# Operations Runbook: CME Data Fetcher

## 🚨 Emergency Contacts & Alerts
System status is reported via **Slack** and **LINE** (if configured in `.env`).
- **Success**: Daily summary of records fetched.
- **Warning**: Partial failure or validation issues.
- **Critical**: Scheduler crash, DB unreachable, or persistent Bot Detection.

## 🛠 Common Issues & Resolutions

### 1. Bot Detection (`BOT_DETECT`)
**Symptom**: Logs show `Error classification: BOT_DETECT`. Browser screenshots in `errors/` show CME access denied page.
**Fixes**:
- **Proxy Rotation**: Ensure `PROXY_URL` is configured with a high-quality residential proxy.
- **Wait Time**: Increase the randomized delay in `BaseScraper`.
- **Session Reset**: Restart the container to clear browser cache and cookies.

### 2. Database Connectivity (`DB_ERROR`)
**Symptom**: Logs show `Query failed`, `Pool connection error`, or tests fail with `ECONNREFUSED 127.0.0.1:5433`.
**Fixes**:
- Check if Docker Desktop is running and the DB container is up (`docker ps`).
- If TimescaleDB is stopped or exited, start it from the Docker Desktop UI or run `docker-compose up -d db` (or the equivalent timescaledb service name).
- Verify `DATABASE_URL` matches the DB container name (usually `db:5432` inside container, or `127.0.0.1:5433` from host).
- Check DB logs: `docker-compose logs timescaledb`.

### 3. Chromium Crash / Shared Memory
**Symptom**: `Browser launch failed` or `Target closed`.
**Fixes**:
- Ensure `shm_size: '2gb'` is set in `docker-compose.yml`.
- If running on low-resource VPS, ensure at least 2GB RAM is available.

## 🧹 Maintenance Tasks

### Log Rotation
Logs are stored in `logs/fetcher.log`. The system uses `winston-daily-rotate-file` (if configured) or standard Docker logging.
- Manual cleanup: `truncate -s 0 logs/fetcher.log`.

### TimescaleDB Chunks
Intraday bars are stored in a hypertable.
- **Retention**: Data older than 90 days is auto-deleted via the retention policy set in migrations.
- To check disk usage: `SELECT * FROM hypertable_detailed_size('intraday_bars');`

## 🔄 Data Correction

### Missing Data Re-run
If a job failed for a specific date:
```bash
npm run backfill -- --symbol ES --date 2025-05-12
```

### Recomputing Analytics
If GEX or Max Pain logic changed, recompute historical summaries:
```bash
npm run recompute -- --all
```

### 🔌 Manual Fetch & Sync for Consumer Apps (e.g., GoldQuant)
If a consumer application like **GoldQuant** fails because output files (`options` or `oi`) are missing for the current date (e.g. after clearing the output folder or during holidays):

#### Current-file and archive behavior
Consumer apps should keep reading the top-level current files, for example:
- `output/options/GC_options_YYYYMMDD.csv`
- `output/oi/GC_options_oi_by_strike_YYYYMMDD.csv`
- `output/oi/GC_oi_summary_YYYYMMDD.csv`
- `output/intraday/GC_1m_YYYYMMDD.csv`
- `output/vol2vol/vol2vol_summary_latest.json`

The exporter also writes timestamped archive snapshots under `output/<kind>/archive/YYYYMMDD/*_HHMMSS.*`. These are for audit/debug/replay history and should not replace the top-level current files unless a consumer app explicitly implements archive selection.

#### 1. Run the manual fetch directly on the Host (Recommended if Docker engine mismatch occurs)
Since public options and futures OI do not require logged-in sessions:
```bash
# 1. Fetch Options for GC (Defaults to today's date)
npm run start -- --mode fetch --type OPTIONS --symbol GC

# 2. Fetch Futures OI for GC (Use the last active trading date, e.g., 2026-06-15)
npm run start -- --mode fetch --type OI --symbol GC --date 2026-06-15

# 3. Calculate OI Summary for GC (Use the last active trading date, e.g., 2026-06-14)
npm run start -- --mode fetch --type OI_SUMMARY --symbol GC --date 2026-06-14
```

#### 2. Copy/Sync files to today's date
If the market is closed (e.g., weekend/holiday) or today's data is not yet published, the files might be saved with the trade date. Copy them to today's date so the consumer app can read them:
```powershell
# In Windows PowerShell:
Copy-Item -Path .\output\oi\GC_options_oi_by_strike_20260614.csv -Destination .\output\oi\GC_options_oi_by_strike_20260616.csv
Copy-Item -Path .\output\oi\GC_oi_summary_20260614.csv -Destination .\output\oi\GC_oi_summary_20260616.csv
Copy-Item -Path .\output\oi\GC_futures_oi_20260615.csv -Destination .\output\oi\GC_futures_oi_20260616.csv
```

## 📜 Deployment & Operations Updates

### 1. Vol2Vol Cookie Expiry
The Vol2Vol scraper requires active CME cookies stored at `config/cme-cookies.json` to access the QuikStrikeExpectedRange tool.
- **Symptom**: Logs show `Could not find QuikStrike iframe. Cookie session might have expired.`
- **Resolution**: Run the login helper locally to refresh session cookies:
  ```bash
  npm run script:cme-login
  ```
  This launches a visible browser. Fill in your credentials, solve the MFA challenge, wait for it to successfully save cookies to `config/cme-cookies.json`, then commit/deploy the refreshed cookies to the server.

### 2. Dashboard Port (3002)
- The Express dashboard backend server is configured to bind to port **3002** by default (override via `DASHBOARD_PORT` in `.env`).
- Next.js frontend runs on port **3000** and proxies `/api/*` requests internally to port **3002**.
- For production, both containers join the external `nginx-proxy` network, and Nginx Proxy Manager handles reverse proxying on ports 80/443 without exposing ports 3000/3002 to the host.

### 3. Deployments
- **Automated**: Pushing code to `main` or `develop` branches triggers GitHub Actions `.github/workflows/deploy.yml` which deploys directly to the server via SSH.
- **Manual (One-Click)**: Run `.\deploy.ps1` inside Windows PowerShell to copy files via SCP and rebuild the containers on the droplet without pushing to Git.

## 📜 Deployment Checklist
1. [ ] Configure production `.env` (ensure TimescaleDB uses port `5433` to prevent conflict with other databases).
2. [ ] Ensure `config/cme-cookies.json` has an active session.
3. [ ] Verify `DATABASE_URL` is secure.
4. [ ] Test notification webhooks.
5. [ ] Verify proxy throughput.
6. [ ] Verify Nginx Proxy Manager configuration routing rules point to `cme-dashboard` on port 3000 and `cme-api` on port 3002.
