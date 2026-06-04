import { BrowserPool } from '../src/browser/BrowserPool.js';

async function interceptCme() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();

  try {
    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('CmeWS/mvc') || url.includes('Quotes') || url.includes('strike-prices') || url.includes('options')) {
        console.log(`[API RESPONSE] url: ${url} (status: ${res.status()})`);
        if (res.status() === 200 && (url.includes('atm') || url.includes('Quotes') || url.includes('Option'))) {
          try {
            const text = await res.text();
            if (text.startsWith('{') || text.startsWith('[')) {
              const json = JSON.parse(text);
              console.log(`  - JSON Response keys:`, Object.keys(json));
              if (json.strikePrices) {
                console.log(`  - Has strikePrices! Count: ${json.strikePrices.length}`);
                if (json.strikePrices.length > 0) {
                  const strike = json.strikePrices[0];
                  console.log(`  - Strike sample keys:`, Object.keys(strike));
                  if (strike.call) {
                    console.log(`  - Strike Call keys:`, Object.keys(strike.call));
                  }
                }
              }
            }
          } catch (e) {
            // ignore parsing error
          }
        }
      }
    });

    console.log('Navigating to CME options quotes page...');
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html', { waitUntil: 'networkidle', timeout: 60000 });
    
    console.log('Page loaded, waiting for 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
  } catch (err) {
    console.error('Error during interception:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

interceptCme();
