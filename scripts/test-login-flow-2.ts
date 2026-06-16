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
  
  console.log('Waiting for #user selector...');
  try {
    await page.waitForSelector('#user', { timeout: 15000 });
    console.log('#user found!');
  } catch (e) {
    console.log('Timeout waiting for #user. Current URL:', page.url());
    fs.writeFileSync('d:/GetDataCMEBoy/output/login_failed.html', await page.content());
    await browser.close();
    return;
  }
  
  const email = process.env.CME_EMAIL || 'test';
  const password = process.env.CME_PASSWORD || 'test';
  
  const results = await page.evaluate(({ email, password }) => {
    const res: string[] = [];
    const user = document.querySelector('#user') as HTMLInputElement;
    const pwd = document.querySelector('#pwd') as HTMLInputElement;
    const btn = document.querySelector('#loginBtn') as HTMLButtonElement;
    
    if (user) {
      user.value = email;
      user.dispatchEvent(new Event('input', { bubbles: true }));
      user.dispatchEvent(new Event('change', { bubbles: true }));
      res.push('User filled');
    }
    if (pwd) {
      pwd.value = password;
      pwd.dispatchEvent(new Event('input', { bubbles: true }));
      pwd.dispatchEvent(new Event('change', { bubbles: true }));
      res.push('Pwd filled');
    }
    if (btn) {
      setTimeout(() => btn.click(), 500);
      res.push('Btn clicked');
    }
    return res;
  }, { email, password });
  
  console.log('Evaluate results:', results);
  
  console.log('Waiting for login to complete...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('Final URL:', page.url());
  
  await browser.close();
}
main();
