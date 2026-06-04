-- ===================================================
-- Add CVD and VWAP standard deviation band columns
-- ===================================================
ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS cvd DECIMAL(12,4);
ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd1_upper DECIMAL(12,4);
ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd1_lower DECIMAL(12,4);
ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd2_upper DECIMAL(12,4);
ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd2_lower DECIMAL(12,4);
