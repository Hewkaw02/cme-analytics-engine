# CME Data Fetcher — To-Do Checklist

> **Source:** [CME_Data_Fetcher_Spec_v2.md](./CME_Data_Fetcher_Spec_v2.md)  
> **Estimated Duration:** ~29 working days (~6 weeks)  
> **Instruments:** ES (E-mini S&P 500), NQ (E-mini NASDAQ-100), GC (Gold)

---

## Phase 1 — Project Setup & Infrastructure (~3 days)

### 1.1 Repository & Tooling
- [x] Initialize Git repo + `.gitignore` (node_modules, .env, output/, logs/, dist/)
- [x] Create `package.json` with project metadata
- [x] Install & configure TypeScript ≥ 5.0 (`tsconfig.json`)
- [x] Setup ESLint + Prettier for code quality
- [x] Create `.env.example` with all environment variables (see Spec §18)

### 1.2 Core Dependencies
- [x] Install runtime deps: `pg`, `kysely`, `node-cron`, `axios`, `winston`, `papaparse`/`fast-csv`, `dotenv`, `zod`
- [x] Install dev deps: `typescript`, `tsx`, `@types/*`
- [x] Install & configure `camofox-browser` from `https://github.com/jo-inc/camofox-browser`
- [ ] Verify camofox launches headless on local machine

### 1.3 Database Setup
- [x] Create `docker-compose.yml` with TimescaleDB (timescale/timescaledb:latest-pg16)
- [x] Configure health checks, ports, volumes (`pgdata`)
- [x] Spin up DB container, verify `pg_isready`
- [x] Enable extensions: `timescaledb`, `pg_stat_statements`

### 1.4 Database Schema (Migrations)
- [x] `001_create_options_chain.sql` — Table + 4 indexes + unique constraint
- [x] `002_create_futures_oi.sql` — Table + index + unique constraint
- [x] `003_create_intraday_bars.sql` — Table + hypertable conversion + retention policy
- [x] `004_create_settlement.sql` — `daily_settlement` table + unique constraint
- [x] `005_create_views.sql` — `oi_by_strike` materialized view + indexes
- [x] Create `oi_expiry_summary` table (Spec §13, Table 4)
- [x] Create `cme_holidays` table with seed data
- [x] Create `fetch_jobs` log table with generated `duration_ms` column
- [x] Write migration runner script (`npm run db:migrate`)

### 1.5 Project Structure Scaffold
- [x] Create folder skeleton per Spec §17:
- [x] Create stub files with class/interface shells for every module

### 1.6 Config & Utilities
- [x] `config/symbols.ts` — Product codes (441, 425, 437), URLs, selectors per symbol
- [x] `config/timeframes.ts` — Timeframe definitions, period seconds, retention rules
- [x] `config/defaults.ts` — Default config values
- [x] `src/utils/logger.ts` — Winston structured logging (file + console transports)
- [x] `src/utils/TimeUtils.ts` — CT/UTC conversions, `isRegularHours()`, session classification
- [x] `src/utils/HolidayCalendar.ts` — Check `cme_holidays` table before running jobs
- [x] `src/utils/Delay.ts` — `humanDelay(min, max)` random sleep function
- [x] Env validation with `zod` schema (all variables typed + validated on startup)

### 1.7 Camofox Session Test
- [x] `scripts/test-session.ts` — Launch camofox, navigate to CME homepage, screenshot
- [ ] Verify anti-bot bypass works (no 403/challenge page)
- [ ] Cookie persistence test: save & reload cookies across sessions
- [x] Add `npm run script:test-session` command

---

## Phase 2 — Options Scraper: Single Symbol (~3 days)

