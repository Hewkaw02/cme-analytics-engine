-- ===================================================
-- TABLE 8: FETCH JOB LOG
-- ===================================================
CREATE TABLE fetch_jobs (
    id                  BIGSERIAL PRIMARY KEY,
    job_id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    run_date            DATE            NOT NULL,
    job_type            VARCHAR(30)     NOT NULL,  -- OPTIONS / OI / INTRADAY / BULLETIN
    symbol              VARCHAR(5),
    timeframe           VARCHAR(5),
    status              VARCHAR(20)     NOT NULL,  -- RUNNING / SUCCESS / PARTIAL / FAILED
    records_inserted    INTEGER         DEFAULT 0,
    records_skipped     INTEGER         DEFAULT 0,
    records_invalid     INTEGER         DEFAULT 0,
    error_message       TEXT,
    retry_count         SMALLINT        DEFAULT 0,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    duration_ms         INTEGER GENERATED ALWAYS AS (
                            EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
                        ) STORED
);

CREATE INDEX idx_fj_date_type ON fetch_jobs (run_date, job_type, symbol);
