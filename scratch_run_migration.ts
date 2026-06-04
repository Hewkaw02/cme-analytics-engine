import { db } from './src/db/client.js';
import { sql } from 'kysely';

async function run() {
  console.log('Running manual migration...');
  await sql`
    ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS cvd DECIMAL(12,4);
    ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd1_upper DECIMAL(12,4);
    ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd1_lower DECIMAL(12,4);
    ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd2_upper DECIMAL(12,4);
    ALTER TABLE intraday_bars ADD COLUMN IF NOT EXISTS vwap_sd2_lower DECIMAL(12,4);

    CREATE TABLE IF NOT EXISTS backtest_runs (
        id                  BIGSERIAL PRIMARY KEY,
        strategy_name       VARCHAR(100)    NOT NULL,
        symbol              VARCHAR(5)      NOT NULL,
        start_date          DATE            NOT NULL,
        end_date            DATE            NOT NULL,
        initial_capital     DECIMAL(16,4)   NOT NULL,
        final_capital       DECIMAL(16,4)   NOT NULL,
        total_trades        INTEGER         NOT NULL,
        win_rate            DECIMAL(6,4)    NOT NULL,
        sharpe_ratio        DECIMAL(8,4),
        sortino_ratio       DECIMAL(8,4),
        max_drawdown        DECIMAL(8,4)    NOT NULL,
        profit_factor       DECIMAL(8,4),
        parameters          JSONB           NOT NULL DEFAULT '{}'::jsonb,
        created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backtest_trades (
        id                  BIGSERIAL PRIMARY KEY,
        run_id              BIGINT          NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
        entry_time          TIMESTAMPTZ     NOT NULL,
        exit_time           TIMESTAMPTZ     NOT NULL,
        direction           VARCHAR(5)      NOT NULL,
        entry_price         DECIMAL(12,4)   NOT NULL,
        exit_price          DECIMAL(12,4)   NOT NULL,
        quantity            DECIMAL(12,4)   NOT NULL,
        pnl                 DECIMAL(16,4)   NOT NULL,
        pnl_pct             DECIMAL(8,4)    NOT NULL,
        exit_reason         VARCHAR(50)     NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bt_trades_run_id ON backtest_trades(run_id);
  `.execute(db);
  console.log('Migration completed successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