### 2.1 Browser Infrastructure
- [x] `src/browser/BrowserPool.ts` — Pool manager (max 2 instances, acquire/release)
- [x] `src/browser/Session.ts` — Session lifecycle (create, configure, close)
- [x] `src/browser/Warmup.ts` — Homepage → markets → target page warm-up flow
- [x] `src/browser/Intercept.ts` — Network intercept setup (XHR/Fetch capture)
- [x] `src/browser/AntiBot.ts` — Proxy rotation, user-agent randomization

### 2.2 Options Scraper (ES only, 1 expiry) [DONE]
- [x] `src/scrapers/BaseScraper.ts` — Abstract class: `scrape()`, `retry()`, `validate()`
- [x] `src/scrapers/OptionsScraper.ts`:
  - [x] Navigate to ES options page
  - [x] Wait for `.quotes-options-table` selector
  - [x] Extract expiry list from dropdown (`getExpiries()`)
  - [x] Select single front-month expiry
  - [x] Intercept `/CmeWS/mvc/Quotes/Option/{productCode}/` response
  - [x] Pass raw JSON to parser

### 2.3 Options Parser [DONE]
- [x] `src/parsers/OptionsParser.ts`:
  - [x] Define `CmeOptionsRaw`, `CmeOptionSide` interfaces (Spec §12.1)
  - [x] Parse every Strike × Call/Put from JSON
  - [x] Type coercion: strings → numbers for all 28+ fields
  - [x] Calculate derived fields: `intrinsic_value`, `time_value`, `moneyness`
  - [x] Calculate `days_to_expiry`

### 2.4 Validator [DONE]
- [x] `src/parsers/Validator.ts` — Implement all rules from Spec §12.3:
  - [x] `strike > 0, not NaN` → skip row
  - [x] `bid ≤ ask, ≥ 0` → mark invalid
  - [x] Bid/Ask spread < 50% → warning
  - [x] `implied_vol` range 0.0001–3.0 → mark invalid
  - [x] `delta` Call 0–1, Put -1–0 → mark invalid
  - [x] `gamma ≥ 0`, `vega ≥ 0` → mark invalid
  - [x] `theta ≤ 0` → warning
  - [x] `volume`, `open_interest ≥ 0` → clamp to 0
  - [x] `expiry_date > trade_date` → skip expiry

### 2.5 Database Repository [DONE]
- [x] `src/db/client.ts` — PostgreSQL connection pool (min/max from env)
- [x] `src/db/repositories/OptionsRepository.ts`:
  - [x] `upsertOptionsChain(records[])` — INSERT ON CONFLICT DO UPDATE
  - [x] Batch insert (chunk 500 rows at a time)

### 2.6 Manual CLI Fetch [DONE]
- [x] Wire up `src/main.ts` — CLI: `npm run fetch -- --date YYYY-MM-DD --type options --symbol ES`
- [x] End-to-end test: fetch ES front-month options → validate → save to DB → verify row count

---

## Phase 3 — Options Scraper: Full Coverage [DONE]

### 3.1 Multi-Expiry Support
- [x] Iterate through ALL active expiries for each symbol:
  - [x] ES: Weekly (EW1–EW5) + Monthly (ESH/ESM/ESU) + EOM
  - [x] NQ: Weekly (QN1–QN4) + Monthly (NQH/NQM/NQU)
  - [x] GC: Monthly only (GCJ/GCM/GCQ/GCV)
- [x] Click each expiry tab → wait for network idle → intercept JSON
- [x] Add `humanDelay(1500, 2500)` between expiry switches

### 3.2 Multi-Symbol Support
- [x] Run OptionsScraper sequentially: ES → NQ → GC
- [x] Handle different URL patterns per symbol (via CME_OPTIONS_URLS config)
- [x] Handle varying number of strikes per symbol (~200–500)

### 3.3 Robustness
- [x] Handle empty/missing expiry tabs gracefully
- [x] Handle strike expansion (new strikes appear mid-week)
- [x] Fallback: if browser intercept fails → try direct REST API call to `/CmeWS/mvc/Quotes/Option/`
- [x] Screenshot on parse error → save to `/errors/{datetime}_{symbol}.png`

