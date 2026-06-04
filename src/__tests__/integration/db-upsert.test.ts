import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OptionsRepository } from '../../db/repositories/OptionsRepository.js';
import { getPool, closePool } from '../../db/client.js';
import type { OptionRecord } from '../../types.js';

describe('DB Integration: OptionsRepository', () => {
  const repo = new OptionsRepository();

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('Skipping DB Integration: DATABASE_URL not set');
      return;
    }
  });

  after(async () => {
    if (process.env.DATABASE_URL) {
      await closePool();
    }
  });

  it('should perform idempotent UPSERTs', async () => {
    if (!process.env.DATABASE_URL) return;

    const testDate = '2099-01-01'; // Far future to avoid conflicts with real data
    const record: OptionRecord = {
      trade_date: testDate,
      fetched_at: new Date().toISOString(),
      symbol: 'ES',
      expiry_code: 'TEST99',
      expiry_date: '2099-03-20',
      days_to_expiry: 100,
      strike: 5000,
      option_type: 'C',
      last_price: 10.5,
      settle_price: 10.0,
      bid: 10.0,
      ask: 11.0,
      bid_size: 1,
      ask_size: 1,
      high: 12,
      low: 9,
      open: 10,
      volume: 100,
      open_interest: 1000,
      oi_change: 10,
      delta: 0.5,
      gamma: 0.01,
      theta: -1,
      vega: 20,
      rho: 0.1,
      implied_vol: 0.15,
      theoretical_value: 10.6,
      underlying_price: 5000,
      intrinsic_value: 0,
      time_value: 10.5,
      moneyness: 'ATM',
      is_valid: true,
    };

    // First insert
    const result1 = await repo.upsertOptionsChain([record]);
    assert.equal(result1.total, 1);
    assert.ok(result1.inserted >= 0);

    // Verify count
    const count1 = await repo.countByDate('ES', testDate);
    assert.equal(count1, 1);

    // Second insert (same record, different last_price)
    const updatedRecord = { ...record, last_price: 99.99 };
    const result2 = await repo.upsertOptionsChain([updatedRecord]);
    assert.equal(result2.total, 1);

    // Verify count still 1
    const count2 = await repo.countByDate('ES', testDate);
    assert.equal(count2, 1);

    // Verify price updated
    const pool = getPool();
    const rows = await pool.query(
      'SELECT last_price FROM options_chain WHERE trade_date = $1 AND symbol = $2 AND strike = $3',
      [testDate, 'ES', 5000]
    );
    assert.equal(Number(rows.rows[0].last_price), 99.99);

    // Cleanup
    await pool.query('DELETE FROM options_chain WHERE trade_date = $1', [testDate]);
  });
});
