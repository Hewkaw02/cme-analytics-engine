export interface SymbolConfig {
  name: string;
  fullName: string;
  exchange: string;
  productCode: number;
  optionsProductId?: number; // New field for ATM API
  contractMultiplier: number;
  tickSize: number;
  optionsUrl: string;
  futuresUrl: string;
  rthStart: string;
  rthEnd: string;
}

/**
 * CME Symbol Configurations per Spec §3.2
 */
export const SYMBOLS: Record<string, SymbolConfig> = {
  ES: {
    name: 'ES',
    fullName: 'E-mini S&P 500',
    exchange: 'CME',
    productCode: 133,
    optionsProductId: 138,
    contractMultiplier: 50,
    tickSize: 0.25,
    optionsUrl: 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html',
    futuresUrl: 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html',
    rthStart: '08:30',
    rthEnd: '15:15',
  },
  NQ: {
    name: 'NQ',
    fullName: 'E-mini Nasdaq-100',
    exchange: 'CME',
    productCode: 146,
    optionsProductId: 148,
    contractMultiplier: 20,
    tickSize: 0.25,
    optionsUrl: 'https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.quotes.options.html',
    futuresUrl: 'https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.quotes.html',
    rthStart: '08:30',
    rthEnd: '15:15',
  },
  GC: {
    name: 'GC',
    fullName: 'Gold',
    exchange: 'COMEX',
    productCode: 437,
    optionsProductId: 192,
    contractMultiplier: 100,
    tickSize: 0.1,
    optionsUrl: 'https://www.cmegroup.com/markets/metals/precious/gold.quotes.options.html',
    futuresUrl: 'https://www.cmegroup.com/markets/metals/precious/gold.quotes.html',
    rthStart: '07:20',
    rthEnd: '12:30',
  },
};

/**
 * Mapping of symbols to their CME settlement product IDs.
 * Note: These can differ from the main product codes.
 */
export const CME_SETTLEMENT_PRODUCT_CODES: Record<string, string> = {
  ES: '133',
  NQ: '146',
  GC: '437',
};

export const CME_PRODUCT_CODES: Record<string, string> = {
  ES: '441',
  NQ: '425',
  GC: '437',
};
