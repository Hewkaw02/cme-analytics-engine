// ===================================================
// Shared TypeScript interfaces for the CME Data Fetcher
// ===================================================

// --- Symbol & Product ---

export type Symbol = 'ES' | 'NQ' | 'GC';

export interface SymbolConfig {
  name: string;
  fullName: string;
  productCode: string | number;
  optionsProductId?: number; // New field for ATM API
  exchange: string;
  optionsUrl: string;
  futuresUrl: string;
  contractMultiplier: number;
  tickSize: number;
  rthStart: string;
  rthEnd: string;
}

/** CME options page URLs keyed by Symbol */
export const CME_OPTIONS_URLS: Record<Symbol, string> = {
  ES: 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html',
  NQ: 'https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.quotes.options.html',
  GC: 'https://www.cmegroup.com/markets/metals/precious/gold.quotes.options.html',
};

/** CME product codes for REST API fallback */
export const CME_PRODUCT_CODES: Record<Symbol, string> = {
  ES: '441',
  NQ: '425',
  GC: '437',
};

// --- Expiry ---

export interface ExpiryInfo {
  code: string; // e.g. "ESM25"
  label: string; // human-readable label from <option> text
  date: string; // YYYY-MM-DD
}

// --- Raw Options (from CME API) ---

export interface CmeOptionsRaw {
  strikePrices: Array<{
    strikePrice: string;
    call: CmeOptionSide;
    put: CmeOptionSide;
  }>;
  tradeDate: string;
  underlyingPrice?: string;
}

export interface CmeOptionSide {
  last: string;
  priorSettle: string; // Changed from settle
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  volume: string;
  openInterest: string;
  openInterestChange: string;
  high: string;
  low: string;
  open: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
  impliedVolatility: string;
  theoreticalValue: string;
}

// --- Data Queues ---

export interface DataQueues {
  options: QueueBuffer<CmeOptionsRaw>;
  intraday: QueueBuffer<{ url: string; raw: unknown }>;
  settlement: QueueBuffer<unknown>;
}

export interface QueueBuffer<T> {
  push(item: T): void;
  drain(): T[];
  size(): number;
}

// --- Options Chain ---

export interface OptionRecord {
  trade_date: string;
  fetched_at: string;
  symbol: string;
  expiry_code: string;
  expiry_date: string;
  days_to_expiry: number;
  strike: number;
  option_type: 'C' | 'P';
  last_price: number | null;
  settle_price: number | null;
  bid: number | null;
  ask: number | null;
  bid_size: number | null;
  ask_size: number | null;
  volume: number;
  open_interest: number;
  oi_change: number;
  high: number | null;
  low: number | null;
  open: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  implied_vol: number | null;
  theoretical_value: number | null;
  underlying_price: number | null;
  intrinsic_value: number | null;
  time_value: number | null;
  moneyness: 'ITM' | 'ATM' | 'OTM' | null;
  is_valid?: boolean;
  validation_notes?: string | null;
  // Used internally by Validator — not persisted to DB
  validation_warnings?: string[];
  validation_errors?: string[];
}

// --- Options Result (from Validator) ---

export interface OptionsResult {
  records: OptionRecord[];
  summary: {
    symbol: string;
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
    errors: string[];
  };
}

// --- Validation ---

export interface ValidationResult {
  record: OptionRecord;
  isValid: boolean;
  warnings: string[];
  errors: string[];
  action: 'keep' | 'skip' | 'mark_invalid';
}

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  skipped: number;
  warnings: number;
}

// --- Browser / Scraper ---

export interface SessionConfig {
  headless: boolean;
  proxy?: string;
  userAgent: string;
  stealth?: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  cookiePersist: boolean;
  cookieFile?: string;
}

// --- Strike OI ---

export interface StrikeOIRecord {
  trade_date: string;
  symbol: string;
  expiry_code: string;
  strike: number;
  underlying_price: number | null;
  call_oi: number;
  put_oi: number;
  call_oi_change: number;
  put_oi_change: number;
  call_volume: number;
  put_volume: number;
  call_iv: number | null;
  put_iv: number | null;
  iv_skew: number | null;
  net_delta_exposure: number | null;
}

// --- OI Summary ---

