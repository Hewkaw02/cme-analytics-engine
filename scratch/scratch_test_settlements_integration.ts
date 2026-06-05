import { BrowserPool } from './src/browser/BrowserPool.js';
import { SettlementScraper } from './src/scrapers/SettlementScraper.js';
import { db } from './src/db/client.js';

async function testSettlementsIntegration() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const scraper = new SettlementScraper(pool, db);
  const tradeDate = '05/19/2026';

  try {
    console.log(`--- Running SettlementScraper for ES ---`);
    const esRecords = await scraper.scrape('ES', tradeDate);
    console.log(`ES Scraped and Saved: ${esRecords.length} records.`);

    console.log(`\n--- Running SettlementScraper for NQ ---`);
    const nqRecords = await scraper.scrape('NQ', tradeDate);
    console.log(`NQ Scraped and Saved: ${nqRecords.length} records.`);

    console.log(`\n--- Running SettlementScraper for GC ---`);
    const gcRecords = await scraper.scrape('GC', tradeDate);
    console.log(`GC Scraped and Saved: ${gcRecords.length} records.`);

    // Read back from Database to verify
    console.log('\n--- Verifying Database Records ---');
    const saved = await db
      .selectFrom('daily_settlement')
      .selectAll()
      .where('trade_date', '=', tradeDate)
      .execute();
    
    console.log(`Total saved records in DB for ${tradeDate}: ${saved.length}`);
    if (saved.length > 0) {
      console.log('Sample DB Record:', saved[0]);
    }

  } catch (err) {
    console.error('Integration Test Error:', err);
  } finally {
    await pool.closeAll();
    await db.destroy();
    console.log('DB client destroyed, pool closed.');
  }
}

testSettlementsIntegration();
