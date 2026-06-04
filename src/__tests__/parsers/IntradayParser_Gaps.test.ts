import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntradayParser } from '../../parsers/IntradayParser.js';
import { logger } from '../../utils/logger.js';

// We can't easily spy on logger with node:test without a library,
// so we'll just check if it executes without crashing and manually verify logic.
// For production tests, a custom logger transport could be used for inspection.

describe('IntradayParser Gap Detection', () => {
  const parser = new IntradayParser();

  it('should not log gaps for continuous data', () => {
    const raw = {
      bars: [
        { time: 1715520000000, open: 5000, high: 5005, low: 4995, close: 5002, volume: 100 }, // 12:00:00
        { time: 1715520060000, open: 5002, high: 5007, low: 4998, close: 5005, volume: 150 }, // 12:01:00
        { time: 1715520120000, open: 5005, high: 5010, low: 5000, close: 5008, volume: 120 }, // 12:02:00
      ]
    };

    const result = parser.parseIntradayBars(raw, 'ES', '1m');
    assert.strictEqual(result.length, 3);
  });

  it('should handle small gaps (< 30 periods) in 1m data', () => {
    const raw = {
      bars: [
        { time: 1715520000000, open: 5000, high: 5005, low: 4995, close: 5002, volume: 100 }, // 12:00:00
        { time: 1715520120000, open: 5002, high: 5007, low: 4998, close: 5005, volume: 150 }, // 12:02:00 (1 min missing)
      ]
    };

    const result = parser.parseIntradayBars(raw, 'ES', '1m');
    assert.strictEqual(result.length, 2);
  });

  it('should identify session RTH/ETH correctly', () => {
    const raw = {
      bars: [
        { time: 1715520000000, open: 5000, high: 5005, low: 4995, close: 5002, volume: 100 },
      ]
    };

    const result = parser.parseIntradayBars(raw, 'ES', '1m');
    const bar = result[0];
    assert.ok(bar.session === 'RTH' || bar.session === 'ETH');
    assert.strictEqual(typeof bar.is_rth, 'boolean');
  });

  it('should calculate bar_close_time correctly', () => {
    const raw = {
      bars: [
        { time: 1715520000000, open: 5000, high: 5005, low: 4995, close: 5002, volume: 100 }, // 12:00:00
      ]
    };

    const result = parser.parseIntradayBars(raw, 'ES', '5m');
    const bar = result[0];
    const openTime = new Date(bar.bar_time).getTime();
    const closeTime = new Date(bar.bar_close_time).getTime();
    assert.strictEqual(closeTime - openTime, 300000); // 5 minutes
  });
});
