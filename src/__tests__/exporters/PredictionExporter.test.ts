import fs from 'fs-extra';
import path from 'path';
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  buildPredictionSnapshot,
  exportPredictionSnapshot,
  selectPredictionSummary,
} from '../../exporters/PredictionExporter.js';
import type { OISummaryRecord } from '../../types.js';
import type { PredictionSnapshot } from '../../types.js';

const outputDir = path.join(process.cwd(), 'output_test_prediction');

describe('PredictionExporter', () => {
  beforeEach(async () => {
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  it('writes prediction_latest.json and an archived point-in-time snapshot', async () => {
    const snapshot: PredictionSnapshot = {
      schemaVersion: 1,
      symbol: 'GC',
      asOfUtc: '2026-06-22T02:15:00.000Z',
      sourceTradeDate: '2026-06-18',
      targetTradeDate: '2026-06-22',
      horizon: 'current_session',
      dataMode: 'PREDICTION_ONLY',
      isTradable: false,
      reason: 'current intraday data is stale',
      bias: {
        direction: 'BULLISH',
        confidence: 0.63,
        drivers: ['call OI wall above spot', 'Vol2Vol range rising'],
      },
      plan: {
        preferredDirection: 'LONG',
        entryZones: [{ label: 'support', lower: 4200, upper: 4210 }],
        invalidationLevel: 4188,
        tp1: 4230,
        tp2: 4248,
        allowedSlots: ['A', 'F'],
        blockedSlots: ['B'],
      },
      sourceFiles: ['oi/GC_oi_summary_20260618.csv'],
    };

    const result = await exportPredictionSnapshot(snapshot, outputDir);

    assert.equal(
      path.relative(outputDir, result.latestPath).replaceAll('\\', '/'),
      'Data-prediction/prediction_latest.json',
    );
    assert.match(
      path.relative(outputDir, result.archivePath).replaceAll('\\', '/'),
      /^Data-prediction\/archive\/20260622\/GC_prediction_20260622_021500\.json$/,
    );

    const latest = await fs.readJson(result.latestPath);
    assert.equal(latest.schemaVersion, 1);
    assert.equal(latest.dataMode, 'PREDICTION_ONLY');
    assert.equal(latest.isTradable, false);
    assert.equal(latest.bias.direction, 'BULLISH');
  });

  it('builds CURRENT_WITH_STALE_OI when intraday is fresh but official OI is older', () => {
    const snapshot = buildPredictionSnapshot({
      symbol: 'GC',
      asOfUtc: '2026-06-22T02:15:00.000Z',
      sourceTradeDate: '2026-06-18',
      targetTradeDate: '2026-06-22',
      hasFreshIntraday: true,
      hasCurrentOfficialOi: false,
      currentPrice: 4210,
      callWall: 4400,
      putWall: 4000,
      sourceFiles: ['oi/GC_oi_summary_20260618.csv'],
    });

    assert.equal(snapshot.dataMode, 'CURRENT_WITH_STALE_OI');
    assert.equal(snapshot.isTradable, true);
    assert.equal(snapshot.bias.direction, 'BULLISH');
    assert.equal(snapshot.plan.preferredDirection, 'LONG');
  });

  it('coerces DB numeric strings before calculating entry and exits', () => {
    const snapshot = buildPredictionSnapshot({
      symbol: 'GC',
      asOfUtc: '2026-06-22T02:15:00.000Z',
      sourceTradeDate: '2026-06-18',
      targetTradeDate: '2026-06-22',
      hasFreshIntraday: true,
      hasCurrentOfficialOi: true,
      currentPrice: '4210.50' as unknown as number,
      callWall: '4400' as unknown as number,
      putWall: '4000' as unknown as number,
      sourceFiles: ['oi/GC_oi_summary_20260618.csv'],
    });

    assert.equal(typeof snapshot.plan.entryZones[0].lower, 'number');
    assert.equal(typeof snapshot.plan.entryZones[0].upper, 'number');
    assert.equal(typeof snapshot.plan.invalidationLevel, 'number');
    assert.equal(typeof snapshot.plan.tp1, 'number');
    assert.equal(snapshot.plan.entryZones[0].upper, 4215.5);
  });

  it('uses bullish support bias when current price is closer to put wall inside the range', () => {
    const snapshot = buildPredictionSnapshot({
      symbol: 'GC',
      asOfUtc: '2026-06-25T02:15:00.000Z',
      sourceTradeDate: '2026-06-24',
      targetTradeDate: '2026-06-24',
      hasFreshIntraday: true,
      hasCurrentOfficialOi: true,
      currentPrice: 3995,
      callWall: 4400,
      putWall: 3800,
      sourceFiles: ['oi/GC_oi_summary_20260624.csv'],
    });

    assert.equal(snapshot.bias.direction, 'BULLISH');
    assert.equal(snapshot.plan.preferredDirection, 'LONG');
  });

  it('selects the nearest liquid OI summary instead of the first row', () => {
    const farSummary = makeSummary({
      expiry_code: 'F7_192',
      days_to_expiry: 216,
      total_call_oi: 11909,
      total_put_oi: 2801,
      max_call_oi_strike: 6500,
      max_put_oi_strike: 4100,
    });
    const nearSummary = makeSummary({
      expiry_code: 'M6_192',
      days_to_expiry: 1,
      total_call_oi: 80000,
      total_put_oi: 75000,
      max_call_oi_strike: 4400,
      max_put_oi_strike: 3800,
    });

    const selected = selectPredictionSummary([farSummary, nearSummary]);

    assert.equal(selected?.expiry_code, 'M6_192');
  });
});

function makeSummary(overrides: Partial<OISummaryRecord>): OISummaryRecord {
  return {
    trade_date: '2026-06-24',
    symbol: 'GC',
    expiry_code: 'M6_192',
    expiry_date: '2026-06-25T00:00:00.000Z',
    days_to_expiry: 1,
    underlying_price: null,
    total_call_oi: 0,
    total_put_oi: 0,
    total_call_volume: 0,
    total_put_volume: 0,
    put_call_oi_ratio: null,
    put_call_vol_ratio: null,
    max_call_oi_strike: null,
    max_put_oi_strike: null,
    max_pain_strike: null,
    max_call_oi_value: 0,
    max_put_oi_value: 0,
    net_gamma_exposure: 0,
    gex_flip_level: null,
    atm_iv_call: null,
    atm_iv_put: null,
    atm_iv_skew: null,
    iv_rank: null,
    iv_percentile: null,
    ...overrides,
  };
}
