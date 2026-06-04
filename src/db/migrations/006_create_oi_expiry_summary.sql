-- ===================================================
-- TABLE 4: OI SUMMARY ต่อ Expiry (Computed)
-- ===================================================
CREATE TABLE oi_expiry_summary (
    id                  BIGSERIAL PRIMARY KEY,
    trade_date          DATE            NOT NULL,
    symbol              VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15)     NOT NULL,
    expiry_date         DATE,
    days_to_expiry      SMALLINT,
    underlying_price    DECIMAL(12,4),

    -- OI Summary
    total_call_oi       BIGINT,
    total_put_oi        BIGINT,
    total_call_volume   BIGINT,
    total_put_volume    BIGINT,
    put_call_oi_ratio   DECIMAL(8,4),
    put_call_vol_ratio  DECIMAL(8,4),

    -- Key Levels
    max_call_oi_strike  DECIMAL(12,2),    -- "Call Wall"
    max_put_oi_strike   DECIMAL(12,2),    -- "Put Wall"
    max_pain_strike     DECIMAL(12,2),    -- Max Pain
    max_call_oi_value   BIGINT,
    max_put_oi_value    BIGINT,

    -- GEX (Gamma Exposure)
    net_gamma_exposure  DECIMAL(16,4),    -- dealers' net gamma
    gex_flip_level      DECIMAL(12,2),    -- ราคาที่ GEX เปลี่ยนจาก + เป็น -

    -- IV
    atm_iv_call         DECIMAL(8,6),
    atm_iv_put          DECIMAL(8,6),
    atm_iv_skew         DECIMAL(8,6),
    iv_rank             DECIMAL(8,4),     -- IV Rank 0–100
    iv_percentile       DECIMAL(8,4),     -- IV Percentile

    computed_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);
