/**
 * Re-export from canonical config location.
 * This file exists for backwards compatibility — use `src/config/defaults.ts` directly.
 */
export {
  REQUEST_DELAY_MIN,
  REQUEST_DELAY_MAX,
  MAX_BROWSER_INSTANCES,
  DB_MIN_POOL,
  DB_MAX_POOL,
  KEEP_DAYS,
  OUTPUT_DIR,
  MAX_RETRIES_TRANSIENT,
  MAX_RETRIES_BOT_DETECT,
  IV_MIN,
  IV_MAX,
  SPREAD_WARNING_THRESHOLD,
  ATM_THRESHOLD_PCT,
  BATCH_SIZE,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS,
} from '../src/config/defaults.js';
