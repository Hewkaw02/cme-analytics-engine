import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMaxPain, calculateMaxPainByExpiry } from '../../analytics/MaxPain.js';
import type { OptionRecord } from '../../types.js';

function makeOpt(overrides: Partial<OptionRecord>): OptionRecord {
  return {
    trade_date: '2025-05-12', symbol: 'ES', expiry_code: 'ESM25', expiry_date: '2025-06-20',
    days_to_expiry: 39, strike: 5500, option_type: 'C', last_price: 50, settle_price: 50,
    bid: 49, ask: 51, bid_size: 10, ask_size: 10, high: 55, low: 45, open: 48,
    volume: 100, open_interest: 1000, oi_change: 0, delta: 0.5, gamma: 0.004, theta: -0.8,
    vega: 15, rho: 0.02, implied_vol: 0.17, theoretical_value: 50, underlying_price: 5500,
    intrinsic_value: 0, time_value: 50, moneyness: 'ATM', fetched_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('MaxPain', () => {
  it('should return 0 for empty options', () => {
    const r = calculateMaxPain([]);
    assert.equal(r.maxPainStrike, 0);
  });

  it('should return 0 for all-zero OI', () => {
    const opts = [
      makeOpt({ strike: 5400, option_type: 'C', open_interest: 0 }),
      makeOpt({ strike: 5400, option_type: 'P', open_interest: 0 }),
    ];
    assert.equal(calculateMaxPain(opts).maxPainStrike, 0);
  });

  it('should find correct max pain with symmetric distribution', () => {
    const opts = [
      makeOpt({ strike: 5400, option_type: 'C', open_interest: 100 }),
      makeOpt({ strike: 5400, option_type: 'P', open_interest: 5000 }),
      makeOpt({ strike: 5500, option_type: 'C', open_interest: 3000 }),
      makeOpt({ strike: 5500, option_type: 'P', open_interest: 3000 }),
      makeOpt({ strike: 5600, option_type: 'C', open_interest: 5000 }),
      makeOpt({ strike: 5600, option_type: 'P', open_interest: 100 }),
    ];
    assert.equal(calculateMaxPain(opts).maxPainStrike, 5500);
  });

  it('should calculate pain correctly per test strike', () => {
    const opts = [
      makeOpt({ strike: 100, option_type: 'C', open_interest: 10 }),
      makeOpt({ strike: 200, option_type: 'P', open_interest: 10 }),
    ];
    const r = calculateMaxPain(opts);
    const p100 = r.painByStrike.find(p => p.strike === 100)!;
    assert.equal(p100.callPain, 0);
    assert.equal(p100.putPain, 1000);
  });

  it('should group by expiry', () => {
    const opts = [
      makeOpt({ expiry_code: 'ESM25', open_interest: 1000 }),
      makeOpt({ expiry_code: 'ESU25', open_interest: 500 }),
    ];
    const results = calculateMaxPainByExpiry(opts);
    assert.equal(results.size, 2);
  });
});
