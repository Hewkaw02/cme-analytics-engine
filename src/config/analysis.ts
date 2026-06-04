import { Symbol, Timeframe } from '../types.js';

export interface AnalysisConfig {
  enabled: boolean;
  cron: string;
  symbols: Symbol[];
  timeframes: Timeframe[];
  fetchOi: boolean;
}

const DEFAULT_CRON = '0 17-23,0-15 * * 1-5';
const DEFAULT_SYMBOLS: Symbol[] = ['ES', 'NQ', 'GC'];
const DEFAULT_TIMEFRAMES: Timeframe[] = ['1m'];
const VALID_SYMBOLS = new Set<string>(DEFAULT_SYMBOLS);
const VALID_TIMEFRAMES = new Set<string>(['1m', '5m', '15m', '30m', '1h', '4h', '1D']);

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

function parseList<T extends string>(
  value: string | undefined,
  defaultValue: T[],
  validValues: Set<string>,
  label: string,
): T[] {
  if (value === undefined || value.trim() === '') return defaultValue;

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const item of items) {
    if (!validValues.has(item)) {
      throw new Error(`Invalid ${label}: ${item}`);
    }
  }

  return items as T[];
}

export function parseAnalysisConfig(source: NodeJS.ProcessEnv): AnalysisConfig {
  return {
    enabled: parseBoolean(source.ANALYSIS_ENABLED, true),
    cron: source.ANALYSIS_CRON?.trim() || DEFAULT_CRON,
    symbols: parseList<Symbol>(source.ANALYSIS_SYMBOLS, DEFAULT_SYMBOLS, VALID_SYMBOLS, 'analysis symbol'),
    timeframes: parseList<Timeframe>(
      source.ANALYSIS_TIMEFRAMES,
      DEFAULT_TIMEFRAMES,
      VALID_TIMEFRAMES,
      'analysis timeframe',
    ),
    fetchOi: parseBoolean(source.ANALYSIS_FETCH_OI, true),
  };
}

export const analysisConfig = parseAnalysisConfig(process.env);
