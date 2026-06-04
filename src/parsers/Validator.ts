import { OptionRecord, OptionsResult, Symbol, IntradayBar } from '../types.js';
import { logger } from '../utils/logger.js';

export class Validator {
  /**
   * Validates a batch of OptionRecords and returns an OptionsResult.
   * Implements rules from Spec §12.3:
   * - Strike must be > 0
   * - Volume / OI clamped to >= 0
   * - Bid/Ask: bid >= 0 and bid <= ask
   * - Implied Volatility: 0.0001 <= IV <= 3.0
   * - Delta: Call [0,1], Put [-1,0]
   * - Gamma >= 0, Vega >= 0
   * - Theta: warn if > 0
   */
  public validateOptions(records: OptionRecord[], symbol: Symbol): OptionsResult {
    let validCount = 0;
    let invalidCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const validatedRecords: OptionRecord[] = [];

    for (const record of records) {
      record.is_valid = true;
      record.validation_warnings = [];
      record.validation_errors = [];

      // Skip expired contracts (DTE < 0)
      if (record.days_to_expiry !== null && record.days_to_expiry < 0) {
        skippedCount++;
        continue;
      }

      // Skip invalid strikes
      if (record.strike <= 0 || isNaN(record.strike)) {
        skippedCount++;
        continue;
      }

      // Volume & OI clamp to >= 0
      if (record.volume < 0) record.volume = 0;
      if (record.open_interest < 0) record.open_interest = 0;

      // Bid/Ask logic
      if (record.bid !== null && record.ask !== null) {
        if (record.bid < 0 || record.ask < 0 || record.bid > record.ask) {
          record.is_valid = false;
          record.validation_errors.push('Bid must be >= 0 and <= Ask');
        } else if (record.ask > 0) {
          const spread = record.ask - record.bid;
          const spreadPct = spread / record.ask;
          if (spreadPct > 0.5) {
            record.validation_warnings.push('Bid/Ask spread > 50%');
          }
        }
      }

      // Implied Volatility range check
      if (record.implied_vol !== null) {
        if (record.implied_vol < 0.0001 || record.implied_vol > 3.0) {
          record.is_valid = false;
          record.validation_errors.push(`implied_vol out of range: ${record.implied_vol}`);
        }
      }

      // Delta range check
      if (record.delta !== null) {
        if (record.option_type === 'C' && (record.delta < 0 || record.delta > 1)) {
          record.is_valid = false;
          record.validation_errors.push(`Call delta out of range: ${record.delta}`);
        } else if (record.option_type === 'P' && (record.delta < -1 || record.delta > 0)) {
          record.is_valid = false;
          record.validation_errors.push(`Put delta out of range: ${record.delta}`);
        }
      }

      // Gamma must be >= 0
      if (record.gamma !== null && record.gamma < 0) {
        record.is_valid = false;
        record.validation_errors.push(`Gamma < 0: ${record.gamma}`);
      }

      // Vega must be >= 0
      if (record.vega !== null && record.vega < 0) {
        record.is_valid = false;
        record.validation_errors.push(`Vega < 0: ${record.vega}`);
      }

      // Theta warning if positive
      if (record.theta !== null && record.theta > 0) {
        record.validation_warnings.push(`Theta > 0: ${record.theta}`);
      }

      // Build validation_notes for DB storage
      const allNotes = [
        ...record.validation_errors,
        ...record.validation_warnings.map((w) => `[WARN] ${w}`),
      ];
      record.validation_notes = allNotes.length > 0 ? allNotes.join('; ') : null;

      if (record.is_valid) {
        validCount++;
      } else {
        invalidCount++;
        if (errors.length < 50) {
          errors.push(`Strike ${record.strike} ${record.option_type}: ${record.validation_errors.join(', ')}`);
        }
      }

      validatedRecords.push(record);
    }

    logger.info(`Validation complete for ${symbol}`, {
      total: records.length,
      valid: validCount,
      invalid: invalidCount,
      skipped: skippedCount,
    });

    return {
      records: validatedRecords,
      summary: {
        symbol,
        total: records.length,
        valid: validCount,
        invalid: invalidCount,
        skipped: skippedCount,
        errors,
      },
    };
  }

