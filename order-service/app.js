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


// Auto-init DB on startup
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        item VARCHAR(200) NOT NULL,
        quantity INTEGER DEFAULT 1,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Only insert if table is empty!
    const count = await pool.query('SELECT COUNT(*) FROM orders');
    if (parseInt(count.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO orders (item, quantity, user_id) VALUES
          ('Cement Bags', 10, 1),
          ('Steel Rods', 50, 1),
          ('Bricks', 200, 2),
          ('Sand Bags', 30, 2)
      `);
      console.log('✅ Orders seeded!');
    } else {
      console.log('✅ Orders table already has data!');
    }
  } catch (err) {
    console.error('DB init failed:', err.message);
  }
};
initDB();

module.exports = app;
