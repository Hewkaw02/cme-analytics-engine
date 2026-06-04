import { logger } from '../utils/logger.js';
import { humanDelay } from '../utils/Delay.js';
import { BrowserPage } from './BrowserPool.js';

/**
 * Warm-up flow per Spec §10.3.
 *
 * Before scraping any data, we must visit the CME homepage and navigate
 * through intermediate pages so that Cloudflare / Akamai sets the required
 * session cookies and JS challenge tokens. Skipping warm-up will trigger
 * anti-bot measures on the actual data pages.
 */
export async function warmupSession(page: BrowserPage): Promise<void> {
  logger.info('Starting browser warm-up flow');

  try {
    // Step 1: Visit CME homepage
    await page.goto('https://www.cmegroup.com/', { waitUntil: 'domcontentloaded' });
    await humanDelay(2000, 4000);
    logger.debug('Warm-up: visited homepage');

    // Step 2: Simulate scroll to look human
    await page.evaluate(() => {
      window.scrollBy(0, 300);
    });
    await humanDelay(500, 1500);

    // Step 3: Navigate to markets page
    await page.goto('https://www.cmegroup.com/markets/', { waitUntil: 'domcontentloaded' });
    await humanDelay(1500, 2500);
    logger.debug('Warm-up: visited markets page');

    // Step 4: Another scroll for naturalness
    await page.evaluate(() => {
      window.scrollBy(0, 200);
    });
    await humanDelay(500, 1000);

    logger.info('Browser warm-up complete — cookies should be set');
  } catch (err) {
    logger.warn('Warm-up flow encountered an error (non-fatal)', { error: String(err) });
    // Non-fatal: continue anyway, the actual scrape may still succeed
  }
}
