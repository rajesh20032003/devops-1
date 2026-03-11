-- ============================================================
-- order-service/init.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  item       VARCHAR(200) NOT NULL,
  quantity   INTEGER DEFAULT 1,
  user_id    INTEGER,               -- references user (loose coupling in microservices)
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO orders (item, quantity, user_id) VALUES
  ('Cement Bags',  10, 1),
  ('Steel Rods',   50, 1),
  ('Bricks',      200, 2),
  ('Sand Bags',    30, 2)
ON CONFLICT DO NOTHING;