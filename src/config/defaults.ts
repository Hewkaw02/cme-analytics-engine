/**
 * Default configuration values for the CME Data Fetcher.
 */

/** Minimum delay between requests (ms) — per legal compliance */
export const REQUEST_DELAY_MIN = 1500;
export const REQUEST_DELAY_MAX = 2500;

/** Maximum browser instances in the pool */
export const MAX_BROWSER_INSTANCES = 2;

/** Database connection pool defaults */
export const DB_MIN_POOL = 2;
export const DB_MAX_POOL = 10;

/** CSV export defaults */
export const KEEP_DAYS = 90;
export const OUTPUT_DIR = './output';

/** Retry defaults */
export const MAX_RETRIES_TRANSIENT = 3;
export const MAX_RETRIES_BOT_DETECT = 2;

/** Validation thresholds */
export const IV_MIN = 0.0001;
export const IV_MAX = 3.0;
export const SPREAD_WARNING_THRESHOLD = 0.50; // 50%
export const ATM_THRESHOLD_PCT = 0.005;       // 0.5% of underlying

/** Batch insert size */
export const BATCH_SIZE = 500;

/** Circuit breaker defaults */
export const CIRCUIT_BREAKER_THRESHOLD = 5;
export const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes
