
import { query, getPool } from '../client.js';
import { logger } from '../../utils/logger.js';
import { IntradayBar } from '../../types.js';

const BATCH_SIZE = 500;

export class IntradayRepository {
  async upsertIntradayBars(bars: IntradayBar[]): Promise<number> {
    if (bars.length === 0) return 0;

    let totalAffected = 0;
    for (let i = 0; i < bars.length; i += BATCH_SIZE) {
      const batch = bars.slice(i, i + BATCH_SIZE);
      totalAffected += await this.upsertBatch(batch);
    }

    logger.info(`IntradayRepository: upserted ${totalAffected} bars`, {
      symbol: bars[0].symbol,
      timeframe: bars[0].timeframe
    });
    return totalAffected;
  }

  private async upsertBatch(bars: IntradayBar[]): Promise<number> {
    const columns = ['bar_time', 'symbol', 'timeframe', 'open', 'high', 'low', 'close', 'volume', 'is_rth'];
    const updateColumns = ['open', 'high', 'low', 'close', 'volume', 'is_rth'];

    const values: any[] = [];
    const rows: string[] = [];
    let paramIndex = 1;

    for (const b of bars) {
      const rowPlaceholders: string[] = [];
      const rowValues = [
        b.bar_time,
        b.symbol,
        b.timeframe,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume,
        b.is_rth
      ];

      for (const val of rowValues) {
        rowPlaceholders.push(`$${paramIndex++}`);
        values.push(val);
      }
      rows.push(`(${rowPlaceholders.join(', ')})`);
    }

    const updateSet = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
    const sql = `
      INSERT INTO intraday_bars (${columns.join(', ')})
      VALUES ${rows.join(', ')}
      ON CONFLICT (bar_time, symbol, timeframe)
      DO UPDATE SET ${updateSet}
    `;

    const result = await query(sql, values);
    return result.rowCount ?? 0;
  }
}
