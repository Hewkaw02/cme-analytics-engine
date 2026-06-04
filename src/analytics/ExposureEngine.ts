import type { OptionRecord } from '../types.js';
import { black76Greeks } from './Black76.js';

export interface StrikeExposure {
  strike: number;
  callGex: number; // Dollar Gamma per point
  putGex: number;
  netGex: number;
  callDex: number; // Dollar Delta
  putDex: number;
  netDex: number;
  callVanna: number;
  putVanna: number;
  netVanna: number;
  callCharm: number;
  putCharm: number;
  netCharm: number;
}

export interface ExposureResult {
  netGex: number;
  netDex: number;
  netVanna: number;
  netCharm: number;
  gexFlipPrice: number | null;
  byStrike: StrikeExposure[];
}

const SYMBOL_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  NQ: 20,
  GC: 100,
};

/**
 * Find the exact price where cumulative Net GEX flips from negative to positive.
 * Uses linear interpolation between the two strikes flanking the crossover point.
 */
export function findGEXFlipPrice(strikeExposures: StrikeExposure[]): number | null {
  if (strikeExposures.length < 2) return null;

  // Sort by strike price
  const sorted = [...strikeExposures].sort((a, b) => a.strike - b.strike);

  // We want to find the first strike where netGex flips sign,
  // or do a cumulative sum flip search.
  // Standard method 1: Spot-wise crossover of cumulative GEX.
  // Standard method 2: Interpolating the strike where individual Net GEX crosses zero.
  // In the Python dashboard, GEX Flip is where the cumulative sum of Net GEX crosses 0.
  // Let's implement the cumulative sum crossover linear interpolation.
  let cumGex = 0;
  const cumGexPoints: { strike: number; cumGex: number }[] = [];

  for (const pt of sorted) {
    cumGex += pt.netGex;
    cumGexPoints.push({ strike: pt.strike, cumGex });
  }

  for (let i = 0; i < cumGexPoints.length - 1; i++) {
    const p1 = cumGexPoints[i];
    const p2 = cumGexPoints[i + 1];

    if ((p1.cumGex < 0 && p2.cumGex > 0) || (p1.cumGex > 0 && p2.cumGex < 0)) {
      // Linear interpolation: y = mx + c. We want x where y = 0.
      // x = x1 + (0 - y1) * (x2 - x1) / (y2 - y1)
      const dy = p2.cumGex - p1.cumGex;
      if (dy === 0) return p1.strike;
      return p1.strike + (0 - p1.cumGex) * (p2.strike - p1.strike) / dy;
    }
  }

  return null;
}

/**
 * Calculates Net dealer exposures (GEX, DEX, Vanna, Charm) across the options chain.
 * Uses the Black-76 model to compute Greeks from first principles.
 * 
 * @param options Option chain records
 * @param spotPrice Current spot price of the underlying futures
 * @param r Risk-free rate (e.g. 0.05 for 5%)
 * @param useComputedGreeks If true, computes Greeks using Black-76. If false, falls back to scraped Greeks (where available).
 */
export function calculateDealerExposures(
  options: OptionRecord[],
  spotPrice: number,
  r: number = 0.05,
  useComputedGreeks: boolean = true
): ExposureResult {
  const symbol = options[0]?.symbol || 'ES';
  const multiplier = SYMBOL_MULTIPLIERS[symbol.toUpperCase()] || 50;

  const strikeMap = new Map<number, StrikeExposure>();

  for (const opt of options) {
    if (!opt.strike || !opt.open_interest) continue;

    // Use Black-76 calculated Greeks or fallback to scraped ones
    let delta = opt.delta ?? 0;
    let gamma = opt.gamma ?? 0;
    let vega = opt.vega ?? 0;
    let theta = opt.theta ?? 0;
    let vanna = 0;
    let charm = 0;

    if (useComputedGreeks && opt.implied_vol && opt.implied_vol > 0) {
      const T = opt.days_to_expiry / 365;
      const iv = opt.implied_vol;

      try {
        const computed = black76Greeks(spotPrice, opt.strike, T, iv, r, opt.option_type);
        delta = computed.delta;
        gamma = computed.gamma;
        vega = computed.vega;
        theta = computed.theta;
        vanna = computed.vanna;
        charm = computed.charm;
      } catch (err) {
        // Fallback to scraped if calculation errors out
        delta = opt.delta ?? 0;
        gamma = opt.gamma ?? 0;
      }
    }

    // Dealer Position Sign assumption:
    // Calls: Retail buys calls -> MM/Dealer is Short Calls (Sign = -1)
    // Puts: Retail buys puts -> MM/Dealer is Short Puts (Sign = +1)
    // Wait! Let's check GEX standard dealer perspective:
    // Call Dealer Gamma = -Gamma. Call GEX = -1 * Gamma * OI * spot * multiplier
    // Put Dealer Gamma = +Gamma. Put GEX = +1 * Gamma * OI * spot * multiplier
    // Let's use: Calls = +1, Puts = -1 to keep consistency with the GEX.ts module,
    // which calculates "customer/net portfolio gamma" (Call = +1, Put = -1).
    // Let's stick to Call GEX = +1 * Gamma * OI * Spot * Multiplier, Put GEX = -1 * Gamma * OI * Spot * Multiplier.
    const sign = opt.option_type === 'C' ? 1 : -1;

    // Dollar Exposure formulas:
    const gex = sign * gamma * opt.open_interest * spotPrice * multiplier;
    const dex = sign * delta * opt.open_interest * spotPrice * multiplier;
    const vannaExp = sign * vanna * opt.open_interest * multiplier;
    const charmExp = sign * charm * opt.open_interest * spotPrice * multiplier;

    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, {
        strike: opt.strike,
        callGex: 0, putGex: 0, netGex: 0,
        callDex: 0, putDex: 0, netDex: 0,
        callVanna: 0, putVanna: 0, netVanna: 0,
        callCharm: 0, putCharm: 0, netCharm: 0,
      });
    }

    const item = strikeMap.get(opt.strike)!;

    if (opt.option_type === 'C') {
      item.callGex += gex;
      item.callDex += dex;
      item.callVanna += vannaExp;
      item.callCharm += charmExp;
    } else {
      item.putGex += gex;
      item.putDex += dex;
      item.putVanna += vannaExp;
      item.putCharm += charmExp;
    }

    item.netGex = item.callGex + item.putGex;
    item.netDex = item.callDex + item.putDex;
    item.netVanna = item.callVanna + item.putVanna;
    item.netCharm = item.callCharm + item.putCharm;
  }

  const byStrike = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

  let netGex = 0;
  let netDex = 0;
  let netVanna = 0;
  let netCharm = 0;

  for (const item of byStrike) {
    netGex += item.netGex;
    netDex += item.netDex;
    netVanna += item.netVanna;
    netCharm += item.netCharm;
  }

  const gexFlipPrice = findGEXFlipPrice(byStrike);

  return {
    netGex,
    netDex,
    netVanna,
    netCharm,
    gexFlipPrice,
    byStrike,
  };
}
