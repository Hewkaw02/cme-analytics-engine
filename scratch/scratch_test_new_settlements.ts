import { BrowserPool } from './src/browser/BrowserPool.js';

async function testNewSettlements() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  const tradeDate = '05/19/2026';

  try {
    // Establish session context
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html', { waitUntil: 'domcontentloaded' });

    // Test ES (133)
    console.log('--- Testing ES (133) with new FUT path ---');
    const esUrl = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/133/FUT?strategy=DEFAULT&tradeDate=${tradeDate}&pageSize=500&isProtected&_t=${Date.now()}`;
    const esData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, esUrl);
    console.log('ES Records count:', esData?.settlements?.length || 0);
    if (esData?.settlements?.length > 0) {
      console.log('ES Sample:', esData.settlements[0]);
    }

    // Test NQ (146)
    console.log('\n--- Testing NQ (146) with new FUT path ---');
    const nqUrl = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/146/FUT?strategy=DEFAULT&tradeDate=${tradeDate}&pageSize=500&isProtected&_t=${Date.now()}`;
    const nqData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, nqUrl);
    console.log('NQ Records count:', nqData?.settlements?.length || 0);
    if (nqData?.settlements?.length > 0) {
      console.log('NQ Sample:', nqData.settlements[0]);
    }

    // Test GC (437)
    console.log('\n--- Testing GC (437) with new FUT path ---');
    const gcUrl = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/437/FUT?strategy=DEFAULT&tradeDate=${tradeDate}&pageSize=500&isProtected&_t=${Date.now()}`;
    const gcData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, gcUrl);
    console.log('GC Records count:', gcData?.settlements?.length || 0);
    if (gcData?.settlements?.length > 0) {
      console.log('GC Sample:', gcData.settlements[0]);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

testNewSettlements();
