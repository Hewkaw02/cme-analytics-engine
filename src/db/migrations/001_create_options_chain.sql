-- ===================================================
-- EXTENSIONS
-- ===================================================
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ===================================================
-- TABLE 1: OPTIONS CHAIN (End-of-Day)
-- ===================================================
CREATE TABLE options_chain (
    id                  BIGSERIAL,
    trade_date          DATE            NOT NULL,
    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    symbol              VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15)     NOT NULL,
    expiry_date         DATE            NOT NULL,
    days_to_expiry      SMALLINT,
    strike              DECIMAL(12,2)   NOT NULL,
    option_type         CHAR(1)         NOT NULL CHECK (option_type IN ('C','P')),

    -- Prices
    last_price          DECIMAL(12,4),
    settle_price        DECIMAL(12,4),
    bid                 DECIMAL(12,4),
    ask                 DECIMAL(12,4),
    bid_size            INTEGER,
    ask_size            INTEGER,
    high                DECIMAL(12,4),
    low                 DECIMAL(12,4),
    open                DECIMAL(12,4),

    -- Volume & OI
    volume              BIGINT          DEFAULT 0,
    open_interest       BIGINT          DEFAULT 0,
    oi_change           BIGINT          DEFAULT 0,

    -- Greeks
    delta               DECIMAL(8,6),
    gamma               DECIMAL(8,6),
    theta               DECIMAL(8,6),
    vega                DECIMAL(8,6),
    rho                 DECIMAL(8,6),

    -- Vol & Model
    implied_vol         DECIMAL(8,6),
    theoretical_value   DECIMAL(12,4),

    -- Derived
    underlying_price    DECIMAL(12,4),
    intrinsic_value     DECIMAL(12,4),
    time_value          DECIMAL(12,4),
    moneyness           VARCHAR(5),

    -- Quality
    is_valid            BOOLEAN         DEFAULT TRUE,
    validation_notes    TEXT,

    PRIMARY KEY (id),
    UNIQUE (trade_date, symbol, expiry_code, strike, option_type)
);

CREATE INDEX idx_oc_date_sym      ON options_chain (trade_date, symbol);
CREATE INDEX idx_oc_expiry        ON options_chain (symbol, expiry_code, trade_date);
CREATE INDEX idx_oc_strike        ON options_chain (symbol, strike, trade_date);
CREATE INDEX idx_oc_oi            ON options_chain (symbol, trade_date, open_interest DESC);
