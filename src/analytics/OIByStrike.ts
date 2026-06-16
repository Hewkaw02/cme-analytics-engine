import { OptionRecord, StrikeOIRecord } from '../types.js';

export function computeOIByStrike(optionsData: OptionRecord[], symbol: string, tradeDate: string): StrikeOIRecord[] {
  const strikeMap = new Map<string, StrikeOIRecord>();

  for (const opt of optionsData) {
    const key = `${opt.expiry_code}_${opt.strike}`;
    if (!strikeMap.has(key)) {
      strikeMap.set(key, {
        trade_date: tradeDate,
        symbol: symbol,
        expiry_code: opt.expiry_code,
        strike: Number(opt.strike),
        underlying_price: opt.underlying_price ? Number(opt.underlying_price) : null,
        call_oi: 0,
        put_oi: 0,
        call_oi_change: 0,
        put_oi_change: 0,
        call_volume: 0,
        put_volume: 0,
        call_iv: null,
        put_iv: null,
        iv_skew: null,
        net_delta_exposure: null,
      });
    }

    const record = strikeMap.get(key)!;
    const oi = Number(opt.open_interest || 0);
    const oiChange = Number(opt.oi_change || 0);
    const vol = Number(opt.volume || 0);
    const iv = opt.implied_vol !== null ? Number(opt.implied_vol) : null;

    if (opt.option_type === 'C') {
      record.call_oi = oi;
      record.call_oi_change = oiChange;
      record.call_volume = vol;
      record.call_iv = iv;
    } else if (opt.option_type === 'P') {
      record.put_oi = oi;
      record.put_oi_change = oiChange;
      record.put_volume = vol;
      record.put_iv = iv;
    }
    
    if (record.call_iv !== null && record.put_iv !== null) {
      record.iv_skew = record.call_iv - record.put_iv;
    }
  }

  return Array.from(strikeMap.values());
}
