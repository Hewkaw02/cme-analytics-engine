import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OptionsRepository } from '../../db/repositories/OptionsRepository.js';
import { getPool, closePool } from '../../db/client.js';
import type { OptionRecord } from '../../types.js';

describe('Integration: Materialized View Refresh', () => {
  const repo = new OptionsRepository();

  before(async () => {
    if (!process.env.DATABASE_URL) return;
  });

  after(async () => {
    if (process.env.DATABASE_URL) {
      await closePool();
    }
  });

  it('should refresh oi_by_strike after insert', async () => {
    if (!process.env.DATABASE_URL) return;

    const testDate = '2099-01-02';
    const records: OptionRecord[] = [
      {
        trade_date: testDate,
        fetched_at: new Date().toISOString(),
        symbol: 'ES',
        expiry_code: 'TEST99',
        expiry_date: '2099-03-20',
        days_to_expiry: 100,
        strike: 5000,
        option_type: 'C',
        volume: 100,
        open_interest: 1000,
        oi_change: 10,
        is_valid: true,
        last_price: 10,
        settle_price: 10,
        bid: 10,
        ask: 11,
        bid_size: 1,
        ask_size: 1,
        high: 11,
        low: 9,
        open: 10,
        delta: 0.5,
        gamma: 0.01,
        theta: -1,
        vega: 20,
        rho: 0.1,
        implied_vol: 0.15,
        theoretical_value: 10.6,
        underlying_price: 5000,
        intrinsic_value: 0,
        time_value: 10,
        moneyness: 'ATM'
      },
      {
        trade_date: testDate,
        fetched_at: new Date().toISOString(),
        symbol: 'ES',
        expiry_code: 'TEST99',
        expiry_date: '2099-03-20',
        days_to_expiry: 100,
        strike: 5000,
        option_type: 'P',
        volume: 200,
        open_interest: 2000,
        oi_change: 20,
        is_valid: true,
        last_price: 10,
        settle_price: 10,
        bid: 10,
        ask: 11,
        bid_size: 1,
        ask_size: 1,
        high: 11,
        low: 9,
        open: 10,
        delta: -0.5,
        gamma: 0.01,
        theta: -1,
        vega: 20,
        rho: 0.1,
        implied_vol: 0.15,
        theoretical_value: 10.6,
        underlying_price: 5000,
        intrinsic_value: 0,
        time_value: 10,
        moneyness: 'ATM'
      }
    ];

    const pool = getPool();

    // 1. Insert data
    await repo.upsertOptionsChain(records);

    // 2. Manual refresh (as it is a materialized view)
    // In production, this might be triggered by the orchestrator or a trigger
    await pool.query('REFRESH MATERIALIZED VIEW oi_by_strike');

    // 3. Query and verify
    const rows = await pool.query(
      'SELECT * FROM oi_by_strike WHERE trade_date = $1 AND symbol = $2 AND strike = $3',
      [testDate, 'ES', 5000]
    );

    assert.equal(rows.rowCount, 1);
    const row = rows.rows[0];
    assert.equal(Number(row.call_oi), 1000);
    assert.equal(Number(row.put_oi), 2000);
    assert.equal(Number(row.call_volume), 100);
    assert.equal(Number(row.put_volume), 200);

    // Cleanup
    await pool.query('DELETE FROM options_chain WHERE trade_date = $1', [testDate]);
    await pool.query('REFRESH MATERIALIZED VIEW oi_by_strike');
  });
});
