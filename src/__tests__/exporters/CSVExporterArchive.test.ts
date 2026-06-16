import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { CSVExporter } from '../../exporters/CSVExporter.js';
import type { OptionRecord } from '../../types.js';

describe('CSVExporter archive snapshots', () => {
  const outputDir = path.join(process.cwd(), 'output_test_csv_archive');

  beforeEach(async () => {
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);
  });

  after(async () => {
    await fs.remove(outputDir);
  });

  it('keeps the latest file path while writing timestamped archive snapshots', async () => {
    const first = makeOptionRecord(2400);
    const second = makeOptionRecord(2450);

    const latestPath = await CSVExporter.exportOptions([first], 'GC', '2026-06-16', outputDir, {
      snapshotTimestamp: '2026-06-16T12:30:45',
    });
    const secondLatestPath = await CSVExporter.exportOptions([second], 'GC', '2026-06-16', outputDir, {
      snapshotTimestamp: '2026-06-16T13:00:05',
    });

    assert.equal(secondLatestPath, latestPath);
    assert.equal(path.relative(outputDir, latestPath).replaceAll('\\', '/'), 'options/GC_options_20260616.csv');

    const archive1230 = path.join(outputDir, 'options', 'archive', '20260616', 'GC_options_20260616_123045.csv');
    const archive1300 = path.join(outputDir, 'options', 'archive', '20260616', 'GC_options_20260616_130005.csv');

    assert.ok(await fs.pathExists(latestPath));
    assert.ok(await fs.pathExists(archive1230));
    assert.ok(await fs.pathExists(archive1300));

    const latestContent = await fs.readFile(latestPath, 'utf8');
    const archive1230Content = await fs.readFile(archive1230, 'utf8');
    const archive1300Content = await fs.readFile(archive1300, 'utf8');

    assert.match(latestContent, /2450/);
    assert.match(archive1230Content, /2400/);
    assert.match(archive1300Content, /2450/);
  });
});

function makeOptionRecord(strike: number): OptionRecord {
  return {
    trade_date: '2026-06-16',
    fetched_at: '2026-06-16T12:30:45.000Z',
    symbol: 'GC',
    expiry_code: 'GCQ26',
    expiry_date: '2026-08-26',
    days_to_expiry: 71,
    strike,
    option_type: 'C',
    last_price: 50,
    settle_price: 51,
    bid: 49,
    ask: 52,
    bid_size: 10,
    ask_size: 10,
    high: 55,
    low: 45,
    open: 48,
    volume: 100,
    open_interest: 500,
    oi_change: 5,
    delta: 0.5,
    gamma: 0.004,
    theta: -0.8,
    vega: 15,
    rho: 0.02,
    implied_vol: 0.17,
    theoretical_value: 50.5,
    underlying_price: 2400,
    intrinsic_value: 0,
    time_value: 50,
    moneyness: 'ATM',
    is_valid: true,
  };
}
