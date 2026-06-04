import { db } from '../db/client.js';
import { logger } from './logger.js';
import { Symbol } from '../types.js';
import fs from 'fs';
import path from 'path';

export class ConsoleVisualizer {
  /**
   * Fetches latest price data and option summary to display a premium console-based
   * candlestick chart, volume profile, technical indicators, and volatility analytics dashboard.
   */
  static async displayAnalysis(
    symbol: Symbol,
    tradeDate: string,
    timeframe: string = '1m',
    limit: number = 40,
  ): Promise<void> {
    try {
      // 1. Fetch recent intraday bars with calculated technical indicators
      const bars = await db
        .selectFrom('intraday_bars')
        .select([
          'bar_time', 'open', 'high', 'low', 'close', 'volume',
          'vwap', 'vwap_session', 'ema_9', 'ema_21', 'atr_14', 'rsi_14', 'bb_upper', 'bb_lower'
        ] as const)
        .where('symbol', '=', symbol)
        .where('timeframe', '=', timeframe)
        .orderBy('bar_time', 'desc')
        .limit(limit)
        .execute();

      if (bars.length === 0) {
        logger.warn(`ConsoleVisualizer: No intraday bars found in database for ${symbol} (${timeframe})`);
        return;
      }

      // Reverse to chronological order (left to right)
      const data = [...bars].reverse();

      const minPrice = Math.min(...data.map((b) => Number(b.low)));
      const maxPrice = Math.max(...data.map((b) => Number(b.high)));
      const range = maxPrice - minPrice;
      const height = 12; // Height of candlestick chart in terminal rows

      // 2. Fetch options summary for the trade date and symbol
      const summary = await db
        .selectFrom('oi_expiry_summary')
        .selectAll()
        .where('symbol', '=', symbol)
        .where('trade_date', '=', tradeDate as any)
        .orderBy('expiry_date', 'asc') // Grab front month
        .limit(1)
        .executeTakeFirst();

      const names: Record<string, string> = {
        ES: 'E-mini S&P 500 Futures',
        NQ: 'E-mini Nasdaq 100 Futures',
        GC: 'Gold Futures',
      };
      const fullName = names[symbol] || symbol;

      // 3. Initialize visual output buffer
      const printedLines: string[] = [];
      const print = (text: string = '') => {
        console.log(text);
        // Strip ANSI colors before saving to text report
        const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
        printedLines.push(clean);
      };

      // 4. Render Box Header
      print(`\x1b[1;36m┌──────────────────────────────────────────────────────────────────────────────┐\x1b[0m`);
      print(`\x1b[1;36m│   CME QUANTITATIVE INTRADAY REPORT - ${symbol.padEnd(41)}│\x1b[0m`);
      print(`\x1b[1;36m│\x1b[0m   \x1b[1m${fullName.padEnd(73)}\x1b[0m\x1b[1;36m│\x1b[0m`);
      print(`\x1b[1;36m├──────────────────────────────────────────────────────────────────────────────┤\x1b[0m`);
      print(`\x1b[1;36m│\x1b[0m Trade Date: ${tradeDate.padEnd(12)} | Timeframe: ${timeframe.padEnd(6)} | Limit: ${(String(limit) + ' bars').padEnd(12)} | RTH/ETH Mixed \x1b[1;36m│\x1b[0m`);
      print(`\x1b[1;36m└──────────────────────────────────────────────────────────────────────────────┘\x1b[0m`);

      print(`\n📈 \x1b[1mCandlestick Price Action Chart (Last ${data.length} bars):\x1b[0m`);
      print(`   Range: \x1b[33m${minPrice.toFixed(2)}\x1b[0m - \x1b[33m${maxPrice.toFixed(2)}\x1b[0m\n`);

      // 5. Draw Candlestick Chart
      for (let y = height; y >= 0; y--) {
        const priceAtLevel = minPrice + (range * y) / height;
        let line = priceAtLevel.toFixed(2).padStart(10) + ' │ ';

        for (const bar of data) {
          const o = Number(bar.open);
          const h = Number(bar.high);
          const l = Number(bar.low);
          const c = Number(bar.close);

          const bull = c >= o;
          const color = bull ? '\x1b[32m' : '\x1b[31m';
          const reset = '\x1b[0m';

          const highIdx = range > 0 ? Math.round(((h - minPrice) / range) * height) : 0;
          const lowIdx = range > 0 ? Math.round(((l - minPrice) / range) * height) : 0;
          const openIdx = range > 0 ? Math.round(((o - minPrice) / range) * height) : 0;
          const closeIdx = range > 0 ? Math.round(((c - minPrice) / range) * height) : 0;

          const bodyMin = Math.min(openIdx, closeIdx);
          const bodyMax = Math.max(openIdx, closeIdx);

          if (y === highIdx && y > bodyMax) {
            line += color + '╷' + reset; // Wick top
          } else if (y === lowIdx && y < bodyMin) {
            line += color + '╵' + reset; // Wick bottom
          } else if (y >= bodyMin && y <= bodyMax) {
            line += color + '█' + reset; // Candle body
          } else if (y < highIdx && y > bodyMax) {
            line += color + '│' + reset; // Wick middle top
          } else if (y > lowIdx && y < bodyMin) {
            line += color + '│' + reset; // Wick middle bottom
          } else {
            line += ' ';
          }
        }
        print(line);
      }

      print(' '.repeat(11) + '└' + '─'.repeat(data.length));
      print(' '.repeat(11) + '  (Time -> ' + data.length + ' bars)');
      print('\n  \x1b[32m█ Bullish\x1b[0m  \x1b[31m█ Bearish\x1b[0m\n');

      // 6. Compute & Draw Volume Profile (POC) Histogram
      print(`🧱 \x1b[1mVolume Profile (Liquidity & Price Acceptance):\x1b[0m`);
      const numBins = 10;
      const binSize = range / numBins;
      const bins = new Array(numBins).fill(0);

      for (const bar of data) {
        const close = Number(bar.close);
        const vol = Number(bar.volume);
        let binIdx = Math.floor((close - minPrice) / binSize);
        if (binIdx >= numBins) binIdx = numBins - 1;
        if (binIdx < 0) binIdx = 0;
        bins[binIdx] += vol;
      }

      const maxBinVol = Math.max(...bins);
      const pocBinIdx = bins.indexOf(maxBinVol);

      for (let i = numBins - 1; i >= 0; i--) {
        const binMin = minPrice + i * binSize;
        const binMax = binMin + binSize;
        const binVol = bins[i];
        
        const pct = maxBinVol > 0 ? binVol / maxBinVol : 0;
        const barWidth = Math.round(pct * 30);
        const barStr = '█'.repeat(barWidth).padEnd(30, ' ');
        const isPoc = i === pocBinIdx;
        const pocTag = isPoc ? '\x1b[1;33m[POC]\x1b[0m' : '     ';
        const priceLabel = `[${binMin.toFixed(2)} - ${binMax.toFixed(2)}]`;
        
        print(`   ${priceLabel.padEnd(23)} │ ${isPoc ? '\x1b[33m' : '\x1b[36m'}${barStr}${isPoc ? '\x1b[0m' : '\x1b[0m'} (${binVol.toLocaleString().padStart(9)}) ${pocTag}`);
      }

      // 7. Compute Volatility & Quantitative Pricing Metrics
      // A. Annualized Realized Volatility from log returns
      const logReturns: number[] = [];
      for (let i = 1; i < data.length; i++) {
        const cToday = Number(data[i].close);
        const cPrev = Number(data[i-1].close);
        if (cPrev > 0 && cToday > 0) {
          logReturns.push(Math.log(cToday / cPrev));
        }
      }
      
      let annualizedVol = 0;
      if (logReturns.length > 0) {
        const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
        const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1 || 1);
        const stdDev = Math.sqrt(variance);
        
        // Annualization based on timeframe
        let periodsPerYear = 252 * 23 * 60;
        if (timeframe === '5m') periodsPerYear = 252 * 23 * 12;
        else if (timeframe === '15m') periodsPerYear = 252 * 23 * 4;
        else if (timeframe === '30m') periodsPerYear = 252 * 23 * 2;
        else if (timeframe === '1h') periodsPerYear = 252 * 23;
        else if (timeframe === '4h') periodsPerYear = 252 * 6;
        else if (timeframe === '1D') periodsPerYear = 252;
        
        annualizedVol = stdDev * Math.sqrt(periodsPerYear) * 100;
      }

      // B. VWAP Z-Score
      const latest = data[data.length - 1];
      let zScore = 0;
      let sd = 0;
      if (latest && latest.vwap_session !== null) {
        const last20 = data.slice(-20);
        const prices = last20.map(b => Number(b.close));
        const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
        sd = Math.sqrt(variance);
        if (sd > 0) {
          zScore = (Number(latest.close) - Number(latest.vwap_session)) / sd;
        }
      }

      // C. Actionable Trading Insights
      let tradeSignal = '\x1b[33mNEUTRAL (Sideways Consolidation)\x1b[0m';
      const rsiVal = latest?.rsi_14 !== null ? Number(latest.rsi_14) : null;
      
      if (zScore > 2.0 || (rsiVal !== null && rsiVal > 75)) {
        tradeSignal = '\x1b[1;31mSELL SETUP (Extreme Overbought / Mean-Reversion Trigger)\x1b[0m';
      } else if (zScore < -2.0 || (rsiVal !== null && rsiVal < 25)) {
        tradeSignal = '\x1b[1;32mBUY SETUP (Extreme Oversold / Mean-Reversion Trigger)\x1b[0m';
      } else if (zScore > 0.5 && (rsiVal !== null && rsiVal > 55)) {
        tradeSignal = '\x1b[32mBULLISH CONTINUATION (Positive Momentum above VWAP)\x1b[0m';
      } else if (zScore < -0.5 && (rsiVal !== null && rsiVal < 45)) {
        tradeSignal = '\x1b[31mBEARISH CONTINUATION (Negative Momentum below VWAP)\x1b[0m';
      }

      let volExpansion = 'Normal Volatility';
      if (latest && latest.atr_14 !== null) {
        const atr = Number(latest.atr_14);
        const tr = Math.max(
          Number(latest.high) - Number(latest.low),
          Math.abs(Number(latest.high) - Number(data[data.length - 2]?.close || latest.close)),
          Math.abs(Number(latest.low) - Number(data[data.length - 2]?.close || latest.close))
        );
        if (tr > 1.5 * atr) {
          volExpansion = '\x1b[1;33mMomentum Volatility Expansion (High Risk / Breakout Alert)\x1b[0m';
        }
      }

      // 8. Draw Latest Price & Technical Indicator Details
      if (latest) {
        const c = Number(latest.close);
        const o = Number(latest.open);
        const h = Number(latest.high);
        const l = Number(latest.low);
        const change = c - o;
        const pctChange = o > 0 ? (change / o) * 100 : 0;
        const color = change >= 0 ? '\x1b[32m' : '\x1b[31m';
        const sign = change >= 0 ? '+' : '';

        const formatNum = (val: any, decimals: number = 2) => 
          val !== null && val !== undefined ? Number(val).toFixed(decimals) : 'N/A';

        print(`\n📊 \x1b[1mLatest Candlestick Technical Analysis:\x1b[0m`);
        print(`   • Time:         ${new Date(latest.bar_time).toLocaleTimeString()}`);
        print(`   • Price:        \x1b[1m${c.toFixed(2)}\x1b[0m (${color}${sign}${pctChange.toFixed(2)}%\x1b[0m)`);
        print(`   • Session VWAP: \x1b[1;36m${formatNum(latest.vwap_session)}\x1b[0m`);
        print(`   • Daily VWAP:   ${formatNum(latest.vwap)}`);
        print(`   • EMA 9 / 21:   ${formatNum(latest.ema_9)} / ${formatNum(latest.ema_21)}`);
        print(`   • Bollinger Bd: ${formatNum(latest.bb_lower)} [Lower] - ${formatNum(latest.bb_upper)} [Upper]`);
        print(`   • RSI (14):     \x1b[1m${formatNum(latest.rsi_14, 1)}\x1b[0m (Wilder's RSI)`);
        print(`   • ATR (14):     ${formatNum(latest.atr_14, 2)} (Average True Range)`);

        print(`\n🧠 \x1b[1mQuantitative Analytics & Insights:\x1b[0m`);
        print(`   • Realized Vol: \x1b[1m${annualizedVol.toFixed(2)}%\x1b[0m (Annualized Realized Volatility)`);
        print(`   • VWAP Z-Score: \x1b[1m${zScore.toFixed(3)}\x1b[0m (Std Dev from Session VWAP)`);
        print(`   • Vol State:    ${volExpansion}`);
        print(`   • Trade Signal: ${tradeSignal}`);
      }

      // 9. Draw Options & Volatility summary if exists
      if (summary) {
        print(`\n🎯 \x1b[1mInstitutional Market Structure (Front Expiry: ${summary.expiry_code}):\x1b[0m`);

        const pcrVal = summary.put_call_oi_ratio !== null ? Number(summary.put_call_oi_ratio) : null;
        let pcrSentiment = '\x1b[33mNeutral\x1b[0m';
        if (pcrVal !== null) {
          if (pcrVal > 1.0) pcrSentiment = '\x1b[31mBearish (Heavy Puts)\x1b[0m';
          else if (pcrVal < 0.7) pcrSentiment = '\x1b[32mBullish (Heavy Calls)\x1b[0m';
        }

        const gexVal = summary.net_gamma_exposure !== null ? Number(summary.net_gamma_exposure) : null;
        let gexSentiment = '\x1b[33mNeutral\x1b[0m';
        if (gexVal !== null) {
          if (gexVal > 0) gexSentiment = '\x1b[32mPositive (Quiet Market)\x1b[0m';
          else if (gexVal < 0) gexSentiment = '\x1b[31mNegative (High Volatility)\x1b[0m';
        }

        const formatNum = (val: any) =>
          val !== null && val !== undefined ? Number(val).toLocaleString() : 'N/A';
        const formatPrice = (val: any) =>
          val !== null && val !== undefined ? Number(val).toFixed(2) : 'N/A';
        const formatPct = (val: any) =>
          val !== null && val !== undefined ? `${Number(val).toFixed(2)}%` : 'N/A';

        print(`   • Underlying Price:   ${formatPrice(summary.underlying_price)}`);
        print(`   • Max Pain Strike:    \x1b[1;33m${formatPrice(summary.max_pain_strike)}\x1b[0m`);
        print(`   • Put/Call OI Ratio:  ${formatPrice(summary.put_call_oi_ratio)} (${pcrSentiment})`);
        print(`   • Put/Call Vol Ratio: ${formatPrice(summary.put_call_vol_ratio)}`);
        print(`   • Call Wall (Resist): \x1b[31m${formatPrice(summary.max_call_oi_strike)}\x1b[0m (OI: ${formatNum(summary.max_call_oi_value)})`);
        print(`   • Put Wall (Support): \x1b[32m${formatPrice(summary.max_put_oi_strike)}\x1b[0m (OI: ${formatNum(summary.max_put_oi_value)})`);
        print(`   • Net Gamma (GEX):    ${formatNum(summary.net_gamma_exposure)} (${gexSentiment})`);
        print(`   • GEX Flip Level:     ${formatPrice(summary.gex_flip_level)}`);
        print(`   • ATM IV Skew:        ${summary.atm_iv_skew !== null ? Number(summary.atm_iv_skew).toFixed(4) : 'N/A'}`);
        print(`   • IV Rank:            ${formatPct(summary.iv_rank)} | IV Percentile: ${formatPct(summary.iv_percentile)}`);
      } else {
        print(`\n🎯 \x1b[1mInstitutional Market Structure:\x1b[0m No OI/Options summary found in DB for date: ${tradeDate}.`);
      }

      print(`\n\x1b[1;36m──────────────────────────────────────────────────────────────────────────────\x1b[0m\n`);

      // 10. Persist Report to Static Text File
      try {
        const reportDir = 'output/analysis';
        fs.mkdirSync(reportDir, { recursive: true });
        const reportPath = path.join(reportDir, `report_${symbol}_${tradeDate}.txt`);
        fs.writeFileSync(reportPath, printedLines.join('\n'), 'utf8');
        logger.info(`ConsoleVisualizer: Analysis report saved successfully to ${reportPath}`);
      } catch (writeErr) {
        logger.warn('ConsoleVisualizer: Failed to persist text analysis report to file system', {
          error: String(writeErr)
        });
      }

    } catch (err) {
      logger.error(`ConsoleVisualizer: Failed to display chart for ${symbol}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
