import { db } from './src/db/client.js';
import { BacktestEngine } from './src/backtest/BacktestEngine.js';
import { GEXReversalStrategy } from './src/backtest/strategies/GEXReversalStrategy.js';
import type { OISummaryRecord, IntradayBar } from './src/types.js';

async function run() {
  const testDate = '2099-01-01';
  console.log('Inserting mock data...');

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
    net_gamma_exposure: 50000,
    gex_flip_level: 5400,
    atm_iv_call: 0.15,
    atm_iv_put: 0.15,
    atm_iv_skew: 0.0,
    iv_rank: 50,
    iv_percentile: 50,
  };

  await db.insertInto('oi_expiry_summary').values(summary as any).execute();

  const bars: IntradayBar[] = [
    {
      bar_time: `${testDate}T09:30:00Z`,
      bar_close_time: `${testDate}T09:31:00Z`,
      symbol: 'TBT',
      timeframe: '1m',
      open: 5460,
      high: 5460,
      low: 5445,
      close: 5448,
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
      close: 5449,
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
      close: 5502,
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
  console.log('Mock data inserted.');

  // Fetch and inspect the trade_date type
  const checkSummary = await db.selectFrom('oi_expiry_summary').select('trade_date').execute();
  if (checkSummary.length > 0) {
    const td = checkSummary[0].trade_date;
    console.log(`[Type Check] trade_date type: ${typeof td}, value: ${td}, constructor: ${td?.constructor?.name}`);
  }

  console.log('Running BacktestEngine...');
  const strategy = new GEXReversalStrategy();
  
  // Patch strategy to add console.log
  const originalOnBar = strategy.onBar.bind(strategy);
  strategy.onBar = (bar, pos, gex) => {
    const sig = originalOnBar(bar, pos, gex);
    console.log(`[Bar debug] Time: ${bar.bar_time}, Close: ${bar.close}, Open: ${bar.open}, Pos: ${pos ? pos.direction : 'None'}, GEX: ${gex ? gex.netGex : 'null'}, PutWall: ${gex ? gex.maxPutOiStrike : 'null'}, Signal: ${sig ? sig.direction : 'None'}`);
    return sig;
  };

  const result = await BacktestEngine.run(db, {
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
    slippageTicks: 0,
    commissionPerTrade: 0,
  });

  console.log('Backtest finished successfully:', result);

  // Cleanup
  console.log('Cleaning up...');
  await db.deleteFrom('backtest_runs').where('strategy_name', '=', 'GEXReversalStrategy').execute();
  await db.deleteFrom('intraday_bars').where('symbol', '=', 'TBT').execute();
  await db.deleteFrom('oi_expiry_summary').where('symbol', '=', 'TBT').execute();
  console.log('Cleanup finished.');
  process.exit(0);
}

run().catch(err => {
  console.error('Error running backtest:', err);
  process.exit(1);
});
