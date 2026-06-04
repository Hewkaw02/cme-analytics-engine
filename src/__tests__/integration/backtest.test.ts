import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, closePool } from '../../db/client.js';
import { BacktestEngine } from '../../backtest/BacktestEngine.js';
import { GEXReversalStrategy } from '../../backtest/strategies/GEXReversalStrategy.js';
import type { IntradayBar, OISummaryRecord } from '../../types.js';

describe('Backtest Integration', () => {
  const testDate = '2099-01-01';

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('Skipping Backtest Integration: DATABASE_URL not set');
      return;
    }

    // Cleanup first to ensure clean state
    await db.deleteFrom('backtest_runs').where('strategy_name', '=', 'GEXReversalStrategy').execute();
    await db.deleteFrom('intraday_bars').where('symbol', '=', 'TBT').execute();
    await db.deleteFrom('oi_expiry_summary').where('symbol', '=', 'TBT').execute();

    // 1. Insert mock options summary
    const summary: OISummaryRecord = {
      trade_date: testDate,
      symbol: 'TBT',
      expiry_code: 'TBT1',
      expiry_date: '2099-03-20',
      days_to_expiry: 78,
      underlying_price: 5500,
      total_call_oi: 10000,
      total_put_oi: 20000,
      total_call_volume: 1000,
      total_put_volume: 2000,
      put_call_oi_ratio: 2.0,
      put_call_vol_ratio: 2.0,
      max_call_oi_strike: 5550,
      max_put_oi_strike: 5450,
      max_pain_strike: 5500,
      max_call_oi_value: 5000,
      max_put_oi_value: 8000,
      net_gamma_exposure: 50000, // Positive Gamma!
      gex_flip_level: 5400,
      atm_iv_call: 0.15,
      atm_iv_put: 0.15,
      atm_iv_skew: 0.0,
      iv_rank: 50,
      iv_percentile: 50,
    };

    await db.insertInto('oi_expiry_summary').values(summary as any).execute();

    // 2. Insert mock intraday bars
    // Generate a sequence of bars:
    // Bar 1: Price dips below Put Wall (5450) -> e.g. close is 5448
    // Bar 2: Price stays low but closes green (close is 5449, open is 5447) -> should trigger buy signal!
    // Bar 3: Price moves back up towards Max Pain (5500) -> close is 5502 -> should trigger exit!
    const bars: IntradayBar[] = [
      {
        bar_time: `${testDate}T09:30:00Z`,
        bar_close_time: `${testDate}T09:31:00Z`,
        symbol: 'TBT',
        timeframe: '1m',
        open: 5460,
        high: 5460,
        low: 5445,
        close: 5448, // closes below Put Wall (5450)
        volume: 100,
        delta_volume: 0,
        buy_volume: 0,
        sell_volume: 0,
        trade_count: 0,
        session: 'RTH',
        is_rth: true,
        vwap: null,
        vwap_session: 5455,
        ema_9: 5455,
        ema_21: 5455,
        atr_14: 5.0,
        rsi_14: 30.0,
        bb_upper: 5470,
        bb_lower: 5440,
        cvd: 0,
        vwap_sd1_upper: null,
        vwap_sd1_lower: null,
        vwap_sd2_upper: null,
        vwap_sd2_lower: null,
        fetched_at: new Date().toISOString(),
      },
      {
        bar_time: `${testDate}T09:31:00Z`,
        bar_close_time: `${testDate}T09:32:00Z`,
        symbol: 'TBT',
        timeframe: '1m',
        open: 5447,
        high: 5451,
        low: 5446,
        close: 5449, // close > open, still below Put Wall -> Buy trigger
        volume: 150,
        delta_volume: 50,
        buy_volume: 100,
        sell_volume: 50,
        trade_count: 0,
        session: 'RTH',
        is_rth: true,
        vwap: null,
        vwap_session: 5453,
        ema_9: 5453,
        ema_21: 5454,
        atr_14: 5.0,
        rsi_14: 35.0,
        bb_upper: 5470,
        bb_lower: 5440,
        cvd: 50,
        vwap_sd1_upper: null,
        vwap_sd1_lower: null,
        vwap_sd2_upper: null,
        vwap_sd2_lower: null,
        fetched_at: new Date().toISOString(),
      },
      {
        bar_time: `${testDate}T09:32:00Z`,
        bar_close_time: `${testDate}T09:33:00Z`,
        symbol: 'TBT',
        timeframe: '1m',
        open: 5450,
        high: 5505,
        low: 5450,
        close: 5502, // reaches Max Pain target -> Sell/Exit trigger
        volume: 200,
        delta_volume: 100,
        buy_volume: 150,
        sell_volume: 50,
        trade_count: 0,
        session: 'RTH',
        is_rth: true,
        vwap: null,
        vwap_session: 5470,
        ema_9: 5470,
        ema_21: 5460,
        atr_14: 5.0,
        rsi_14: 70.0,
        bb_upper: 5490,
        bb_lower: 5430,
        cvd: 150,
        vwap_sd1_upper: null,
        vwap_sd1_lower: null,
        vwap_sd2_upper: null,
        vwap_sd2_lower: null,
        fetched_at: new Date().toISOString(),
      },
    ];

    await db.insertInto('intraday_bars').values(bars as any).execute();
  });

  after(async () => {
    if (process.env.DATABASE_URL) {
      // Clean up mock data
      await db.deleteFrom('backtest_runs').where('strategy_name', '=', 'GEXReversalStrategy').execute();
      await db.deleteFrom('intraday_bars').where('symbol', '=', 'TBT').execute();
      await db.deleteFrom('oi_expiry_summary').where('symbol', '=', 'TBT').execute();
      await closePool();
    }
  });

  it('should run backtest successfully and save results', async () => {
    if (!process.env.DATABASE_URL) return;

    const strategy = new GEXReversalStrategy();
    const config = {
      strategy,
      strategyParams: {
        atrMultiplierStop: 2.0,
        useMaxPainForTarget: true,
        minNetGex: 10000,
      },
      symbol: 'TBT',
      startDate: testDate,
      endDate: testDate,
      initialCapital: 100000,
      timeframe: '1m',
      slippageTicks: 0, // No slippage to make profit match math exactly
      commissionPerTrade: 0, // No commission for clean math
    };

    const result = await BacktestEngine.run(db, config);

    assert.ok(result.runId);
    assert.equal(result.metrics.winRate, 1.0);
    assert.equal(result.metrics.maxDrawdown, 0);

    // Verify database entries
    const run = await db
      .selectFrom('backtest_runs')
      .selectAll()
      .where('id', '=', result.runId as any)
      .executeTakeFirstOrThrow();

    assert.equal(run.strategy_name, 'GEXReversalStrategy');
    assert.equal(run.symbol, 'TBT');
    assert.equal(Number(run.initial_capital), 100000);
    // Math: Entry at 5449. Exit at 5502. 
    // Profit points = 53 points.
    // Multiplier for TBT = 1 (default since not in ES/NQ/GC/CL).
    // PnL = 53 points * 1 = 53.
    // Final capital = 100000 + 53 = 100053.
    assert.equal(Number(run.final_capital), 100053);
    assert.equal(Number(run.total_trades), 1);

    const trades = await db
      .selectFrom('backtest_trades')
      .selectAll()
      .where('run_id', '=', result.runId as any)
      .execute();

    assert.equal(trades.length, 1);
    assert.equal(trades[0].direction, 'LONG');
    assert.equal(Number(trades[0].entry_price), 5449);
    assert.equal(Number(trades[0].exit_price), 5502);
    assert.equal(Number(trades[0].pnl), 53);
  });
});
