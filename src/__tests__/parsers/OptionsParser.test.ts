import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OptionsParser, CmeOptionsRaw } from '../../parsers/OptionsParser.js';

describe('OptionsParser', () => {
  const parser = new OptionsParser();

  function makeMockRaw(overrides?: Partial<CmeOptionsRaw>): CmeOptionsRaw {
    return {
      expirationDate: '2025-06-20',
      underlyingPrice: '5500.00',
      optionContractQuotes: [
        {
          strikePrice: '5400',
          calls: {
            last: '120.50', settle: '121.00', bid: '119.00', ask: '122.00',
            bidSize: '10', askSize: '15', volume: '500', openInterest: '3000',
            openInterestChange: '150', high: '125.00', low: '118.00', open: '119.50',
            delta: '0.65', gamma: '0.002', theta: '-0.50', vega: '12.5',
            rho: '0.03', impliedVolatility: '0.1800', theoreticalValue: '121.25',
          },
          puts: {
            last: '20.50', settle: '21.00', bid: '19.00', ask: '22.00',
            bidSize: '8', askSize: '12', volume: '300', openInterest: '2000',
            openInterestChange: '-50', high: '23.00', low: '18.00', open: '19.50',
            delta: '-0.35', gamma: '0.002', theta: '-0.45', vega: '12.5',
            rho: '-0.02', impliedVolatility: '0.1900', theoreticalValue: '21.25',
          },
        },
        {
          strikePrice: '5500',
          calls: {
            last: '55.00', settle: '56.00', bid: '53.00', ask: '57.00',
            bidSize: '20', askSize: '25', volume: '1200', openInterest: '8000',
            openInterestChange: '500', high: '60.00', low: '50.00', open: '54.00',
            delta: '0.50', gamma: '0.004', theta: '-0.80', vega: '15.0',
            rho: '0.02', impliedVolatility: '0.1700', theoreticalValue: '55.50',
          },
          puts: {
            last: '55.00', settle: '56.00', bid: '53.00', ask: '57.00',
            bidSize: '18', askSize: '22', volume: '1100', openInterest: '7500',
            openInterestChange: '400', high: '59.00', low: '51.00', open: '54.00',
            delta: '-0.50', gamma: '0.004', theta: '-0.80', vega: '15.0',
            rho: '-0.02', impliedVolatility: '0.1750', theoreticalValue: '55.50',
          },
        },
      ],
      ...overrides,
    };
  }

  const mockExpiry = { code: 'ESM25', date: '2025-06-20', label: 'Jun 2025' };

  it('should parse all strikes and both sides (Call + Put)', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    // 2 strikes × 2 sides = 4 records
    assert.equal(records.length, 4);
  });

  it('should correctly assign symbol and expiry fields', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    for (const r of records) {
      assert.equal(r.symbol, 'ES');
      assert.equal(r.expiry_code, 'ESM25');
      assert.equal(r.expiry_date, '2025-06-20');
    }
  });

  it('should correctly parse numeric fields from strings', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    const call5400 = records.find(r => r.strike === 5400 && r.option_type === 'C')!;
    assert.equal(call5400.last_price, 120.50);
    assert.equal(call5400.settle_price, 121.00);
    assert.equal(call5400.bid, 119.00);
    assert.equal(call5400.ask, 122.00);
    assert.equal(call5400.volume, 500);
    assert.equal(call5400.open_interest, 3000);
    assert.equal(call5400.oi_change, 150);
    assert.equal(call5400.delta, 0.65);
    assert.equal(call5400.gamma, 0.002);
    assert.equal(call5400.theta, -0.50);
    assert.equal(call5400.vega, 12.5);
    assert.equal(call5400.implied_vol, 0.18);
  });

  it('should calculate intrinsic_value correctly for calls', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    const call5400 = records.find(r => r.strike === 5400 && r.option_type === 'C')!;
    // ITM call: underlying 5500 - strike 5400 = 100
    assert.equal(call5400.intrinsic_value, 100);
  });

  it('should calculate intrinsic_value correctly for puts', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    const put5400 = records.find(r => r.strike === 5400 && r.option_type === 'P')!;
    // OTM put: strike 5400 - underlying 5500 = -100, clamp to 0
    assert.equal(put5400.intrinsic_value, 0);
  });

  it('should calculate time_value as last - intrinsic', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    const call5400 = records.find(r => r.strike === 5400 && r.option_type === 'C')!;
    // time_value = 120.50 - 100 = 20.50
    assert.equal(call5400.time_value, 20.50);
  });

  it('should classify moneyness correctly (ITM/ATM/OTM)', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    // Strike 5400, underlying 5500 → Call ITM, Put OTM
    const call5400 = records.find(r => r.strike === 5400 && r.option_type === 'C')!;
    assert.equal(call5400.moneyness, 'ITM');

    const put5400 = records.find(r => r.strike === 5400 && r.option_type === 'P')!;
    assert.equal(put5400.moneyness, 'OTM');

    // Strike 5500, underlying 5500 → ATM (within 0.5% buffer)
    const call5500 = records.find(r => r.strike === 5500 && r.option_type === 'C')!;
    assert.equal(call5500.moneyness, 'ATM');
  });

  it('should skip strikes with invalid (zero or NaN) strike price', () => {
    const raw = makeMockRaw();
    raw.optionContractQuotes.push({
      strikePrice: '0',
      calls: raw.optionContractQuotes[0].calls,
      puts: raw.optionContractQuotes[0].puts,
    });
    raw.optionContractQuotes.push({
      strikePrice: 'abc',
      calls: raw.optionContractQuotes[0].calls,
      puts: raw.optionContractQuotes[0].puts,
    });

    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);
    // Only 2 valid strikes × 2 sides = 4
    assert.equal(records.length, 4);
  });

  it('should handle UNCH and dash values as null', () => {
    const raw = makeMockRaw();
    raw.optionContractQuotes[0].calls.last = 'UNCH';
    raw.optionContractQuotes[0].calls.bid = '-';

    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);
    const call5400 = records.find(r => r.strike === 5400 && r.option_type === 'C')!;
    assert.equal(call5400.last_price, null);
    assert.equal(call5400.bid, null);
  });

  it('should handle missing underlying price', () => {
    const raw = makeMockRaw({ underlyingPrice: '' });
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    for (const r of records) {
      assert.equal(r.underlying_price, null);
      assert.equal(r.intrinsic_value, null);
      assert.equal(r.time_value, null);
      assert.equal(r.moneyness, null);
    }
  });

  it('should handle empty optionContractQuotes', () => {
    const raw = makeMockRaw({ optionContractQuotes: [] });
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);
    assert.equal(records.length, 0);
  });

  it('should populate fetched_at and trade_date', () => {
    const raw = makeMockRaw();
    const records = parser.parseOptionsChain(raw, 'ES', mockExpiry);

    for (const r of records) {
      assert.ok(r.fetched_at, 'fetched_at should be populated');
      assert.ok(r.trade_date, 'trade_date should be populated');
      assert.match(r.trade_date, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
