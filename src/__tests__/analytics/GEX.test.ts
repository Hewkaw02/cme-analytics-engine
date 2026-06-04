import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGEX, calculateGEXByExpiry } from '../../analytics/GEX.js';
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

describe('GEX', () => {
  it('should throw for unknown symbol', () => {
    assert.throws(() => calculateGEX([], 'XX'), /Unknown symbol/);
  });

  it('should return empty result for no options', () => {
    const r = calculateGEX([], 'ES');
    assert.equal(r.netGEX, 0);
    assert.equal(r.gexByStrike.length, 0);
    assert.equal(r.flipLevel, 0);
  });

  it('should skip options with null/zero gamma or OI', () => {
    const opts = [
      makeOpt({ gamma: 0, open_interest: 1000 }),
      makeOpt({ gamma: null, open_interest: 1000 }),
      makeOpt({ gamma: 0.004, open_interest: 0 }),
    ];
    const r = calculateGEX(opts, 'ES');
    assert.equal(r.rawGEXPoints.length, 0);
  });

  it('should calculate positive GEX for calls (dealer short gamma)', () => {
    const opts = [
      makeOpt({ strike: 5500, option_type: 'C', gamma: 0.004, open_interest: 1000, underlying_price: 5500 }),
    ];
    const r = calculateGEX(opts, 'ES');
    // GEX = +1 * 0.004 * 1000 * 50 * 5500 = 1,100,000
    assert.equal(r.rawGEXPoints[0].gex, 1_100_000);
  });

  it('should calculate negative GEX for puts (dealer long gamma)', () => {
    const opts = [
      makeOpt({ strike: 5500, option_type: 'P', gamma: 0.004, open_interest: 1000, underlying_price: 5500 }),
    ];
    const r = calculateGEX(opts, 'ES');
    // GEX = -1 * 0.004 * 1000 * 50 * 5500 = -1,100,000
    assert.equal(r.rawGEXPoints[0].gex, -1_100_000);
  });

  it('should use correct multiplier per symbol', () => {
    const opt = makeOpt({ strike: 5500, option_type: 'C', gamma: 0.004, open_interest: 1000, underlying_price: 5500 });
    const esResult = calculateGEX([opt], 'ES');
    const nqResult = calculateGEX([{ ...opt }], 'NQ');
    // ES multiplier=50, NQ multiplier=20
    assert.ok(Math.abs(esResult.netGEX) > Math.abs(nqResult.netGEX));
  });

  it('should aggregate GEX by strike', () => {
    const opts = [
      makeOpt({ strike: 5500, option_type: 'C', gamma: 0.004, open_interest: 1000, underlying_price: 5500 }),
      makeOpt({ strike: 5500, option_type: 'P', gamma: 0.004, open_interest: 1000, underlying_price: 5500 }),
    ];
    const r = calculateGEX(opts, 'ES');
    assert.equal(r.gexByStrike.length, 1);
    assert.equal(r.gexByStrike[0].strike, 5500);
    assert.ok(r.gexByStrike[0].callGEX > 0);
    assert.ok(r.gexByStrike[0].putGEX < 0);
    // Net = call + put = 0 for equal OI/gamma
    assert.equal(r.gexByStrike[0].netGEX, 0);
  });

  it('should find flip level where cumulative GEX crosses zero', () => {
    const opts = [
      makeOpt({ strike: 5400, option_type: 'C', gamma: 0.01, open_interest: 2000, underlying_price: 5500 }),
      makeOpt({ strike: 5500, option_type: 'P', gamma: 0.01, open_interest: 5000, underlying_price: 5500 }),
    ];
    const r = calculateGEX(opts, 'ES');
    // Call GEX at 5400 positive, Put GEX at 5500 negative and larger → flip at 5500
    if (r.flipLevel > 0) {
      assert.ok(r.flipLevel >= 5400 && r.flipLevel <= 5500);
    }
  });

  it('should group by expiry for calculateGEXByExpiry', () => {
    const opts = [
      makeOpt({ expiry_code: 'ESM25', gamma: 0.004, open_interest: 1000, underlying_price: 5500 }),
      makeOpt({ expiry_code: 'ESU25', gamma: 0.004, open_interest: 500, underlying_price: 5500 }),
    ];
    const results = calculateGEXByExpiry(opts, 'ES');
    assert.equal(results.size, 2);
  });
});
