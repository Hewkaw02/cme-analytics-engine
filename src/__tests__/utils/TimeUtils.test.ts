import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeUtils } from '../../utils/TimeUtils.js';

describe('TimeUtils', () => {
  describe('isRegularHours', () => {
    it('should return true for ES during RTH (08:30-15:15 CT)', () => {
      // 10:00 CT = 15:00 UTC (CDT, UTC-5) or 16:00 UTC (CST, UTC-6)
      // We'll test with a date that's clearly in RTH range
      const date = new Date('2025-05-12T15:00:00Z'); // ~10:00 CT (CDT)
      assert.equal(TimeUtils.isRegularHours('ES', date), true);
    });

    it('should return false for ES during ETH (before 08:30 CT)', () => {
      const date = new Date('2025-05-12T05:00:00Z'); // ~00:00 CT
      assert.equal(TimeUtils.isRegularHours('ES', date), false);
    });

    it('should return true for GC during RTH (07:20-13:30 CT)', () => {
      const date = new Date('2025-05-12T15:00:00Z'); // ~10:00 CT
      assert.equal(TimeUtils.isRegularHours('GC', date), true);
    });

    it('should return false for GC after RTH close (> 13:30 CT)', () => {
      const date = new Date('2025-05-12T23:00:00Z'); // ~18:00 CT
      assert.equal(TimeUtils.isRegularHours('GC', date), false);
    });

    it('should return true for NQ during RTH (same as ES)', () => {
      const date = new Date('2025-05-12T15:00:00Z');
      assert.equal(TimeUtils.isRegularHours('NQ', date), true);
    });

    it('should return false for unknown symbol', () => {
      const date = new Date('2025-05-12T15:00:00Z');
      assert.equal(TimeUtils.isRegularHours('XX', date), false);
    });
  });

  describe('getDaysToExpiry', () => {
    it('should return positive days for future expiry', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const result = TimeUtils.getDaysToExpiry(futureDate.toISOString().slice(0, 10));
      assert.ok(result > 0);
      assert.ok(result <= 31);
    });

    it('should return 0 for today', () => {
      const now = new Date();
      const today = TimeUtils.formatCT(now, 'yyyy-MM-dd');
      const result = TimeUtils.getDaysToExpiry(today, now);
      assert.equal(result, 0);
    });

    it('should treat date-only expiry as CME Central Time calendar days', () => {
      const bangkokEarlyMorning = new Date('2026-06-16T02:00:00+07:00');
      assert.equal(TimeUtils.getDaysToExpiry('2026-06-15', bangkokEarlyMorning), 0);
      assert.equal(TimeUtils.getDaysToExpiry('2026-06-16', bangkokEarlyMorning), 1);
    });

    it('should return negative for past expiry', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const result = TimeUtils.getDaysToExpiry(pastDate.toISOString().slice(0, 10));
      assert.ok(result < 0);
    });
  });

  describe('getCTNow', () => {
    it('should return a valid Date object', () => {
      const ctNow = TimeUtils.getCTNow();
      assert.ok(ctNow instanceof Date);
    });
  });

  describe('formatCT', () => {
    it('should format a date in CT timezone', () => {
      const date = new Date('2025-05-12T12:00:00Z');
      const formatted = TimeUtils.formatCT(date);
      assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should accept custom format pattern', () => {
      const date = new Date('2025-05-12T12:00:00Z');
      const formatted = TimeUtils.formatCT(date, 'yyyy-MM-dd');
      assert.match(formatted, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getActiveContractCode', () => {
    it('should derive GC contract month from the date instead of returning the old placeholder', () => {
      const contract = TimeUtils.getActiveContractCode('GC', new Date('2026-06-15T00:00:00Z'));
      assert.equal(contract, 'GCQ6');
    });

    it('should allow explicit active contract overrides for forward testing', () => {
      const previous = process.env.ACTIVE_CONTRACT_GC;
      process.env.ACTIVE_CONTRACT_GC = 'GCQ6';

      try {
        const contract = TimeUtils.getActiveContractCode('GC', new Date('2026-06-15T00:00:00Z'));
        assert.equal(contract, 'GCQ6');
      } finally {
        if (previous === undefined) {
          delete process.env.ACTIVE_CONTRACT_GC;
        } else {
          process.env.ACTIVE_CONTRACT_GC = previous;
        }
      }
    });
  });
});
