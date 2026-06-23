import { BaseScraper, ScraperErrorType } from './BaseScraper.js';
import { Symbol, Vol2VolSnapshotRecord, Vol2VolStrikeRecord } from '../types.js';
import { logger } from '../utils/logger.js';
import { humanDelay } from '../utils/Delay.js';
import { db } from '../db/client.js';
import { Vol2VolRepository } from '../db/repositories/Vol2VolRepository.js';
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const VOL2VOL_URL = 'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';
const OUTPUT_DIR = path.resolve('output/vol2vol');

const PRODUCT_MAPPING: Record<string, { name: string; pid: string; pf: string }> = {
  ES: { name: 'S&P 500', pid: '103', pf: '26' },
  NQ: { name: 'NASDAQ 100', pid: '121', pf: '26' },
  GC: { name: 'Gold', pid: '40', pf: '6' }
};

function formatToUSDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const year = parts[0];
  const month = parseInt(parts[1], 10).toString();
  const day = parseInt(parts[2], 10).toString();
  return `${month}/${day}/${year}`;
}

export class Vol2VolScraper extends BaseScraper {
  private repo: Vol2VolRepository;

  constructor(pool: any) {
    super(pool);
    this.repo = new Vol2VolRepository(db);
  }

  /**
   * Scrapes Vol2Vol data for a given symbol.
   */
  async scrape(symbol: string, tradeDate: string): Promise<{ recordsInserted: number; recordsSkipped: number; recordsInvalid: number }> {
    return this.retry(
      () => this.doScrape(symbol as Symbol, tradeDate),
      `Vol2VolScraper(${symbol})`,
      ScraperErrorType.TRANSIENT
    );
  }

  private async autoLogin(page: any): Promise<boolean> {
    const email = process.env.CME_EMAIL;
    const password = process.env.CME_PASSWORD;
    if (!email || !password) {
      logger.warn('[Vol2VolScraper] No CME credentials found in .env');
      return false;
    }

    logger.info('[Vol2VolScraper] Attempting auto-login using .env credentials...');
    try {
      await page.goto('https://www.cmegroup.com/', { waitUntil: 'domcontentloaded' });
      await humanDelay(3000, 5000);

      // Check if already logged in first
      const initiallyLoggedIn = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const loggedInIndicators = ['log out', 'logout', 'my account', 'my profile', 'sign out'];
        return loggedInIndicators.some(indicator => bodyText.toLowerCase().includes(indicator));
      }).catch(() => false);

