import { db } from './src/db/client.js';

interface Bar {
  bar_time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function runIntradayAnalysis() {
  const symbol = 'ES';
  const limit = 200;

  // 1. Fetch latest intraday bars for ES
  const rawBars = await db
    .selectFrom('intraday_bars')
    .select(['bar_time', 'open', 'high', 'low', 'close', 'volume'])
    .where('symbol', '=', symbol)
    .where('timeframe', '=', '1m')
    .orderBy('bar_time', 'desc')
    .limit(limit)
    .execute();

  if (rawBars.length === 0) {
    console.log(`❌ No intraday bars found for ${symbol} in the database.`);
    process.exit(1);
  }

  // Reverse to chronological order
  const bars: Bar[] = rawBars.reverse().map((b) => ({
    bar_time: new Date(b.bar_time),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume),
  }));

  console.log(`\n📊 Analyzing ${bars.length} intraday bars (1m) for ${symbol}...`);

  // 2. Compute VWAP (Volume Weighted Average Price)
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTypicalVolume += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }
  
  const vwap = cumulativeVolume > 0 ? cumulativeTypicalVolume / cumulativeVolume : 0;

  // 3. Compute VWAP Standard Deviation (Bands)
  let sumSquaredDeviation = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    sumSquaredDeviation += bar.volume * Math.pow(typicalPrice - vwap, 2);
  }
  const vwapSD = cumulativeVolume > 0 ? Math.sqrt(sumSquaredDeviation / cumulativeVolume) : 0;

  const upperBand1 = vwap + vwapSD;
  const lowerBand1 = vwap - vwapSD;
  const upperBand2 = vwap + 2 * vwapSD;
  const lowerBand2 = vwap - 2 * vwapSD;

  // 4. Compute Realized Volatility (Log Returns)
  const logReturns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const ret = Math.log(bars[i].close / bars[i - 1].close);
    logReturns.push(ret);
  }
  
  let realizedVolAnnualized = 0;
  let avgReturn = 0;
  if (logReturns.length > 0) {
    avgReturn = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const squaredDiffs = logReturns.map((r) => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (logReturns.length - 1 || 1);
    const stdDev = Math.sqrt(variance);
    // Scale 1-minute returns to annualized (252 days * 1440 minutes/day = 362,880 minutes per year)
    realizedVolAnnualized = stdDev * Math.sqrt(252 * 1440) * 100;
  }

  // 5. Compute Volume Profile (10 Bins)
  const prices = bars.map((b) => b.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const binCount = 10;
  const binSize = priceRange / binCount;

  const bins = Array.from({ length: binCount }, (_, i) => ({
    low: minPrice + i * binSize,
    high: minPrice + (i + 1) * binSize,
    volume: 0,
  }));

  for (const bar of bars) {
    const price = bar.close;
    const binIdx = Math.min(Math.floor((price - minPrice) / binSize), binCount - 1);
    bins[binIdx].volume += bar.volume;
  }

  const maxBinVolume = Math.max(...bins.map((b) => b.volume)) || 1;
  // Point of Control (POC) is the bin with highest volume
  const pocBinIdx = bins.findIndex((b) => b.volume === maxBinVolume);
  const pocPrice = (bins[pocBinIdx].low + bins[pocBinIdx].high) / 2;

  // 6. Draw Premium Quantitative Dashboard
  console.log(`\x1b[1;35m============================================================\x1b[0m`);
  console.log(`\x1b[1;35m   INTRADAY QUANTITATIVE ENGINE & MICROSTRUCTURE REPORT     \x1b[0m`);
  console.log(`\x1b[1;35m============================================================\x1b[0m`);
  console.log(`📡 \x1b[1mSymbol:\x1b[0m ${symbol} | Timeframe: 1m | Dataset: Last ${bars.length} bars`);
  console.log(`📅 \x1b[1mTime Window:\x1b[0m ${bars[0].bar_time.toLocaleTimeString()} to ${bars[bars.length - 1].bar_time.toLocaleTimeString()}`);
  console.log(`\x1b[1;35m────────────────────────────────────────────────────────────\x1b[0m`);

  console.log(`\n🧠 \x1b[1;36m1. Volatility & Pricing Metrics:\x1b[0m`);
  console.log(`   • Min Price:          \x1b[33m${minPrice.toFixed(2)}\x1b[0m`);
  console.log(`   • Max Price:          \x1b[33m${maxPrice.toFixed(2)}\x1b[0m`);
  console.log(`   • Dynamic Range:      ${priceRange.toFixed(2)} pts`);
  console.log(`   • Ann. Realized Vol:  \x1b[1;31m${realizedVolAnnualized.toFixed(2)}%\x1b[0m (Historical 1m returns scaled)`);

  console.log(`\n📊 \x1b[1;36m2. VWAP Institutional Benchmarks:\x1b[0m`);
  console.log(`   • VWAP Central Price: \x1b[1;32m${vwap.toFixed(2)}\x1b[0m`);
  console.log(`   • Upper Band +1 SD:   ${upperBand1.toFixed(2)}`);
  console.log(`   • Lower Band -1 SD:   ${lowerBand1.toFixed(2)}`);
  console.log(`   • Upper Band +2 SD:   \x1b[31m${upperBand2.toFixed(2)}\x1b[0m (Overbought Wall)`);
  console.log(`   • Lower Band -2 SD:   \x1b[32m${lowerBand2.toFixed(2)}\x1b[0m (Oversold Support)`);

  const latestPrice = bars[bars.length - 1].close;
  const zScore = vwapSD > 0 ? (latestPrice - vwap) / vwapSD : 0;
  let devStatus = '\x1b[33mFair Value\x1b[0m';
  if (zScore > 2) devStatus = '\x1b[1;31mExtreme Overbought (> +2 SD)\x1b[0m';
  else if (zScore > 1) devStatus = '\x1b[31mMod. Overbought (> +1 SD)\x1b[0m';
  else if (zScore < -2) devStatus = '\x1b[1;32mExtreme Oversold (< -2 SD)\x1b[0m';
  else if (zScore < -1) devStatus = '\x1b[32mMod. Oversold (< -1 SD)\x1b[0m';

  console.log(`   • Current Price:      \x1b[1m${latestPrice.toFixed(2)}\x1b[0m`);
  console.log(`   • Price vs VWAP Dev:  ${zScore.toFixed(2)} SD (${devStatus})`);

  console.log(`\n🧱 \x1b[1;36m3. Volume Profile (Market Acceptance Bins):\x1b[0m`);
  
  for (let i = binCount - 1; i >= 0; i--) {
    const bin = bins[i];
    const isPOC = i === pocBinIdx;
    const barLength = Math.round((bin.volume / maxBinVolume) * 30);
    const chartBar = '█'.repeat(barLength).padEnd(30, ' ');
    const label = `${bin.low.toFixed(2)} - ${bin.high.toFixed(2)}`;
    
    if (isPOC) {
      console.log(`   👉 \x1b[1;36m${label.padStart(17)} │ ${chartBar} (${bin.volume.toLocaleString()}) [POC] \x1b[0m`);
    } else {
      console.log(`      ${label.padStart(17)} │ ${chartBar} (${bin.volume.toLocaleString()})`);
    }
  }

  console.log(`\n💡 \x1b[1;33m4. Quantitative Trading Insights:\x1b[0m`);
  if (zScore > 2) {
    console.log(`   • \x1b[1;31m[SELL SIGNAL]\x1b[0m Price is significantly above the institutional VWAP band (> +2 SD).`);
    console.log(`     Look for short entries targeting a reversion to mean at ${vwap.toFixed(2)}.`);
  } else if (zScore < -2) {
    console.log(`   • \x1b[1;32m[BUY SIGNAL]\x1b[0m Price is deeply below the institutional VWAP band (< -2 SD).`);
    console.log(`     Look for long entries targeting a reversion to mean at ${vwap.toFixed(2)}.`);
  } else {
    console.log(`   • \x1b[1;32m[ACCUMULATION ZONE]\x1b[0m Price is circulating near Fair Value (Z-Score: ${zScore.toFixed(2)}).`);
    console.log(`     The heaviest trading node (Point of Control) is centered at \x1b[1;36m${pocPrice.toFixed(2)}\x1b[0m.`);
    console.log(`     Watch for a breakout above ${maxPrice.toFixed(2)} or breakdown below ${minPrice.toFixed(2)} for momentum.`);
  }
  
  console.log(`\x1b[1;35m============================================================\x1b[0m\n`);

  process.exit(0);
}

runIntradayAnalysis().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
