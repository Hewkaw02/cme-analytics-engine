import * as fs from 'fs';
import * as path from 'path';

// Handle uncaught exceptions to prevent internal Playwright/Camoufox crashes from killing the script
process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) {
    return;
  }
  console.error('Uncaught:', err);
});
process.on('unhandledRejection', (reason) => {
  if (String(reason).includes('location.url')) return;
});

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const VOL2VOL_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

async function main() {
  const { Camoufox } = await import('camoufox-js') as any;
  const browser = await Camoufox({ headless: true });
  
  try {
    const context = await browser.newContext({ storageState: COOKIES_PATH });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise(r => setTimeout(r, 15000));

    const frames = page.frames();
    const qsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
    if (!qsFrame) {
      console.error('Frame not found');
      return;
    }

    await qsFrame.click('a[title="Change to any product"]');
    await new Promise(r => setTimeout(r, 2000));

    const attributes = await qsFrame.evaluate(() => {
      const link = document.querySelector('.product-selector .products a');
      if (!link) return 'No link found';
      return Array.from(link.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      }));
    });

    console.log('Attributes of the first product link:', attributes);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
