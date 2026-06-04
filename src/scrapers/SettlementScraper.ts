import { BaseScraper } from './BaseScraper.js';
import { BrowserPool } from '../browser/BrowserPool.js';
import { SettlementRecord } from '../types.js';

import { SYMBOLS } from '../config/symbols.js';

export class SettlementScraper extends BaseScraper {
  private db: any;

  constructor(pool: BrowserPool, dbClient: any) {
    super(pool);
    this.db = dbClient;
  }

  async scrape(symbol: string, tradeDate: string): Promise<SettlementRecord[]> {
    const productCode = SYMBOLS[symbol].productCode;
    if (!productCode) throw new Error(`Unknown symbol: ${symbol}`);

    const url = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/${productCode}/FUT?strategy=DEFAULT&tradeDate=${tradeDate}&pageSize=500&isProtected&_t=${Date.now()}`;

    const page = await this.pool.acquire();
    try {
      // Establish origin context to avoid CORS / NetworkError in about:blank
      await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html', { waitUntil: 'domcontentloaded' });

      const raw = await page.evaluate(async (fetchUrl: any) => {
        const res = await fetch(fetchUrl, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
        return res.json();
      }, url);

      const records = this.parseSettlement(raw, symbol, tradeDate);

      if (records.length > 0) {
        await this.db
          .insertInto('daily_settlement')
          .values(records)
          .onConflict((oc: any) =>
            oc.columns(['trade_date', 'symbol', 'expiry_code']).doUpdateSet((eb: any) => ({
              open: eb.ref('excluded.open'),
              high: eb.ref('excluded.high'),
              low: eb.ref('excluded.low'),
              settle: eb.ref('excluded.settle'),
              prior_settle: eb.ref('excluded.prior_settle'),
              change: eb.ref('excluded.change'),
              est_volume: eb.ref('excluded.est_volume'),
              prior_oi: eb.ref('excluded.prior_oi'),
              oi: eb.ref('excluded.oi'),
              source: eb.ref('excluded.source'),
              fetched_at: eb.ref('excluded.fetched_at'),
            })),
          )
          .execute();
      }

      return records;
    } finally {
      await this.pool.release(page);
    }
  }

  private parseSettlement(raw: any, symbol: string, tradeDate: string): SettlementRecord[] {
    if (!raw || !raw.settlements) return [];

    return raw.settlements.map((s: any) => ({
      trade_date: tradeDate,
      symbol,
      expiry_code: s.month || '',
      open: this.parseFloatOrNull(s.open),
      high: this.parseFloatOrNull(s.high),
      low: this.parseFloatOrNull(s.low),
      settle: this.parseFloatOrNull(s.settle),
      prior_settle: this.parseFloatOrNull(s.priorSettle),
      change: this.parseFloatOrNull(s.change),
      est_volume: this.parseIntOrNull(s.volume),
      prior_oi: this.parseIntOrNull(s.priorOi),
      oi: this.parseIntOrNull(s.openInterest || s.oi),
      source: 'CME_WS',
      fetched_at: new Date().toISOString(),
    }));
  }

  private parseFloatOrNull(val: any): number | null {
    if (!val || val === '-') return null;
    const parsed = parseFloat(val.toString().replace(/,/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  private parseIntOrNull(val: any): number | null {
    if (!val || val === '-') return null;
    const parsed = parseInt(val.toString().replace(/,/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
  }
}
