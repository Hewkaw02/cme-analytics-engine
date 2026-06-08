import type { OptionRecord } from '../types.js';

export interface PainPoint {
  strike: number;
  callPain: number;
  putPain: number;
  totalPain: number;
}

export interface MaxPainResult {
  maxPainStrike: number;
  painByStrike: PainPoint[];
}

/**
 * Calculates the Max Pain strike price from a list of option records.
 * Max Pain is the strike price where option buyers would lose the most money
 * (meaning option sellers/market makers have the minimum payout/pain).
 */
export function calculateMaxPain(options: OptionRecord[]): MaxPainResult {
  if (!options || options.length === 0) {
    return { maxPainStrike: 0, painByStrike: [] };
  }

  // Find all unique strikes in the options chain
  const strikes = Array.from(new Set(options.map((o) => o.strike))).sort((a, b) => a - b);
  
  if (strikes.length === 0) {
    return { maxPainStrike: 0, painByStrike: [] };
  }

  // If all open interest is zero, max pain strike is 0
  const totalOi = options.reduce((sum, o) => sum + Number(o.open_interest ?? 0), 0);
  if (totalOi === 0) {
    return { maxPainStrike: 0, painByStrike: [] };
  }

  const painByStrike: PainPoint[] = [];
  let minPain = Infinity;
  let maxPainStrike = 0;

  for (const testStrike of strikes) {
    let callPain = 0;
    let putPain = 0;

    for (const opt of options) {
      const oi = Number(opt.open_interest ?? 0);
      if (oi === 0) continue;

      const optStrike = Number(opt.strike);

      if (opt.option_type === 'C') {
        // Calls: if underlying finishes at testStrike, buyer profits if testStrike > strike
        // Loss to buyer is 0, seller payout is (testStrike - strike) * OI
        if (testStrike > optStrike) {
          callPain += (testStrike - optStrike) * oi;
        }
      } else if (opt.option_type === 'P') {
        // Puts: if underlying finishes at testStrike, buyer profits if testStrike < strike
        // Seller payout is (strike - testStrike) * OI
        if (testStrike < optStrike) {
          putPain += (optStrike - testStrike) * oi;
        }
      }
    }

    const totalPain = callPain + putPain;
    painByStrike.push({
      strike: testStrike,
      callPain,
      putPain,
      totalPain,
    });

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  }

  return {
    maxPainStrike,
    painByStrike,
  };
}

/**
 * Calculates Max Pain grouped by expiry code.
 */
export function calculateMaxPainByExpiry(options: OptionRecord[]): Map<string, MaxPainResult> {
  const groups = new Map<string, OptionRecord[]>();
  
  for (const opt of options) {
    const key = opt.expiry_code;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(opt);
  }

  const results = new Map<string, MaxPainResult>();
  for (const [expiryCode, opts] of groups.entries()) {
    results.set(expiryCode, calculateMaxPain(opts));
  }

  return results;
}
