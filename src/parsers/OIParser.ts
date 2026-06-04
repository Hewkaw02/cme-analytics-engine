import { FuturesOIRecord, StrikeOIRecord, OptionRecord } from '../types.js';
import { SYMBOLS } from '../config/symbols.js';

export class OIParser {
  /**
   * Parses the JSON response from CME Futures Settlements API into FuturesOIRecord array.
   */
  public parseFuturesOI(rawJson: any, symbol: string, tradeDate: string): FuturesOIRecord[] {
    const records: FuturesOIRecord[] = [];

    if (!rawJson || !rawJson.settlements || !Array.isArray(rawJson.settlements)) {
      return records;
    }

    for (const item of rawJson.settlements) {
      // Exclude total rows or invalid rows
      if (item.month === 'TOTAL' || !item.month) {
        continue;
      }

      const totalOi = this.parseNumber(item.openInterest) || 0;
      const totalVolume = this.parseNumber(item.volume) || 0;
      const settlePrice = this.parseNumber(item.settle);
      const priorSettle = this.parseNumber(item.priorSettle);

      let priceChange: number | null = null;
      if (settlePrice !== null && priorSettle !== null) {
        priceChange = settlePrice - priorSettle;
      }

      // We might not have prior OI to calculate oi_change directly from this payload,
      // but CME sometimes provides it. Assuming 0 if not present, to be calculated by DB or analytics.
      const oiChange = this.parseNumber(item.oiChange) || 0;
      let oiChangePct: number | null = null;
      if (oiChange !== 0 && totalOi !== 0) {
        const prevOi = totalOi - oiChange;
        if (prevOi > 0) {
          oiChangePct = (oiChange / prevOi) * 100;
        }
      }

      records.push({
        trade_date: tradeDate,
        symbol: symbol,
        expiry_code: item.month.trim(),
        expiry_date: null, // To be filled/mapped later if needed
        total_oi: totalOi,
        oi_change: oiChange,
        oi_change_pct: oiChangePct,
        total_volume: totalVolume,
        settle_price: settlePrice,
        prior_settle: priorSettle,
        price_change: priceChange,
        source: 'CME_WS',
        fetched_at: new Date().toISOString(),
      });
    }

    return records;
  }

  /**
   * Aggregates OptionRecord[] into StrikeOIRecord[].
   */
  public parseStrikeOI(
    options: OptionRecord[],
    symbol: string,
    tradeDate: string,
  ): StrikeOIRecord[] {
    const strikeMap = new Map<string, StrikeOIRecord>();
    const multiplier = SYMBOLS[symbol]?.contractMultiplier || 1;

    for (const opt of options) {
      const key = `${opt.expiry_code}_${opt.strike}`;

      if (!strikeMap.has(key)) {
        strikeMap.set(key, {
          trade_date: tradeDate,
          symbol: symbol,
          expiry_code: opt.expiry_code,
          strike: opt.strike,
          underlying_price: opt.underlying_price,
          call_oi: 0,
          put_oi: 0,
          call_oi_change: 0,
          put_oi_change: 0,
          call_volume: 0,
          put_volume: 0,
          call_iv: null,
          put_iv: null,
          iv_skew: null,
          net_delta_exposure: 0,
        });
      }

      const record = strikeMap.get(key)!;

      if (opt.option_type === 'C') {
        record.call_oi += opt.open_interest || 0;
        record.call_oi_change += opt.oi_change || 0;
        record.call_volume += opt.volume || 0;
        record.call_iv = opt.implied_vol;

        if (opt.delta !== null && opt.open_interest !== null) {
          // Delta exposure for Calls = call_oi * delta * multiplier
          record.net_delta_exposure =
            (record.net_delta_exposure || 0) + opt.open_interest * opt.delta * multiplier;
        }
      } else if (opt.option_type === 'P') {
        record.put_oi += opt.open_interest || 0;
        record.put_oi_change += opt.oi_change || 0;
        record.put_volume += opt.volume || 0;
        record.put_iv = opt.implied_vol;

        if (opt.delta !== null && opt.open_interest !== null) {
          // Delta exposure for Puts = put_oi * delta * multiplier
          record.net_delta_exposure =
            (record.net_delta_exposure || 0) + opt.open_interest * opt.delta * multiplier;
        }
      }
    }

    const results = Array.from(strikeMap.values());

    for (const record of results) {
      // Calculate IV skew if both Call IV and Put IV exist
      if (record.call_iv !== null && record.put_iv !== null) {
        record.iv_skew = record.put_iv - record.call_iv;
      }
    }

    return results;
  }

  private parseNumber(val: any): number | null {
    if (val === undefined || val === null || val === '-' || val === 'UNCH') return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const clean = val.replace(/,/g, '').trim();
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}
