import * as fs from 'fs';
import * as path from 'path';

process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) return;
  console.error('Uncaught:', err);
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

    console.log('Navigating to Vol2Vol...');
    await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('Waiting for initial load...');
    await new Promise(r => setTimeout(r, 15000));

    const frames = page.frames();
    const qsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
    if (!qsFrame) {
      console.error('QuikStrike iframe not found!');
      return;
    }

    // Open popup
    console.log('Clicking product selector trigger...');
    await qsFrame.click('a[title="Change to any product"]');
    await new Promise(r => setTimeout(r, 3000));

    // Get asset classes
    const assetClasses = await qsFrame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.product-selector .groups a'));
      return links.map((l: any) => ({
        text: l.textContent.trim(),
        groupId: l.getAttribute('GroupId') || l.getAttribute('groupid')
      }));
    });

    console.log('Asset Classes:', assetClasses);

    // Let's print products for Agriculture first BEFORE clicking anything, to see if attributes are present initially
    const initialProducts = await qsFrame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.product-selector .products a'));
      return links.map((l: any) => ({
        text: l.textContent.trim(),
        attrs: Array.from(l.attributes).map((a: any) => ({ name: a.name, value: a.value }))
      }));
    });
    console.log('Initial Products (Agriculture):', JSON.stringify(initialProducts, null, 2));

    // Now click Equity Indexes (GroupId: 3)
    console.log('Clicking Equity Indexes (GroupId: 3)...');
    await qsFrame.click('.product-selector .groups a[GroupId="3"], .product-selector .groups a[groupid="3"]');
    await new Promise(r => setTimeout(r, 4000));

    const equityProducts = await qsFrame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.product-selector .products a'));
      return links.map((l: any) => ({
        text: l.textContent.trim(),
        attrs: Array.from(l.attributes).map((a: any) => ({ name: a.name, value: a.value }))
      }));
    });
    console.log('Equity Products:', JSON.stringify(equityProducts, null, 2));

    // Click Metals (GroupId: 6)
    console.log('Clicking Metals (GroupId: 6)...');
    await qsFrame.click('.product-selector .groups a[GroupId="6"], .product-selector .groups a[groupid="6"]');
    await new Promise(r => setTimeout(r, 4000));

    const metalsProducts = await qsFrame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.product-selector .products a'));
      return links.map((l: any) => ({
        text: l.textContent.trim(),
        attrs: Array.from(l.attributes).map((a: any) => ({ name: a.name, value: a.value }))
      }));
    });
    console.log('Metals Products:', JSON.stringify(metalsProducts, null, 2));

  } catch (err) {
    console.error('Error during discovery:', err);
  } finally {
    await browser.close();
  }
}

main();
