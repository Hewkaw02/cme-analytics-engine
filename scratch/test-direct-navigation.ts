import * as fs from 'fs';
import * as path from 'path';

process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) return;
  console.error('Uncaught:', err);
});
process.on('unhandledRejection', (reason) => {
  if (String(reason).includes('location.url')) return;
});

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const VOL2VOL_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

const PRODUCTS = [
  { symbol: 'ZS', name: 'Soybeans', pid: '25', pf: '4' },
  { symbol: 'ES', name: 'S&P 500', pid: '103', pf: '26' },
  { symbol: 'NQ', name: 'NASDAQ 100', pid: '121', pf: '26' },
  { symbol: 'GC', name: 'Gold', pid: '40', pf: '6' }
];

async function main() {
  const { Camoufox } = await import('camoufox-js') as any;
  const browser = await Camoufox({ headless: true });
  
  try {
    const context = await browser.newContext({ storageState: COOKIES_PATH });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    console.log('1. Navigating to Vol2Vol wrapper on cmegroup.com...');
    await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('Waiting for load...');
    await new Promise(r => setTimeout(r, 20000));

    // Get the active frame URL
    const qsFrame = page.frames().find((f: any) => f.url().includes('QuikStrikeView.aspx'));
    if (!qsFrame) {
      console.error('❌ QuikStrike iframe not found!');
      return;
    }

    const iframeSrc = qsFrame.url();
    console.log(`Active iframe URL: ${iframeSrc}`);

    // Parse insid and qsid from iframeSrc
    const urlObj = new URL(iframeSrc);
    const insid = urlObj.searchParams.get('insid');
    const qsid = urlObj.searchParams.get('qsid');

    if (!insid || !qsid) {
      console.error('❌ Could not extract insid or qsid from URL');
      return;
    }

    console.log(`Extracted insid: ${insid}`);
    console.log(`Extracted qsid: ${qsid}`);

    // Iterate through products and scrape them using direct navigation
    for (const prod of PRODUCTS) {
      console.log(`\n--- Fetching ${prod.name} (${prod.symbol}) ---`);
      
      const directUrl = `https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedV2VExpectedRange&pid=${prod.pid}&pf=${prod.pf}&insid=${insid}&qsid=${qsid}`;
      console.log(`Navigating to direct URL: ${directUrl}`);
      
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 10000));

      const html = await page.content();
      
      // Regex to parse JSONSettings
      const jsonSettingsRegex = /"JSONSettings"\s*:\s*"({[\s\S]*?})"\s*}/;
      const match = html.match(jsonSettingsRegex);

      if (match) {
        try {
          const unescaped = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const settings = JSON.parse(unescaped);
          
          console.log(`✓ Parse Success for ${prod.symbol}!`);
          console.log(`  Product Name: ${settings.Product?.Name}`);
          console.log(`  Future Price: ${settings.FuturePrice}`);
          console.log(`  ATM Volatility: ${settings.ATMVol ? (settings.ATMVol * 100).toFixed(2) + '%' : 'N/A'}`);
          console.log(`  DTE: ${settings.DTE?.toFixed(2)}`);

          // Save test result
          const testFilePath = path.resolve(`scratch/test_${prod.symbol}.json`);
          fs.writeFileSync(testFilePath, JSON.stringify(settings, null, 2));
        } catch (e: any) {
          console.error(`  ❌ Failed parsing settings for ${prod.symbol}: ${e.message}`);
        }
      } else {
        console.error(`  ❌ JSONSettings not found for ${prod.symbol}`);
      }

      // Take screenshot of direct page
      const screenshotPath = path.resolve(`scratch/test_${prod.symbol}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`  Screenshot saved to: ${screenshotPath}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