export interface OISummaryRecord {
  trade_date: string;
  symbol: string;
  expiry_code: string;
  expiry_date: string | null;
  days_to_expiry: number | null;
  underlying_price: number | null;
  total_call_oi: number;
  total_put_oi: number;
  total_call_volume: number;
  total_put_volume: number;
  put_call_oi_ratio: number | null;
  put_call_vol_ratio: number | null;
  max_call_oi_strike: number | null;
  max_put_oi_strike: number | null;
  max_pain_strike: number | null;
  max_call_oi_value: number | null;
  max_put_oi_value: number | null;
  net_gamma_exposure: number | null;
  gex_flip_level: number | null;
  atm_iv_call: number | null;
  atm_iv_put: number | null;
  atm_iv_skew: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
}

// --- Futures OI ---

export interface FuturesOIRecord {
  trade_date: string;
  symbol: string;
  expiry_code: string;
  expiry_date: string | null;
  total_oi: number | null;
  oi_change: number | null;
  oi_change_pct: number | null;
  total_volume: number | null;
  settle_price: number | null;
  prior_settle: number | null;
  price_change: number | null;
  source: string;
  fetched_at: string;
}

// --- Intraday ---

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export interface IntradayBar {
  bar_time: string;
  bar_close_time: string;
  symbol: string;
  timeframe: string;
  expiry_code?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  buy_volume: number | null;
  sell_volume: number | null;
  delta_volume: number | null;
  trade_count: number | null;
  session: string;
  is_rth: boolean;

  // Indicators (calculated post-insert)
  vwap_session: number | null;
  ema_9: number | null;
  ema_21: number | null;
  atr_14: number | null;
  rsi_14: number | null;
  bb_upper: number | null;
  bb_lower: number | null;

  // Computed Indicators (Pillar 2 Volume Profile / SD bands)
  cvd: number | null;
  vwap_sd1_upper: number | null;
  vwap_sd1_lower: number | null;
  vwap_sd2_upper: number | null;
  vwap_sd2_lower: number | null;

  fetched_at: string;
}

// --- Settlement ---

export interface SettlementRecord {
  trade_date: string;
  symbol: string;
  expiry_code: string;
  open: number | null;
  high: number | null;
  low: number | null;
  settle: number | null;
  prior_settle: number | null;
  change: number | null;
  est_volume: number | null;
  prior_oi: number | null;
  oi: number | null;
  source: string | null;
  fetched_at: string;
}

// --- Error Classification ---

export enum ErrorType {
  TRANSIENT = 'TRANSIENT',
  BOT_DETECT = 'BOT_DETECT',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION = 'VALIDATION',
  DB_ERROR = 'DB_ERROR',
  FATAL = 'FATAL',
}

// --- Job Logging ---

export type JobStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type JobType = 'OPTIONS' | 'OI' | 'INTRADAY' | 'SETTLEMENT' | 'BULLETIN' | 'ANALYSIS';

export interface FetchJobRecord {
  id?: number;
  job_type: JobType;
  symbol: string;
  trade_date: string;
  status: JobStatus;
  records_inserted: number;
  records_skipped: number;
  records_invalid: number;
  error_message?: string;
  retry_count: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

// --- Upsert Stats ---

export interface UpsertStats {
  inserted: number;
  updated: number;
  skipped?: number;
  total: number;
}

// --- Backtest Runs & Trades ---

export interface BacktestRunRecord {
  id?: string;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_trades: number;
  win_rate: number;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number;
  profit_factor: number | null;
  parameters: Record<string, any>;
  created_at?: string;
}

export interface BacktestTradeRecord {
  id?: string;
  run_id: string;
  entry_time: string;
  exit_time: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
}

// --- Database Schema (Kysely) ---

export interface Database {
  options_chain: OptionRecord;
  futures_oi: FuturesOIRecord;
  intraday_bars: IntradayBar;
  daily_settlement: SettlementRecord;
  oi_expiry_summary: OISummaryRecord;
  fetch_jobs: FetchJobRecord;
  cme_holidays: {
    holiday_date: string;
    holiday_name: string;
    is_trading_holiday: boolean;
  };
  backtest_runs: BacktestRunRecord;
  backtest_trades: BacktestTradeRecord;
}
