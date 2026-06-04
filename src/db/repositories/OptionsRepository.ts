import { query, getPool } from '../client.js';
import { logger } from '../../utils/logger.js';
import { OptionRecord } from '../../types.js';

/**
 * Batch size for INSERT operations.
 * Keeps individual queries manageable for PostgreSQL.
 */
const BATCH_SIZE = 500;

export interface UpsertStats {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Repository for the options_chain table.
 * Handles batch UPSERT (INSERT ... ON CONFLICT DO UPDATE).
 */
export class OptionsRepository {
  /**
   * Upsert an array of OptionRecords into the options_chain table.
   * Records are batched in chunks of BATCH_SIZE (500) for performance.
   *
   * Uses INSERT ... ON CONFLICT (trade_date, symbol, expiry_code, strike, option_type) DO UPDATE
   * to ensure idempotent re-runs (Spec §12.3 — duplicate insert = UPSERT correctly).
   */
  async upsertOptionsChain(records: OptionRecord[]): Promise<UpsertStats> {
    if (records.length === 0) {
      logger.info('OptionsRepository: no records to upsert');
      return { inserted: 0, updated: 0, total: 0 };
    }

    const pool = getPool();
    let totalAffected = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const affected = await this.upsertBatch(batch);
      totalAffected += affected;

      logger.debug(
        `OptionsRepository: batch ${Math.floor(i / BATCH_SIZE) + 1} upserted ${affected} rows`,
      );
    }

    const stats: UpsertStats = {
      inserted: totalAffected, // PG doesn't distinguish insert vs update in rowCount
      updated: 0,
      total: records.length,
    };

    logger.info(`OptionsRepository: upserted ${totalAffected} rows (${records.length} submitted)`, {
      symbol: records[0]?.symbol,
      tradeDate: records[0]?.trade_date,
    });

    return stats;
  }

  /**
   * Upsert a single batch of records.
   */
  private async upsertBatch(records: OptionRecord[]): Promise<number> {
    // Build parameterized INSERT with ON CONFLICT DO UPDATE
    const columns = [
      'trade_date',
      'fetched_at',
      'symbol',
      'expiry_code',
      'expiry_date',
      'days_to_expiry',
      'strike',
      'option_type',
      'last_price',
      'settle_price',
      'bid',
      'ask',
      'bid_size',
      'ask_size',
      'high',
      'low',
      'open',
      'volume',
      'open_interest',
      'oi_change',
      'delta',
      'gamma',
      'theta',
      'vega',
      'rho',
      'implied_vol',
      'theoretical_value',
      'underlying_price',
      'intrinsic_value',
      'time_value',
      'moneyness',
      'is_valid',
      'validation_notes',
    ];

    const updateColumns = columns.filter(
      (col) => !['trade_date', 'symbol', 'expiry_code', 'strike', 'option_type'].includes(col),
    );

    const values: unknown[] = [];
    const rows: string[] = [];
    let paramIndex = 1;

    for (const r of records) {
      const rowPlaceholders: string[] = [];
      const rowValues = [
        r.trade_date,
        r.fetched_at,
        r.symbol,
        r.expiry_code,
        r.expiry_date,
        r.days_to_expiry,
        r.strike,
        r.option_type,
        r.last_price,
        r.settle_price,
        r.bid,
        r.ask,
        r.bid_size,
        r.ask_size,
        r.high,
        r.low,
        r.open,
        r.volume,
        r.open_interest,
        r.oi_change,
        r.delta,
        r.gamma,
        r.theta,
        r.vega,
        r.rho,
        r.implied_vol,
        r.theoretical_value,
        r.underlying_price,
        r.intrinsic_value,
        r.time_value,
        r.moneyness,
        r.is_valid ?? true,
        r.validation_notes ?? null,
      ];

      for (const val of rowValues) {
        rowPlaceholders.push(`$${paramIndex++}`);
        values.push(val);
      }

      rows.push(`(${rowPlaceholders.join(', ')})`);
    }

    const updateSet = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    const sql = `
      INSERT INTO options_chain (${columns.join(', ')})
      VALUES ${rows.join(',\n')}
      ON CONFLICT (trade_date, symbol, expiry_code, strike, option_type)
      DO UPDATE SET ${updateSet}
    `;

    const result = await query(sql, values);
    return result.rowCount ?? 0;
  }

  /**
   * Count options records for a given symbol and trade date.
   */
  async countByDate(symbol: string, tradeDate: string): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT COUNT(*) as cnt FROM options_chain WHERE symbol = $1 AND trade_date = $2',
      [symbol, tradeDate],
    );
    return parseInt(result.rows[0]?.cnt || '0', 10);
  }

  /**
   * Get distinct expiry codes for a symbol on a given date.
   */
  async getExpiryCodes(symbol: string, tradeDate: string): Promise<string[]> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT DISTINCT expiry_code FROM options_chain WHERE symbol = $1 AND trade_date = $2 ORDER BY expiry_code',
      [symbol, tradeDate],
    );
    return result.rows.map((r: { expiry_code: string }) => r.expiry_code);
  }

  /**
   * Get all valid options records for a symbol on a given trade date.
   * Used by OI_SUMMARY analytics to compute per-expiry summaries.
   */
  async getOptionsForDate(symbol: string, tradeDate: string): Promise<OptionRecord[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM options_chain
       WHERE symbol = $1 AND trade_date = $2 AND is_valid = TRUE
       ORDER BY expiry_code, strike, option_type`,
      [symbol, tradeDate],
    );
    return result.rows as OptionRecord[];
  }
}
