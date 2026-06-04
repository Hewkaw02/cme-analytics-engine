import { BrowserPool } from '../src/browser/BrowserPool.js';
import { warmupSession } from '../src/browser/Warmup.js';
import { SYMBOLS } from '../src/config/symbols.js';
import { logger } from '../src/utils/logger.js';

async function test() {
  const pool = new BrowserPool({
    headless: true,
    stealth: true,
    viewport: { width: 1400, height: 850 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  try {
    console.log('Warming up browser session...');
    await warmupSession(page);

    const productId = 138; // ES Options
    const year = '2026';
    const month = 6;

    // Test ATM URL
    const atmUrl = `https://www.cmegroup.com/CmeWS/mvc/atm/strike-prices/${productId}/${year}/${month}/ATM`;
    console.log(`Fetching ATM data from: ${atmUrl}`);
    const atmData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, atmUrl);

    console.log(`ATM strike prices: ${atmData?.strikePrices?.length ?? 0} strikes`);
    if (atmData?.strikePrices) {
      console.log('ATM Strikes:', atmData.strikePrices.map((s: any) => s.strikePrice).join(', '));
    }

    // Test ALL URL
    const allUrl = `https://www.cmegroup.com/CmeWS/mvc/atm/strike-prices/${productId}/${year}/${month}/ALL`;
    console.log(`Fetching ALL data from: ${allUrl}`);
    const allData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, allUrl);

    console.log(`ALL strike prices: ${allData?.strikePrices?.length ?? 0} strikes`);
    if (allData?.strikePrices) {
      console.log('ALL Strikes count:', allData.strikePrices.length);
      console.log('First 5 strikes:', allData.strikePrices.slice(0, 5).map((s: any) => s.strikePrice).join(', '));
      console.log('Last 5 strikes:', allData.strikePrices.slice(-5).map((s: any) => s.strikePrice).join(', '));
    }

  } catch (err) {
    console.error('Error during API test:', err);
  } finally {
    await pool.close();
    process.exit(0);
  }
}

test();
