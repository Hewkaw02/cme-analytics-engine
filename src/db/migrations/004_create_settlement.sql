-- ===================================================
-- TABLE 6: DAILY SETTLEMENT (Official EOD)
-- ===================================================
CREATE TABLE daily_settlement (
    id              BIGSERIAL PRIMARY KEY,
    trade_date      DATE            NOT NULL,
    symbol          VARCHAR(5)      NOT NULL,
    expiry_code     VARCHAR(15)     NOT NULL,
    open            DECIMAL(12,4),
    high            DECIMAL(12,4),
    low             DECIMAL(12,4),
    settle          DECIMAL(12,4),
    prior_settle    DECIMAL(12,4),
    change          DECIMAL(12,4),
    est_volume      BIGINT,
    prior_oi        BIGINT,
    oi              BIGINT,
    source          VARCHAR(20),    -- CME_BULLETIN / CME_WS
    fetched_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);