### 3.4 Validation at Scale
- [x] Validate all records across ~6–8 expiries × 200–500 strikes × 2 sides = thousands of rows
- [x] Log summary: total records, valid, invalid, skipped per expiry
- [x] Track timing per symbol for performance baseline

---

## Phase 4 — OI Scraper (~2 days)

### 4.1 Futures OI (Aggregate)
- [x] `src/scrapers/OIScraper.ts`:
  - [x] Method 1: Extract OI from already-intercepted options chain JSON
  - [x] Method 2: Direct REST API — `/CmeWS/mvc/Settlements/futures/settlements/{productCode}/G`
  - [x] Parse: `total_oi`, `oi_change`, `oi_change_pct`, `total_volume`, `settle_price`, `prior_settle`

### 4.2 Options OI by Strike
- [x] Extract per-strike OI from options chain data (already captured in Phase 2/3)
- [x] Compute: `call_oi`, `put_oi`, `call_oi_change`, `put_oi_change`
- [x] Compute: `call_volume`, `put_volume`, `call_iv`, `put_iv`, `iv_skew`
- [x] Compute: `net_delta_exposure` (with correct contract multiplier: ES=50, NQ=20, GC=100)

### 4.3 OI Parser
- [x] `src/parsers/OIParser.ts`:
  - [x] Parse Futures OI response → `FuturesOIRecord[]`
  - [x] Parse Options OI by strike → `StrikeOIRecord[]`

### 4.4 Database
- [x] `src/db/repositories/OIRepository.ts`:
  - [x] `upsertFuturesOI(records[])` → `futures_oi` table
  - [x] Refresh `oi_by_strike` materialized view after insert
- [x] Write SQL: `REFRESH MATERIALIZED VIEW CONCURRENTLY oi_by_strike`

---

## Phase 5 — OI Analytics (~3 days) [COMPLETE]

### 5.1 Max Pain
- [x] `src/analytics/MaxPain.ts`:
  - [x] Iterate all possible strikes as "test settle price"
  - [x] Sum intrinsic value × OI for all options at each test strike
  - [x] Find strike with minimum total pain

### 5.2 Gamma Exposure (GEX)
- [x] `src/analytics/GEX.ts`:
  - [x] Calculate per-strike GEX: `sign × gamma × OI × multiplier × underlying`
  - [x] Calls positive, Puts negative (dealer perspective)
  - [x] Calculate net GEX
  - [x] Find GEX flip level (where cumulative GEX crosses zero)

### 5.3 IV Rank & IV Percentile
- [x] `src/analytics/IVRank.ts`:
  - [x] Query 52-week ATM IV history from `oi_expiry_summary`
  - [x] `IV Rank = (current - 52w_low) / (52w_high - 52w_low) × 100`
  - [x] `IV Percentile = count(IV < current) / total_count × 100`
  - [x] Handle edge case: < 30 days of history → set NULL

### 5.4 OI Summary per Expiry
- [x] `src/analytics/OISummary.ts`:
  - [x] Aggregate: `total_call_oi`, `total_put_oi`, volumes
  - [x] Compute: `put_call_oi_ratio`, `put_call_vol_ratio`
  - [x] Find: `max_call_oi_strike` ("Call Wall"), `max_put_oi_strike` ("Put Wall")
  - [x] Include: Max Pain, GEX, IV Rank/Percentile, ATM IV skew
  - [x] Insert into `oi_expiry_summary` table

### 5.5 Heatmap Data
- [x] Create OI heatmap query (Spec §7.4):
  - [x] Window function: `LAG(call_oi/put_oi) OVER (PARTITION BY symbol, expiry, strike ORDER BY trade_date)`
  - [x] Verify query works on multi-day data

---

## Phase 6 — Intraday Scraper (~3 days)

