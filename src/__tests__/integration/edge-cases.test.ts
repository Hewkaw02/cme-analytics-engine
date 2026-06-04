import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OptionsParser } from '../../parsers/OptionsParser.js';
import { HolidayCalendar } from '../../utils/HolidayCalendar.js';
import { Symbol } from '../../types.js';

describe('Edge Case Testing', () => {
  const parser = new OptionsParser();

  it('should handle empty options chain (all zero values) without crash', () => {
    const raw: any = {
      optionContractQuotes: [
        {
          strikePrice: '5000',
          calls: { last: '-', change: '-', volume: '-', openInterest: '-' },
          puts: { last: '-', change: '-', volume: '-', openInterest: '-' }
        }
      ],
      underlyingPrice: '-'
    };

    const expiry = { code: 'TEST', label: 'Test Expiry', date: '2026-12-18' };
    const records = parser.parseOptionsChain(raw, 'ES', expiry);

    assert.equal(records.length, 2); // One Call, one Put
    assert.equal(records[0].strike, 5000);
    assert.equal(records[0].volume, 0);
    assert.equal(records[0].open_interest, 0);
    assert.equal(records[0].last_price, null);
  });

  it('HolidayCalendar should correctly identify weekends and holidays', async () => {
    // Weekend: Saturday 2026-05-09
    const sat = new Date('2026-05-09T10:00:00');
    assert.equal(HolidayCalendar.isWeekend(sat), true);
    assert.equal(await HolidayCalendar.isHolidayOrWeekend(sat), true);

    // Holiday: Memorial Day 2026-05-25
    const memorialDay = new Date('2026-05-25T10:00:00');
    assert.equal(await HolidayCalendar.isHolidayOrWeekend(memorialDay), true);

    // Regular day: Tuesday 2026-05-12
    const regularDay = new Date('2026-05-12T10:00:00');
    assert.equal(await HolidayCalendar.isHolidayOrWeekend(regularDay), false);
  });

  it('should parse complex strike prices (e.g. fractional or large)', () => {
    const raw: any = {
      optionContractQuotes: [
        {
          strikePrice: '5,125.50',
          calls: { last: '1.25', volume: '10', openInterest: '100' },
          puts: null
        }
      ],
      underlyingPrice: '5,000.00'
    };
    const expiry = { code: 'TEST', label: 'Test Expiry', date: '2026-12-18' };
    const records = parser.parseOptionsChain(raw, 'ES', expiry);

    assert.equal(records[0].strike, 5125.5);
    assert.equal(records[0].underlying_price, 5000);
  });
});
