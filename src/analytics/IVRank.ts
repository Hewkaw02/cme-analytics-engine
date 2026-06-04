export interface IVRankResult {
  ivRank: number | null;
  ivPercentile: number | null;
  historyDays: number;
  iv52wLow: number;
  iv52wHigh: number;
}

/**
 * Calculates IV Rank and IV Percentile from a list of historical IV values.
 * Returns null if history contains less than 30 valid days of data.
 */
export function calculateIVRankFromHistory(currentIV: number, history: number[]): IVRankResult {
  if (!history) {
    return { ivRank: null, ivPercentile: null, historyDays: 0, iv52wLow: 0, iv52wHigh: 0 };
  }

  // Filter valid historical IV values (must be a number, not NaN, and positive)
  const validHistory = history.filter(
    (val) => typeof val === 'number' && !isNaN(val) && val > 0
  );

  const historyDays = validHistory.length;

  if (historyDays < 30) {
    return {
      ivRank: null,
      ivPercentile: null,
      historyDays,
      iv52wLow: 0,
      iv52wHigh: 0,
    };
  }

  const iv52wLow = Math.min(...validHistory);
  const iv52wHigh = Math.max(...validHistory);

  let ivRank: number;
  if (iv52wHigh - iv52wLow === 0) {
    ivRank = 50; // midpoint fallback
  } else {
    ivRank = ((currentIV - iv52wLow) / (iv52wHigh - iv52wLow)) * 100;
  }

  // Clamp IV Rank between 0 and 100
  if (ivRank < 0) ivRank = 0;
  if (ivRank > 100) ivRank = 100;

  // Round to 4 decimal places
  ivRank = Math.round(ivRank * 10000) / 10000;

  // IV Percentile = percentage of historical days where IV was lower than current IV
  const countBelow = validHistory.filter((iv) => iv < currentIV).length;
  let ivPercentile = (countBelow / historyDays) * 100;
  ivPercentile = Math.round(ivPercentile * 10000) / 10000;

  return {
    ivRank,
    ivPercentile,
    historyDays,
    iv52wLow,
    iv52wHigh,
  };
}
