import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Validator } from '../../parsers/Validator.js';
import type { OptionRecord } from '../../types.js';

describe('Validator', () => {
  const validator = new Validator();

  function makeRecord(overrides?: Partial<OptionRecord>): OptionRecord {
    return {
      trade_date: '2025-05-12',
      symbol: 'ES',
      expiry_code: 'ESM25',
      expiry_date: '2025-06-20',
      days_to_expiry: 39,
      strike: 5500,
      option_type: 'C',
      last_price: 55.0,
      settle_price: 56.0,
      bid: 53.0,
      ask: 57.0,
      bid_size: 20,
      ask_size: 25,
      high: 60.0,
      low: 50.0,
      open: 54.0,
      volume: 1200,
      open_interest: 8000,
      oi_change: 500,
      delta: 0.50,
      gamma: 0.004,
      theta: -0.80,
      vega: 15.0,
      rho: 0.02,
      implied_vol: 0.17,
      theoretical_value: 55.5,
      underlying_price: 5500,
      intrinsic_value: 0,
      time_value: 55.0,
      moneyness: 'ATM',
      fetched_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('should mark valid records as is_valid = true', () => {
    const result = validator.validateOptions([makeRecord()], 'ES');
    assert.equal(result.summary.valid, 1);
    assert.equal(result.summary.invalid, 0);
    assert.equal(result.records[0].is_valid, true);
  });

  it('should skip records with strike <= 0', () => {
    const result = validator.validateOptions([makeRecord({ strike: 0 })], 'ES');
    assert.equal(result.summary.skipped, 1);
    assert.equal(result.records.length, 0);
  });

  it('should skip records with NaN strike', () => {
    const result = validator.validateOptions([makeRecord({ strike: NaN })], 'ES');
    assert.equal(result.summary.skipped, 1);
  });

  it('should skip records with negative days_to_expiry (expired)', () => {
    const result = validator.validateOptions([makeRecord({ days_to_expiry: -1 })], 'ES');
    assert.equal(result.summary.skipped, 1);
  });

  it('should clamp negative volume to 0', () => {
    const result = validator.validateOptions([makeRecord({ volume: -10 })], 'ES');
    assert.equal(result.records[0].volume, 0);
  });

  it('should clamp negative open_interest to 0', () => {
    const result = validator.validateOptions([makeRecord({ open_interest: -5 })], 'ES');
    assert.equal(result.records[0].open_interest, 0);
  });

  it('should mark invalid when bid > ask', () => {
    const result = validator.validateOptions([makeRecord({ bid: 60, ask: 50 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
    assert.ok(result.records[0].validation_errors!.some(e => e.includes('Bid')));
  });

  it('should mark invalid when bid < 0', () => {
    const result = validator.validateOptions([makeRecord({ bid: -1, ask: 50 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should add warning when bid/ask spread > 50%', () => {
    // ask=100, bid=10 → spread=90, spread/ask=0.9 > 0.5
    const result = validator.validateOptions([makeRecord({ bid: 10, ask: 100 })], 'ES');
    assert.ok(result.records[0].validation_warnings!.some(w => w.includes('spread')));
  });

  it('should mark invalid when implied_vol out of range (too low)', () => {
    const result = validator.validateOptions([makeRecord({ implied_vol: 0.00001 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when implied_vol out of range (too high)', () => {
    const result = validator.validateOptions([makeRecord({ implied_vol: 5.0 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should accept implied_vol in valid range', () => {
    const result = validator.validateOptions([makeRecord({ implied_vol: 0.25 })], 'ES');
    assert.equal(result.records[0].is_valid, true);
  });

  it('should mark invalid when Call delta out of range (> 1)', () => {
    const result = validator.validateOptions([makeRecord({ option_type: 'C', delta: 1.5 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when Call delta < 0', () => {
    const result = validator.validateOptions([makeRecord({ option_type: 'C', delta: -0.1 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when Put delta out of range (< -1)', () => {
    const result = validator.validateOptions([makeRecord({ option_type: 'P', delta: -1.5 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when Put delta > 0', () => {
    const result = validator.validateOptions([makeRecord({ option_type: 'P', delta: 0.1 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when gamma < 0', () => {
    const result = validator.validateOptions([makeRecord({ gamma: -0.001 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should mark invalid when vega < 0', () => {
    const result = validator.validateOptions([makeRecord({ vega: -1 })], 'ES');
    assert.equal(result.records[0].is_valid, false);
  });

  it('should add warning when theta > 0', () => {
    const result = validator.validateOptions([makeRecord({ theta: 0.5 })], 'ES');
    assert.ok(result.records[0].validation_warnings!.some(w => w.includes('Theta')));
    // Theta > 0 is a warning, not invalid
    assert.equal(result.records[0].is_valid, true);
  });

  it('should handle null Greeks without marking invalid', () => {
    const result = validator.validateOptions([makeRecord({
      delta: null, gamma: null, theta: null, vega: null, implied_vol: null,
    })], 'ES');
    assert.equal(result.records[0].is_valid, true);
  });

  it('should correctly count total, valid, invalid, skipped', () => {
    const records = [
      makeRecord(),                              // valid
      makeRecord({ strike: 0 }),                 // skipped
      makeRecord({ implied_vol: 10.0 }),         // invalid
      makeRecord({ days_to_expiry: -5 }),         // skipped
      makeRecord({ delta: 0.3, gamma: 0.01 }),   // valid
    ];
    const result = validator.validateOptions(records, 'ES');
    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.valid, 2);
    assert.equal(result.summary.invalid, 1);
    assert.equal(result.summary.skipped, 2);
  });

  it('should limit error messages to 50 max', () => {
    // Create 60 invalid records
    const records = Array.from({ length: 60 }, (_, i) =>
      makeRecord({ strike: i + 1, implied_vol: 10.0 })
    );
    const result = validator.validateOptions(records, 'ES');
    assert.ok(result.summary.errors.length <= 50);
  });
});
