import type { BacktestTradeRecord } from '../types.js';

export interface PerformanceMetricsResult {
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  profitFactor: number | null;
}

/**
 * Calculates quantitative performance metrics for a backtest run.
 * 
 * @param initialCapital Starting capital
 * @param trades List of trade records executed
 * @param dailyEquity Map of date (YYYY-MM-DD) to equity value at end of day
 */
export function calculatePerformanceMetrics(
  initialCapital: number,
  trades: BacktestTradeRecord[],
  dailyEquity: Map<string, number>
): PerformanceMetricsResult {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      winRate: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      profitFactor: 0,
    };
  }

  // 1. Win Rate
  const winningTrades = trades.filter((t) => Number(t.pnl) > 0).length;
  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

  // 2. Profit Factor
  let grossProfits = 0;
  let grossLosses = 0;
  for (const t of trades) {
    const pnl = Number(t.pnl);
    if (pnl > 0) {
      grossProfits += pnl;
    } else {
      grossLosses += Math.abs(pnl);
    }
  }
  const profitFactor = grossLosses > 0 ? grossProfits / grossLosses : null;

  // 3. Max Drawdown (using daily equity values)
  const sortedDates = Array.from(dailyEquity.keys()).sort();
  const equityCurve: number[] = [initialCapital];
  for (const date of sortedDates) {
    equityCurve.push(dailyEquity.get(date)!);
  }

  let peak = -Infinity;
  let maxDd = 0;
  for (const eq of equityCurve) {
    if (eq > peak) {
      peak = eq;
    }
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }

  // 4. Sharpe and Sortino Ratios (Annualized from daily returns)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    const curr = equityCurve[i];
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  let sharpeRatio: number | null = null;
  let sortinoRatio: number | null = null;

  if (dailyReturns.length > 0) {
    const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    
    // Standard deviation
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1 || 1);
    const stdDev = Math.sqrt(variance);
    
    // Downside deviation (only negative returns)
    const negativeReturns = dailyReturns.filter(r => r < 0);
    const downsideVar = negativeReturns.length > 0 
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / dailyReturns.length
      : 0;
    const downsideDev = Math.sqrt(downsideVar);

    // Annualization factor (252 trading days per year)
    const annFactor = Math.sqrt(252);

    sharpeRatio = stdDev > 0 ? (mean / stdDev) * annFactor : 0;
    sortinoRatio = downsideDev > 0 ? (mean / downsideDev) * annFactor : 0;
  }

  return {
    winRate,
    maxDrawdown: maxDd,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
  };
}
