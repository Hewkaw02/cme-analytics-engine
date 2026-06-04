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
**Symptom**: Logs show `Query failed` or `Pool connection error`.
**Fixes**:
- Check if DB container is running: `docker ps`.
- Verify `DATABASE_URL` matches the DB container name (usually `db:5432`).
- Check DB logs: `docker-compose logs db`.

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

## 📜 Deployment Checklist
1. [ ] Configure production `.env`.
2. [ ] Verify `DATABASE_URL` is secure.
3. [ ] Test notification webhooks.
4. [ ] Verify proxy throughput.
5. [ ] Run `npm run test` on the target server.
