/**
 * CME Group Interactive Login Helper
 * 
 * Opens a visible browser window, auto-fills credentials,
 * waits for the user to complete MFA, then saves the session
 * cookies to config/cme-cookies.json for headless reuse.
 * 
 * Usage: npx tsx scripts/cme-login.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const CME_EMAIL = process.env.CME_EMAIL || '';
const CME_PASSWORD = process.env.CME_PASSWORD || '';
const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const LOGIN_URL = 'https://www.cmegroup.com/';
const LOGGED_IN_INDICATOR_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

async function main() {
  console.log('=== CME Group Interactive Login Helper ===\n');

  if (!CME_EMAIL || !CME_PASSWORD) {
    console.error('❌ CME_EMAIL and CME_PASSWORD must be configured in your .env file!');
    process.exit(1);
  }

  // Dynamically import camoufox-js
  const { Camoufox } = await import('camoufox-js') as any;

  console.log('1. Launching visible browser (headless: false)...');
  const browser = await Camoufox({ headless: false });
  const context = browser.contexts?.()[0] ?? browser;
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    // Step 1: Navigate to CME homepage
    console.log('2. Navigating to CME Group homepage...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Click "Log In" button on the homepage
    console.log('3. Clicking "Log In" button...');
    const loginClicked = await page.evaluate(() => {
      // Look for the Log In button in the top nav
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const loginBtn = buttons.find((b: any) => {
        const text = b.textContent?.trim().toLowerCase();
        return text === 'log in' || text === 'login';
      });
      if (loginBtn) {
        (loginBtn as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (loginClicked) {
      console.log('   ✓ Login button clicked');
    } else {
      console.log('   ⚠ Could not find Login button, navigating directly to login page...');
      await page.goto('https://login.cmegroup.com/sso/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    await new Promise(r => setTimeout(r, 5000));

    // Step 3: Try to fill in the email/username field
    console.log('4. Attempting to auto-fill credentials...');
    const filledCredentials = await page.evaluate(({ email, password }) => {
      const results: string[] = [];

      // Try common selectors for email/username input
      const emailSelectors = [
        '#user',
        'input[name="email"]',
        'input[name="username"]',
        'input[name="loginName"]',
        'input[type="email"]',
        'input[id="email"]',
        'input[id="username"]',
        'input[id="loginName"]',
        '#signInName',
        'input[placeholder*="email" i]',
        'input[placeholder*="user" i]',
      ];

      let emailInput: HTMLInputElement | null = null;
      for (const sel of emailSelectors) {
        emailInput = document.querySelector(sel);
        if (emailInput) {
          results.push(`Found email input: ${sel}`);
          break;
        }
      }

      // Check inside iframes too
      if (!emailInput) {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) continue;
            for (const sel of emailSelectors) {
              emailInput = iframeDoc.querySelector(sel);
              if (emailInput) {
                results.push(`Found email input in iframe: ${sel}`);
                break;
              }
            }
            if (emailInput) break;
          } catch {
            // cross-origin iframe, skip
          }
        }
      }

      if (emailInput) {
        // Use native setter to bypass React/Angular controlled inputs
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(emailInput, email);
        } else {
          emailInput.value = email;
        }
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        results.push('Email filled');
      } else {
        results.push('Email input NOT found');
      }

      // Try common selectors for password input
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[id="password"]',
        '#password',
      ];

      let passwordInput: HTMLInputElement | null = null;
      for (const sel of passwordSelectors) {
        passwordInput = document.querySelector(sel);
        if (passwordInput) {
          results.push(`Found password input: ${sel}`);
          break;
        }
      }

      // Check inside iframes too
      if (!passwordInput) {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) continue;
            for (const sel of passwordSelectors) {
              passwordInput = iframeDoc.querySelector(sel);
              if (passwordInput) {
                results.push(`Found password input in iframe: ${sel}`);
                break;
              }
            }
            if (passwordInput) break;
          } catch {
            // cross-origin iframe, skip
          }
        }
      }

      if (passwordInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(passwordInput, password);
        } else {
          passwordInput.value = password;
        }
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        results.push('Password filled');

        // Attempt to auto-submit
        setTimeout(() => {
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], #login-button, .login-button') as HTMLElement;
          if (submitBtn) {
            submitBtn.click();
            results.push('Submit button clicked automatically');
          } else {
            // check within form
            const form = passwordInput?.closest('form');
            if (form) {
              const formBtn = form.querySelector('button, input[type="submit"]') as HTMLElement;
              if (formBtn) {
                formBtn.click();
                results.push('Submit button inside form clicked automatically');
              }
            }
          }
        }, 500);

      } else {
        results.push('Password input NOT found');
      }

      return results;
    }, { email: CME_EMAIL, password: CME_PASSWORD });

    console.log('   Auto-fill results:');
    for (const r of filledCredentials) {
      console.log(`   - ${r}`);
    }

    // Step 4: Wait for the user to complete MFA and login
    console.log('\n' + '='.repeat(60));
    console.log('  ⚠️  ACTION REQUIRED: Complete the login in the browser window');
    console.log('  ');
    console.log('  If credentials were not auto-filled, please type them manually.');
    console.log('  Complete any MFA / CAPTCHA challenge that appears.');
    console.log('  ');
    console.log('  The script will detect when you are logged in and save cookies.');
    console.log('='.repeat(60) + '\n');

    // Poll until we detect successful login
    // We check by navigating to the Vol2Vol page and seeing if the login wall is gone
    let loggedIn = false;
    const maxWaitMs = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    const pollIntervalMs = 5000;

    while (!loggedIn && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      // Check if the URL has moved away from the login subdomain
      const currentUrl = page.url();
      
      const isLoggedIn = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const loggedInIndicators = ['log out', 'logout', 'my account', 'my profile', 'sign out'];
        return loggedInIndicators.some(indicator => bodyText.toLowerCase().includes(indicator));
      }).catch(() => false);

      if (!currentUrl.includes('login.cmegroup.com') && currentUrl.includes('cmegroup.com') && !currentUrl.includes('/sso/login')) {
        loggedIn = true;
        console.log(`   ✓ Login detected via URL change to: ${currentUrl}`);
      } else if (isLoggedIn) {
        loggedIn = true;
        console.log('   ✓ Login detected via page text!');
      } else {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r   ⏳ Waiting for login... (${elapsed}s elapsed)`);
      }
    }

    if (!loggedIn) {
      console.log('\n   ⚠ Timeout waiting for login detection.');
      console.log('   Attempting to save cookies anyway (you may be logged in on a different tab)...');
    }

    // Step 5: Navigate to Vol2Vol to confirm access, then save cookies
    console.log('\n5. Navigating to Vol2Vol to confirm access...');
    await page.goto(LOGGED_IN_INDICATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));

    // Take a confirmation screenshot
    const screenshotPath = path.resolve('output/cme_login_confirmation.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const screenshotBuf = await page.screenshot({ fullPage: false });
    fs.writeFileSync(screenshotPath, screenshotBuf);
    console.log(`   Screenshot saved: ${screenshotPath}`);

    // Step 6: Save cookies
    console.log('6. Saving session cookies...');
    fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });

    // Get cookies from the browser context
    const ctx = page.context();
    if (ctx && typeof ctx.storageState === 'function') {
      const state = await ctx.storageState();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(state, null, 2));
      console.log(`   ✓ Cookies saved to: ${COOKIES_PATH}`);
      console.log(`   ✓ Total cookies: ${state.cookies?.length ?? 'unknown'}`);
    } else {
      // Fallback: extract cookies via CDP or evaluate
      const cookies = await page.evaluate(() => {
        return document.cookie;
      });
      const cookieData = { cookies: cookies, timestamp: new Date().toISOString() };
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookieData, null, 2));
      console.log(`   ✓ Cookies saved (fallback method) to: ${COOKIES_PATH}`);
    }

    console.log('\n=== Login Complete ===');
    console.log('You can now run the Vol2Vol scraper:');
    console.log('  npx tsx scripts/fetch-vol2vol.ts\n');

  } catch (err) {
    console.error('\n❌ Error during login process:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close().catch(() => {});
  }
}

// Handle uncaught exceptions from Playwright internals
process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) {
    return; // Suppress known Camoufox/Playwright bug
  }
  console.error('Uncaught:', err);
});
process.on('unhandledRejection', (reason) => {
  if (String(reason).includes('location.url')) return;
});

main();
