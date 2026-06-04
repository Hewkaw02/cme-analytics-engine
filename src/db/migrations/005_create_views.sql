-- ===================================================
-- TABLE 3: OI แยก Strike × Call/Put (Computed View)
-- ===================================================
CREATE MATERIALIZED VIEW oi_by_strike AS
SELECT
    trade_date,
    symbol,
    expiry_code,
    expiry_date,
    strike,
    underlying_price,
    SUM(CASE WHEN option_type = 'C' THEN open_interest ELSE 0 END)  AS call_oi,
    SUM(CASE WHEN option_type = 'P' THEN open_interest ELSE 0 END)  AS put_oi,
    SUM(CASE WHEN option_type = 'C' THEN oi_change     ELSE 0 END)  AS call_oi_change,
    SUM(CASE WHEN option_type = 'P' THEN oi_change     ELSE 0 END)  AS put_oi_change,
    SUM(CASE WHEN option_type = 'C' THEN volume        ELSE 0 END)  AS call_volume,
    SUM(CASE WHEN option_type = 'P' THEN volume        ELSE 0 END)  AS put_volume,
    MAX(CASE WHEN option_type = 'C' THEN implied_vol   END)         AS call_iv,
    MAX(CASE WHEN option_type = 'P' THEN implied_vol   END)         AS put_iv,
    MAX(CASE WHEN option_type = 'P' THEN implied_vol   END)
      - MAX(CASE WHEN option_type = 'C' THEN implied_vol END)       AS iv_skew,
    SUM(
      CASE WHEN option_type = 'C'
        THEN open_interest * COALESCE(delta, 0)
        ELSE open_interest * COALESCE(delta, 0)
      END
    ) * CASE symbol
        WHEN 'ES' THEN 50
        WHEN 'NQ' THEN 20
        WHEN 'GC' THEN 100
        ELSE 1
      END AS net_delta_exposure   -- contract multiplier per symbol
FROM options_chain
WHERE is_valid = TRUE
GROUP BY trade_date, symbol, expiry_code, expiry_date, strike, underlying_price;

CREATE UNIQUE INDEX ON oi_by_strike (trade_date, symbol, expiry_code, strike);
CREATE INDEX ON oi_by_strike (symbol, trade_date, call_oi DESC);
CREATE INDEX ON oi_by_strike (symbol, trade_date, put_oi DESC);

