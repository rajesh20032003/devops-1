-- ============================================================
-- user-service/init.sql — Database Initialization
-- ============================================================
-- This file runs AUTOMATICALLY when postgres container starts
-- for the FIRST TIME (when data volume is empty)
--
-- Mounted via docker-compose volume:
--   ./user-service/init.sql:/docker-entrypoint-initdb.d/init.sql
--
-- After first run, postgres stores data in the volume
-- This file won't run again unless you delete the volume
-- ============================================================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,        -- auto-increment ID
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()    -- auto-set on insert
);

-- Seed some initial data (so dashboard shows numbers immediately)
INSERT INTO users (name, email) VALUES
  ('Rajesh',          'rajesh@example.com'),
  ('DevOps Engineer', 'devops@example.com'),
  ('Alice',           'alice@example.com'),
  ('Bob',             'bob@example.com')
ON CONFLICT (email) DO NOTHING;  -- don't fail if already exists