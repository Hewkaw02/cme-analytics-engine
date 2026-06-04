import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { CSVExporter } from '../../exporters/CSVExporter.js';
import type { OptionRecord, IntradayBar } from '../../types.js';

describe('CSVExporter Integration', () => {
  const testOutputDir = path.join(process.cwd(), 'output_test_integration');

  before(async () => {
    await fs.ensureDir(testOutputDir);
  });

  after(async () => {
    // Keep it for inspection if needed, or cleanup
    // await fs.remove(testOutputDir);
  });

  it('should export options to CSV and create the directory structure', async () => {
    const data: OptionRecord[] = [
      {
        trade_date: '2025-05-12',
        fetched_at: new Date().toISOString(),
        symbol: 'ES',
        expiry_code: 'ESM25',
        expiry_date: '2025-06-20',
        days_to_expiry: 39,
        strike: 5500,
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
        volume: 1000,
        open_interest: 5000,
        oi_change: 100,
        delta: 0.5,
        gamma: 0.004,
        theta: -0.8,
        vega: 15,
        rho: 0.02,
        implied_vol: 0.17,
        theoretical_value: 50.5,
        underlying_price: 5500,
        intrinsic_value: 0,
        time_value: 50,
        moneyness: 'ATM',
        is_valid: true,
      },
    ];

    const filePath = await CSVExporter.exportOptions(data, 'ES', '2025-05-12', testOutputDir);
    
    assert.ok(filePath.includes('ES_options_20250512.csv'));
    assert.ok(await fs.pathExists(filePath));
    
    const content = await fs.readFile(filePath, 'utf8');
    assert.ok(content.includes('trade_date,fetched_at,symbol,expiry_code'));
    assert.ok(content.includes('2025-05-12'));
    assert.ok(content.includes('ESM25'));
    assert.ok(content.includes('5500'));
  });

  it('should export intraday bars to CSV', async () => {
    const data: IntradayBar[] = [
      {
        bar_time: '2025-05-12T10:00:00Z',
        bar_close_time: '2025-05-12T10:01:00Z',
        symbol: 'ES',
        timeframe: '1m',
        open: 5500,
        high: 5505,
        low: 5495,
        close: 5502,
        volume: 100,
        vwap: 5501,
        session: 'RTH',
        is_rth: true,
        fetched_at: new Date().toISOString(),
      },
    ];

    const filePath = await CSVExporter.exportIntraday(data, 'ES', '1m', '2025-05-12', testOutputDir);
    
    assert.ok(filePath.includes('ES_1m_20250512.csv'));
    assert.ok(await fs.pathExists(filePath));
    
    const content = await fs.readFile(filePath, 'utf8');
    assert.ok(content.includes('bar_time,bar_close_time,symbol,timeframe'));
    assert.ok(content.includes('5500,5505,5495,5502'));
  });

  it('should handle empty data gracefully', async () => {
    const filePath = await CSVExporter.exportOptions([], 'ES', '2025-05-12', testOutputDir);
    assert.equal(filePath, '');
  });
});
