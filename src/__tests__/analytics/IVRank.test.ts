import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateIVRankFromHistory } from '../../analytics/IVRank.js';

describe('IVRank (from history)', () => {
  it('should return null when history < 30 days', () => {
    const history = Array.from({ length: 20 }, (_, i) => 0.15 + i * 0.001);
    const r = calculateIVRankFromHistory(0.16, history);
    assert.equal(r.ivRank, null);
    assert.equal(r.ivPercentile, null);
    assert.equal(r.historyDays, 20);
  });

  it('should calculate IV Rank correctly', () => {
    // 52w low=0.10, 52w high=0.30, current=0.20
    // IV Rank = (0.20 - 0.10) / (0.30 - 0.10) * 100 = 50
    const history = Array.from({ length: 60 }, (_, i) => 0.10 + (i / 59) * 0.20);
    const r = calculateIVRankFromHistory(0.20, history);
    assert.equal(r.ivRank, 50);
  });

  it('should calculate IV Percentile correctly', () => {
    // 50 values from 0.10 to 0.20, current = 0.15
    const history = Array.from({ length: 50 }, (_, i) => 0.10 + (i / 49) * 0.10);
    const r = calculateIVRankFromHistory(0.15, history);
    assert.ok(r.ivPercentile! > 0);
    assert.ok(r.ivPercentile! < 100);
  });

  it('should clamp IV Rank to 0-100', () => {
    // current > 52w high
    const history = Array.from({ length: 50 }, () => 0.15);
    history[0] = 0.10;
    history[1] = 0.20;
    const r = calculateIVRankFromHistory(0.25, history);
    assert.equal(r.ivRank, 100);
  });

  it('should handle all same IV values (range=0)', () => {
    const history = Array.from({ length: 50 }, () => 0.15);
    const r = calculateIVRankFromHistory(0.15, history);
    assert.equal(r.ivRank, 50); // midpoint fallback
  });

  it('should report correct 52w high/low', () => {
    const history = [0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30];
    // Need 30+ days
    const padded = [...history, ...Array.from({ length: 25 }, () => 0.15)];
    const r = calculateIVRankFromHistory(0.20, padded);
    assert.equal(r.iv52wLow, 0.10);
    assert.equal(r.iv52wHigh, 0.30);
  });

  it('should filter invalid values (NaN, 0, negative)', () => {
    const history = [
      ...Array.from({ length: 35 }, () => 0.15),
      NaN, 0, -0.1,
    ];
    const r = calculateIVRankFromHistory(0.15, history);
    // Invalid values filtered → only 35 valid
    assert.equal(r.historyDays, 35);
  });
});
