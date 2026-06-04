/**
 * Black-76 Option Pricing Model & Greeks calculations for Futures Options.
 * Reference: Black, F. (1976). "The pricing of commodity contracts". Journal of Financial Economics.
 */

/**
 * Standard normal probability density function (PDF).
 */
export function norm_pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal cumulative distribution function (CDF).
 * Using Abramowitz & Stegun (formula 26.2.17) approximation.
 * Maximum error: 7.5e-8.
 */
export function norm_cdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0.0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

export interface Black76GreeksResult {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  vanna: number;
  charm: number;
}

/**
 * Solves for Implied Volatility using Newton-Raphson with a Bisection fallback.
 * 
 * @param marketPrice The observed market price of the option (settlement or last price)
 * @param F Futures spot price
 * @param K Strike price
 * @param T Time to expiration (years)
 * @param r Risk-free rate
 * @param type Option type: 'C' or 'P'
 */
export function impliedVolatility(
  marketPrice: number,
  F: number,
  K: number,
  T: number,
  r: number,
  type: 'C' | 'P'
): number | null {
  if (marketPrice <= 0 || F <= 0 || K <= 0 || T <= 0) return null;

  const discount = Math.exp(-r * T);
  const intrinsic = type === 'C' ? Math.max(0, F - K) : Math.max(0, K - F);
  
  if (marketPrice <= discount * intrinsic) {
    return 0.0001; // Floor close to zero
  }

  let low = 0.0001;
  let high = 5.0; // 500% IV cap
  let sigma = 0.25; // standard initial guess

  for (let i = 0; i < 50; i++) {
    const price = black76Price(F, K, T, sigma, r, type);
    const diff = price - marketPrice;

    if (Math.abs(diff) < 1e-5) {
      return sigma;
    }

    const greeks = black76Greeks(F, K, T, sigma, r, type);
    const vega = greeks.vega;

    if (vega > 1e-4) {
      const step = diff / vega;
      const nextSigma = sigma - step;
      if (nextSigma > low && nextSigma < high) {
        sigma = nextSigma;
        continue;
      }
    }

    // Fallback to Bisection
    if (diff > 0) {
      high = sigma;
    } else {
      low = sigma;
    }
    sigma = 0.5 * (low + high);

    if (high - low < 1e-5) {
      break;
    }
  }

  return sigma;
}

/**
 * Calculates option price under the Black-76 model.
 * 
 * @param F Futures spot price
 * @param K Strike price
 * @param T Time to expiration (years)
 * @param sigma Implied volatility (decimal, e.g., 0.15 for 15%)
 * @param r Risk-free interest rate (decimal, e.g., 0.05 for 5%)
 * @param type Option type: 'C' (Call) or 'P' (Put)
 */
export function black76Price(
  F: number,
  K: number,
  T: number,
  sigma: number,
  r: number,
  type: 'C' | 'P'
): number {
  if (F <= 0 || K <= 0) return 0;
  
  const discount = Math.exp(-r * T);

  // Expiration edge case
  if (T <= 0) {
    if (type === 'C') return Math.max(0, F - K);
    return Math.max(0, K - F);
  }

  // Zero volatility edge case
  if (sigma <= 0) {
    if (type === 'C') return discount * Math.max(0, F - K);
    return discount * Math.max(0, K - F);
  }

  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'C') {
    return discount * (F * norm_cdf(d1) - K * norm_cdf(d2));
  } else {
    return discount * (K * norm_cdf(-d2) - F * norm_cdf(-d1));
  }
}

/**
 * Calculates option Greeks under the Black-76 model.
 * 
 * @param F Futures spot price
 * @param K Strike price
 * @param T Time to expiration (years)
 * @param sigma Implied volatility (decimal, e.g., 0.15 for 15%)
 * @param r Risk-free interest rate (decimal, e.g., 0.05 for 5%)
 * @param type Option type: 'C' (Call) or 'P' (Put)
 */
export function black76Greeks(
  F: number,
  K: number,
  T: number,
  sigma: number,
  r: number,
  type: 'C' | 'P'
): Black76GreeksResult {
  const result: Black76GreeksResult = {
    delta: 0,
    gamma: 0,
    vega: 0,
    theta: 0,
    vanna: 0,
    charm: 0
  };

  if (F <= 0 || K <= 0) return result;

  const discount = Math.exp(-r * T);

  // Expiration edge case
  if (T <= 0) {
    if (type === 'C') {
      result.delta = F > K ? 1 : (F === K ? 0.5 : 0);
    } else {
      result.delta = F < K ? -1 : (F === K ? -0.5 : 0);
    }
    return result;
  }

  // Zero volatility edge case
  if (sigma <= 0) {
    if (type === 'C') {
      result.delta = F > K ? discount : (F === K ? 0.5 * discount : 0);
    } else {
      result.delta = F < K ? -discount : (F === K ? -0.5 * discount : 0);
    }
    return result;
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const n_d1 = norm_pdf(d1);
  const N_d1 = norm_cdf(d1);
  const N_d2 = norm_cdf(d2);

  // 1. Delta
  if (type === 'C') {
    result.delta = discount * N_d1;
  } else {
    result.delta = -discount * norm_cdf(-d1);
  }

  // 2. Gamma
  result.gamma = discount * n_d1 / (F * sigma * sqrtT);

  // 3. Vega
  result.vega = F * discount * sqrtT * n_d1;

  // 4. Theta (daily decay = annual / 365)
  // Theta is -dC/dT. A standard representation:
  const price = black76Price(F, K, T, sigma, r, type);
  const annualTheta = - (F * discount * n_d1 * sigma) / (2 * sqrtT) + r * price;
  result.theta = annualTheta / 365;

  // 5. Vanna (dDelta/dSigma)
  // dDelta_c/dSigma = -discount * n(d1) * d2 / sigma
  result.vanna = -discount * n_d1 * d2 / sigma;

  // 6. Charm (dDelta/dTime) -> sensitivity to calendar time passage
  // dDelta_c/dt = -dDelta_c/dT = r * discount * N(d1) + discount * n(d1) * d2 / (2T)
  // Let's divide by 365 to get daily Charm.
  if (type === 'C') {
    const annualCharm = r * discount * N_d1 + discount * n_d1 * d2 / (2 * T);
    result.charm = annualCharm / 365;
  } else {
    const N_minus_d1 = norm_cdf(-d1);
    const annualCharm = -r * discount * N_minus_d1 - discount * n_d1 * d2 / (2 * T);
    result.charm = annualCharm / 365;
  }

  return result;
}
