-- ===================================================
-- TABLE 5: INTRADAY BARS (TimescaleDB Hypertable)
-- ===================================================
CREATE TABLE intraday_bars (
    bar_time            TIMESTAMPTZ     NOT NULL,
    bar_close_time      TIMESTAMPTZ,
    symbol              VARCHAR(5)      NOT NULL,
    timeframe           VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15),

    -- OHLCV
    open                DECIMAL(12,4)   NOT NULL,
    high                DECIMAL(12,4)   NOT NULL,
    low                 DECIMAL(12,4)   NOT NULL,
    close               DECIMAL(12,4)   NOT NULL,
    volume              BIGINT          NOT NULL DEFAULT 0,

    -- Enhanced
    vwap                DECIMAL(12,4),
    buy_volume          BIGINT,
    sell_volume         BIGINT,
    delta_volume        BIGINT,
    trade_count         INTEGER,

    -- Session
    session             VARCHAR(10),
    is_rth              BOOLEAN,

    -- Indicators (คำนวณ post-insert)
    vwap_session        DECIMAL(12,4),
    ema_9               DECIMAL(12,4),
    ema_21              DECIMAL(12,4),
    atr_14              DECIMAL(12,4),
    rsi_14              DECIMAL(8,4),
    bb_upper            DECIMAL(12,4),
    bb_lower            DECIMAL(12,4),

    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (bar_time, symbol, timeframe)
);

-- Convert to TimescaleDB hypertable (partition by time)
SELECT create_hypertable(
    'intraday_bars',
    'bar_time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX idx_ib_sym_tf ON intraday_bars (symbol, timeframe, bar_time DESC);
CREATE INDEX idx_ib_rth    ON intraday_bars (symbol, timeframe, is_rth, bar_time DESC);

-- Data retention policies
SELECT add_retention_policy('intraday_bars',
  INTERVAL '90 days',
  if_not_exists => TRUE
);
