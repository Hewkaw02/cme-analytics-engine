import { format } from 'date-fns';
import { db } from '../db/client.js';
import { logger } from './logger.js';

/**
 * Utility to check if a given date is a CME trading holiday.
 * Checks the `cme_holidays` database table with a fallback to a static list.
 */
export class HolidayCalendar {
  // Fallback list of known holidays (YYYY-MM-DD format)
  private static staticHolidays = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
    '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
    '2026-11-26', '2026-12-25',
  ]);

  /**
   * Check if the date is a weekend (Saturday = 6, Sunday = 0)
   */
  public static isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Check if the date is a CME trading holiday (or weekend).
   */
  public static async isHolidayOrWeekend(date: Date): Promise<boolean> {
    if (this.isWeekend(date)) {
      return true;
    }

    const formattedDate = format(date, 'yyyy-MM-dd');

    // 1. Check DB first if available
    try {
      const holiday = await db
        .selectFrom('cme_holidays')
        .select('holiday_name')
        .where('holiday_date', '=', formattedDate)
        .executeTakeFirst();
      
      if (holiday) {
        logger.info(`Date ${formattedDate} identified as holiday via DB: ${holiday.holiday_name}`);
        return true;
      }
    } catch (err) {
      // Ignore DB error and fallback
      logger.debug('HolidayCalendar: DB check failed, using static fallback', { error: String(err) });
    }

    // 2. Fallback to static list
    return this.staticHolidays.has(formattedDate);
  }
}
