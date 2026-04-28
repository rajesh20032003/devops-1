'use strict';

const { Pool } = require('pg');
const fs = require('fs');

// ============================================================
// getPassword() — Smart secret fetching
// ============================================================
// Local dev  → reads Docker secret file
// AWS        → fetches from AWS Secrets Manager
// ============================================================

async function getSecret() {
  // ── AWS Secrets Manager (production) ──────────────────────
  // If DB_SECRET_NAME is set, we are on AWS
  // Fetch credentials from Secrets Manager
  if (process.env.DB_SECRET_NAME) {
    console.log('Fetching credentials from AWS Secrets Manager...');

    const {
      SecretsManagerClient,
      GetSecretValueCommand,
    } = require('@aws-sdk/client-secrets-manager');

    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      // NO credentials here!
      // Uses IAM Role attached to EC2/ECS/EKS automatically
    });

    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: process.env.DB_SECRET_NAME,
      })
    );

    // AWS stores RDS credentials as JSON:
    // { username, password, host, port, dbname }
    const secret = JSON.parse(response.SecretString);
    console.log('Credentials fetched from AWS Secrets Manager ✅');
    return secret;
  }

  // ── Docker Secrets (Stage 2 — local dev) ──────────────────
  // If /run/secrets/db_password exists, use it
  try {
    const password = fs.readFileSync('/run/secrets/db_password', 'utf8').trim();
    console.log('Password loaded from Docker secret ✅');
    return { password };
  } catch {
    // ── Plain env var (Stage 1 — fallback) ──────────────────
    console.warn('Using plain env var for password (Stage 1)');
    return { password: process.env.DB_PASSWORD || '' };
  }
}

// ── Create pool ───────────────────────────────────────────────
// Pool is created once and reused for all requests
// getPool() is called on first request

let pool = null;

async function getPool() {
  if (pool) return pool;

  const secret = await getSecret();

  pool = new Pool({
    // AWS Secrets Manager returns full connection info
    // Docker secret / env var only returns password
    // so we fallback to env vars for host/port/db/user
    host: secret.host || process.env.DB_HOST,
    port: secret.port || parseInt(process.env.DB_PORT) || 5432,
    database: secret.dbname || process.env.DB_NAME,
    user: secret.username || process.env.DB_USER,
    password: secret.password,

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,

    // SSL required for RDS in production
    // not needed locally
    ssl: process.env.DB_SECRET_NAME ? { rejectUnauthorized: false } : false,
  });

  // Test connection
  pool.connect((err, client, release) => {
    if (err) {
      /* eslint-disable no-console */
      console.error('DB connection failed:', err.message);
      pool = null; // reset so next request retries
    } else {
      console.log('DB connected successfully!!! ✅');
      release();
    }
  });

  return pool;
}

// ── Proxy object ──────────────────────────────────────────────
// app.js uses pool.query() everywhere
// This proxy makes getPool() transparent to app.js
// app.js doesn't need to change at all!
const poolProxy = {
  query: async (...args) => {
    const p = await getPool();
    return p.query(...args);
  },
};

module.exports = poolProxy;
