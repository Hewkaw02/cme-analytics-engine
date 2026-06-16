import 'dotenv/config';
import { Camoufox } from 'camoufox-js';
import * as fs from 'fs';

async function main() {
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to homepage...');
  await page.goto('https://www.cmegroup.com/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('Clicking login...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const loginBtn = buttons.find((b: any) => b.textContent?.trim().toLowerCase() === 'log in');
    if (loginBtn) (loginBtn as HTMLElement).click();
  });
  
  await new Promise(r => setTimeout(r, 5000));
  console.log('Current URL after click:', page.url());
  
  const content = await page.content();
  fs.writeFileSync('d:/GetDataCMEBoy/output/login_page.html', content);
  
  await browser.close();
}
main();
