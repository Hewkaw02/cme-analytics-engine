import { Kysely } from 'kysely';
import { SettlementRecord, Database } from '../../types.js';

export class SettlementRepository {
  private db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async upsertSettlements(records: SettlementRecord[]): Promise<void> {
    if (records.length === 0) return;

    await this.db
      .insertInto('daily_settlement')
      .values(records)
      .onConflict((oc) =>
        oc.columns(['trade_date', 'symbol', 'expiry_code']).doUpdateSet((eb) => ({
          open: eb.ref('excluded.open'),
          high: eb.ref('excluded.high'),
          low: eb.ref('excluded.low'),
          settle: eb.ref('excluded.settle'),
          prior_settle: eb.ref('excluded.prior_settle'),
          change: eb.ref('excluded.change'),
          est_volume: eb.ref('excluded.est_volume'),
          prior_oi: eb.ref('excluded.prior_oi'),
          oi: eb.ref('excluded.oi'),
          source: eb.ref('excluded.source'),
          fetched_at: eb.ref('excluded.fetched_at'),
        })),
      )
      .execute();
  }
}
