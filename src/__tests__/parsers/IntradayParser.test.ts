import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntradayParser, CmeChartRaw } from '../../parsers/IntradayParser.js';

describe('IntradayParser', () => {
  const parser = new IntradayParser();

  function makeMockChart(): CmeChartRaw {
    const baseTime = new Date('2025-05-12T15:00:00Z').getTime(); // ~10:00 CT (RTH)
    return {
      bars: [
        { time: baseTime, open: 5500, high: 5510, low: 5495, close: 5505, volume: 1000 },
        { time: baseTime + 60000, open: 5505, high: 5515, low: 5500, close: 5510, volume: 800 },
        { time: baseTime + 120000, open: 5510, high: 5520, low: 5505, close: 5515, volume: 1200 },
      ],
    };
  }

  it('should parse bars correctly', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m');
    assert.equal(bars.length, 3);
  });

  it('should set correct OHLCV values', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m');
    assert.equal(bars[0].open, 5500);
    assert.equal(bars[0].high, 5510);
    assert.equal(bars[0].low, 5495);
    assert.equal(bars[0].close, 5505);
    assert.equal(bars[0].volume, 1000);
  });

  it('should set symbol and timeframe', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'NQ', '5m');
    for (const bar of bars) {
      assert.equal(bar.symbol, 'NQ');
      assert.equal(bar.timeframe, '5m');
    }
  });

  it('should classify RTH session for ES during trading hours', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m');
    // 15:00 UTC = ~10:00 CT → within RTH (08:30-15:15)
    assert.equal(bars[0].is_rth, true);
    assert.equal(bars[0].session, 'RTH');
  });

  it('should classify ETH session for ES outside trading hours', () => {
    const nightChart: CmeChartRaw = {
      bars: [{ time: new Date('2025-05-12T05:00:00Z').getTime(), open: 5500, high: 5510, low: 5495, close: 5505, volume: 100 }],
    };
    const bars = parser.parseIntradayBars(nightChart, 'ES', '1m');
    assert.equal(bars[0].is_rth, false);
    assert.equal(bars[0].session, 'ETH');
  });

  it('should compute bar_close_time based on timeframe', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m');
    const openMs = new Date(bars[0].bar_time).getTime();
    const closeMs = new Date(bars[0].bar_close_time!).getTime();
    assert.equal(closeMs - openMs, 60000); // 1 minute
  });

  it('should handle null/undefined raw data', () => {
    assert.equal(parser.parseIntradayBars(null as any, 'ES', '1m').length, 0);
    assert.equal(parser.parseIntradayBars({ bars: null } as any, 'ES', '1m').length, 0);
  });

  it('should set expiry_code when provided', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m', 'ESM25');
    assert.equal(bars[0].expiry_code, 'ESM25');
  });

  it('should populate fetched_at', () => {
    const bars = parser.parseIntradayBars(makeMockChart(), 'ES', '1m');
    assert.ok(bars[0].fetched_at);
  });
});