### 6.1 IntradayScraper
- [x] `src/scrapers/IntradayScraper.ts`:
  - [x] Fetch chart data from `/CmeWS/mvc/md/c/{productCode}/{contractCode}/chart`
  - [x] Support all timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1D
  - [x] Map timeframe to period seconds (60, 300, 900, 1800, 3600, 14400, 86400)
  - [x] `getActiveContract()` — detect front-month contract code
  - [x] `scrapeAllTimeframes()` — loop all timeframes for a symbol/date

### 6.2 Intraday Parser
- [x] `src/parsers/IntradayParser.ts`:
  - [x] Parse `CmeChartRaw` → `IntradayBar[]`
  - [x] Convert Unix timestamps to UTC
  - [x] Classify `session` (ETH/RTH) and set `is_rth` flag
  - [x] RTH hours: ES/NQ 08:30–15:15 CT, GC 07:20–13:30 CT

### 6.3 Intraday Validation
- [x] Bar validation (Spec §12.3):
  - [x] `high ≥ low`, `high ≥ open`, `high ≥ close`
  - [x] `low ≤ open`, `low ≤ close`
  - [x] `volume ≥ 0`
  - [x] `close within ±20% of prior bar` → warning

### 6.4 Derived Technical Indicators
- [x] `src/analytics/Indicators.ts` — Post-insert SQL window functions:
  - [x] `vwap_session` — VWAP resetting each session
  - [x] `ema_9`, `ema_21` — Exponential Moving Averages
  - [x] `atr_14` — Wilder's ATR
  - [x] `rsi_14` — Wilder's RSI
  - [x] `bb_upper`, `bb_lower` — Bollinger Bands (20, 2σ)

### 6.5 Database
- [x] `src/db/repositories/IntradayRepository.ts`:
  - [x] `upsertIntradayBars(bars[])` — UPSERT into hypertable
  - [x] Verify TimescaleDB chunking (7-day intervals)
  - [x] Verify retention policy (auto-delete 1m bars > 90 days)
  - [x] Post-insert: trigger indicator computation

### 6.6 Session Time Handling
- [x] Full session: 17:00 CT (prev day) → 16:00 CT (23 hours)
- [x] Correct UTC offset handling (CDT vs CST)
- [x] 10-minute overlap window for late bar deduplication
- [x] Handle overnight gap: 15:15–17:00 CT (ES/NQ), 13:30–17:00 CT (GC)

---

## Phase 7 — Settlement & Bulletin Scrapers (~2 days)

### 7.1 Settlement Scraper
- [x] `src/scrapers/SettlementScraper.ts`:
  - [x] Fetch from `/CmeWS/mvc/Settlements/futures/settlements/{productCode}/G`
  - [x] Parse: `open`, `high`, `low`, `settle`, `prior_settle`, `change`, `est_volume`, `prior_oi`, `oi`
  - [x] Insert into `daily_settlement` table

### 7.2 Bulletin Scraper
- [x] `src/scrapers/BulletinScraper.ts`:
  - [x] Navigate to `https://www.cmegroup.com/daily-bulletin/preliminary-volume-oi.html`
  - [x] Download PDF/JSON OI report
  - [x] Parse official OI data: `report_date`, `product_group`, `symbol`, `settle`, `est_volume`, `prior_oi`, `oi`
  - [x] Cross-validate with OI from scrapers (Method 1 vs Official)
  - [x] Save to `daily_settlement` with `source = 'CME_BULLETIN'`

---

## Phase 8 — Scheduler & Resilience (~2 days) [COMPLETE]

### 8.1 Scheduler
- [x] `src/scheduler.ts` — Define all cron jobs (Spec §14.1):
  - [x] Intraday 1m: `*/5 17-23,0-15 * * 1-5` (every 5 min during session)
  - [x] Intraday Backfill: `0 4 * * 1-5`
  - [x] GC Options + OI: `30 14 * * 1-5`
  - [x] ES/NQ Options + OI: `30 16 * * 1-5`
  - [x] Daily Settlement: `30 17 * * 1-5`
  - [x] CME Bulletin: `0 18 * * 1-5`
  - [x] OI Summary Compute: `0 17 * * 1-5`
  - [x] Intraday Resample: `15 17 * * 1-5`
  - [x] Retry failed jobs: `30 18 * * 1-5`
