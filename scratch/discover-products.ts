import * as fs from 'fs';
import * as path from 'path';

// Handle uncaught exceptions to prevent internal Playwright/Camoufox crashes from killing the script
process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) {
    return; // Suppress known Camoufox/Playwright bug
  }
  console.error('Uncaught:', err);
});
process.on('unhandledRejection', (reason) => {
  if (String(reason).includes('location.url')) return;
});

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const VOL2VOL_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

async function main() {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('Cookie file not found!');
    process.exit(1);
  }

  const { Camoufox } = await import('camoufox-js') as any;
  const browser = await Camoufox({ headless: true });
  
  try {
    const context = await browser.newContext({ storageState: COOKIES_PATH });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    console.log('Navigating to Vol2Vol...');
    await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('Waiting for load...');
    await new Promise(r => setTimeout(r, 15000));

    // Get the QuikStrike iframe
    const frames = page.frames();
    const qsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
    if (!qsFrame) {
      console.error('QuikStrike iframe not found!');
      return;
    }

    console.log(`Found iframe: ${qsFrame.url()}`);

    // Click the "Change product" button/link inside the iframe to open the popup
    console.log('Clicking product selector trigger...');
    await qsFrame.click('a[title="Change to any product"]');
    await new Promise(r => setTimeout(r, 2000));

    // Get all asset class links (e.g. Equity Indexes, Metals)
    const assetClasses = await qsFrame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.product-selector .groups a'));
      return links.map((l: any) => ({
        text: l.textContent.trim(),
        groupId: l.getAttribute('GroupId') || l.getAttribute('groupid')
      }));
    });

    console.log('Asset Classes:', assetClasses);

    // Loop through each asset class, click it, and list its products
    for (const ac of assetClasses) {
      console.log(`\n--- Clicking Asset Class: ${ac.text} (GroupId: ${ac.groupId}) ---`);
      
      // Click the asset class link
      await qsFrame.click(`.product-selector .groups a[GroupId="${ac.groupId}"], .product-selector .groups a[groupid="${ac.groupId}"]`);
      await new Promise(r => setTimeout(r, 2000));

      // Get list of products currently visible
      const products = await qsFrame.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.product-selector .products a'));
        return links.map((l: any) => ({
          text: l.textContent.trim(),
          title: l.getAttribute('title'),
          href: l.getAttribute('href'),
          productId: l.getAttribute('productid'),
          familyId: l.getAttribute('familyid')
        }));
      });

      console.log('Products:', products.map(p => `${p.text} (pid: ${p.productId}, pf: ${p.familyId})`));
    }

  } catch (err) {
    console.error('Error during discovery:', err);
  } finally {
    await browser.close();
  }
}

main();
