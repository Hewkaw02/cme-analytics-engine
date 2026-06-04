import { BrowserPool } from './src/browser/BrowserPool.js';
import { env } from './src/config/env.js';

async function interceptCME() {
  const pool = new BrowserPool({
    headless: false, // watch what happens
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  console.log('Navigating to CME ES Quotes page...');
  
  // Listen for all API requests
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/CmeWS/') || url.includes('chart') || url.includes('quotes')) {
      console.log(`[NETWORK] ${response.status()} - ${url}`);
    }
  });

  try {
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html', { waitUntil: 'networkidle' });
    console.log('Page loaded. Waiting 10 seconds to capture network traffic...');
    
    // Evaluate some interactions if needed, like clicking the 'Chart' tab
    await new Promise(r => setTimeout(r, 5000));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

interceptCME();
