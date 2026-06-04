import type { OptionRecord } from '../types.js';
import { black76Greeks } from './Black76.js';

export interface GEXStrikePoint {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
}

export interface GEXRawPoint {
  strike: number;
  gex: number;
  option_type: 'C' | 'P';
}

export interface GEXResult {
  netGEX: number;
  gexByStrike: GEXStrikePoint[];
  rawGEXPoints: GEXRawPoint[];
  flipLevel: number;
}

const SYMBOL_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  NQ: 20,
  GC: 100,
};

/**
 * Calculates Gamma Exposure (GEX) for option records.
 */
export function calculateGEX(
  options: OptionRecord[],
  symbol: string,
  mode: 'scraped' | 'computed' = 'scraped',
  r: number = 0.05
): GEXResult {
  const multiplier = SYMBOL_MULTIPLIERS[symbol.toUpperCase()];
  if (multiplier === undefined) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  if (!options || options.length === 0) {
    return { netGEX: 0, gexByStrike: [], rawGEXPoints: [], flipLevel: 0 };
  }

  const rawGEXPoints: GEXRawPoint[] = [];
  const strikeMap = new Map<number, { callGEX: number; putGEX: number }>();

  for (const opt of options) {
    if (
      opt.open_interest === null ||
      opt.open_interest === undefined ||
      opt.open_interest === 0 ||
      opt.underlying_price === null ||
      opt.underlying_price === undefined ||
      opt.underlying_price === 0
    ) {
      continue;
    }

    let gamma = opt.gamma;
    if (mode === 'computed' && opt.implied_vol && opt.implied_vol > 0) {
      const T = opt.days_to_expiry / 365;
      try {
        const computed = black76Greeks(opt.underlying_price, opt.strike, T, opt.implied_vol, r, opt.option_type);
        gamma = computed.gamma;
      } catch (err) {
        gamma = opt.gamma;
      }
    }

    if (gamma === null || gamma === undefined || gamma === 0) {
      continue;
    }

    const sign = opt.option_type === 'C' ? 1 : -1;
    const gex = sign * gamma * opt.open_interest * multiplier * opt.underlying_price;

    rawGEXPoints.push({
      strike: opt.strike,
      gex,
      option_type: opt.option_type as 'C' | 'P',
    });

    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, { callGEX: 0, putGEX: 0 });
    }
    const current = strikeMap.get(opt.strike)!;
    if (opt.option_type === 'C') {
      current.callGEX += gex;
    } else {
      current.putGEX += gex;
    }
  }

  const gexByStrike: GEXStrikePoint[] = [];
  let netGEX = 0;

  for (const [strike, values] of strikeMap.entries()) {
    const strikeNet = values.callGEX + values.putGEX;
    netGEX += strikeNet;
    gexByStrike.push({
      strike,
      callGEX: values.callGEX,
      putGEX: values.putGEX,
      netGEX: strikeNet,
    });
  }

  // Sort by strike ascending
  gexByStrike.sort((a, b) => a.strike - b.strike);

  // GEX Flip Level = strike where cumulative GEX flips sign
  let flipLevel = 0;
  let cumulativeGEX = 0;
  
  for (let i = 0; i < gexByStrike.length; i++) {
    const point = gexByStrike[i];
    const prevGEX = cumulativeGEX;
    cumulativeGEX += point.netGEX;

    if (i > 0 && ((prevGEX >= 0 && cumulativeGEX < 0) || (prevGEX <= 0 && cumulativeGEX > 0))) {
      flipLevel = point.strike;
      break;
    }
  }

  return {
    netGEX,
    gexByStrike,
    rawGEXPoints,
    flipLevel,
  };
}

/**
 * Calculates GEX grouped by expiry code.
 */
export function calculateGEXByExpiry(options: OptionRecord[], symbol: string): Map<string, GEXResult> {
  const groups = new Map<string, OptionRecord[]>();
  
  for (const opt of options) {
    const key = opt.expiry_code;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(opt);
  }

  const results = new Map<string, GEXResult>();
  for (const [expiryCode, opts] of groups.entries()) {
    results.set(expiryCode, calculateGEX(opts, symbol));
  }

  return results;
}
