import { db } from '../src/db/client.js';

async function checkDb() {
  try {
    const dates = await db
      .selectFrom('options_chain')
      .select('trade_date')
      .select(eb => eb.fn.count('trade_date').as('cnt'))
      .groupBy('trade_date')
      .execute();
    
    console.log('Available Options Chain Dates in DB:', dates);

    const nonNullIv = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('implied_vol', 'is not', null)
      .executeTakeFirst();
    console.log('Options with non-null implied_vol:', nonNullIv);

    const nonNullDelta = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('delta', 'is not', null)
      .executeTakeFirst();
    console.log('Options with non-null delta:', nonNullDelta);

    const nonNullGamma = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('gamma', 'is not', null)
      .executeTakeFirst();
    console.log('Options with non-null gamma:', nonNullGamma);

    const nonNullSettle = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('settle_price', 'is not', null)
      .executeTakeFirst();
    console.log('Options with non-null settle_price:', nonNullSettle);

    const nonZeroOi = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('open_interest', '>', 0)
      .executeTakeFirst();
    console.log('Options with open_interest > 0:', nonZeroOi);

    const nonNullUnderlying = await db
      .selectFrom('options_chain')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('underlying_price', 'is not', null)
      .executeTakeFirst();
    console.log('Options with non-null underlying_price:', nonNullUnderlying);

    const sampleOptions = await db
      .selectFrom('options_chain')
      .select(['expiry_code', 'strike', 'option_type', 'implied_vol', 'gamma', 'delta', 'settle_price', 'underlying_price'])
      .where('settle_price', 'is not', null)
      .limit(5)
      .execute();
    console.log('Sample options with Settle Price:', sampleOptions);

    const settlements = await db
      .selectFrom('daily_settlement')
      .select('trade_date')
      .select(eb => eb.fn.count('trade_date').as('cnt'))
      .groupBy('trade_date')
      .execute();
    
    console.log('Available Daily Settlement Dates in DB:', settlements);
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

checkDb();