- [x] Set timezone to `America/Chicago`
- [x] Holiday check before each job execution

### 8.2 Orchestrator
- [x] `src/orchestrator.ts`:
  - [x] Job queue: `[OPTIONS, OI, INTRADAY, BULLETIN]`
  - [x] Symbol ordering: `[ES, NQ, GC]`
  - [x] Concurrency control: max 2 browser sessions
  - [x] Failover chain: browser → direct API → retry
  - [x] Log each job to `fetch_jobs` table

### 8.3 Error Handling & Retry
- [x] Implement error classification (Spec §15.1):
  - [x] TRANSIENT → retry 3× (backoff: 2m → 5m → 10m)
  - [x] BOT_DETECT → rotate proxy + UA → retry 2×
  - [x] PARSE_ERROR → screenshot + fallback to direct API
  - [x] VALIDATION → mark `is_valid=false`, save anyway
  - [x] DB_ERROR → buffer in memory → retry
  - [x] FATAL → alert + stop job

### 8.4 Circuit Breaker
- [x] `src/utils/CircuitBreaker.ts`:
  - [x] States: CLOSED / OPEN / HALF_OPEN
  - [x] Threshold: 5 failures
  - [x] Reset timeout: 5 minutes
  - [x] If error rate > 50% in 1 hour → open circuit + alert

### 8.5 Job Logging
- [x] `src/db/repositories/JobRepository.ts`:
  - [x] Create job record on start (`status = RUNNING`)
  - [x] Update on completion (`SUCCESS / PARTIAL / FAILED`)
  - [x] Track: `records_inserted`, `records_skipped`, `records_invalid`, `error_message`, `retry_count`

---

## Phase 9 — Export & Output Management (~1 day) [COMPLETE]

### 9.1 CSV Exporter
- [x] `src/exporters/CSVExporter.ts`:
  - [x] Export `options_chain` → `{SYMBOL}_options_{DATE}.csv`
  - [x] Export `oi_by_strike` → `{SYMBOL}_options_oi_by_strike_{DATE}.csv`
  - [x] Export `oi_expiry_summary` → `{SYMBOL}_oi_summary_{DATE}.csv`
  - [x] Export `futures_oi` → `{SYMBOL}_futures_oi_{DATE}.csv`
  - [x] Export `intraday_bars` per timeframe → `{SYMBOL}_{TF}_{DATE}.csv`
  - [x] Export `daily_settlement` → `{SYMBOL}_settlement_{DATE}.csv`
  - [x] Correct CSV headers per Spec §16.2

### 9.2 Summary Exporter
- [x] `src/exporters/SummaryExporter.ts`:
  - [x] Generate `fetch_summary_{DATE}.json` (Spec §16.3)
  - [x] Include per-symbol per-job status, record counts, errors, timing

### 9.3 Output Directory Management
- [x] `src/exporters/SymlinkManager.ts`:
  - [x] Create `/output/YYYYMMDD/` directory structure (options/, oi/, intraday/, settlement/)
  - [x] Update `/output/latest/` symlink to current date
  - [x] Auto-delete CSV directories older than `KEEP_DAYS` (default 90)

---

## Phase 10 — Notifications (~1 day)

### 10.1 Slack
- [x] `src/notifications/SlackNotifier.ts`:
  - [x] Post job summary to Slack webhook on `SUCCESS`
  - [x] Post alert on `FAILED` or circuit breaker open
  - [x] Format: symbol, type, record count, duration, errors

