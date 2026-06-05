import axios from 'axios';

async function fetchLiveSpread() {
  const symbols = ['ES=F', 'SPY', 'NQ=F', 'QQQ', 'GC=F', 'GLD'];
  const prices: { [key: string]: number } = {};

  console.log('📡 Fetching current live prices from Yahoo Finance...');
  for (const sym of symbols) {
    try {
      const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.data?.chart?.result?.[0]?.meta) {
        prices[sym] = res.data.chart.result[0].meta.regularMarketPrice;
      }
    } catch (err) {
      console.error(`❌ Failed to fetch price for ${sym}:`, (err as Error).message);
    }
  }

  console.log('\n================================================================');
  console.log('       LIVE DERIVATIVES COMPARISON (CME FUTURES VS. ETF)        ');
  console.log('================================================================');

  // Pair 1: ES vs SPY (Price Scale: 0.1)
  if (prices['ES=F'] && prices['SPY']) {
    const rawCME = prices['ES=F'];
    const scaledCME = rawCME * 0.1;
    const etfVal = prices['SPY'];
    const diff = etfVal - scaledCME;
    const basisBps = (diff / scaledCME) * 10000;
    console.log(`📈 PAIR: S&P 500 (ES Futures vs. SPY ETF)`);
    console.log(`   • CME ES=F Price:   $${rawCME.toFixed(2)}`);
    console.log(`   • CME ES (Scaled):  $${scaledCME.toFixed(2)} (x 0.1)`);
    console.log(`   • ETF SPY Price:    $${etfVal.toFixed(2)}`);
    console.log(`   • Current Spread:   ${diff >= 0 ? '+' : ''}$${diff.toFixed(3)}`);
    console.log(`   • Arbitrage Basis:  ${diff >= 0 ? '+' : ''}${basisBps.toFixed(1)} bps`);
  } else {
    console.log(`❌ S&P 500 data incomplete.`);
  }
  console.log('────────────────────────────────────────────────────────────────');

  // Pair 2: NQ vs QQQ (Price Scale: 0.025)
  if (prices['NQ=F'] && prices['QQQ']) {
    const rawCME = prices['NQ=F'];
    const scaledCME = rawCME * 0.025;
    const etfVal = prices['QQQ'];
    const diff = etfVal - scaledCME;
    const basisBps = (diff / scaledCME) * 10000;
    console.log(`📈 PAIR: Nasdaq-100 (NQ Futures vs. QQQ ETF)`);
    console.log(`   • CME NQ=F Price:   $${rawCME.toFixed(2)}`);
    console.log(`   • CME NQ (Scaled):  $${scaledCME.toFixed(2)} (x 0.025)`);
    console.log(`   • ETF QQQ Price:    $${etfVal.toFixed(2)}`);
    console.log(`   • Current Spread:   ${diff >= 0 ? '+' : ''}$${diff.toFixed(3)}`);
    console.log(`   • Arbitrage Basis:  ${diff >= 0 ? '+' : ''}${basisBps.toFixed(1)} bps`);
  } else {
    console.log(`❌ Nasdaq-100 data incomplete.`);
  }
  console.log('────────────────────────────────────────────────────────────────');

  // Pair 3: GC vs GLD (Price Scale: 0.1)
  if (prices['GC=F'] && prices['GLD']) {
    const rawCME = prices['GC=F'];
    const scaledCME = rawCME * 0.1;
    const etfVal = prices['GLD'];
    const diff = etfVal - scaledCME;
    const basisBps = (diff / scaledCME) * 10000;
    console.log(`📈 PAIR: Gold (GC Futures vs. GLD ETF)`);
    console.log(`   • CME GC=F Price:   $${rawCME.toFixed(2)}`);
    console.log(`   • CME GC (Scaled):  $${scaledCME.toFixed(2)} (x 0.1)`);
    console.log(`   • ETF GLD Price:    $${etfVal.toFixed(2)}`);
    console.log(`   • Current Spread:   ${diff >= 0 ? '+' : ''}$${diff.toFixed(3)}`);
    console.log(`   • Arbitrage Basis:  ${diff >= 0 ? '+' : ''}${basisBps.toFixed(1)} bps`);
  } else {
    console.log(`❌ Gold data incomplete.`);
  }
  console.log('================================================================\n');
}

fetchLiveSpread();
