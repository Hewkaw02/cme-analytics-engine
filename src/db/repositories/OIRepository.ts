import { Kysely, sql } from 'kysely';
// Assuming db instance is exported from db/client.ts
// import { db } from '../client';
import { FuturesOIRecord, Database } from '../../types.js';

export class OIRepository {
  private db: Kysely<Database>;

  constructor(dbInstance: Kysely<Database>) {
    this.db = dbInstance;
  }

  /**
   * Upserts Futures OI records.
   * On conflict (trade_date, symbol, expiry_code), updates the records.
   */
  public async upsertFuturesOI(records: FuturesOIRecord[]): Promise<void> {
    if (!records || records.length === 0) return;

    await this.db
      .insertInto('futures_oi')
      .values(records)
      .onConflict((oc: any) =>
        oc.columns(['trade_date', 'symbol', 'expiry_code']).doUpdateSet((eb: any) => ({
          total_oi: eb.ref('excluded.total_oi'),
          oi_change: eb.ref('excluded.oi_change'),
          oi_change_pct: eb.ref('excluded.oi_change_pct'),
          total_volume: eb.ref('excluded.total_volume'),
          settle_price: eb.ref('excluded.settle_price'),
          prior_settle: eb.ref('excluded.prior_settle'),
          price_change: eb.ref('excluded.price_change'),
          fetched_at: eb.ref('excluded.fetched_at'),
        })),
      )
      .execute();
  }

  /**
   * Refreshes the `oi_by_strike` materialized view concurrently.
   * Assumes the materialized view and its unique index have already been created.
   */
  public async refreshOIByStrikeView(): Promise<void> {
    // CONCURRENTLY requires a unique index on the materialized view
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY oi_by_strike`.execute(this.db);
  }
}
