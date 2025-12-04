-- Charity Bot v1 Database Schema
-- Compatible with PostgreSQL and Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bot state table - stores virtual balances and cycle tracking
CREATE TABLE IF NOT EXISTS bot_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    botA_virtual_usd NUMERIC(12, 2) NOT NULL DEFAULT 230.00,
    botB_virtual_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    botA_cycle_number INTEGER NOT NULL DEFAULT 1,
    botA_cycle_target NUMERIC(12, 2) NOT NULL DEFAULT 200.00,
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for bot_state table
DROP TRIGGER IF EXISTS update_bot_state_updated_at ON bot_state;
CREATE TRIGGER update_bot_state_updated_at
    BEFORE UPDATE ON bot_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert initial bot state if not exists
INSERT INTO bot_state (botA_virtual_usd, botB_virtual_usd, botA_cycle_number, botA_cycle_target)
SELECT 230.00, 0.00, 1, 200.00
WHERE NOT EXISTS (SELECT 1 FROM bot_state);

-- Sentiment readings table
CREATE TABLE IF NOT EXISTS sentiment_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fgi_value INTEGER NOT NULL CHECK (fgi_value >= 0 AND fgi_value <= 100),
    trend_score NUMERIC(4, 3) NOT NULL CHECK (trend_score >= -1.0 AND trend_score <= 1.0),
    mcs NUMERIC(3, 2) NOT NULL CHECK (mcs >= 0.0 AND mcs <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for latest readings
CREATE INDEX IF NOT EXISTS idx_sentiment_readings_created_at ON sentiment_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_readings_latest ON sentiment_readings(created_at) WHERE created_at = (SELECT MAX(created_at) FROM sentiment_readings);

-- Trade logs table
CREATE TABLE IF NOT EXISTS trade_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot TEXT NOT NULL CHECK (bot IN ('A', 'B')),
    pair TEXT NOT NULL CHECK (pair IN ('BTC/USD', 'ETH/USD')),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    size NUMERIC(16, 8) NOT NULL,
    entry_price NUMERIC(12, 2),
    exit_price NUMERIC(12, 2),
    pnl_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for trade analysis
CREATE INDEX IF NOT EXISTS idx_trade_logs_bot_created ON trade_logs(bot, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_pair ON trade_logs(pair);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created_at ON trade_logs(created_at DESC);

-- Monthly reports table
CREATE TABLE IF NOT EXISTS monthly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month TEXT NOT NULL CHECK (length(month) = 7), -- Format: YYYY-MM
    botB_start_balance NUMERIC(12, 2) NOT NULL,
    botB_end_balance NUMERIC(12, 2) NOT NULL,
    donation_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(month)
);

-- Index for monthly reports
CREATE INDEX IF NOT EXISTS idx_monthly_reports_month ON monthly_reports(month);

-- API rate limiting table for Kraken
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint TEXT NOT NULL,
    last_call TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    call_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_endpoint ON api_rate_limits(endpoint);

-- Bot performance analytics table
CREATE TABLE IF NOT EXISTS bot_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot TEXT NOT NULL CHECK (bot IN ('A', 'B')),
    date DATE NOT NULL,
    total_pnl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    trades_count INTEGER NOT NULL DEFAULT 0,
    win_rate NUMERIC(4, 3),
    max_drawdown NUMERIC(6, 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bot, date)
);

CREATE INDEX IF NOT EXISTS idx_bot_performance_bot_date ON bot_performance(bot, date);

-- Configuration table for dynamic settings
CREATE TABLE IF NOT EXISTS configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER IF NOT EXISTS update_configuration_updated_at
    BEFORE UPDATE ON configuration
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration values
INSERT INTO configuration (key, value, description) VALUES 
    ('cycle_seed_amount', '30', 'Seed amount for new Bot A cycles'),
    ('botB_transfer_amount', '200', 'Amount transferred from Bot A to Bot B per cycle'),
    ('max_daily_trades_botA', '6', 'Maximum daily trades for Bot A when MCS >= 0.8'),
    ('min_mcs_for_trading', '0.4', 'Minimum MCS required for Bot A trading'),
    ('botB_min_mcs', '0.5', 'Minimum MCS required for Bot B trading')
ON CONFLICT (key) DO NOTHING;

-- Views for easy data access
CREATE OR REPLACE VIEW latest_sentiment AS
SELECT * FROM sentiment_readings 
WHERE created_at = (SELECT MAX(created_at) FROM sentiment_readings);

CREATE OR REPLACE VIEW current_bot_state AS
SELECT * FROM bot_state 
WHERE id = (SELECT id FROM bot_state ORDER BY created_at DESC LIMIT 1);

-- Function to get Bot A next cycle target
CREATE OR REPLACE FUNCTION calculate_next_cycle_target(current_target NUMERIC, cycle_seed NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    RETURN current_target + cycle_seed;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate monthly donation
CREATE OR REPLACE FUNCTION calculate_monthly_donation(start_balance NUMERIC, end_balance NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    RETURN GREATEST(end_balance - start_balance, 0) * 0.5;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions for Supabase
-- Note: Adjust these for your specific setup
GRANT USAGE ON SCHEMA public TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;

COMMENT ON TABLE bot_state IS 'Stores virtual balances and cycle tracking for both trading bots';
COMMENT ON TABLE sentiment_readings IS 'Market sentiment data including FGI, trend scores, and MCS values';
COMMENT ON TABLE trade_logs IS 'Complete record of all trades executed by both bots';
COMMENT ON TABLE monthly_reports IS 'Monthly performance reports and donation calculations';
COMMENT ON TABLE api_rate_limits IS 'Rate limiting tracking for external API calls';
COMMENT ON TABLE bot_performance IS 'Daily performance metrics for both bots';
COMMENT ON TABLE configuration IS 'Dynamic configuration settings that can be adjusted during runtime';