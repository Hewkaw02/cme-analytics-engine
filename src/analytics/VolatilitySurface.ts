import type { OptionRecord } from '../types.js';

export interface StrikeIV {
  strike: number;
  iv: number;
}

export interface SDBandsResult {
  spotPrice: number;
  atmIV: number;
  dte: number;
  sd1Upper: number;
  sd1Lower: number;
  sd2Upper: number;
  sd2Lower: number;
}

/**
 * Linearly interpolates the ATM Implied Volatility (IV) using the two flanking strikes nearest to the spot price.
 * This avoids the OTM bias that simple min(IV) or nearest-strike methods suffer from.
 */
export function interpolateATMIV(spotPrice: number, strikeIVs: StrikeIV[]): number | null {
  const valid = strikeIVs
    .filter((s) => s.iv !== null && s.iv !== undefined && s.iv > 0 && s.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].iv;

  // Find flanking strikes
  let lowerFlank: StrikeIV | null = null;
  let upperFlank: StrikeIV | null = null;

  for (let i = 0; i < valid.length; i++) {
    const pt = valid[i];
    if (pt.strike <= spotPrice) {
      lowerFlank = pt;
    }
    if (pt.strike >= spotPrice && upperFlank === null) {
      upperFlank = pt;
      break;
    }
  }

  // Edge cases: spot price is outside the strike range
  if (!lowerFlank && upperFlank) return upperFlank.iv;
  if (lowerFlank && !upperFlank) return lowerFlank.iv;
  if (!lowerFlank && !upperFlank) return null; // Should not happen given length >= 2

  // Flanking strikes found
  const x1 = lowerFlank!.strike;
  const y1 = lowerFlank!.iv;
  const x2 = upperFlank!.strike;
  const y2 = upperFlank!.iv;

  if (x1 === x2) return y1;

  // Linear interpolation: y = y1 + (y2 - y1) * (spot - x1) / (x2 - x1)
  return y1 + (y2 - y1) * (spotPrice - x1) / (x2 - x1);
}

/**
 * Calculates Standard Deviation Bands based on Spot Price, ATM IV, and Days to Expiration (DTE).
 * Formula: spot +/- (IV * spot * sqrt(DTE/365) * n)
 */
export function calculateSDBands(
  spotPrice: number,
  atmIV: number,
  dte: number
): SDBandsResult {
  const t = dte / 365;
  const oneStdDevMove = atmIV * spotPrice * Math.sqrt(t);

  return {
    spotPrice,
    atmIV,
    dte,
    sd1Upper: spotPrice + oneStdDevMove,
    sd1Lower: spotPrice - oneStdDevMove,
    sd2Upper: spotPrice + 2 * oneStdDevMove,
    sd2Lower: spotPrice - 2 * oneStdDevMove,
  };
}

/**
 * Solves for the implied underlying futures price for each expiry code using Put-Call parity.
 * Formula: F = K + e^(rT) * (Call - Put)
 */
export function solveImpliedFuturesPrice(options: OptionRecord[], r: number = 0.05): Map<string, number> {
  const expiryGroups = new Map<string, OptionRecord[]>();
  for (const opt of options) {
    if (!expiryGroups.has(opt.expiry_code)) {
      expiryGroups.set(opt.expiry_code, []);
    }
    expiryGroups.get(opt.expiry_code)!.push(opt);
  }

  const impliedPrices = new Map<string, number>();

  for (const [expiryCode, group] of expiryGroups.entries()) {
    const dte = group[0]?.days_to_expiry || 0;
    const T = dte / 365;
    const discountFactor = Math.exp(r * T);

    const strikeMap = new Map<number, { callPrice?: number; putPrice?: number }>();
    for (const opt of group) {
      if (opt.settle_price === null || opt.settle_price === undefined) continue;
      const strikeVal = Number(opt.strike);
      const settleVal = Number(opt.settle_price);
      
      if (!strikeMap.has(strikeVal)) {
        strikeMap.set(strikeVal, {});
      }
      const item = strikeMap.get(strikeVal)!;
      if (opt.option_type === 'C') {
        item.callPrice = settleVal;
      } else {
        item.putPrice = settleVal;
      }
    }

    const candidates: { strike: number; impliedF: number; diff: number }[] = [];
    for (const [strike, prices] of strikeMap.entries()) {
      if (prices.callPrice !== undefined && prices.putPrice !== undefined) {
        const impliedF = strike + discountFactor * (prices.callPrice - prices.putPrice);
        candidates.push({
          strike,
          impliedF,
          diff: Math.abs(prices.callPrice - prices.putPrice),
        });
      }
    }

    if (candidates.length > 0) {
      // Sort by absolute call/put price difference to find ATM
      candidates.sort((a, b) => a.diff - b.diff);
      const topCount = Math.min(3, candidates.length);
      let sumF = 0;
      for (let i = 0; i < topCount; i++) {
        sumF += candidates[i].impliedF;
      }
      impliedPrices.set(expiryCode, sumF / topCount);
    }
  }

  return impliedPrices;
}
