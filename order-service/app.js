// order-service/app.js — Updated with PostgreSQL
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

// ── GET /orders ───────────────────────────────────────────────
app.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, item, quantity, user_id, created_at FROM orders ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('DB query failed:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /orders ──────────────────────────────────────────────
app.post('/orders', async (req, res) => {
  const { item, quantity, user_id } = req.body;

  if (!item) {
    return res.status(400).json({ error: 'item is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO orders (item, quantity, user_id) VALUES ($1, $2, $3) RETURNING *',
      [item, quantity || 1, user_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Insert failed:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'UP', db: 'UP' });
  } catch (err) {
    res.status(503).json({ status: 'UP', db: 'DOWN', error: err.message });
  }
});

app.get('/test', (req, res) => res.status(200).send('OK'));

module.exports = app;
