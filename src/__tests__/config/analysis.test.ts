import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAnalysisConfig } from '../../config/analysis.js';

describe('analysis config', () => {
  it('uses conservative defaults for hourly analysis runs', () => {
    const config = parseAnalysisConfig({});

    assert.equal(config.enabled, true);
    assert.equal(config.cron, '0 17-23,0-15 * * 1-5');
    assert.deepEqual(config.symbols, ['ES', 'NQ', 'GC']);
    assert.deepEqual(config.timeframes, ['1m']);
    assert.equal(config.fetchOi, true);
  });

  it('parses symbols and timeframes from comma-separated env values', () => {
    const config = parseAnalysisConfig({
      ANALYSIS_SYMBOLS: 'ES, NQ',
      ANALYSIS_TIMEFRAMES: '1m,5m, 15m',
    });

    assert.deepEqual(config.symbols, ['ES', 'NQ']);
    assert.deepEqual(config.timeframes, ['1m', '5m', '15m']);
  });

  it('honors boolean toggles', () => {
    const config = parseAnalysisConfig({
      ANALYSIS_ENABLED: 'false',
      ANALYSIS_FETCH_OI: 'false',
    });

    assert.equal(config.enabled, false);
    assert.equal(config.fetchOi, false);
  });
});
