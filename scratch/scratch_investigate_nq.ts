import { BrowserPool } from './src/browser/BrowserPool.js';

async function investigateNQ() {
  const pool = new BrowserPool({
    headless: false,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();

  try {
    // 1. Let's find NQ's Product ID by going to NQ Settlements page
    console.log('--- 1. Investigating NQ Settlements (to get Product ID) ---');
    
    let nqProductId: string | null = null;
    let interceptedUrl: string | null = null;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('CmeWS/mvc/Settlements/Futures/Settlements/')) {
        interceptedUrl = url;
        const match = url.match(/\/Settlements\/Futures\/Settlements\/(\d+)\/FUT/);
        if (match) {
          nqProductId = match[1];
          console.log(`[FOUND NQ PRODUCT ID] -> ${nqProductId}`);
        }
      }
    });

    await page.goto('https://www.cmegroup.com/markets/equities/nasdaq/micro-e-mini-nasdaq-100.settlements.html', { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait a bit to ensure request is captured
    await new Promise(r => setTimeout(r, 3000));

    if (!nqProductId) {
      console.log('Trying E-mini Nasdaq-100 instead of Micro...');
      await page.goto('https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.settlements.html', { waitUntil: 'networkidle', timeout: 60000 });
      await new Promise(r => setTimeout(r, 3000));
    }

    if (nqProductId && interceptedUrl) {
      console.log(`NQ Product ID is ${nqProductId}`);
      
      // Let's test changing the date to see if data changes and print a sample of the JSON payload.
      // We will execute a fetch directly within the page context to reuse the browser session cookies!
      // This is a great way to bypass Akamai because it inherits the cookies.
      
      const yesterday = '05/18/2026';
      const dayBefore = '05/15/2026'; // May 15 is a Friday, May 18 is Monday, May 19 is Tuesday

      console.log(`\n--- 2. Fetching NQ Settlements for ${yesterday} via Page context... ---`);
      const testUrl1 = interceptedUrl.replace(/tradeDate=[^&]+/, `tradeDate=${yesterday}`);
      
      const data1 = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.json();
      }, testUrl1);

      console.log(`Response Status for ${yesterday}:`, data1 ? 'SUCCESS' : 'FAILED');
      if (data1 && data1.settlements && data1.settlements.length > 0) {
        console.log(`Found ${data1.settlements.length} settlement rows.`);
        console.log('Sample Row:', JSON.stringify(data1.settlements[0], null, 2));
      } else {
        console.log('Empty response or error:', data1);
      }

      console.log(`\n--- 3. Fetching NQ Settlements for ${dayBefore} via Page context... ---`);
      const testUrl2 = interceptedUrl.replace(/tradeDate=[^&]+/, `tradeDate=${dayBefore}`);
      const data2 = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.json();
      }, testUrl2);

      console.log(`Response Status for ${dayBefore}:`, data2 ? 'SUCCESS' : 'FAILED');
      if (data2 && data2.settlements && data2.settlements.length > 0) {
        console.log(`Found ${data2.settlements.length} settlement rows.`);
        console.log('Sample Row:', JSON.stringify(data2.settlements[0], null, 2));
        
        // Compare the first contract price of yesterday vs day before to verify it actually changes!
        const p1 = data1.settlements[0].settle;
        const p2 = data2.settlements[0].settle;
        console.log(`Yesterday Settle: ${p1}, Day Before Settle: ${p2} -> ${p1 !== p2 ? 'DIFFERENT (DATE WORKS!)' : 'SAME'}`);
      }

      // 4. Let's do the same for NQ Volume
      console.log('\n--- 4. Fetching NQ Volume via Page context... ---');
      const volumeUrl = `https://www.cmegroup.com/CmeWS/mvc/Volume/Details/${nqProductId}/FUT?tradeDate=${yesterday}&isProtected&_t=${Date.now()}`;
      const volData = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.json();
      }, volumeUrl);

      if (volData) {
         console.log('Volume data keys:', Object.keys(volData));
         if (volData.volumeDetails && volData.volumeDetails.length > 0) {
           console.log('Volume Details Sample Row:', JSON.stringify(volData.volumeDetails[0], null, 2));
         } else {
           console.log('Volume Details empty:', volData);
         }
      }
    } else {
      console.log('❌ Could not intercept NQ Settlements Endpoint');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

investigateNQ();
