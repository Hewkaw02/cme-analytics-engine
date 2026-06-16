import { BaseScraper, ScraperErrorType } from './BaseScraper.js';
import { OptionsParser } from '../parsers/OptionsParser.js';
import { Validator } from '../parsers/Validator.js';
import { Symbol, ExpiryInfo, OptionsResult, CME_OPTIONS_URLS, OptionRecord } from '../types.js';
import { SYMBOLS } from '../config/symbols.js';
import { BrowserPool, BrowserPage } from '../browser/BrowserPool.js';
import { warmupSession } from '../browser/Warmup.js';
import { humanDelay } from '../utils/Delay.js';
import { logger } from '../utils/logger.js';
import { CmeOptionsRaw } from '../parsers/OptionsParser.js';

export class OptionsScraper extends BaseScraper {
  private parser: OptionsParser;
  private validator: Validator;

  constructor(pool: BrowserPool) {
    super(pool);
    this.parser = new OptionsParser();
    this.validator = new Validator();
  }

  /**
   * Scrapes options data for a given symbol across all active expiries.
   * Phase 2/3: Single + Multi-Symbol Support.
   */
  async scrape(symbol: Symbol, expectedTradeDate?: string): Promise<OptionsResult> {
    return this.retry(
      () => this.doScrape(symbol, expectedTradeDate),
      `OptionsScraper(${symbol})`,
      ScraperErrorType.TRANSIENT,
    );
  }

  private async doScrape(symbol: Symbol, expectedTradeDate?: string): Promise<OptionsResult> {
    const page = await this.pool.acquire();
    const allRecords: OptionRecord[] = [];

    try {
      await warmupSession(page);
      
      const config = SYMBOLS[symbol];
      const productId = config.optionsProductId || config.productCode;

      logger.info(`[OptionsScraper] Fetching expiries for ${symbol} (Product ID: ${productId})`);
      const expiries = await this.getExpiriesFromApi(page, productId as number);

      if (expiries.length === 0) {
        logger.warn(`No expiries found for ${symbol} via API.`);
        return { records: [], summary: { symbol, total: 0, valid: 0, invalid: 0, skipped: 0, errors: [] } };
      }

      logger.info(`[OptionsScraper] Found ${expiries.length} expiries for ${symbol}`);

      let dateValidated = false;

      for (const expiry of expiries) {
        try {
          logger.info(`[OptionsScraper] Fetching data for ${symbol} expiry: ${expiry.label} (${expiry.code})`);
          
          // The new API uses productId/year/month
          const dateParts = expiry.date.split('-');
          const year = dateParts[0];
          const month = parseInt(dateParts[1], 10);
          
          const data = await this.fetchOptionsDataFromApi(page, productId as number, year, month);
          if (data) {
            // Validate tradeDate in the API response if expectedTradeDate is provided
            if (expectedTradeDate && !dateValidated && data.tradeDate) {
              const apiDateStr = new Date(data.tradeDate).toISOString().slice(0, 10);
              if (apiDateStr !== expectedTradeDate) {
                throw new Error(`CME options data has not been updated yet for target date: ${expectedTradeDate} (current on site: ${apiDateStr})`);
              }
              dateValidated = true;
            }

            const parsed = this.parser.parseOptionsChain(data, symbol, expiry);
            allRecords.push(...parsed);
            logger.info(`[OptionsScraper] Parsed ${parsed.length} records for ${expiry.code}`);
          }
          
          await humanDelay(1000, 2000);
        } catch (err) {
          logger.error(`Failed to fetch/parse expiry ${expiry.code} for ${symbol}`, { error: String(err) });
          // Propagate the specific date mismatch error to fail the job
          if (err instanceof Error && err.message.includes('CME options data has not been updated yet')) {
            throw err;
          }
        }
      }

      // Validation with per-expiry summary logging
      return this.validator.validateOptionsPerExpiry(allRecords, symbol);
    } finally {
      await this.pool.release(page);
    }
  }

