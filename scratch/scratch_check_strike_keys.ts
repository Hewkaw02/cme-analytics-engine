import { BrowserPool } from './src/browser/BrowserPool.js';

async function main() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();

  try {
    // Navigate to a quotes page to get cookies
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html', { waitUntil: 'domcontentloaded' });
    
    // Fetch options expirations for ES (product ID 133)
    const expiriesUrl = 'https://www.cmegroup.com/CmeWS/mvc/atm/expirations/133';
    console.log('Fetching expiries from:', expiriesUrl);
    const expiries = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, expiriesUrl);
    
    console.log('Expiries structure is array of length:', expiries.length);
    
    // Let's get the first expiration info
    const firstGroup = expiries[0];
    const firstExp = firstGroup?.contractExpirations?.[0];
    if (!firstExp) {
      console.log('No expiries found.');
      return;
    }
    
    const year = firstExp.expirationYear;
    const month = firstExp.expirationMonth;
    const strikesUrl = `https://www.cmegroup.com/CmeWS/mvc/atm/strike-prices/133/${year}/${month}/ALL`;
    console.log(`Fetching strikes from: ${strikesUrl}`);
    const strikesData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, strikesUrl);
    
    console.log('Strikes data keys:', Object.keys(strikesData));
    if (strikesData.strikePrices && strikesData.strikePrices.length > 0) {
      console.log('Total strikes:', strikesData.strikePrices.length);
      const sample = strikesData.strikePrices.find((s: any) => s.call && (s.call.volume || s.call.openInterest || s.call.priorSettle));
      console.log('Sample Strike with active call:', JSON.stringify(sample || strikesData.strikePrices[0], null, 2));
    } else {
      console.log('No strikes returned:', strikesData);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

main().catch(console.error);
