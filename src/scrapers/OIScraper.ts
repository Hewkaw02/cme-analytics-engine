import { logger } from '../utils/logger.js';
import { BaseScraper, ScraperErrorType } from './BaseScraper.js';
import { OIParser } from '../parsers/OIParser.js';
import { SYMBOLS, CME_SETTLEMENT_PRODUCT_CODES } from '../config/symbols.js';
import { BrowserPool } from '../browser/BrowserPool.js';
import { format, parseISO } from 'date-fns';

export interface OIResult {
  futuresOI: any[];
  strikeOI: any[];
  bulletinOI: any[];
}

export class OIScraper extends BaseScraper {
  private parser: OIParser;

  constructor(pool: BrowserPool) {
    super(pool);
    this.parser = new OIParser();
  }

  public async scrape(symbol: string, tradeDate: string): Promise<OIResult> {
    return this.retry(
      () => this.doScrape(symbol, tradeDate),
      `OIScraper(${symbol}, ${tradeDate})`,
      ScraperErrorType.TRANSIENT,
    );
  }

  private async doScrape(symbol: string, tradeDate: string): Promise<OIResult> {
    console.log(`[OIScraper] Starting OI scrape for ${symbol} on ${tradeDate}`);

    const strikeOI = await this.extractFromOptionsChain(symbol, tradeDate);
    const futuresOI = await this.fetchFuturesOI(symbol, tradeDate);
    const bulletinOI = await this.fetchDailyBulletin(symbol, tradeDate);

    return { strikeOI, futuresOI, bulletinOI };
  }

  private async fetchFuturesOI(symbol: string, tradeDate: string): Promise<any[]> {
    const settlementId = CME_SETTLEMENT_PRODUCT_CODES[symbol];
    if (!settlementId) {
      throw new Error(`Settlement ID for ${symbol} not found in config`);
    }

    // CME API expects MM/DD/YYYY for settlement data
    const formattedDate = format(parseISO(tradeDate), 'MM/dd/yyyy');
    const url = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/${settlementId}/FUT?strategy=DEFAULT&tradeDate=${formattedDate}&pageSize=500&isProtected&_t=${Date.now()}`;

    const page = await this.pool.acquire();
    try {
      logger.info(`[OIScraper] Fetching Futures OI for ${symbol} from ${url}`);

      // Establish origin context to avoid CORS / NetworkError
      try {
        const productUrl = SYMBOLS[symbol]?.futuresUrl || 'https://www.cmegroup.com/';
        await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
      } catch (e) {
        logger.warn(`[OIScraper] Navigation timeout or error, proceeding with fetch...`);
      }

      const response = await page.evaluate(async (fetchUrl: any) => {
        const res = await fetch(fetchUrl, {
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
        });
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch(e) {
            throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
        }
      }, url);

      console.log(`[OIScraper] Received ${response.settlements?.length || 0} futures settlement records`);
      if (response.settlements?.length > 0) {
        console.log(`[OIScraper] First record:`, JSON.stringify(response.settlements[0]));
      }

      return this.parser.parseFuturesOI(response, symbol, tradeDate);
    } catch (error) {
      console.error(`[OIScraper] Error fetching Futures OI for ${symbol}:`, error);
      throw error;
    } finally {
      await this.pool.release(page);
    }
  }

  private async extractFromOptionsChain(symbol: string, tradeDate: string): Promise<any[]> {
    return [];
  }

  private async fetchDailyBulletin(symbol: string, tradeDate: string): Promise<any[]> {
    return [];
  }
}
