import fs from 'fs-extra';
import path from 'path';
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  buildPredictionSnapshot,
  exportPredictionSnapshot,
} from '../../exporters/PredictionExporter.js';
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
});
