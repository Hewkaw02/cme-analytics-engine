import { BrowserPool } from './src/browser/BrowserPool.js';
import * as fs from 'fs';
import * as path from 'path';

// Handle uncaught exceptions to prevent internal Playwright/Camoufox crashes from killing the script
process.on('uncaughtException', (err) => {
  console.log(`[Caught Uncaught Exception] ${err.name}: ${err.message}`);
  // If it is the specific playwright error, ignore it
  if (err.stack && err.stack.includes('playwright-core') && err.stack.includes('location.url')) {
    console.log('Suppressing Playwright location.url crash...');
    return;
  }
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('[Caught Unhandled Rejection] Reason:', reason);
});

async function investigateVol2Vol() {
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1440, height: 900 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  console.log('1. Navigating to Vol2Vol Expected Range tool...');
  
  const apiCalls: { url: string, method: string, type: string, status?: number }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const type = response.request().resourceType();
    
    // We are looking for any fetch/xhr or quikstrike related requests
    if (type === 'fetch' || type === 'xhr' || url.includes('quikstrike')) {
      apiCalls.push({ 
        url, 
        method: response.request().method(), 
        type,
        status: response.status()
      });
      console.log(`[HTTP ${response.status()}] ${response.request().method()} - ${type} - ${url.slice(0, 150)}`);
    }
  });

  try {
    // Navigate to the tool page
    await page.goto('https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html', { 
      waitUntil: 'networkidle', 
      timeout: 90000 
    });
    console.log('2. Page loaded.');

    // Wait a bit to ensure everything (including frames) is loaded
    await new Promise(r => setTimeout(r, 15000));

    // Get iframe elements and other info
    const pageDetails = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const iframeInfo = iframes.map(iframe => ({
        id: iframe.id,
        src: iframe.src,
        className: iframe.className,
        name: iframe.name
      }));
      
      const bodyText = document.body.innerText;
      const buttons = Array.from(document.querySelectorAll('button, a')).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim(),
        id: el.id,
        href: (el as any).href
      })).filter(el => el.text && el.text.length > 0 && el.text.length < 50);

      return {
        iframeInfo,
        bodyTextSnippet: bodyText.slice(0, 1000),
        buttons: buttons.slice(0, 30)
      };
    });

    console.log('\n=== PAGE DETAILS ===');
    console.log('Iframes:', JSON.stringify(pageDetails.iframeInfo, null, 2));
    console.log('Body Text Snippet (first 1000 chars):');
    console.log(pageDetails.bodyTextSnippet);
    console.log('Buttons/Links:', JSON.stringify(pageDetails.buttons, null, 2));
    console.log('=====================\n');

    // Take a screenshot to visualize
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const screenshotPath = path.resolve('output/vol2vol_screenshot.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, screenshotBuffer);
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Print all api calls summary
    console.log('\n=== XHR/FETCH/QUIKSTRIKE CALLS ===');
    apiCalls.forEach(call => {
      console.log(`- [${call.status}] ${call.method} (${call.type}): ${call.url}`);
    });
    console.log('==================================\n');

  } catch (err) {
    console.error('Error during Vol2Vol investigation:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

investigateVol2Vol();
