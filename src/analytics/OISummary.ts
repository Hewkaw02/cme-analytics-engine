import { Pool } from 'pg';
import { OptionRecord, OISummaryRecord } from '../types.js';
import { calculateMaxPain } from './MaxPain.js';
import { calculateGEX } from './GEX.js';
import { calculateIVRankFromHistory } from './IVRank.js';
import { logger } from '../utils/logger.js';

/**
 * Computes options and Open Interest (OI) summary records for each expiry of a symbol.
 */
export async function computeOISummary(
  pool: Pool,
  optionsData: OptionRecord[],
  symbol: string,
  tradeDate: string,
): Promise<OISummaryRecord[]> {
  if (!optionsData || optionsData.length === 0) {
    logger.warn(`No options data provided to computeOISummary for ${symbol} on ${tradeDate}`);
    return [];
  }

  // Group options by expiry_code
  const expiryGroups = new Map<string, OptionRecord[]>();
  for (const opt of optionsData) {
    const code = opt.expiry_code;
    if (!expiryGroups.has(code)) {
      expiryGroups.set(code, []);
    }
    expiryGroups.get(code)!.push(opt);
  }

  const summaries: OISummaryRecord[] = [];

  for (const [expiryCode, groupOpts] of expiryGroups.entries()) {
    try {
      // 1. Gather basic metadata
      const firstOpt = groupOpts[0];
      const expiryDate = firstOpt.expiry_date || null;
      const daysToExpiry = firstOpt.days_to_expiry !== undefined ? firstOpt.days_to_expiry : null;
      const underlyingPrice = firstOpt.underlying_price !== undefined && firstOpt.underlying_price !== null ? Number(firstOpt.underlying_price) : null;

      // 2. Aggregate Call/Put OI and volumes
      let totalCallOi = 0;
      let totalPutOi = 0;
      let totalCallVolume = 0;
      let totalPutVolume = 0;

      // Track max strike/values for Call Wall & Put Wall
      let maxCallOiStrike: number | null = null;
      let maxCallOiValue = -1;
      let maxPutOiStrike: number | null = null;
      let maxPutOiValue = -1;

      for (const opt of groupOpts) {
        const oi = Number(opt.open_interest || 0);
        const vol = Number(opt.volume || 0);
        const strikeVal = Number(opt.strike);

        if (opt.option_type === 'C') {
          totalCallOi += oi;
          totalCallVolume += vol;
          if (oi > maxCallOiValue) {
            maxCallOiValue = oi;
            maxCallOiStrike = strikeVal;
          }
        } else if (opt.option_type === 'P') {
          totalPutOi += oi;
          totalPutVolume += vol;
          if (oi > maxPutOiValue) {
            maxPutOiValue = oi;
            maxPutOiStrike = strikeVal;
          }
        }
      }

      // If max OI values were never updated from default -1, set to null
      const finalMaxCallOiValue = maxCallOiValue >= 0 ? maxCallOiValue : null;
      const finalMaxPutOiValue = maxPutOiValue >= 0 ? maxPutOiValue : null;

      // Ratios
      const putCallOiRatio = totalCallOi > 0 ? totalPutOi / totalCallOi : null;
      const putCallVolRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null;

      // 3. Compute Max Pain
      const maxPainRes = calculateMaxPain(groupOpts);
      const maxPainStrike = maxPainRes.maxPainStrike > 0 ? maxPainRes.maxPainStrike : null;

      // 4. Compute GEX
      let netGammaExposure: number | null = null;
      let gexFlipLevel: number | null = null;
      try {
        const gexRes = calculateGEX(groupOpts, symbol);
        netGammaExposure = gexRes.netGEX;
        gexFlipLevel = gexRes.flipLevel > 0 ? gexRes.flipLevel : null;
      } catch (err) {
        logger.warn(`GEX calculation failed for ${symbol} ${expiryCode}`, { error: err instanceof Error ? err.message : String(err) });
      }

      // 5. ATM IV calculations
      let atmIvCall: number | null = null;
      let atmIvPut: number | null = null;
      let atmIvSkew: number | null = null;

      if (underlyingPrice !== null && groupOpts.length > 0) {
        // Find the strike closest to the underlying price
        let closestStrike = Number(groupOpts[0].strike);
        let minDiff = Math.abs(closestStrike - underlyingPrice);

        for (const opt of groupOpts) {
          const strikeVal = Number(opt.strike);
          const diff = Math.abs(strikeVal - underlyingPrice);
          if (diff < minDiff) {
            minDiff = diff;
            closestStrike = strikeVal;
          }
        }

        // Get ATM options at this closest strike
        const atmCall = groupOpts.find((o) => Number(o.strike) === closestStrike && o.option_type === 'C');
        const atmPut = groupOpts.find((o) => Number(o.strike) === closestStrike && o.option_type === 'P');

        atmIvCall = atmCall?.implied_vol !== undefined && atmCall.implied_vol !== null ? Number(atmCall.implied_vol) : null;
        atmIvPut = atmPut?.implied_vol !== undefined && atmPut.implied_vol !== null ? Number(atmPut.implied_vol) : null;

        if (atmIvCall !== null && atmIvPut !== null) {
          atmIvSkew = atmIvCall - atmIvPut;
        }
      }

      // 6. IV Rank & IV Percentile (from historical DB records)
      let ivRank: number | null = null;
      let ivPercentile: number | null = null;

      if (atmIvCall !== null) {
        try {
          const historyRes = await pool.query(
            `
            SELECT atm_iv_call
            FROM oi_expiry_summary
            WHERE symbol = $1
              AND expiry_code = $2
              AND trade_date >= $3::date - INTERVAL '365 days'
            ORDER BY trade_date
            `,
            [symbol, expiryCode, tradeDate]
          );

          const history = historyRes.rows.map((r) => Number(r.atm_iv_call)).filter((val) => !isNaN(val) && val > 0);
          
          // Add the current day's ATM IV if not already in the history list
          history.push(atmIvCall);

          const ivRankRes = calculateIVRankFromHistory(atmIvCall, history);
          ivRank = ivRankRes.ivRank;
          ivPercentile = ivRankRes.ivPercentile;
        } catch (err) {
          logger.warn(`Failed to fetch IV history for rank calculations on ${symbol} ${expiryCode}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      summaries.push({
        trade_date: tradeDate,
        symbol,
        expiry_code: expiryCode,
        expiry_date: expiryDate,
        days_to_expiry: daysToExpiry,
        underlying_price: underlyingPrice,
        total_call_oi: totalCallOi,
        total_put_oi: totalPutOi,
        total_call_volume: totalCallVolume,
        total_put_volume: totalPutVolume,
        put_call_oi_ratio: putCallOiRatio,
        put_call_vol_ratio: putCallVolRatio,
        max_call_oi_strike: maxCallOiStrike,
        max_put_oi_strike: maxPutOiStrike,
        max_pain_strike: maxPainStrike,
        max_call_oi_value: finalMaxCallOiValue,
        max_put_oi_value: finalMaxPutOiValue,
        net_gamma_exposure: netGammaExposure,
        gex_flip_level: gexFlipLevel,
        atm_iv_call: atmIvCall,
        atm_iv_put: atmIvPut,
        atm_iv_skew: atmIvSkew,
        iv_rank: ivRank,
        iv_percentile: ivPercentile,
      });
    } catch (err) {
      logger.error(`Error computing summary for expiry ${expiryCode}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summaries;
}

/**
 * Upserts computed OISummaryRecord objects into the oi_expiry_summary database table.
 */
export async function upsertOISummaries(pool: Pool, summaries: OISummaryRecord[]): Promise<void> {
  if (!summaries || summaries.length === 0) return;

  const queryText = `
    INSERT INTO oi_expiry_summary (
      trade_date, symbol, expiry_code, expiry_date, days_to_expiry, underlying_price,
      total_call_oi, total_put_oi, total_call_volume, total_put_volume,
      put_call_oi_ratio, put_call_vol_ratio, max_call_oi_strike, max_put_oi_strike, max_pain_strike,
      max_call_oi_value, max_put_oi_value, net_gamma_exposure, gex_flip_level,
      atm_iv_call, atm_iv_put, atm_iv_skew, iv_rank, iv_percentile
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
    )
    ON CONFLICT (trade_date, symbol, expiry_code)
    DO UPDATE SET
      expiry_date = EXCLUDED.expiry_date,
      days_to_expiry = EXCLUDED.days_to_expiry,
      underlying_price = EXCLUDED.underlying_price,
      total_call_oi = EXCLUDED.total_call_oi,
      total_put_oi = EXCLUDED.total_put_oi,
      total_call_volume = EXCLUDED.total_call_volume,
      total_put_volume = EXCLUDED.total_put_volume,
      put_call_oi_ratio = EXCLUDED.put_call_oi_ratio,
      put_call_vol_ratio = EXCLUDED.put_call_vol_ratio,
      max_call_oi_strike = EXCLUDED.max_call_oi_strike,
      max_put_oi_strike = EXCLUDED.max_put_oi_strike,
      max_pain_strike = EXCLUDED.max_pain_strike,
      max_call_oi_value = EXCLUDED.max_call_oi_value,
      max_put_oi_value = EXCLUDED.max_put_oi_value,
      net_gamma_exposure = EXCLUDED.net_gamma_exposure,
      gex_flip_level = EXCLUDED.gex_flip_level,
      atm_iv_call = EXCLUDED.atm_iv_call,
      atm_iv_put = EXCLUDED.atm_iv_put,
      atm_iv_skew = EXCLUDED.atm_iv_skew,
      iv_rank = EXCLUDED.iv_rank,
      iv_percentile = EXCLUDED.iv_percentile,
      computed_at = NOW()
  `;

  for (const s of summaries) {
    try {
      await pool.query(queryText, [
        s.trade_date,
        s.symbol,
        s.expiry_code,
        s.expiry_date,
        s.days_to_expiry,
        s.underlying_price,
        s.total_call_oi,
        s.total_put_oi,
        s.total_call_volume,
        s.total_put_volume,
        s.put_call_oi_ratio,
        s.put_call_vol_ratio,
        s.max_call_oi_strike,
        s.max_put_oi_strike,
        s.max_pain_strike,
        s.max_call_oi_value,
        s.max_put_oi_value,
        s.net_gamma_exposure,
        s.gex_flip_level,
        s.atm_iv_call,
        s.atm_iv_put,
        s.atm_iv_skew,
        s.iv_rank,
        s.iv_percentile,
      ]);
    } catch (err) {
      logger.error(`Failed to upsert OI summary for ${s.symbol} ${s.expiry_code} on ${s.trade_date}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`OISummary: Successfully upserted ${summaries.length} summaries`);
}
