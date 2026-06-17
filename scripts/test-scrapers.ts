import { BrowserPool } from '../src/browser/BrowserPool.js';
import { OptionsScraper } from '../src/scrapers/OptionsScraper.js';
import { SettlementScraper } from '../src/scrapers/SettlementScraper.js';
import { logger } from '../src/utils/logger.js';

// Mock DB chain to allow test to run without active database connection
const mockDb = {
  insertInto: () => mockDb,
  values: () => mockDb,
  onConflict: () => mockDb,
  doUpdateSet: () => mockDb,
  execute: async () => []
} as any;

async function testScrapers() {
  const pool = new BrowserPool({
    headless: true,
    stealth: true,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'random',
    timeout: 30000,
    cookiePersist: false
  }, { maxInstances: 1 });

  try {
    const settlementScraper = new SettlementScraper(pool, mockDb);
    logger.info('Testing SettlementScraper for GC...');
    const settlements = await settlementScraper.scrape('GC', '2026-06-15');
    logger.info(`Settlement records found: ${settlements.length}`);
    if (settlements.length > 0) {
      logger.info('Sample settlement record:');
      console.log(settlements[0]);
    }

    const optionsScraper = new OptionsScraper(pool);
    logger.info('Testing OptionsScraper for GC...');
    const options = await optionsScraper.scrape('GC', '2026-06-15');
    logger.info(`Options records found: ${options.records.length}`);
    
    // Find an option record with non-zero open interest to prove it works
    const withOi = options.records.filter(r => r.open_interest > 0);
    logger.info(`Options with >0 Open Interest: ${withOi.length}`);
    if (withOi.length > 0) {
      logger.info('Sample option record with OI:');
      console.log(withOi[0]);
    } else if (options.records.length > 0) {
      logger.info('No options with OI found. Sample record:');
      console.log(options.records[0]);
    }
  } catch (err) {
    logger.error('Test failed', err);
  } finally {
    await pool.closeAll();
  }
}

testScrapers().catch(console.error);
