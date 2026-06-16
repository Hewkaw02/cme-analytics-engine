
import { logger } from '../utils/logger.js';
import { BaseScraper } from './BaseScraper.js';
import { IntradayParser, CmeChartRaw } from '../parsers/IntradayParser.js';
import { IntradayRepository } from '../db/repositories/IntradayRepository.js';
import { humanDelay } from '../utils/Delay.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { IntradayBar, Timeframe } from '../types.js';

export interface IntradayResult {
  symbol: string;
  timeframe: string;
  bars: IntradayBar[];
}

export interface IntradayScrapeRunResult {
  recordsInserted: number;
  results: IntradayResult[];
}

export class IntradayScraper extends BaseScraper {
  private parser: IntradayParser;
  private repo: IntradayRepository;

  private readonly PERIODS: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1D': 86400,
  };

  private readonly YAHOO_SYMBOLS: Record<string, string> = {
    'ES': 'ES=F',
    'NQ': 'NQ=F',
    'GC': 'GC=F'
  };

  constructor(pool: any, repo: IntradayRepository) {
    super(pool);
    this.parser = new IntradayParser();
    this.repo = repo;
  }

  async scrape(symbol: string, timeframe: string, startTime: Date, endTime: Date): Promise<IntradayResult> {
    try {
        // Try CME first (though we expect 404 currently)
        return await this.fetchFromCME(symbol, timeframe, startTime, endTime);
    } catch (err: any) {
        if (err.message.includes('404')) {
            logger.warn(`[IntradayScraper] CME API returned 404 for ${symbol}. Falling back to Yahoo Finance...`);
            return await this.fetchFromYahoo(symbol, timeframe, startTime, endTime);
        }
        throw err;
    }
  }

  private async fetchFromCME(symbol: string, timeframe: string, startTime: Date, endTime: Date): Promise<IntradayResult> {
    const symbolConfig = (await import('../config/symbols.js')).SYMBOLS[symbol];
    const productCode = symbolConfig?.productCode || 133;
    const contractCode = await this.getActiveContract(symbol);
    const period = this.PERIODS[timeframe] || 60;

    const url = `https://www.cmegroup.com/CmeWS/mvc/md/c/${productCode}/${contractCode}/chart?startTime=${startTime.getTime()}&endTime=${endTime.getTime()}&period=${period}`;

    const page = await this.pool.acquire();
    try {
      const productUrl = `https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html`;
      await page.goto(productUrl, { waitUntil: 'domcontentloaded' });

      const raw = (await page.evaluate(async (fetchUrl) => {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      }, url)) as CmeChartRaw;

      const bars = this.parser.parseIntradayBars(raw, symbol, timeframe, contractCode);
      return { symbol, timeframe, bars };
    } finally {
      await this.pool.release(page);
    }
  }

  private async fetchFromYahoo(symbol: string, timeframe: string, startTime: Date, endTime: Date): Promise<IntradayResult> {
    const yahooSymbol = this.YAHOO_SYMBOLS[symbol];
    if (!yahooSymbol) throw new Error(`No Yahoo symbol mapping for ${symbol}`);

    // Convert timeframe to Yahoo format (1m, 5m, 15m, 30m, 60m, 1h, 1d)
    let yahooInterval = timeframe;
    if (timeframe === '1h') yahooInterval = '60m';
    if (timeframe === '1D') yahooInterval = '1d';
    if (timeframe === '4h') yahooInterval = '60m';

    const period1 = Math.floor(startTime.getTime() / 1000);
    const period2 = Math.floor(endTime.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yahooInterval}&period1=${period1}&period2=${period2}`;

    logger.info(`[IntradayScraper] Fetching from Yahoo: ${url}`);

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Yahoo HTTP Error: ${res.status}`);
        const raw = await res.json();
        return this.parseYahooData(raw, symbol, timeframe);
    } catch (err: any) {
        logger.error(`[IntradayScraper] Yahoo fetch failed: ${err.message}`);
        throw err;
    }
  }

  private parseYahooData(raw: any, symbol: string, timeframe: string): IntradayResult {
    const result = raw.chart?.result?.[0];
    if (!result) throw new Error('Invalid Yahoo response format');

    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    const periodSeconds = this.PERIODS[timeframe] || 60;
    const bars = timestamps.map((t: number, i: number) => ({
      bar_time: new Date(t * 1000).toISOString(),
      bar_close_time: new Date((t + periodSeconds) * 1000).toISOString(),
      symbol,
      timeframe,
      expiry_code: TimeUtils.getActiveContractCode(symbol),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i],
      vwap: null,
      buy_volume: null,
      sell_volume: null,
      delta_volume: null,
      trade_count: null,
      session: TimeUtils.isRegularHours(symbol, new Date(t * 1000)) ? 'RTH' : 'ETH',
      is_rth: TimeUtils.isRegularHours(symbol, new Date(t * 1000)),
      vwap_session: null,
      ema_9: null,
      ema_21: null,
      atr_14: null,
      rsi_14: null,
      bb_upper: null,
      bb_lower: null,
      cvd: null,
      vwap_sd1_upper: null,
      vwap_sd1_lower: null,
      vwap_sd2_upper: null,
      vwap_sd2_lower: null,
      fetched_at: new Date().toISOString(),
    })).filter((b: any) => b.open != null && b.close != null);

    return { symbol, timeframe, bars };
  }

  async scrapeAllTimeframes(
    symbol: string,
    tradeDate: string,
    timeframes: Timeframe[] = Object.keys(this.PERIODS) as Timeframe[],
  ): Promise<IntradayScrapeRunResult> {
    const start = new Date(`${tradeDate}T00:00:00Z`);
    const end = new Date();
    let totalInserted = 0;
    const results: IntradayResult[] = [];

    for (const timeframe of timeframes) {
      try {
        const result = await this.scrape(symbol, timeframe, start, end);
        if (result.bars.length > 0) {
            const inserted = await this.repo.upsertIntradayBars(result.bars);
            totalInserted += inserted;
            results.push(result);
            logger.info(`[IntradayScraper] Saved ${result.bars.length} bars for ${symbol} ${timeframe}`);
        }
      } catch (err: any) {
        logger.error(`[IntradayScraper] Failed to scrape ${symbol} ${timeframe}: ${err.message}`);
      }
      await humanDelay(1000, 2000);
    }

    return { recordsInserted: totalInserted, results };
  }

  async getActiveContract(symbol: string): Promise<string> {
    return TimeUtils.getActiveContractCode(symbol);
  }
}
