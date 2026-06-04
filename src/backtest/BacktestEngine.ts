import { Kysely } from 'kysely';
import type { Database, IntradayBar, BacktestRunRecord, BacktestTradeRecord } from '../types.js';
import type { Strategy, Position, StrategyGexState } from './strategies/Strategy.js';
import { calculatePerformanceMetrics } from './PerformanceMetrics.js';
import { logger } from '../utils/logger.js';

export interface BacktestConfig {
  strategy: Strategy;
  strategyParams: Record<string, any>;
  symbol: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  initialCapital: number;
  timeframe?: string; // defaults to '1m'
  slippageTicks?: number; // slip entry/exit price by N ticks
  commissionPerTrade?: number; // flat fee per trade (e.g. $2.01 per side)
}

const TICK_SIZES: Record<string, number> = {
  ES: 0.25,
  NQ: 0.25,
  GC: 0.10,
  CL: 0.01,
};

const MULTIPLIERS: Record<string, number> = {
  ES: 50,
  NQ: 20,
  GC: 100,
  CL: 1000,
};

export class BacktestEngine {
  static async run(db: Kysely<Database>, config: BacktestConfig): Promise<{ runId: string; metrics: any }> {
    const {
      strategy,
      strategyParams,
      symbol,
      startDate,
      endDate,
      initialCapital,
      timeframe = '1m',
      slippageTicks = 1,
      commissionPerTrade = 2.50,
    } = config;

    logger.info(`BacktestEngine: Initializing run for strategy ${strategy.name} on ${symbol} (${startDate} to ${endDate})`);

    // Initialize strategy parameters
    strategy.init(strategyParams);

    const tickSize = TICK_SIZES[symbol] || 0.01;
    const multiplier = MULTIPLIERS[symbol] || 1.0;
    const slippageValue = slippageTicks * tickSize;

    // 1. Fetch Intraday Bars
    const bars = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('timeframe', '=', timeframe)
      .where('bar_time', '>=', `${startDate}T00:00:00Z` as any)
      .where('bar_time', '<=', `${endDate}T23:59:59Z` as any)
      .orderBy('bar_time', 'asc')
      .execute();

    if (bars.length === 0) {
      throw new Error(`No historical bars found for backtest of ${symbol} from ${startDate} to ${endDate}`);
    }

    logger.info(`BacktestEngine: Loaded ${bars.length} intraday bars.`);

    // 2. Fetch Options Open Interest and GEX stats for the date range
    const oiSummaries = await db
      .selectFrom('oi_expiry_summary')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('trade_date', '>=', startDate)
      .where('trade_date', '<=', endDate)
      .orderBy('trade_date', 'asc')
      .execute();

    // Group options stats by trade date for O(1) retrieval
    // We aggregate GEX and pick the dominant expiry's walls and flip level
    const dateGexMap = new Map<string, StrategyGexState>();
    
    // Group raw rows by date first
    const summariesByDate = new Map<string, typeof oiSummaries>();
    for (const row of oiSummaries) {
      // trade_date is a DATE column, parsed as local Date by pg
      const d = new Date(row.trade_date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!summariesByDate.has(dateStr)) {
        summariesByDate.set(dateStr, []);
      }
      summariesByDate.get(dateStr)!.push(row);
    }

    for (const [dateStr, rows] of summariesByDate.entries()) {
      let netGex = 0;
      let dominantExpiry: typeof rows[0] | null = null;
      let maxOi = -1;

      for (const row of rows) {
        netGex += Number(row.net_gamma_exposure || 0);
        const totalOi = Number(row.total_call_oi || 0) + Number(row.total_put_oi || 0);
        if (totalOi > maxOi) {
          maxOi = totalOi;
          dominantExpiry = row;
        }
      }

      if (dominantExpiry) {
        dateGexMap.set(dateStr, {
          netGex,
          gexFlip: dominantExpiry.gex_flip_level ? Number(dominantExpiry.gex_flip_level) : null,
          maxCallOiStrike: dominantExpiry.max_call_oi_strike ? Number(dominantExpiry.max_call_oi_strike) : null,
          maxPutOiStrike: dominantExpiry.max_put_oi_strike ? Number(dominantExpiry.max_put_oi_strike) : null,
          maxPainStrike: dominantExpiry.max_pain_strike ? Number(dominantExpiry.max_pain_strike) : null,
        });
      }
    }

    logger.info(`BacktestEngine: Loaded options summary data for ${dateGexMap.size} dates.`);

    // 3. Execution Loop
    let capital = initialCapital;
    let currentPosition: Position | null = null;
    const trades: BacktestTradeRecord[] = [];
    const dailyEquity = new Map<string, number>();

    let lastDateStr = '';

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const barTime = new Date(bar.bar_time);
      // bar_time is a TIMESTAMPTZ column, representing UTC timestamp
      const dateStr = `${barTime.getUTCFullYear()}-${String(barTime.getUTCMonth() + 1).padStart(2, '0')}-${String(barTime.getUTCDate()).padStart(2, '0')}`;

      // Retrieve GEX state for the day
      const gexState = dateGexMap.get(dateStr) || null;

      // Ask strategy for decisions on this bar
      const signal = strategy.onBar(bar, currentPosition, gexState);

      if (signal) {
        if (signal.direction === 'LONG' && !currentPosition) {
          // Entry price incorporates slippage (buying the ask)
          const entryPrice = Number(bar.close) + slippageValue;
          currentPosition = {
            entryTime: bar.bar_time,
            direction: 'LONG',
            entryPrice,
            quantity: 1, // Default 1 contract
          };
          // Pay commission per side
          capital -= commissionPerTrade;
        } else if (signal.direction === 'SHORT' && !currentPosition) {
          // Entry price incorporates slippage (selling the bid)
          const entryPrice = Number(bar.close) - slippageValue;
          currentPosition = {
            entryTime: bar.bar_time,
            direction: 'SHORT',
            entryPrice,
            quantity: 1, // Default 1 contract
          };
          // Pay commission per side
          capital -= commissionPerTrade;
        } else if (signal.direction === 'EXIT' && currentPosition) {
          // Exit price incorporates slippage (selling LONG / buying back SHORT)
          const exitPrice = currentPosition.direction === 'LONG'
            ? Number(bar.close) - slippageValue
            : Number(bar.close) + slippageValue;

          // Pay commission per side
          capital -= commissionPerTrade;

          const pnlPoints = currentPosition.direction === 'LONG'
            ? exitPrice - currentPosition.entryPrice
            : currentPosition.entryPrice - exitPrice;

          const pnl = pnlPoints * multiplier * currentPosition.quantity;
          const pnlPct = pnlPoints / currentPosition.entryPrice;

          // We'll set run_id to a placeholder and fill it upon DB insertion
          const tradeRecord: BacktestTradeRecord = {
            run_id: '0', 
            entry_time: currentPosition.entryTime,
            exit_time: bar.bar_time,
            direction: currentPosition.direction,
            entry_price: currentPosition.entryPrice,
            exit_price: exitPrice,
            quantity: currentPosition.quantity,
            pnl,
            pnl_pct: pnlPct,
            exit_reason: signal.reason,
          };

          trades.push(tradeRecord);
          capital += pnl;
          currentPosition = null;
        }
      }

      // Track daily equity at the end of each date
      const isLastBarOfSegment = i === bars.length - 1;
      const nextBar = !isLastBarOfSegment ? bars[i + 1] : null;
      const nextDateStr = nextBar 
        ? (() => {
            const nbTime = new Date(nextBar.bar_time);
            return `${nbTime.getUTCFullYear()}-${String(nbTime.getUTCMonth() + 1).padStart(2, '0')}-${String(nbTime.getUTCDate()).padStart(2, '0')}`;
          })()
        : '';

      if (dateStr !== nextDateStr || isLastBarOfSegment) {
        // Calculate unrealized PnL
        let unrealized = 0;
        if (currentPosition) {
          const closeVal = Number(bar.close);
          const points = currentPosition.direction === 'LONG'
            ? closeVal - currentPosition.entryPrice
            : currentPosition.entryPrice - closeVal;
          unrealized = points * multiplier * currentPosition.quantity;
        }
        dailyEquity.set(dateStr, capital + unrealized);
        lastDateStr = dateStr;
      }
    }

