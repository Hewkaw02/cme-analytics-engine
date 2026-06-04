import { BrowserPool } from '../src/browser/BrowserPool.js';
import * as fs from 'fs';

async function fetchSample() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();

  try {
    console.log('Warming up session...');
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    const url = 'https://www.cmegroup.com/CmeWS/mvc/atm/strike-prices/138/2026/06/ALL';
    console.log(`Fetching from: ${url}`);
    
    const response = await page.evaluate(async (fetchUrl) => {
      const res = await fetch(fetchUrl);
      return res.json();
    }, url);

    console.log('Keys of response:', Object.keys(response));
    if (response.strikePrices && response.strikePrices.length > 0) {
      console.log('Number of strike prices:', response.strikePrices.length);
      const sample = response.strikePrices[Math.floor(response.strikePrices.length / 2)];
      console.log('Sample strike price structure:', JSON.stringify(sample, null, 2));
    } else {
      console.log('strikePrices is empty or not present:', response);
    }
  } catch (err) {
    console.error('Error fetching sample:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

fetchSample();
