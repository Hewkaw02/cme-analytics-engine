import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { IntradayRepository } from '../../db/repositories/IntradayRepository.js';
import { getPool, closePool, db } from '../../db/client.js';
import type { IntradayBar } from '../../types.js';

describe('Integration: TimescaleDB Hypertable', () => {
  const repo = new IntradayRepository(db);

  before(async () => {
    if (!process.env.DATABASE_URL) return;
  });

  after(async () => {
    if (process.env.DATABASE_URL) {
      await closePool();
    }
  });

  it('should verify intraday_bars is a hypertable and supports chunking', async () => {
    if (!process.env.DATABASE_URL) return;

    const pool = getPool();

    // 1. Verify it is a hypertable
    const hypertableCheck = await pool.query(
      "SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'intraday_bars'"
    );
    console.log("hypertable check", hypertableCheck.rowCount);
    assert.equal(hypertableCheck.rowCount, 1, 'intraday_bars should be a hypertable');

    // 2. Insert test data across different "chunks" (7 days interval)
    const now = new Date();
    const bars: IntradayBar[] = [
      {
        bar_time: now.toISOString(),
        bar_close_time: new Date(now.getTime() + 60000).toISOString(),
        symbol: 'ES',
        timeframe: '1m',
        open: 5000, high: 5001, low: 4999, close: 5000, volume: 100,
        fetched_at: now.toISOString(),
        expiry_code: 'ESH5', vwap: null, buy_volume: null, sell_volume: null, delta_volume: null,
        trade_count: null, session: 'RTH', is_rth: true, vwap_session: null, ema_9: null,
        ema_21: null, atr_14: null, rsi_14: null, bb_upper: null, bb_lower: null
      },
      {
        bar_time: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago (different chunk)
        bar_close_time: null,
        symbol: 'ES',
        timeframe: '1m',
        open: 4900, high: 4901, low: 4899, close: 4900, volume: 200,
        fetched_at: now.toISOString(),
        expiry_code: 'ESH5', vwap: null, buy_volume: null, sell_volume: null, delta_volume: null,
        trade_count: null, session: 'RTH', is_rth: true, vwap_session: null, ema_9: null,
        ema_21: null, atr_14: null, rsi_14: null, bb_upper: null, bb_lower: null
      }
    ];

    console.log("Upserting bars...");
    await repo.upsertIntradayBars(bars);
    console.log("Upsert done.");

    // 3. Verify chunks were created
    const chunkCount = await pool.query(
      "SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name = 'intraday_bars'"
    );
    console.log("chunk count", chunkCount.rows[0].count);
    assert.ok(Number(chunkCount.rows[0].count) >= 1, 'Should have at least one chunk');

    // 4. Query data back
    const result = await pool.query(
      "SELECT * FROM intraday_bars WHERE symbol = $1 AND timeframe = $2 ORDER BY bar_time DESC LIMIT 10",
      ['ES', '1m']
    );
    assert.ok(result.rows.length >= 2);

    // Cleanup
    await pool.query("DELETE FROM intraday_bars WHERE symbol = 'ES' AND timeframe = '1m'");
  });
});
