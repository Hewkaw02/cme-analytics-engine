import { Camoufox } from 'camoufox-js';
import * as fs from 'fs';
import * as path from 'path';

// Handle uncaught exceptions from Playwright/Camoufox internals
process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) {
    return; // Suppress known Camoufox/Playwright bug
  }
  console.error('Uncaught exception occurred (non-fatal):', err);
});
process.on('unhandledRejection', (reason) => {
  if (String(reason).includes('location.url')) return;
  console.error('Unhandled rejection occurred (non-fatal):', reason);
});

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const VOL2VOL_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

async function main() {
  console.log('Launching browser to inspect QuikStrike dropdowns...');
  const browser = await Camoufox({ headless: true });
  
  let context;
  let page;
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      context = await browser.newContext({ storageState: COOKIES_PATH });
      page = await context.newPage();
    } else {
      page = await browser.newPage();
    }
  } catch (err) {
    page = await browser.newPage();
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    console.log('Navigating to Vol2Vol page...');
    await page.goto(VOL2VOL_URL, { waitUntil: 'networkidle', timeout: 90000 });
    console.log('Waiting for session to initialize...');
    await new Promise(r => setTimeout(r, 20000));

    // Find the iframe
    const qsFrame = page.frames().find((f: any) => f.url().includes('QuikStrikeView.aspx'));
    if (!qsFrame) {
      console.error('QuikStrike iframe not found!');
      await browser.close();
      return;
    }

    console.log('Found QuikStrike iframe at:', qsFrame.url());

    // Let's inspect the dropdown elements inside the iframe
    const dropdownsInfo = await qsFrame.evaluate(() => {
      // Find all select elements
      const selects = Array.from(document.querySelectorAll('select'));
      return selects.map(select => {
        const options = Array.from(select.querySelectorAll('option'));
        return {
          id: select.id,
          name: select.name,
          className: select.className,
          options: options.map(opt => ({
            text: opt.textContent?.trim(),
            value: opt.value,
            selected: opt.selected
          }))
        };
      });
    });

    console.log('Dropdowns inside QuikStrike iframe:');
    console.log(JSON.stringify(dropdownsInfo, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

main();
