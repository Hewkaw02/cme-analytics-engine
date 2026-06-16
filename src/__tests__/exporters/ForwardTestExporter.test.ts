import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { exportForwardTestCsvs } from '../../exporters/ForwardTestExporter.js';
import type { IntradayBar, OISummaryRecord, StrikeOIRecord } from '../../types.js';

describe('ForwardTestExporter', () => {
  const outputDir = path.join(process.cwd(), 'output_test_forward_exports');

  before(async () => {
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);
  });

  after(async () => {
    await fs.remove(outputDir);
  });

  it('exports the OI by strike, OI summary, and intraday CSVs used by GoldQuant', async () => {
    const strikeOI: StrikeOIRecord[] = [
      {
        trade_date: '2026-06-15',
        symbol: 'GC',
        expiry_code: 'GCQ26',
        strike: 2400,
        underlying_price: 2412.5,
        call_oi: 1200,
        put_oi: 900,
        call_oi_change: 40,
        put_oi_change: -20,
        call_volume: 300,
        put_volume: 250,
        call_iv: 0.18,
        put_iv: 0.2,
        iv_skew: -0.02,
        net_delta_exposure: 125000,
      },
    ];
    const summaries: OISummaryRecord[] = [
      {
        trade_date: '2026-06-15',
        symbol: 'GC',
        expiry_code: 'GCQ26',
        expiry_date: '2026-08-26',
        days_to_expiry: 72,
        underlying_price: 2412.5,
        total_call_oi: 15000,
        total_put_oi: 11000,
        total_call_volume: 3000,
        total_put_volume: 2500,
        put_call_oi_ratio: 0.73,
        put_call_vol_ratio: 0.83,
        max_call_oi_strike: 2450,
        max_put_oi_strike: 2350,
        max_pain_strike: 2400,
        max_call_oi_value: 2000,
        max_put_oi_value: 1800,
        net_gamma_exposure: 12345,
        gex_flip_level: 2390,
        atm_iv_call: 0.18,
        atm_iv_put: 0.2,
        atm_iv_skew: -0.02,
        iv_rank: 45,
        iv_percentile: 52,
      },
    ];
    const intradayBars: IntradayBar[] = [
      {
        bar_time: '2026-06-15T14:30:00.000Z',
        bar_close_time: '2026-06-15T14:31:00.000Z',
        symbol: 'GC',
        timeframe: '1m',
        expiry_code: 'GCQ26',
        open: 2410,
        high: 2415,
        low: 2408,
        close: 2412,
        volume: 125,
        vwap: 2411.5,
        buy_volume: null,
        sell_volume: null,
        delta_volume: null,
        trade_count: null,
        session: 'RTH',
        is_rth: true,
        vwap_session: null,
        ema_9: null,
        ema_21: null,
        atr_14: null,
        rsi_14: null,
        bb_upper: null,
        bb_lower: null,
        cvd: null,
        vwap_sd1_upper: null,
        vwap_sd1_lower: null,
        vwap_sd2_upper: null,
        vwap_sd2_lower: null,
        fetched_at: '2026-06-15T14:31:01.000Z',
      },
    ];

    const files = await exportForwardTestCsvs({
      outputDir,
      symbol: 'GC',
      tradeDate: '2026-06-15',
      strikeOI,
      oiSummaries: summaries,
      intradayResults: [{ symbol: 'GC', timeframe: '1m', bars: intradayBars }],
    });

    assert.deepEqual(
      files.map((file) => path.relative(outputDir, file).replaceAll('\\', '/')).sort(),
      [
        'intraday/GC_1m_20260615.csv',
        'oi/GC_oi_summary_20260615.csv',
        'oi/GC_options_oi_by_strike_20260615.csv',
      ],
    );

    const strikeContent = await fs.readFile(path.join(outputDir, 'oi', 'GC_options_oi_by_strike_20260615.csv'), 'utf8');
    assert.match(strikeContent, /call_oi,put_oi/);
    const summaryContent = await fs.readFile(path.join(outputDir, 'oi', 'GC_oi_summary_20260615.csv'), 'utf8');
    assert.match(summaryContent, /max_call_oi_strike,max_put_oi_strike/);
    const intradayContent = await fs.readFile(path.join(outputDir, 'intraday', 'GC_1m_20260615.csv'), 'utf8');
    assert.match(intradayContent, /bar_time,bar_close_time,symbol,timeframe/);
  });
});