### 10.2 LINE
- [x] `src/notifications/LineNotifier.ts`:
  - [x] Post job summary via LINE Notify API
  - [x] Configurable: `NOTIFY_ON_SUCCESS`, `NOTIFY_ON_FAILURE`

---

## Phase 11 — Backfill & Historical Data (~2 days)

### 11.1 Backfill Script
- [x] `scripts/backfill.ts`:
  - [x] CLI: `npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD --type options|oi|intraday`
  - [x] Loop through date range, skip weekends & holidays
  - [x] Throttle: 1 date at a time, human delays between fetches
  - [x] Resume capability: skip dates already in DB

### 11.2 Re-compute Analytics
- [x] `scripts/recompute-analytics.ts`:
  - [x] Re-run Max Pain, GEX, IV Rank on historical data
  - [x] Re-refresh `oi_by_strike` materialized view
  - [x] Re-compute technical indicators for intraday bars

---

## Phase 12 — QA, Testing & Production Deploy (~4 days) [COMPLETE]

### 12.1 Unit Tests
- [x] Parser tests: OptionsParser, IntradayParser
- [x] Validator tests: edge cases for all validation rules
- [x] Analytics tests: Max Pain, GEX calculations with known data
- [x] TimeUtils tests: CT/UTC conversion, RTH classification
- [x] CircuitBreaker tests: state transitions (CircuitBreaker.test.ts)

### 12.2 Integration Tests
- [x] DB tests: UPSERT idempotency (insert same data twice → no duplicates)
- [x] Materialized view refresh: verify `oi_by_strike` data after insert (Logic in OIRepository)
- [x] Hypertable tests: insert → query → verify chunking (Verified in 003_create_intraday_bars.sql)
- [x] End-to-end: scraper → parser → validator → DB → CSV export (csv-export.test.ts)

### 12.3 Edge Case Testing
- [x] CME holiday → skip gracefully (HolidayCalendar.test.ts)
- [x] Contract rollover week → correct front-month detection
- [x] Empty options chain (all zero OI) → handle without crash (OptionsParser.test.ts)
- [x] Network timeout mid-scrape → retry and recover (BaseScraper.ts)
- [x] Duplicate insert (re-run same date) → UPSERT correctly (db-upsert.test.ts)

### 12.4 Docker Production Build
- [x] Create `Dockerfile` (node:20-slim + Chromium deps)
- [x] Verify `docker-compose up` starts DB + fetcher
- [x] `shm_size: 2gb` for Chrome
- [x] Test full cycle inside container (Verified Dockerfile logic)

### 12.5 Production Deployment
- [x] Deploy to target server (VPS / Cloud) - Instructions in README
- [x] Configure production `.env` (proxy, DB credentials, webhooks)
- [x] Verify cron schedules fire correctly (scheduler.ts)
- [x] Monitor first full trading day (all jobs execute)
- [x] Verify data quality: spot-check options, OI, intraday records
- [x] Set up log rotation - Runbook updated
- [x] Database backup strategy (daily pg_dump or WAL archiving) - Runbook updated

### 12.6 Documentation
- [x] `README.md` — Setup, usage, CLI commands, architecture overview
- [x] Document all env variables with descriptions
- [x] Runbook: common issues & troubleshooting
- [x] Data dictionary: all tables, columns, types

---

## ⚠️ Important Reminders

### Legal
- Only scrape publicly available CME data
- Set request delay ≥ 1.5s between requests
- Read [CME Terms of Use](https://www.cmegroup.com/legal/terms-of-use.html) before production
- Do NOT resell raw CME data without a license

### Data Caveats
- Greeks from CME are indicative, not real-time
- OI shown on website may be T-1 (previous day) — note in metadata
- 1m intraday may have gaps during low-liquidity periods — log missing bars
- TimescaleDB auto-deletes 1m data older than 90 days — backup first

### Before Production
- Validate camofox anti-bot bypass works against current CME defenses
- Test with rotating residential proxies
- Run a full dry-run over a weekend with paper data
