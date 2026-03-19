// ============================================================
// user-service/app.js — Updated with PostgreSQL
// ============================================================
//
// WHAT CHANGED FROM YOUR ORIGINAL:
// ─────────────────────────────────────────────────────────────
// Before: res.json([{ id: 1, name: 'Rajesh!' }])
//         → hardcoded array, no DB
//
// After:  const result = await pool.query('SELECT * FROM users')
//         res.json(result.rows)
//         → real data from PostgreSQL
//
// Everything else stays the same ✅
// ============================================================

const express = require('express');
const pool = require('./db'); // our DB connection pool

const app = express();
app.use(express.json()); // parse JSON request bodies (for POST)

// ── GET /users ────────────────────────────────────────────────
// Before: returned hardcoded array
// After:  queries PostgreSQL and returns real rows
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users ORDER BY id'
    );
    res.json(result.rows);
    // result.rows = array of objects: [{ id: 1, name: 'Rajesh', ... }]
  } catch (err) {
    console.error('DB query failed:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /users ───────────────────────────────────────────────
// NEW endpoint — create a user
// Shows how to do parameterized queries (prevents SQL injection!)
app.post('/users', async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'name and email required' });
  }

  try {
    const result = await pool.query(
      // $1, $2 = parameterized query — NEVER use string concatenation!
      // 'SELECT * FROM users WHERE id = ' + id  ← SQL injection risk ❌
      // 'SELECT * FROM users WHERE id = $1', [id] ← safe ✅
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Insert failed:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET /health ───────────────────────────────────────────────
// Updated: also checks DB connection
// Industry: health check should verify ALL dependencies
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1'); // lightweight DB ping
    res.json({ status: 'UP', db: 'UP' });
  } catch (err) {
    res.status(503).json({ status: 'UP', db: 'DOWN', error: err.message });
  }
});

app.get('/test', (req, res) => {
  res.status(200).send('OK');
});


// Auto-init DB on startup
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const count = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(count.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (name, email) VALUES
          ('Rajesh', 'rajesh@example.com'),
          ('DevOps Engineer', 'devops@example.com'),
          ('Alice', 'alice@example.com'),
          ('Bob', 'bob@example.com')
      `);
      console.log('✅ Users seeded!');
    }
    console.log('✅ Users DB initialized!');
  } catch (err) {
    console.error('DB init failed:', err.message);
  }
};
initDB();

module.exports = app;
