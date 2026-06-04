import { db } from '../src/db/client.js';
import { BrowserPool } from '../src/browser/BrowserPool.js';
import { IntradayRepository } from '../src/db/repositories/IntradayRepository.js';
import { IntradayScraper } from '../src/scrapers/IntradayScraper.js';
import { Indicators } from '../src/analytics/Indicators.js';
import { logger } from '../src/utils/logger.js';
import { env } from '../src/config/env.js';
import { Symbol } from '../src/types.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  return {
    timeframe: parsed.timeframe || '1D',
    symbol: parsed.symbol || 'ALL',
    days: parseInt(parsed.days || '1825', 10), // 5 years default
  };
}

async function runBackfill() {
  const { timeframe, symbol, days } = parseArgs();

  logger.info(`=== Historical Backfill Utility ===`);
  logger.info(`Timeframe: ${timeframe}`);
  logger.info(`Symbol:    ${symbol}`);
  logger.info(`Days:      ${days} days ago`);

  // Define symbols to process
  const symbolsToProcess: Symbol[] = symbol === 'ALL' ? ['ES', 'NQ', 'GC'] : [symbol as Symbol];

  // Initialize browser pool (required for scraping infrastructure)
  const sessionConfig = {
    headless: true,
    proxy: env.PROXY_URL,
    userAgent: 'Mozilla/5.0',
    stealth: true,
    viewport: { width: 1920, height: 1080 },
    timeout: 30_000,
    cookiePersist: false,
  };

  const pool = new BrowserPool(sessionConfig, { maxInstances: 1 });
  const repo = new IntradayRepository(db);
  const scraper = new IntradayScraper(pool, repo);

  // Compute start and end times
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

  logger.info(`Backfill date range: ${startTime.toISOString()} to ${endTime.toISOString()}`);

  for (const sym of symbolsToProcess) {
    try {
      logger.info(`[Backfill] Starting ${sym} (${timeframe})...`);
      
      // Perform historical scrape
      const result = await scraper.scrape(sym, timeframe, startTime, endTime);
      
      if (result.bars.length === 0) {
        logger.warn(`[Backfill] No bars returned for ${sym} (${timeframe})`);
        continue;
      }

      logger.info(`[Backfill] Scraped ${result.bars.length} bars. Saving to database...`);
      const inserted = await repo.upsertIntradayBars(result.bars);
      logger.info(`[Backfill] Upserted ${inserted} bars into database for ${sym}.`);

      // Compute technical indicators on the backfilled data
      logger.info(`[Backfill] Computing technical indicators for ${sym} (${timeframe})...`);
      await Indicators.computeIntradayIndicators(db, sym, timeframe);
      logger.info(`[Backfill] Technical indicators calculated and persisted for ${sym}.`);

    } catch (err: any) {
      logger.error(`[Backfill] Failed to backfill ${sym} (${timeframe}): ${err.message}`);
    }
  }

  // Cleanup pool
  await pool.closeAll();
  logger.info('=== Backfill Utility Completed ===');
  process.exit(0);
}

runBackfill().catch((err) => {
  logger.error('Backfill Utility Fatal Error', { error: String(err) });
  process.exit(1);
});
