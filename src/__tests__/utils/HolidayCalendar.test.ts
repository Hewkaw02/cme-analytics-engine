import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HolidayCalendar } from '../../utils/HolidayCalendar.js';

process.env.CME_HOLIDAY_DB_LOOKUP = 'false';

describe('HolidayCalendar', () => {
  it('should identify weekends as holidays', async () => {
    // 2026-05-10 is Sunday
    const sunday = new Date('2026-05-10');
    assert.strictEqual(HolidayCalendar.isWeekend(sunday), true);
    assert.strictEqual(await HolidayCalendar.isHolidayOrWeekend(sunday), true);

    // 2026-05-09 is Saturday
    const saturday = new Date('2026-05-09');
    assert.strictEqual(HolidayCalendar.isWeekend(saturday), true);
    assert.strictEqual(await HolidayCalendar.isHolidayOrWeekend(saturday), true);
  });

  it('should identify weekdays as non-weekends', () => {
    // 2026-05-12 is Tuesday
    const tuesday = new Date('2026-05-12');
    assert.strictEqual(HolidayCalendar.isWeekend(tuesday), false);
  });

  it('should identify known CME holidays', async () => {
    // 2026-01-01 is New Year's Day
    const newYear = new Date('2026-01-01');
    assert.strictEqual(await HolidayCalendar.isHolidayOrWeekend(newYear), true);

    // 2026-12-25 is Christmas
    const christmas = new Date('2026-12-25');
    assert.strictEqual(await HolidayCalendar.isHolidayOrWeekend(christmas), true);
  });

  it('should identify regular business days as non-holidays', async () => {
    // 2026-05-13 is Wednesday (not a holiday)
    const wednesday = new Date('2026-05-13');
    assert.strictEqual(await HolidayCalendar.isHolidayOrWeekend(wednesday), false);
  });
});
