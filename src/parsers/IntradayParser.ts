import { IntradayBar } from '../types.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { logger } from '../utils/logger.js';

export interface CmeChartRaw {
  bars: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

const PERIOD_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

export class IntradayParser {
  /**
   * Parse raw CME chart bars into IntradayBar records.
   * Includes gap detection for 1m data per Spec caveats.
   */
  parseIntradayBars(
    raw: CmeChartRaw,
    symbol: string,
    timeframe: string,
    expiry_code: string | undefined = undefined,
  ): IntradayBar[] {
    if (!raw || !raw.bars || raw.bars.length === 0) return [];

    const bars: IntradayBar[] = raw.bars.map((bar) => {
      const barTime = new Date(bar.time);
      const isRTH = TimeUtils.isRegularHours(symbol, barTime);
      const closeTime = new Date(barTime.getTime() + PERIOD_SECONDS[timeframe] * 1000);

      return {
        bar_time: barTime.toISOString(),
        bar_close_time: closeTime.toISOString(),
        symbol,
        timeframe,
        expiry_code,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        vwap: null,
        buy_volume: null,
        sell_volume: null,
        delta_volume: null,
        trade_count: null,
        session: isRTH ? 'RTH' : 'ETH',
        is_rth: isRTH,

        // Indicators (calculated post-insert)
        vwap_session: null,
        ema_9: null,
        ema_21: null,
        atr_14: null,
        rsi_14: null,
        bb_upper: null,
        bb_lower: null,

        // Computed Indicators
        cvd: null,
        vwap_sd1_upper: null,
        vwap_sd1_lower: null,
        vwap_sd2_upper: null,
        vwap_sd2_lower: null,

        fetched_at: new Date().toISOString(),
      };
    });

    // Run gap detection for 1m timeframe
    if (timeframe === '1m') {
      this.detectGaps(bars, symbol);
    }

    return bars;
  }

  /**
   * Detect and log gaps in time-series bars.
   * A gap is defined as a missing period between two adjacent bars.
   */
  private detectGaps(bars: IntradayBar[], symbol: string): void {
    if (bars.length < 2) return;

    const timeframe = bars[0].timeframe;
    const intervalMs = PERIOD_SECONDS[timeframe] * 1000;

    for (let i = 1; i < bars.length; i++) {
      const prevTime = new Date(bars[i - 1].bar_time).getTime();
      const currTime = new Date(bars[i].bar_time).getTime();
      const diff = currTime - prevTime;

      if (diff > intervalMs) {
        const missingCount = Math.floor(diff / intervalMs) - 1;
        
        // Only log if it's not a known session gap (15:15-17:00 or 13:30-17:00)
        // We use a simple heuristic: if missing > 30 mins, it's likely a market close
        if (missingCount > 0 && missingCount < 30) {
          logger.warn(`Intraday gap detected for ${symbol} ${timeframe}`, {
            from: bars[i - 1].bar_time,
            to: bars[i].bar_time,
            missingPeriods: missingCount,
          });
        }
      }
    }
  }
}
