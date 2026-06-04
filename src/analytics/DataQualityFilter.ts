import type { OptionRecord } from '../types.js';

export interface DataQualityReport {
  clean: OptionRecord[];
  rejected: OptionRecord[];
  qualityScore: number; // 0 to 100
  warnings: string[];
}

/**
 * Pre-processes options chain to filter out illiquid, faulty or anomalous data.
 * Returns clean records, rejected records, and a quality score for the data feed.
 */
export function filterOptions(
  options: OptionRecord[],
  maxSpreadPct: number = 0.50 // Reject if spread is > 50% of mid price
): DataQualityReport {
  const clean: OptionRecord[] = [];
  const rejected: OptionRecord[] = [];
  const warnings: string[] = [];

  let zeroBidCount = 0;
  let wideSpreadCount = 0;
  let volumeAnomalyCount = 0;

  for (const opt of options) {
    let rejectReason = '';

    // Check basic numerical fields
    if (opt.strike === null || opt.strike === undefined || opt.strike <= 0) {
      rejectReason = 'Invalid strike price';
    } else if (opt.implied_vol === null || opt.implied_vol === undefined || opt.implied_vol <= 0) {
      rejectReason = 'Missing or zero implied volatility';
    }

    // Bid-Ask Spread checking
    if (!rejectReason && opt.bid !== null && opt.ask !== null) {
      const bid = opt.bid;
      const ask = opt.ask;
      const mid = (bid + ask) / 2;

      if (bid === 0) {
        zeroBidCount++;
        // If bid is 0 but ask is positive and it's OTM, it's illiquid but standard for deep OTM.
        // We can keep it but flag it or warn, or check if it's ATM.
        const isATMOrITM = opt.moneyness === 'ATM' || opt.moneyness === 'ITM';
        if (isATMOrITM) {
          rejectReason = 'Zero bid price for ATM/ITM option';
        }
      } else if (mid > 0) {
        const spreadPct = (ask - bid) / mid;
        if (spreadPct > maxSpreadPct) {
          wideSpreadCount++;
          rejectReason = `Spread too wide: ${(spreadPct * 100).toFixed(1)}% (max ${maxSpreadPct * 100}%)`;
        }
      }
    }

    // Volume vs Open Interest anomaly check
    if (opt.volume > 0 && opt.open_interest > 0) {
      if (opt.volume > 2 * opt.open_interest) {
        volumeAnomalyCount++;
        warnings.push(
          `Volume anomaly for ${opt.expiry_code} ${opt.option_type}${opt.strike}: Volume (${opt.volume}) > 2x OI (${opt.open_interest})`
        );
      }
    }

    if (rejectReason) {
      // Create a shallow copy with validation notes
      const copy = {
        ...opt,
        is_valid: false,
        validation_notes: opt.validation_notes 
          ? `${opt.validation_notes}; ${rejectReason}`
          : rejectReason
      };
      rejected.push(copy);
    } else {
      clean.push(opt);
    }
  }

  // Calculate quality score: percentage of clean records out of total
  const total = options.length;
  const qualityScore = total > 0 ? Math.round((clean.length / total) * 100) : 100;

  if (zeroBidCount > 0) {
    warnings.push(`Found ${zeroBidCount} option(s) with zero bid price.`);
  }
  if (wideSpreadCount > 0) {
    warnings.push(`Rejected ${wideSpreadCount} option(s) due to bid-ask spread exceeding ${(maxSpreadPct * 100).toFixed(0)}%.`);
  }
  if (volumeAnomalyCount > 0) {
    warnings.push(`Detected ${volumeAnomalyCount} option(s) with volume greater than 2x Open Interest.`);
  }

  return {
    clean,
    rejected,
    qualityScore,
    warnings,
  };
}
