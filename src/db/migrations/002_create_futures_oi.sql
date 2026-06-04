-- ===================================================
-- TABLE 2: FUTURES OI รายวัน (Aggregate)
-- ===================================================
CREATE TABLE futures_oi (
    id              BIGSERIAL PRIMARY KEY,
    trade_date      DATE            NOT NULL,
    symbol          VARCHAR(5)      NOT NULL,
    expiry_code     VARCHAR(15)     NOT NULL,
    expiry_date     DATE,
    total_oi        BIGINT,
    oi_change       BIGINT,
    oi_change_pct   DECIMAL(8,4),
    total_volume    BIGINT,
    settle_price    DECIMAL(12,4),
    prior_settle    DECIMAL(12,4),
    price_change    DECIMAL(12,4),
    source          VARCHAR(20)     DEFAULT 'CME_WS',    -- CME_WS / BULLETIN
    fetched_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);

CREATE INDEX idx_foi_date_sym ON futures_oi (trade_date, symbol);
