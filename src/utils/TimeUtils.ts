import { format, addDays, differenceInDays } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const CT_TIMEZONE = 'America/Chicago';

export class TimeUtils {
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

  static getDaysToExpiry(expiryDate: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return differenceInDays(expiry, today);
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
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const day = date.getDate();

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
      // GC has different rollover, usually every even month or specific liquidity.
      // Simplification: use 'G' if unknown
      return 'GCG6'; // Feb 2026 placeholder
    }

    return 'G';
  }
}
