import { ExpiryInfo, OptionRecord, Symbol } from '../types.js';

export interface CmeOptionsRaw {
  strikePrices: Array<{
    strikePrice: string;
    call: CmeOptionSide;
    put: CmeOptionSide;
  }>;
  tradeDate: string;
  underlyingPrice?: string; // May be missing in some responses
}

export interface CmeOptionSide {
  last: string;
  priorSettle: string; // Changed from settle
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  volume: string;
  openInterest: string;
  openInterestChange: string;
  high: string;
  low: string;
  open: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
  impliedVolatility: string;
  theoreticalValue: string;
}

export class OptionsParser {
  private parseDecimal(val: any): number | null {
    if (val === undefined || val === null || val === '-' || val.toString().toUpperCase() === 'UNCH') return null;
    const cleanVal = val.toString().replace(/,/g, '');
    const parsed = parseFloat(cleanVal);
    return isNaN(parsed) ? null : parsed;
  }

  private parseIntVal(val: any): number {
    if (val === undefined || val === null || val === '-') return 0;
    const cleanVal = val.toString().replace(/,/g, '');
    const parsed = parseInt(cleanVal, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = d2.getTime() - d1.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  public parseOptionsChain(raw: CmeOptionsRaw, symbol: Symbol, expiry: ExpiryInfo): OptionRecord[] {
    const records: OptionRecord[] = [];
    const underlying = this.parseDecimal(raw.underlyingPrice || '');
    const today = raw.tradeDate ? new Date(raw.tradeDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const dte = this.daysBetween(today, expiry.date);

    // Support both old and new root keys for backward compatibility during transition
    const rows = raw.strikePrices || (raw as any).optionContractQuotes || [];

    for (const row of rows) {
      const strike = parseFloat(row.strikePrice.replace(/,/g, ''));
      if (isNaN(strike) || strike <= 0) continue;

      const sides: Array<['C' | 'P', CmeOptionSide]> = [
        ['C', row.call || (row as any).calls],
        ['P', row.put || (row as any).puts],
      ];

      for (const [optType, s] of sides) {
        if (!s) continue;

        const last = this.parseDecimal(s.last);
        let intrinsic = null;
        if (underlying !== null) {
          intrinsic = optType === 'C'
            ? Math.max(0, underlying - strike)
            : Math.max(0, strike - underlying);
        }

        let time_value = null;
        if (last !== null && intrinsic !== null) {
          time_value = last - intrinsic;
        }

        let moneyness: 'ITM' | 'ATM' | 'OTM' | null = null;
        if (underlying !== null) {
          const atmThreshold = underlying * 0.005; // 0.5% buffer for ATM
          if (Math.abs(underlying - strike) <= atmThreshold) {
            moneyness = 'ATM';
          } else if (optType === 'C') {
            moneyness = underlying > strike ? 'ITM' : 'OTM';
          } else {
            moneyness = underlying < strike ? 'ITM' : 'OTM';
          }
        }

        records.push({
          trade_date: today,
          fetched_at: new Date().toISOString(),
          symbol,
          expiry_code: expiry.code,
          expiry_date: expiry.date,
          days_to_expiry: dte,
          strike,
          option_type: optType,
          last_price: last,
          settle_price: this.parseDecimal(s.priorSettle || (s as any).settle),
          bid: this.parseDecimal(s.bid),
          ask: this.parseDecimal(s.ask),
          bid_size: this.parseDecimal(s.bidSize),
          ask_size: this.parseDecimal(s.askSize),
          volume: this.parseIntVal(s.volume),
          open_interest: this.parseIntVal(s.openInterest),
          oi_change: this.parseIntVal(s.openInterestChange),
          high: this.parseDecimal(s.high),
          low: this.parseDecimal(s.low),
          open: this.parseDecimal(s.open),
          delta: this.parseDecimal(s.delta),
          gamma: this.parseDecimal(s.gamma),
          theta: this.parseDecimal(s.theta),
          vega: this.parseDecimal(s.vega),
          rho: this.parseDecimal(s.rho),
          implied_vol: this.parseDecimal(s.impliedVolatility),
          theoretical_value: this.parseDecimal(s.theoreticalValue),
          underlying_price: underlying,
          intrinsic_value: intrinsic,
          time_value: time_value,
          moneyness,
          is_valid: true,
        });
      }
    }

    return records;
  }
}
