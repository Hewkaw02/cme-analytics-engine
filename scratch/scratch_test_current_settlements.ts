import { BrowserPool } from './src/browser/BrowserPool.js';
import { SettlementScraper } from './src/scrapers/SettlementScraper.js';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

async function testCurrentSettlements() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  // Mock DB client
  const mockDb = {
    insertInto: () => ({
      values: () => ({
        onConflict: () => ({
          doUpdateSet: () => ({
            execute: async () => {
              console.log('Mock DB execute called');
            }
          })
        })
      })
    })
  };

  const scraper = new SettlementScraper(pool, mockDb);
  const tradeDate = '05/19/2026';

  try {
    console.log(`--- Testing ES Settlements with current logic (ProductCode: 133, path: /G) ---`);
    const recordsES = await scraper.scrape('ES', tradeDate);
    console.log(`ES Scraped Records: ${recordsES.length}`);
    if (recordsES.length > 0) {
      console.log('ES Sample:', recordsES[0]);
    }

    console.log(`\n--- Testing NQ Settlements with current logic (ProductCode: 146, path: /G) ---`);
    const recordsNQ = await scraper.scrape('NQ', tradeDate);
    console.log(`NQ Scraped Records: ${recordsNQ.length}`);
    if (recordsNQ.length > 0) {
      console.log('NQ Sample:', recordsNQ[0]);
    }
  } catch (err) {
    console.error('Error during scrape:', err);
  } finally {
    await pool.closeAll();
  }
}

testCurrentSettlements();