    // Force close any open position at the end of the backtest
    if (currentPosition) {
      const lastBar = bars[bars.length - 1];
      const exitPrice = currentPosition.direction === 'LONG'
        ? Number(lastBar.close) - slippageValue
        : Number(lastBar.close) + slippageValue;

      capital -= commissionPerTrade;
      const pnlPoints = currentPosition.direction === 'LONG'
        ? exitPrice - currentPosition.entryPrice
        : currentPosition.entryPrice - exitPrice;

      const pnl = pnlPoints * multiplier * currentPosition.quantity;
      const pnlPct = pnlPoints / currentPosition.entryPrice;

      trades.push({
        run_id: '0',
        entry_time: currentPosition.entryTime,
        exit_time: lastBar.bar_time,
        direction: currentPosition.direction,
        entry_price: currentPosition.entryPrice,
        exit_price: exitPrice,
        quantity: currentPosition.quantity,
        pnl,
        pnl_pct: pnlPct,
        exit_reason: 'FORCE_CLOSE_END_OF_TEST',
      });
      capital += pnl;
      dailyEquity.set(lastDateStr, capital);
    }

    // 4. Calculate final metrics
    const metrics = calculatePerformanceMetrics(initialCapital, trades, dailyEquity);

    // 5. Save Run to Database
    const runRecord: Omit<BacktestRunRecord, 'id' | 'created_at'> = {
      strategy_name: strategy.name,
      symbol,
      start_date: startDate,
      end_date: endDate,
      initial_capital: initialCapital,
      final_capital: capital,
      total_trades: trades.length,
      win_rate: metrics.winRate,
      sharpe_ratio: metrics.sharpeRatio,
      sortino_ratio: metrics.sortinoRatio,
      max_drawdown: metrics.maxDrawdown,
      profit_factor: metrics.profitFactor,
      parameters: strategyParams,
    };

    const runInsertResult = await db
      .insertInto('backtest_runs')
      .values(runRecord as any)
      .returning('id')
      .executeTakeFirstOrThrow();

    const runId = String(runInsertResult.id);

    // 6. Save Trades to Database
    if (trades.length > 0) {
      const tradesWithRunId = trades.map(t => ({
        ...t,
        run_id: runId,
      }));

      await db
        .insertInto('backtest_trades')
        .values(tradesWithRunId as any)
        .execute();
    }

    logger.info(`BacktestEngine: Backtest run saved with ID ${runId}. Final capital: ${capital.toFixed(2)}, trades: ${trades.length}`);

    return {
      runId,
      metrics,
    };
  }
}
