import 'dotenv/config';
import { Camoufox } from 'camoufox-js';
import * as fs from 'fs';

async function main() {
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to login...');
  await page.goto('https://login.cmegroup.com/sso/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  
  const content = await page.content();
  fs.writeFileSync('d:/GetDataCMEBoy/output/login_page.html', content);
  console.log('Saved page content.');

  // Also check frames
  const frames = page.frames();
  for (const f of frames) {
     console.log('Frame URL:', f.url());
  }

  await browser.close();
}
main();
