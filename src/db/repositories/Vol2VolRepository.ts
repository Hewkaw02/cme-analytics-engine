import { Kysely } from 'kysely';
import { Database, Vol2VolSnapshotRecord, Vol2VolStrikeRecord } from '../../types.js';
import { logger } from '../../utils/logger.js';

export class Vol2VolRepository {
  private db: Kysely<Database>;

  constructor(dbInstance: Kysely<Database>) {
    this.db = dbInstance;
  }

  /**
   * Saves a full Vol2Vol dataset (snapshot + strikes) inside a transaction.
   */
  public async saveVol2VolData(
    snapshot: Omit<Vol2VolSnapshotRecord, 'id' | 'fetched_at'>,
    strikes: Omit<Vol2VolStrikeRecord, 'id' | 'snapshot_id'>[]
  ): Promise<number> {
    return await this.db.transaction().execute(async (tx) => {
      // 1. Insert snapshot
      const snapshotResult = await tx
        .insertInto('vol2vol_snapshots')
        .values({
          trade_date: snapshot.trade_date,
          symbol: snapshot.symbol,
          future_price: snapshot.future_price,
          atm_volatility: snapshot.atm_volatility,
          dte: snapshot.dte,
          sd1_down: snapshot.sd1_down,
          sd1_up: snapshot.sd1_up,
          sd2_down: snapshot.sd2_down,
          sd2_up: snapshot.sd2_up,
          sd3_down: snapshot.sd3_down,
          sd3_up: snapshot.sd3_up,
          expiry_date: snapshot.expiry_date,
          contract_title: snapshot.contract_title,
          fetched_at: new Date().toISOString()
        })
        .onConflict((oc) =>
          oc.columns(['trade_date', 'symbol', 'fetched_at']).doUpdateSet((eb) => ({
            future_price: eb.ref('excluded.future_price'),
            atm_volatility: eb.ref('excluded.atm_volatility'),
            dte: eb.ref('excluded.dte'),
            sd1_down: eb.ref('excluded.sd1_down'),
            sd1_up: eb.ref('excluded.sd1_up'),
            sd2_down: eb.ref('excluded.sd2_down'),
            sd2_up: eb.ref('excluded.sd2_up'),
            sd3_down: eb.ref('excluded.sd3_down'),
            sd3_up: eb.ref('excluded.sd3_up'),
            expiry_date: eb.ref('excluded.expiry_date'),
            contract_title: eb.ref('excluded.contract_title'),
          }))
        )
        .returning('id')
        .executeTakeFirstOrThrow();

      const snapshotId = Number(snapshotResult.id);

      if (strikes.length > 0) {
        // 2. Prepare values
        const strikeValues = strikes.map((s) => ({
          snapshot_id: snapshotId,
          strike: s.strike,
          call_volume: s.call_volume,
          put_volume: s.put_volume,
          implied_vol: s.implied_vol,
          settle_vol: s.settle_vol,
        }));

        // 3. Batch insert strikes
        // We split into chunks if there are too many (though Vol2Vol usually has < 150 strikes)
        const CHUNK_SIZE = 100;
        for (let i = 0; i < strikeValues.length; i += CHUNK_SIZE) {
          const chunk = strikeValues.slice(i, i + CHUNK_SIZE);
          await tx
            .insertInto('vol2vol_strike_records')
            .values(chunk)
            .onConflict((oc) =>
              oc.columns(['snapshot_id', 'strike']).doUpdateSet((eb) => ({
                call_volume: eb.ref('excluded.call_volume'),
                put_volume: eb.ref('excluded.put_volume'),
                implied_vol: eb.ref('excluded.implied_vol'),
                settle_vol: eb.ref('excluded.settle_vol'),
              }))
            )
            .execute();
        }
      }

      logger.info(`Vol2VolRepository: Saved snapshot ID ${snapshotId} with ${strikes.length} strikes for ${snapshot.symbol}`);
      return snapshotId;
    });
  }

  /**
   * Retrieves the latest snapshot and its associated strike records for a given symbol.
   */
  public async getLatestSnapshot(symbol: string): Promise<{
    snapshot: Vol2VolSnapshotRecord;
    strikes: Vol2VolStrikeRecord[];
  } | null> {
    const snapshot = await this.db
      .selectFrom('vol2vol_snapshots')
      .selectAll()
      .where('symbol', '=', symbol)
      .orderBy('fetched_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!snapshot) return null;

    const strikes = await this.db
      .selectFrom('vol2vol_strike_records')
      .selectAll()
      .where('snapshot_id', '=', Number(snapshot.id))
      .orderBy('strike', 'asc')
      .execute();

    return {
      snapshot,
      strikes,
    };
  }
}
