import { format } from 'date-fns';
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

  private static isDatabaseLookupEnabled(): boolean {
    const raw = process.env.CME_HOLIDAY_DB_LOOKUP;
    if (raw === undefined) {
      return true;
    }
    return ['1', 'true', 'yes', 'y', 'on'].includes(raw.trim().toLowerCase());
  }

  /**
   * Check if the date is a weekend according to CME session hours (Chicago Time).
   * CME is closed from Friday 17:00 CT to Sunday 17:00 CT.
   */
  public static isWeekend(date: Date): boolean {
    const day = date.getDay();
    const hours = date.getHours();

    if (day === 6) {
      return true; // Saturday
    }
    if (day === 5 && hours >= 17) {
      return true; // Friday after 17:00 CT
    }
    if (day === 0 && hours < 17) {
      return true; // Sunday before 17:00 CT
    }
    return false;
  }

  /**
   * Check if the date is a CME trading holiday (or weekend).
   */
  public static async isHolidayOrWeekend(date: Date): Promise<boolean> {
    if (this.isWeekend(date)) {
      return true;
    }

    const day = date.getDay();
    const hours = date.getHours();

    // Determine which date to check for holiday.
    // If it's Sunday after 17:00 CT, we check if the next day (Monday) is a holiday.
    let checkDate = date;
    if (day === 0 && hours >= 17) {
      const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      checkDate = nextDay;
    }

    const formattedDate = format(checkDate, 'yyyy-MM-dd');

    if (this.staticHolidays.has(formattedDate)) {
      return true;
    }

    if (!this.isDatabaseLookupEnabled()) {
      return false;
    }

    // Check DB for holidays not covered by the static fallback list.
    try {
      const { db } = await import('../db/client.js');
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

    return false;
  }
}
