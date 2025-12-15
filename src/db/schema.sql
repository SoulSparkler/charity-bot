-- Charity Bot v1 Database Schema - PHASE 1 ONLY
-- Minimal base table creation - NO data operations allowed in PHASE 1

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PHASE 1: Base table structure ONLY (id PRIMARY KEY)
-- NO INSERT/UPDATE operations - these go to PHASE 4
CREATE TABLE IF NOT EXISTS bot_state (
    id UUID PRIMARY KEY
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';