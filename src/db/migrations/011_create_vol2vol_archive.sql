-- ===================================================
-- TABLE 11: VOL2VOL SNAPSHOTS (Intraday & Historical Expected Ranges)
-- ===================================================
CREATE TABLE IF NOT EXISTS vol2vol_snapshots (
    id                  BIGSERIAL PRIMARY KEY,
    trade_date          DATE            NOT NULL,
    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    symbol              VARCHAR(5)      NOT NULL,
    future_price        DECIMAL(12,4)   NOT NULL,
    atm_volatility      DECIMAL(8,6)    NOT NULL,
    dte                 DECIMAL(12,6)   NOT NULL,
    
    -- Standard Deviation Bounds (Calculated on-the-fly or parsed from CME)
    sd1_down            DECIMAL(12,4)   NOT NULL,
    sd1_up              DECIMAL(12,4)   NOT NULL,
    sd2_down            DECIMAL(12,4)   NOT NULL,
    sd2_up              DECIMAL(12,4)   NOT NULL,
    sd3_down            DECIMAL(12,4)   NOT NULL,
    sd3_up              DECIMAL(12,4)   NOT NULL,
    
    expiry_date         DATE,
    contract_title      VARCHAR(100),
    
    UNIQUE (trade_date, symbol, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_v2vs_fetched_at ON vol2vol_snapshots (symbol, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_v2vs_trade_date ON vol2vol_snapshots (symbol, trade_date DESC);

-- ===================================================
-- TABLE 12: VOL2VOL STRIKE DETAILS (Intraday Volume & Implied Volatility Profile)
-- ===================================================
CREATE TABLE IF NOT EXISTS vol2vol_strike_records (
    id                  BIGSERIAL PRIMARY KEY,
    snapshot_id         BIGINT          NOT NULL REFERENCES vol2vol_snapshots(id) ON DELETE CASCADE,
    strike              DECIMAL(12,2)   NOT NULL,
    call_volume         BIGINT          NOT NULL DEFAULT 0,
    put_volume          BIGINT          NOT NULL DEFAULT 0,
    implied_vol         DECIMAL(8,6),
    settle_vol          DECIMAL(8,6),
    
    UNIQUE (snapshot_id, strike)
);

CREATE INDEX IF NOT EXISTS idx_v2vsr_snapshot ON vol2vol_strike_records (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_v2vsr_strike   ON vol2vol_strike_records (strike);