  private async getExpiriesFromApi(page: BrowserPage, productId: number): Promise<ExpiryInfo[]> {
    const url = `https://www.cmegroup.com/CmeWS/mvc/atm/expirations/${productId}`;
    try {
      const raw = await page.evaluate(async (fetchUrl: string) => {
        const res = await fetch(fetchUrl);
        return res.json();
      }, url);

      // The response is an array of option types (American, EOM, Weekly, etc.)
      const expiries: ExpiryInfo[] = [];
      const seenCodes = new Set<string>();

      for (const group of raw) {
        if (group.contractExpirations) {
          for (const exp of group.contractExpirations) {
            // Create a more unique expiry code using Month + Year to avoid collisions
            // Format: [Symbol][Month][YearShort] e.g. ESM26
            const monthMap: Record<number, string> = {
              1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M',
              7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z'
            };
            const monthCode = monthMap[exp.expirationMonth] || 'X';
            const yearShort = exp.expirationYear.toString().slice(-1);
            
            // Priority 1: Use underlying if it looks unique for this expiry month
            // Priority 2: Fallback to synthetic unique code
            const baseCode = exp.underlyingFutureContract || `${productId}${monthCode}${yearShort}`;
            
            // If we've seen this code (underlying) for a DIFFERENT month, we MUST make it unique
            let uniqueCode = baseCode;
            const disambiguator = `${exp.expirationMonth}${exp.expirationYear}`;
            
            // Since the DB has a unique constraint on expiry_code, we use a fully unique key if possible
            // But usually the UI shows the "Label" as the distinct thing.
            // For now, let's use the underlying + disambiguator if needed, 
            // or just a custom code that matches CME style.
            const customCode = `${monthCode}${yearShort}_${exp.productId}`;
            
            expiries.push({
              code: customCode, // Using custom unique code for the internal record
              label: `${group.label} - ${exp.label}`,
              date: exp.lastTradeDate.split('T')[0],
            });
          }
        }
      }
      return expiries;
    } catch (err) {
      logger.error(`Failed to fetch expiries from API for ${productId}`, { error: String(err) });
      return [];
    }
  }

  private async fetchOptionsDataFromApi(
    page: BrowserPage,
    productId: number,
    year: string,
    month: number,
  ): Promise<CmeOptionsRaw | null> {
    const url = `https://www.cmegroup.com/CmeWS/mvc/atm/strike-prices/${productId}/${year}/${month}/ALL`;
    
    // Method 1: page.evaluate(fetch) - Fast and clean
    try {
      logger.debug(`[OptionsScraper] Attempting Method 1 (fetch) for: ${url}`);
      return await page.evaluate(async (fetchUrl: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        try {
          const res = await fetch(fetchUrl, { signal: controller.signal });
          return await res.json();
        } finally {
          clearTimeout(timeoutId);
        }
      }, url);
    } catch (err) {
      logger.warn(`[OptionsScraper] Method 1 failed for ${url}, trying Method 2 (goto)`, { error: String(err) });
      
      // Method 2: page.goto (direct navigation) - More robust against certain network issues
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const content = await page.evaluate(() => document.body.innerText);
        return JSON.parse(content);
      } catch (gotoErr) {
        logger.error(`[OptionsScraper] All methods failed for ${url}`, { error: String(gotoErr) });
        return null;
      }
    }
  }

  private async setupIntercept(
    page: BrowserPage,
    queues: { raw: CmeOptionsRaw; url: string }[],
  ): Promise<void> {
    await page.route('**/*', (route: any, request: any) => {
      const blocked = ['image', 'stylesheet', 'font', 'media'];
      if (blocked.includes(request.resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('response', async (res: any) => {
      const url = res.url();
      if (/\/CmeWS\/mvc\/Quotes\/Option\/\d+\//.test(url)) {
        try {
          const raw = (await res.json()) as CmeOptionsRaw;
          if (raw) queues.push({ raw, url });
        } catch {
          // ignore non-JSON responses
        }
      }
    });
  }

  private async getExpiries(page: BrowserPage): Promise<ExpiryInfo[]> {
    try {
      return await page.$$eval('select.expiry-select option', (options: any[]) =>
        options.map((opt) => ({
          code: (opt as HTMLOptionElement).value,
          label: opt.textContent?.trim() ?? '',
          date: (opt as HTMLElement).dataset?.expiry ?? '',
        })),
      );
    } catch {
      return [];
    }
  }

  private async selectExpiry(page: BrowserPage, expiry: ExpiryInfo): Promise<void> {
    await page.select('select.expiry-select', expiry.code);
  }

  private async fallbackFetch(
    page: BrowserPage,
    symbol: Symbol,
    expiryCode: string,
  ): Promise<CmeOptionsRaw | null> {
    const productCode = SYMBOLS[symbol].productCode;
    const url = `https://www.cmegroup.com/CmeWS/mvc/Quotes/Option/${productCode}/G/${expiryCode}`;
    try {
      const raw = await page.evaluate(async (fetchUrl: any) => {
        const res = await fetch(fetchUrl, {
          headers: { Accept: 'application/json' },
        });
        return res.json();
      }, url);
      return raw as CmeOptionsRaw;
    } catch {
      logger.error(`Fallback API fetch failed for ${symbol} ${expiryCode}`);
      return null;
    }
  }
}
