import { BrowserPool } from './src/browser/BrowserPool.js';

async function investigateSettlementsAndVolume() {
  const pool = new BrowserPool({
    headless: false,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  
  // Array to store intercepted URLs
  const urls: string[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const type = response.request().resourceType();
    if (type === 'fetch' || type === 'xhr') {
      if (url.includes('CmeWS') || url.includes('settlements') || url.includes('volume') || url.includes('quotes')) {
        console.log(`[FOUND API] ${response.status()} ${response.request().method()} -> ${url}`);
        urls.push(url);
      }
    }
  });

  try {
    console.log('--- 1. Investigating Gold Settlements ---');
    await page.goto('https://www.cmegroup.com/markets/metals/precious/gold.settlements.html', { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Gold Settlements loaded.');
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n--- 2. Investigating Gold Volume ---');
    await page.goto('https://www.cmegroup.com/markets/metals/precious/gold.volume.html', { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Gold Volume loaded.');
    await new Promise(r => setTimeout(r, 5000));

  } catch (err) {
    console.error('Error during navigation:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
    console.log('\nAll unique intercepted endpoints:');
    console.log([...new Set(urls)].join('\n'));
  }
}

investigateSettlementsAndVolume();