      if (initiallyLoggedIn) {
        logger.info('[Vol2VolScraper] Already logged in according to page indicators.');
        return true;
      }

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const loginBtn = buttons.find((b: any) => b.textContent?.trim().toLowerCase() === 'log in');
        if (loginBtn) (loginBtn as HTMLElement).click();
      });

      logger.info('[Vol2VolScraper] Navigating to login page via homepage click...');
      await humanDelay(5000, 8000);

      let currentUrl = page.url();
      if (!currentUrl.includes('login.cmegroup.com') && !currentUrl.includes('/sso/login')) {
        logger.info('[Vol2VolScraper] Login button click did not navigate, going directly to login page...');
        await page.goto('https://login.cmegroup.com/sso/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await humanDelay(3000, 5000);
      }

      // Wait for login inputs to load
      const inputSelector = '#user, input[name="email"], input[name="username"], input[type="email"], input[id="email"], #signInName';
      try {
        await page.waitForSelector(inputSelector, { timeout: 15000 });
      } catch (err) {
        logger.warn('[Vol2VolScraper] Login inputs not found within 15s.');
      }

      const filledCredentials = await page.evaluate(({ email, password }: any) => {
        const results: string[] = [];

        const emailSelectors = ['#user', 'input[name="email"]', 'input[name="username"]', 'input[type="email"]', 'input[id="email"]', 'input[id="username"]', '#signInName'];
        let emailInput: any = null;
        for (const sel of emailSelectors) { emailInput = document.querySelector(sel); if (emailInput) break; }

        if (emailInput) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) nativeInputValueSetter.call(emailInput, email);
          else emailInput.value = email;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
          results.push('Email filled');
        }

        const passwordSelectors = ['#pwd', 'input[name="password"]', 'input[type="password"]', 'input[id="password"]', '#password'];
        let passwordInput: any = null;
        for (const sel of passwordSelectors) { passwordInput = document.querySelector(sel); if (passwordInput) break; }

        if (passwordInput) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) nativeInputValueSetter.call(passwordInput, password);
          else passwordInput.value = password;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          results.push('Password filled');

          setTimeout(() => {
            const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], #login-button, .login-button') as HTMLElement;
            if (submitBtn) submitBtn.click();
            else {
              const form = passwordInput?.closest('form');
              if (form) {
                const formBtn = form.querySelector('button, input[type="submit"]') as HTMLElement;
                if (formBtn) formBtn.click();
              }
            }
          }, 500);
        }
        return results;
      }, { email, password });

      logger.info('[Vol2VolScraper] Credentials submitted...', { results: filledCredentials });

      // Poll for login success (up to 30 seconds)
      let loggedIn = false;
      const loginCheckStart = Date.now();
      while (Date.now() - loginCheckStart < 30000) {
        const url = page.url();
        const hasLoggedInIndicator = await page.evaluate(() => {
          const bodyText = document.body?.innerText || '';
          const loggedInIndicators = ['log out', 'logout', 'my account', 'my profile', 'sign out'];
          return loggedInIndicators.some(indicator => bodyText.toLowerCase().includes(indicator));
        }).catch(() => false);

        if (!url.includes('login.cmegroup.com') && !url.includes('/sso/login') && (url.includes('cmegroup.com') || hasLoggedInIndicator)) {
          loggedIn = true;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (loggedIn) {
         logger.info('[Vol2VolScraper] Auto-login successful!');
         const ctx = page.context ? page.context() : null;
         if (ctx && typeof ctx.storageState === 'function') {
           const state = await ctx.storageState();
           if (!fs.existsSync(path.dirname(COOKIES_PATH))) fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
           fs.writeFileSync(COOKIES_PATH, JSON.stringify(state, null, 2));
           logger.info('[Vol2VolScraper] New cookies saved');
         }
         return true;
      }
      logger.warn('[Vol2VolScraper] Login timeout or still on login page. URL: ' + page.url());
      return false;
    } catch (e) {
      logger.warn('[Vol2VolScraper] Auto-login failed', { error: String(e) });
      return false;
    }
  }

  private async doScrape(symbol: Symbol, tradeDate: string): Promise<{ recordsInserted: number; recordsSkipped: number; recordsInvalid: number }> {
    const prod = PRODUCT_MAPPING[symbol];
    if (!prod) {
      throw new Error(`Symbol ${symbol} is not mapped in Vol2VolScraper`);
    }

    const todayStr = format(new Date(), 'yyyyMMdd');
    const page = await this.pool.acquire();
    const rawPage = page as any;

    try {
      // 1. Inject saved cookies into the browser context if available
      const context = rawPage.context ? rawPage.context() : null;
      if (context && context.addCookies && fs.existsSync(COOKIES_PATH)) {
        const storageState = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
        if (storageState.cookies && Array.isArray(storageState.cookies)) {
          await context.addCookies(storageState.cookies);
          logger.info(`[Vol2VolScraper] Injected ${storageState.cookies.length} session cookies into page context`);
        }
      } else {
        logger.warn(`[Vol2VolScraper] Cookie file not found at ${COOKIES_PATH}. Scraping might fail if session is required.`);
      }

      // 2. Navigate to Wrapper URL to establish/verify session and extract insid/qsid
      logger.info(`[Vol2VolScraper] Navigating to CME Vol2Vol wrapper URL: ${VOL2VOL_URL}`);
      await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded' });
      
      // Poll up to 30 seconds for the QuikStrike iframe to load AND for session params to be present
      let qsFrame = null;
      let insid = null;
      let qsid = null;
      const iframeWaitStart = Date.now();
      
      while (Date.now() - iframeWaitStart < 30000) {
        const frames = rawPage.frames ? rawPage.frames() : [];
        qsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
        if (qsFrame) {
          const frameUrl = qsFrame.url();
          if (frameUrl && frameUrl !== 'about:blank') {
            try {
              const urlObj = new URL(frameUrl);
              insid = urlObj.searchParams.get('insid');
              qsid = urlObj.searchParams.get('qsid');
              if (insid && qsid) {
                break;
              }
            } catch (err) {
              // ignore malformed URLs
            }
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!qsFrame || !insid || !qsid) {
        logger.warn('[Vol2VolScraper] QuikStrike iframe or session not found. Session might be expired. Triggering auto-login...');
        const loggedIn = await this.autoLogin(page);
        if (loggedIn) {
          logger.info('[Vol2VolScraper] Returning to wrapper URL after successful login...');
          await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded' });
          
          // Poll again after login
          const postLoginWaitStart = Date.now();
          while (Date.now() - postLoginWaitStart < 30000) {
            const frames = rawPage.frames ? rawPage.frames() : [];
            qsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
            if (qsFrame) {
              const frameUrl = qsFrame.url();
              if (frameUrl && frameUrl !== 'about:blank') {
                try {
                  const urlObj = new URL(frameUrl);
                  insid = urlObj.searchParams.get('insid');
                  qsid = urlObj.searchParams.get('qsid');
                  if (insid && qsid) {
                    break;
                  }
                } catch (err) {}
              }
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      let directUrl = `https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedV2VExpectedRange&pid=${prod.pid}&pf=${prod.pf}`;
      const gotoOptions: any = { waitUntil: 'domcontentloaded' };

      if (!qsFrame || !insid || !qsid) {
        logger.warn('[Vol2VolScraper] QuikStrike iframe still not found. Proceeding with direct navigation fallback using Referer.');
        gotoOptions.referer = VOL2VOL_URL;
      } else {
        logger.info(`[Vol2VolScraper] Session active: insid=${insid}, qsid=${qsid}`);
        directUrl += `&insid=${insid}&qsid=${qsid}`;
      }

      // 3. Navigate directly to direct view
      try {
        // Stop current wrapper page loading and navigate to about:blank to avoid NS_BINDING_ABORTED
        try {
          await page.evaluate(() => window.stop()).catch(() => {});
          await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 } as any).catch(() => {});
        } catch {}

        logger.info(`[Vol2VolScraper] Navigating directly to direct view: ${directUrl}`);
        await page.goto(directUrl, gotoOptions);
      } catch (err: any) {
        logger.warn(`[Vol2VolScraper] Direct navigation failed: ${err.message}. Clearing cookies and retrying login...`);
        
        if (context && typeof context.clearCookies === 'function') {
          await context.clearCookies();
        }
        
        if (fs.existsSync(COOKIES_PATH)) {
          try {
            fs.unlinkSync(COOKIES_PATH);
            logger.info(`[Vol2VolScraper] Deleted expired cookies file at ${COOKIES_PATH}`);
          } catch (unlinkErr) {
            logger.warn(`[Vol2VolScraper] Failed to delete cookie file: ${unlinkErr}`);
          }
        }
        
        const loggedIn = await this.autoLogin(page);
        if (!loggedIn) {
          throw new Error(`[Vol2VolScraper] Re-login failed after navigation error: ${err.message}`);
        }
        
        logger.info('[Vol2VolScraper] Returning to wrapper URL after successful re-login...');
        await page.goto(VOL2VOL_URL, { waitUntil: 'domcontentloaded' });
        
        // Poll for iframe again after re-login
        let newQsFrame = null;
        let newInsid = null;
        let newQsid = null;
        const reLoginIframeWaitStart = Date.now();
        while (Date.now() - reLoginIframeWaitStart < 30000) {
          const frames = rawPage.frames ? rawPage.frames() : [];
          newQsFrame = frames.find((f: any) => f.url().includes('QuikStrikeView.aspx'));
          if (newQsFrame) {
            const frameUrl = newQsFrame.url();
            if (frameUrl && frameUrl !== 'about:blank') {
              try {
                const urlObj = new URL(frameUrl);
                newInsid = urlObj.searchParams.get('insid');
                newQsid = urlObj.searchParams.get('qsid');
                if (newInsid && newQsid) {
                  break;
                }
              } catch (err) {}
            }
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        
        directUrl = `https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedV2VExpectedRange&pid=${prod.pid}&pf=${prod.pf}`;
        const newGotoOptions: any = { waitUntil: 'domcontentloaded' };
        
        if (!newQsFrame || !newInsid || !newQsid) {
          logger.warn('[Vol2VolScraper] QuikStrike iframe still not found after re-login. Proceeding with direct navigation fallback using Referer.');
          newGotoOptions.referer = VOL2VOL_URL;
        } else {
          logger.info(`[Vol2VolScraper] Session active after re-login: insid=${newInsid}, qsid=${newQsid}`);
          directUrl += `&insid=${newInsid}&qsid=${newQsid}`;
        }
        
        try {
          await page.evaluate(() => window.stop()).catch(() => {});
          await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 } as any).catch(() => {});
        } catch {}

        logger.info(`[Vol2VolScraper] Retrying direct navigation: ${directUrl}`);
        await page.goto(directUrl, newGotoOptions);
      }
      await humanDelay(8000, 12000); // Wait for chart scripts to fully render

      // Dynamic Expiry selection: Find and switch to the contract expiring on tradeDate if available
      const usDate = formatToUSDate(tradeDate);
      logger.info(`[Vol2VolScraper] Checking for contract expiring on ${tradeDate} (${usDate})...`);
      const postbackArg = await page.evaluate((targetDate: string) => {
        const links = Array.from(document.querySelectorAll('#ctl00_ucSelector_pnlExpirations a'));
        for (const el of links) {
          const title = el.getAttribute('title') || '';
          const cleanTitle = title.replace(/\s+/g, ' ');
          if (cleanTitle.includes(`Option Expiration: ${targetDate}`) || cleanTitle.includes(`Option Expiration:\t${targetDate}`)) {
            const href = el.getAttribute('href') || '';
            const match = href.match(/__doPostBack\('([^']*)'/);
            if (match) return match[1];
          }
        }
        return null;
      }, usDate);

      if (postbackArg) {
        logger.info(`[Vol2VolScraper] Found matching contract. Triggering postback: ${postbackArg}`);
        try {
          await Promise.all([
            (page as any).waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {
              // Asynchronous postback (UpdatePanel) might not trigger a full page navigation,
              // so a timeout is expected. We will wait a few seconds after postback instead.
              logger.debug('[Vol2VolScraper] Postback navigation promise resolved or timed out (expected for UpdatePanel).');
            }),
            page.evaluate((arg: string) => {
              const theForm = (document.forms as any)['Form1'] || (document as any).Form1;
              if (theForm) {
                let targetInput = theForm.elements['__EVENTTARGET'] || theForm['__EVENTTARGET'];
                if (!targetInput) {
                  targetInput = document.createElement('input');
                  targetInput.type = 'hidden';
                  targetInput.name = '__EVENTTARGET';
                  theForm.appendChild(targetInput);
                }
                let argInput = theForm.elements['__EVENTARGUMENT'] || theForm['__EVENTARGUMENT'];
                if (!argInput) {
                  argInput = document.createElement('input');
                  argInput.type = 'hidden';
                  argInput.name = '__EVENTARGUMENT';
                  theForm.appendChild(argInput);
                }
                
                targetInput.value = arg;
                argInput.value = '';
                theForm.submit();
                return true;
              }
              return false;
            }, postbackArg)
          ]);
          logger.info('[Vol2VolScraper] Postback triggered. Waiting for new chart data...');
          await humanDelay(8000, 12000);
        } catch (postbackErr) {
          logger.error('[Vol2VolScraper] Error executing contract postback:', { error: String(postbackErr) });
        }
      } else {
        logger.info(`[Vol2VolScraper] No option contract found expiring on ${tradeDate} in selector. Continuing with default.`);
      }

      // Extract JSONSettings string from raw page source
      const html = rawPage.content ? await rawPage.content() : await page.evaluate(() => document.documentElement.outerHTML);
      const jsonSettingsRegex = /"JSONSettings"\s*:\s*"({[\s\S]*?})"\s*}/;
      const match = html.match(jsonSettingsRegex);

      if (!match) {
        // Take a screenshot of the failure for diagnostic purposes
        await this.screenshotOnError(page, symbol, 'settings_missing');
        throw new Error(`[Vol2VolScraper] JSONSettings script block not found for ${symbol}`);
      }

      const unescaped = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const settings = JSON.parse(unescaped);

      // 4. Parse JSON settings
      const futurePrice = settings.FuturePrice;
      const atmVolatility = settings.ATMVol || 0;
      const dte = settings.DTE || 0;
      const contractTitle = settings.Title || `${symbol} Expected Range`;
      const productName = settings.Product?.Name || prod.name;

      if (!futurePrice) {
        throw new Error(`[Vol2VolScraper] Future price not found in scraped settings for ${symbol}`);
      }

      // Process standard deviations
      const sdRanges: Record<number, { downStart: number; downEnd: number; upStart: number; upEnd: number }> = {};
      if (settings.Ranges && Array.isArray(settings.Ranges.data)) {
        const ranges = settings.Ranges.data;
        const groupedRanges: Record<number, any[]> = {};
        
        ranges.forEach((r: any) => {
          const rangeNum = r.Tag?.Range;
          if (rangeNum !== undefined) {
            if (!groupedRanges[rangeNum]) groupedRanges[rangeNum] = [];
            groupedRanges[rangeNum].push(r);
          }
        });

        for (const [sdStr, items] of Object.entries(groupedRanges)) {
          const sdNum = parseInt(sdStr, 10);
          if (items.length >= 2) {
            items.sort((a, b) => (a.x || 0) - (b.x || 0));
            const downsideItem = items[0];
            const upsideItem = items[1];

            sdRanges[sdNum] = {
              downStart: downsideItem.x || 0,
              downEnd: downsideItem.x2 || 0,
              upStart: upsideItem.x || 0,
              upEnd: upsideItem.x2 || 0
            };
          }
        }
      }

      // Get specific SD values (Fallback to ATM spot if not found)
      const sd1_down = sdRanges[1]?.downStart || (futurePrice * 0.99);
      const sd1_up = sdRanges[1]?.upEnd || (futurePrice * 1.01);
      const sd2_down = sdRanges[2]?.downStart || (futurePrice * 0.98);
      const sd2_up = sdRanges[2]?.upEnd || (futurePrice * 1.02);
      const sd3_down = sdRanges[3]?.downStart || (futurePrice * 0.97);
      const sd3_up = sdRanges[3]?.upEnd || (futurePrice * 1.03);

      // Match Expiry Date from settings if available (e.g. from Title or active contract)
      // Standard title often contains contract month code like "E4BK6"
      // Vol2Vol DTE can help estimate expiry date: tradeDate + DTE
      const parsedDteDays = Math.ceil(dte);
      const expDate = new Date(tradeDate);
      expDate.setDate(expDate.getDate() + parsedDteDays);
      const expiryDateStr = expDate.toISOString().split('T')[0];

      // Parse strike details
      const strikeDataMap: Record<number, { strike: number; callVolume: number; putVolume: number; impliedVol: number | null; settleVol: number | null }> = {};
      
      const getOrCreateStrike = (strike: number) => {
        if (!strikeDataMap[strike]) {
          strikeDataMap[strike] = { strike, callVolume: 0, putVolume: 0, impliedVol: null, settleVol: null };
        }
        return strikeDataMap[strike];
      };

      if (settings.Call && Array.isArray(settings.Call.data)) {
        settings.Call.data.forEach((item: any) => {
          if (item.x !== undefined) getOrCreateStrike(item.x).callVolume = item.y || 0;
        });
      }
      if (settings.Put && Array.isArray(settings.Put.data)) {
        settings.Put.data.forEach((item: any) => {
          if (item.x !== undefined) getOrCreateStrike(item.x).putVolume = item.y || 0;
        });
      }
      if (settings.Vol && Array.isArray(settings.Vol.data)) {
        settings.Vol.data.forEach((item: any) => {
          if (item.x !== undefined) getOrCreateStrike(item.x).impliedVol = item.y !== undefined ? item.y : null;
        });
      }
      if (settings.VolSettle && Array.isArray(settings.VolSettle.data)) {
        settings.VolSettle.data.forEach((item: any) => {
          if (item.x !== undefined) getOrCreateStrike(item.x).settleVol = item.y !== undefined ? item.y : null;
        });
      }

      const strikeRecords = Object.values(strikeDataMap).map((s) => ({
        strike: s.strike,
        call_volume: s.callVolume,
        put_volume: s.putVolume,
        implied_vol: s.impliedVol,
        settle_vol: s.settleVol
      }));

      // 5. Save snapshot to PostgreSQL
      const snapshot: Omit<Vol2VolSnapshotRecord, 'id' | 'fetched_at'> = {
        trade_date: tradeDate,
        symbol,
        future_price: futurePrice,
        atm_volatility: atmVolatility,
        dte,
        sd1_down,
        sd1_up,
        sd2_down,
        sd2_up,
        sd3_down,
        sd3_up,
        expiry_date: expiryDateStr,
        contract_title: contractTitle
      };

      await this.repo.saveVol2VolData(snapshot, strikeRecords);

      // 6. Write JSON files to output directory for backwards compatibility with the existing Express Dashboard
      await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
      
      const fileData = {
        symbol,
        productName,
        title: contractTitle,
        futurePrice,
        atmVolatility,
        dte,
        standardDeviations: Object.entries(sdRanges).map(([sdStr, r]) => ({
          sd: parseInt(sdStr, 10),
          downside: { width: futurePrice - r.downStart, strikeStart: r.downStart, strikeEnd: r.downEnd },
          upside: { width: r.upEnd - futurePrice, strikeStart: r.upStart, strikeEnd: r.upEnd }
        })),
        strikeData: Object.values(strikeDataMap).map((s) => ({
          strike: s.strike,
          callVolume: s.callVolume,
          putVolume: s.putVolume,
          totalVolume: s.callVolume + s.putVolume,
          impliedVol: s.impliedVol,
          settleVol: s.settleVol
        })),
        scrapedAt: new Date().toISOString()
      };

      // Write dated file
      const cleanFilePath = path.join(OUTPUT_DIR, `vol2vol_${symbol}_${todayStr}.json`);
      fs.writeFileSync(cleanFilePath, JSON.stringify(fileData, null, 2));

      // Update consolidated summary latest file
      const summaryFileLatest = path.join(OUTPUT_DIR, 'vol2vol_summary_latest.json');
      let existingSummary: any = { fetchDate: new Date().toISOString(), scrapedSymbols: [], data: {} };
      if (fs.existsSync(summaryFileLatest)) {
        try {
          existingSummary = JSON.parse(fs.readFileSync(summaryFileLatest, 'utf-8'));
        } catch {
          // ignore parsing error
        }
      }
      existingSummary.fetchDate = new Date().toISOString();
      if (!existingSummary.scrapedSymbols.includes(symbol)) {
        existingSummary.scrapedSymbols.push(symbol);
      }
      existingSummary.data[symbol] = fileData;
      fs.writeFileSync(summaryFileLatest, JSON.stringify(existingSummary, null, 2));

      logger.info(`[Vol2VolScraper] Scraped and saved Vol2Vol data for ${symbol} to disk.`);

      return {
        recordsInserted: strikeRecords.length + 1,
        recordsSkipped: 0,
        recordsInvalid: 0
      };

    } finally {
      await this.pool.release(page);
    }
  }
}
