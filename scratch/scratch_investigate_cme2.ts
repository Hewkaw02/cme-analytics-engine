import { BrowserPool } from './src/browser/BrowserPool.js';

async function investigateCMEChart() {
  const pool = new BrowserPool({
    headless: false,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  
  try {
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html', { waitUntil: 'domcontentloaded' });
    console.log('Page loaded. Extracting tab names...');

    const tabs = await page.evaluate(() => {
        // Find the main navigation or tab bar elements
        // The cme group website usually uses ul.nav, div.tabs, etc.
        const tabElements = Array.from(document.querySelectorAll('li.nav-item, a.nav-link, button[role="tab"], .cme-tab-title, li.tab-header'));
        return tabElements.map(el => el.textContent?.trim()).filter(Boolean);
    });

    console.log('Found Tabs/Nav links:');
    console.log([...new Set(tabs)]);

    // Let's also look for any iframe with tradingview
    const iframes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('iframe')).map(f => f.src);
    });
    console.log('\nIFrames found:', iframes);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

investigateCMEChart();
