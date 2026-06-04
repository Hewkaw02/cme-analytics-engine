import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';
import { logger } from '../utils/logger.js';

export class Indicators {
  static async computeIntradayIndicators(
    db: Kysely<Database>,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    try {
      // 1. Fetch recent bars ordered descending to capture the LATEST 2000 bars
      // Fetch up to 2000 bars to ensure plenty of warm-up for rolling indicators
      const bars = await db
        .selectFrom('intraday_bars')
        .select([
          'bar_time', 'open', 'high', 'low', 'close', 'volume', 'session', 'is_rth', 'delta_volume'
        ] as const)
        .where('symbol', '=', symbol)
        .where('timeframe', '=', timeframe)
        .orderBy('bar_time', 'desc')
        .limit(2000)
        .execute();

      if (bars.length === 0) {
        logger.warn(`Indicators: No bars found for ${symbol} ${timeframe} to compute indicators.`);
        return;
      }

      // Reverse to chronological order (ascending time)
      bars.reverse();

      logger.info(`Indicators: Computing metrics for ${bars.length} bars of ${symbol} (${timeframe})`);

      const N = bars.length;
      
      // Arrays for computed values
      const vwaps: (number | null)[] = new Array(N).fill(null);
      const vwapSessions: (number | null)[] = new Array(N).fill(null);
      const ema9s: (number | null)[] = new Array(N).fill(null);
      const ema21s: (number | null)[] = new Array(N).fill(null);
      const atr14s: (number | null)[] = new Array(N).fill(null);
      const rsi14s: (number | null)[] = new Array(N).fill(null);
      const bbUppers: (number | null)[] = new Array(N).fill(null);
      const bbLowers: (number | null)[] = new Array(N).fill(null);

      // CVD and VWAP SD bands (Pillar 2)
      const cvds: (number | null)[] = new Array(N).fill(null);
      const vwapSd1Uppers: (number | null)[] = new Array(N).fill(null);
      const vwapSd1Lowers: (number | null)[] = new Array(N).fill(null);
      const vwapSd2Uppers: (number | null)[] = new Array(N).fill(null);
      const vwapSd2Lowers: (number | null)[] = new Array(N).fill(null);

      // --- 1. Compute VWAP (Daily), Session VWAP, VWAP Bands & CVD ---
      let cumVolDaily = 0;
      let cumTypVolDaily = 0;
      let lastDateStr = '';

      let cumVolSession = 0;
      let cumTypVolSession = 0;
      let cumTypSqVolSession = 0;
      let cumCvdSession = 0;
      let lastSession = '';

      for (let i = 0; i < N; i++) {
        const bar = bars[i];
        const barTime = new Date(bar.bar_time);
        const dateStr = barTime.toISOString().split('T')[0];
        
        const open = Number(bar.open);
        const high = Number(bar.high);
        const low = Number(bar.low);
        const close = Number(bar.close);
        const vol = Number(bar.volume);
        const delta = Number(bar.delta_volume || 0);
        
        const tp = (high + low + close) / 3;

        // Daily reset check
        if (dateStr !== lastDateStr) {
          cumVolDaily = 0;
          cumTypVolDaily = 0;
          lastDateStr = dateStr;
        }

        // Session reset check (RTH vs ETH)
        const session = bar.session || '';
        if (session !== lastSession) {
          cumVolSession = 0;
          cumTypVolSession = 0;
          cumTypSqVolSession = 0;
          cumCvdSession = 0;
          lastSession = session;
        }

        cumVolDaily += vol;
        cumTypVolDaily += tp * vol;
        vwaps[i] = cumVolDaily > 0 ? cumTypVolDaily / cumVolDaily : null;

        cumVolSession += vol;
        cumTypVolSession += tp * vol;
        cumTypSqVolSession += tp * tp * vol;
        cumCvdSession += delta;

        const currentVwap = cumVolSession > 0 ? cumTypVolSession / cumVolSession : null;
        vwapSessions[i] = currentVwap;
        cvds[i] = cumCvdSession;

        if (currentVwap !== null && cumVolSession > 0) {
          const variance = Math.max(0, (cumTypSqVolSession / cumVolSession) - (currentVwap * currentVwap));
          const stdDev = Math.sqrt(variance);

          vwapSd1Uppers[i] = currentVwap + stdDev;
          vwapSd1Lowers[i] = currentVwap - stdDev;
          vwapSd2Uppers[i] = currentVwap + 2 * stdDev;
          vwapSd2Lowers[i] = currentVwap - 2 * stdDev;
        }
      }

      // --- 2. Compute EMA 9 and EMA 21 ---
      const k9 = 2 / (9 + 1);
      const k21 = 2 / (21 + 1);

      let prevEma9 = Number(bars[0].close);
      let prevEma21 = Number(bars[0].close);
      
      ema9s[0] = prevEma9;
      ema21s[0] = prevEma21;

      for (let i = 1; i < N; i++) {
        const close = Number(bars[i].close);
        
        const ema9 = close * k9 + prevEma9 * (1 - k9);
        ema9s[i] = ema9;
        prevEma9 = ema9;

        const ema21 = close * k21 + prevEma21 * (1 - k21);
        ema21s[i] = ema21;
        prevEma21 = ema21;
      }

      // --- 3. Compute Bollinger Bands (20, 2) ---
      for (let i = 19; i < N; i++) {
        let sum = 0;
        for (let j = i - 19; j <= i; j++) {
          sum += Number(bars[j].close);
        }
        const sma = sum / 20;

        let sumSqDiff = 0;
        for (let j = i - 19; j <= i; j++) {
          sumSqDiff += Math.pow(Number(bars[j].close) - sma, 2);
        }
        const variance = sumSqDiff / 20;
        const stdDev = Math.sqrt(variance);

        bbUppers[i] = sma + 2 * stdDev;
        bbLowers[i] = sma - 2 * stdDev;
      }

      // --- 4. Compute Wilder's ATR 14 ---
      const trs = new Array(N);
      trs[0] = Number(bars[0].high) - Number(bars[0].low);
      for (let i = 1; i < N; i++) {
        const h = Number(bars[i].high);
        const l = Number(bars[i].low);
        const prevC = Number(bars[i - 1].close);
        trs[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      }

      let sumTr14 = 0;
      for (let i = 0; i < 14; i++) {
        sumTr14 += trs[i];
      }
      let prevAtr = sumTr14 / 14;
      atr14s[13] = prevAtr;

      for (let i = 14; i < N; i++) {
        const atr = (prevAtr * 13 + trs[i]) / 14;
        atr14s[i] = atr;
        prevAtr = atr;
      }

      // --- 5. Compute Wilder's RSI 14 ---
      const gains = new Array(N).fill(0);
      const losses = new Array(N).fill(0);

      for (let i = 1; i < N; i++) {
        const change = Number(bars[i].close) - Number(bars[i - 1].close);
        if (change > 0) {
          gains[i] = change;
        } else {
          losses[i] = -change;
        }
      }

      let sumGain14 = 0;
      let sumLoss14 = 0;
      for (let i = 1; i <= 14; i++) {
        sumGain14 += gains[i];
        sumLoss14 += losses[i];
      }

      let prevAvgGain = sumGain14 / 14;
      let prevAvgLoss = sumLoss14 / 14;

      const rs0 = prevAvgLoss > 0 ? prevAvgGain / prevAvgLoss : 999999;
      rsi14s[14] = 100 - 100 / (1 + rs0);

      for (let i = 15; i < N; i++) {
        const avgGain = (prevAvgGain * 13 + gains[i]) / 14;
        const avgLoss = (prevAvgLoss * 13 + losses[i]) / 14;
        
        const rs = avgLoss > 0 ? avgGain / avgLoss : 999999;
        rsi14s[i] = 100 - 100 / (1 + rs);
        
        prevAvgGain = avgGain;
        prevAvgLoss = avgLoss;
      }

      // --- 6. Batch Update database using optimized UNNEST query ---
      const barTimes = bars.map(b => new Date(b.bar_time).toISOString());
      const symbols = new Array(N).fill(symbol);
      const timeframes = new Array(N).fill(timeframe);

      await sql`
        UPDATE intraday_bars AS ib SET
          vwap = u.vwap::numeric,
          vwap_session = u.vwap_session::numeric,
          ema_9 = u.ema_9::numeric,
          ema_21 = u.ema_21::numeric,
          atr_14 = u.atr_14::numeric,
          rsi_14 = u.rsi_14::numeric,
          bb_upper = u.bb_upper::numeric,
          bb_lower = u.bb_lower::numeric,
          cvd = u.cvd::numeric,
          vwap_sd1_upper = u.vwap_sd1_upper::numeric,
          vwap_sd1_lower = u.vwap_sd1_lower::numeric,
          vwap_sd2_upper = u.vwap_sd2_upper::numeric,
          vwap_sd2_lower = u.vwap_sd2_lower::numeric
        FROM (
          SELECT
            UNNEST(${barTimes}::timestamptz[]) AS bar_time,
            UNNEST(${symbols}::varchar[]) AS symbol,
            UNNEST(${timeframes}::varchar[]) AS timeframe,
            UNNEST(${vwaps}::numeric[]) AS vwap,
            UNNEST(${vwapSessions}::numeric[]) AS vwap_session,
            UNNEST(${ema9s}::numeric[]) AS ema_9,
            UNNEST(${ema21s}::numeric[]) AS ema_21,
            UNNEST(${atr14s}::numeric[]) AS atr_14,
            UNNEST(${rsi14s}::numeric[]) AS rsi_14,
            UNNEST(${bbUppers}::numeric[]) AS bb_upper,
            UNNEST(${bbLowers}::numeric[]) AS bb_lower,
            UNNEST(${cvds}::numeric[]) AS cvd,
            UNNEST(${vwapSd1Uppers}::numeric[]) AS vwap_sd1_upper,
            UNNEST(${vwapSd1Lowers}::numeric[]) AS vwap_sd1_lower,
            UNNEST(${vwapSd2Uppers}::numeric[]) AS vwap_sd2_upper,
            UNNEST(${vwapSd2Lowers}::numeric[]) AS vwap_sd2_lower
        ) AS u
        WHERE ib.bar_time = u.bar_time AND ib.symbol = u.symbol AND ib.timeframe = u.timeframe
      `.execute(db);

      logger.info(`Indicators: Successfully calculated and batch updated ${N} bars (including CVD and VWAP bands) for ${symbol} (${timeframe})`);
    } catch (err: any) {
      logger.error(`Indicators: Failed to compute indicators for ${symbol} (${timeframe})`, {
        error: err.message
      });
      throw err;
    }
  }
}
