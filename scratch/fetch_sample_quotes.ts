import { BrowserPool } from '../src/browser/BrowserPool.js';

async function fetchSampleQuotes() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();

  try {
    console.log('Warming up session...');
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    // Let's try the Quotes/Option endpoint
    const url = 'https://www.cmegroup.com/CmeWS/mvc/Quotes/Option/133/G/ESM6';
    console.log(`Fetching from: ${url}`);
    
    const response = await page.evaluate(async (fetchUrl) => {
      const res = await fetch(fetchUrl);
      return res.json();
    }, url);

    console.log('Keys of response:', Object.keys(response));
    if (response.quotes && response.quotes.length > 0) {
      console.log('Number of quotes:', response.quotes.length);
      const sample = response.quotes[Math.floor(response.quotes.length / 2)];
      console.log('Sample quote structure:', JSON.stringify(sample, null, 2));
    } else if (response.optionContractQuotes && response.optionContractQuotes.length > 0) {
      console.log('Number of optionContractQuotes:', response.optionContractQuotes.length);
      const sample = response.optionContractQuotes[Math.floor(response.optionContractQuotes.length / 2)];
      console.log('Sample optionContractQuotes structure:', JSON.stringify(sample, null, 2));
    } else {
      console.log('Response empty or different:', response);
    }
  } catch (err) {
    console.error('Error fetching quotes:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

fetchSampleQuotes();