  /**
   * Validate per-expiry options batch and log a summary per expiry.
   * Phase 3.4 requirement: log summary per expiry.
   */
  public validateOptionsPerExpiry(
    records: OptionRecord[],
    symbol: Symbol,
  ): OptionsResult {
    // Group by expiry
    const byExpiry = new Map<string, OptionRecord[]>();
    for (const r of records) {
      const existing = byExpiry.get(r.expiry_code) || [];
      existing.push(r);
      byExpiry.set(r.expiry_code, existing);
    }

    const allValidated: OptionRecord[] = [];
    let totalValid = 0;
    let totalInvalid = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    for (const [expiryCode, expiryRecords] of byExpiry) {
      const result = this.validateOptions(expiryRecords, symbol);
      allValidated.push(...result.records);
      totalValid += result.summary.valid;
      totalInvalid += result.summary.invalid;
      totalSkipped += result.summary.skipped;
      allErrors.push(...result.summary.errors);

      logger.info(`[Validator] Per-expiry summary for ${symbol} ${expiryCode}`, {
        total: result.summary.total,
        valid: result.summary.valid,
        invalid: result.summary.invalid,
        skipped: result.summary.skipped,
      });
    }

    return {
      records: allValidated,
      summary: {
        symbol,
        total: records.length,
        valid: totalValid,
        invalid: totalInvalid,
        skipped: totalSkipped,
        errors: allErrors.slice(0, 50),
      },
    };
  }

  /**
   * Validate intraday bars per Spec §12.3.
   * Includes the `close ±20% prior bar` spike warning rule.
   */
  public validateIntradayBars(
    bars: IntradayBar[],
    symbol: string,
  ): { valid: IntradayBar[]; warnings: string[] } {
    const warnings: string[] = [];
    const valid: IntradayBar[] = [];

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      let isValid = true;

      // Basic OHLCV sanity
      if (bar.high < bar.low) {
        warnings.push(`[${bar.bar_time}] high (${bar.high}) < low (${bar.low})`);
        isValid = false;
      }

      if (bar.open < bar.low || bar.open > bar.high) {
        warnings.push(`[${bar.bar_time}] open (${bar.open}) outside H/L range`);
      }

      if (bar.close < bar.low || bar.close > bar.high) {
        warnings.push(`[${bar.bar_time}] close (${bar.close}) outside H/L range`);
      }

      if (bar.volume < 0) {
        warnings.push(`[${bar.bar_time}] negative volume: ${bar.volume}`);
        bar.volume = 0;
      }

      // close ±20% prior bar — Spec §12.3 spike warning
      if (i > 0) {
        const priorClose = bars[i - 1].close;
        if (priorClose > 0) {
          const changePct = Math.abs(bar.close - priorClose) / priorClose;
          if (changePct > 0.20) {
            warnings.push(
              `[SPIKE] ${symbol} ${bar.bar_time}: close ${bar.close} deviates ` +
                `${(changePct * 100).toFixed(1)}% from prior bar close ${priorClose}`,
            );
            logger.warn(`Intraday spike warning for ${symbol}`, {
              barTime: bar.bar_time,
              close: bar.close,
              priorClose,
              changePct: `${(changePct * 100).toFixed(1)}%`,
            });
          }
        }
      }

      if (isValid) {
        valid.push(bar);
      }
    }

    if (warnings.length > 0) {
      logger.warn(`Intraday validation: ${warnings.length} warnings for ${symbol}`, {
        sampleWarnings: warnings.slice(0, 5),
      });
    }

    return { valid, warnings };
  }
}
