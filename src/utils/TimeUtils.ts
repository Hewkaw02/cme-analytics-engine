import { differenceInCalendarDays } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const CT_TIMEZONE = 'America/Chicago';

export class TimeUtils {
  private static getActiveContractOverride(symbol: string): string | undefined {
    const override = process.env[`ACTIVE_CONTRACT_${symbol}`] || process.env[`${symbol}_ACTIVE_CONTRACT`];
    const normalized = override?.trim();
    return normalized || undefined;
  }

  private static parseCMECalendarDate(value: string): Date {
    const trimmed = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid CME calendar date: ${value}`);
    }

    return this.parseCMECalendarDate(formatInTimeZone(parsed, CT_TIMEZONE, 'yyyy-MM-dd'));
  }

  static getCTNow(): Date {
    return toZonedTime(new Date(), CT_TIMEZONE);
  }

  static formatCT(date: Date, pattern = 'yyyy-MM-dd HH:mm:ss'): string {
    return formatInTimeZone(date, CT_TIMEZONE, pattern);
  }

  static isRegularHours(symbol: string, date: Date): boolean {
    const ctDate = toZonedTime(date, CT_TIMEZONE);
    const hours = ctDate.getHours();
    const minutes = ctDate.getMinutes();
    const timeNum = hours * 100 + minutes;

    // ES/NQ RTH: 08:30–15:15 CT
    if (symbol === 'ES' || symbol === 'NQ') {
      return timeNum >= 830 && timeNum <= 1515;
    }

    // GC RTH: 07:20–13:30 CT
    if (symbol === 'GC') {
      return timeNum >= 720 && timeNum <= 1330;
    }

    return false;
  }

  static getDaysToExpiry(expiryDate: string, now: Date = new Date()): number {
    const today = this.parseCMECalendarDate(formatInTimeZone(now, CT_TIMEZONE, 'yyyy-MM-dd'));
    const expiry = this.parseCMECalendarDate(expiryDate);
    return differenceInCalendarDays(expiry, today);
  }

  /**
   * Get the 3rd Friday of a given month/year.
   */
  static getThirdFriday(year: number, month: number): Date {
    const date = new Date(year, month, 1);
    let count = 0;
    while (count < 3) {
      if (date.getDay() === 5) count++;
      if (count < 3) date.setDate(date.getDate() + 1);
    }
    return date;
  }

  /**
   * Determine the active contract code (e.g. ESH5) based on current date.
   * For ES/NQ: H (Mar), M (Jun), U (Sep), Z (Dec).
   * Rollover: Monday prior to 3rd Friday of expiry month.
   */
  static getActiveContractCode(symbol: string, date: Date = new Date()): string {
    const override = this.getActiveContractOverride(symbol);
    if (override) return override;

    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    if (symbol === 'ES' || symbol === 'NQ') {
      const quarters = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-indexed)
      const codes = ['H', 'M', 'U', 'Z'];

      for (let i = 0; i < quarters.length; i++) {
        const qMonth = quarters[i];
        const thirdFriday = this.getThirdFriday(year, qMonth);
        const rollDate = new Date(thirdFriday);
        rollDate.setDate(thirdFriday.getDate() - 4); // Monday prior to Friday

        if (date < rollDate || (month === qMonth && date < rollDate)) {
          const yearSuffix = (year % 100).toString().padStart(2, '0');
          // Wait, CME uses ESH26 for 2026? Actually often just ESH6 or ESH26. 
          // Spec says ESZ4 (for 2024). So ES + Code + YearLastDigit.
          return `${symbol}${codes[i]}${year % 10}`;
        }
        
        // If we are past the roll date of the last quarter, we are in the first quarter of next year
        if (i === 3 && date >= rollDate) {
           return `${symbol}H${(year + 1) % 10}`;
        }
      }
      
      // Default to next nearest quarter if not caught in loop
      const nextQIndex = quarters.findIndex(q => month <= q);
      const targetQ = nextQIndex === -1 ? 0 : nextQIndex;
      const targetYear = nextQIndex === -1 ? year + 1 : year;
      return `${symbol}${codes[targetQ]}${targetYear % 10}`;
    }

    if (symbol === 'GC') {
      const contractMonths = [1, 3, 5, 7, 9, 11]; // Feb, Apr, Jun, Aug, Oct, Dec
      const codes = ['G', 'J', 'M', 'Q', 'V', 'Z'];
      const nextIndex = contractMonths.findIndex((contractMonth) => month <= contractMonth);
      const targetIndex = nextIndex === -1 ? 0 : nextIndex;
      const targetYear = nextIndex === -1 ? year + 1 : year;
      return `${symbol}${codes[targetIndex]}${targetYear % 10}`;
    }

    return 'G';
  }
}
