/**
 * CME Vol2Vol Expected Range Scraper
 * 
 * Uses saved session cookies from cme-login.ts to access the
 * QuikStrike Vol2Vol Expected Range tool headlessly.
 * Intercepts network traffic to capture the underlying data feed.
 * 
 * Usage: npx tsx scripts/fetch-vol2vol.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import {
  buildVol2VolToolUrl,
  VOL2VOL_WRAPPER_URL,
  type Vol2VolSessionParams,
} from '../src/scrapers/Vol2VolUrl.js';
import { writeSnapshotTextFileSync } from '../src/exporters/SnapshotFileWriter.js';

const COOKIES_PATH = path.resolve('config/cme-cookies.json');
const OUTPUT_DIR = path.resolve('output/vol2vol');

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

interface StandardDeviationRange {
  sd: number;
  downside: {
    width: number;
    strikeStart: number;
    strikeEnd: number;
  };
  upside: {
    width: number;
    strikeStart: number;
    strikeEnd: number;
  };
}

interface DeltaStrike {
  label: string;
  strike: number;
}

interface StrikeData {
  strike: number;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  impliedVol: number | null;
  settleVol: number | null;
}

interface ExtractedVol2VolData {
  symbol: string;
  productName: string;
  title: string;
  futurePrice: number;
  atmVolatility: number;
  dte: number;
  standardDeviations: StandardDeviationRange[];
  deltaStrikes: DeltaStrike[];
  strikeData: StrikeData[];
  scrapedAt: string;
}

async function main() {
  const runStartedAt = new Date();
  const today = format(runStartedAt, 'yyyyMMdd');
  console.log(`=== CME Vol2Vol Expected Range Scraper (${today}) ===\n`);

  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('❌ Cookie file not found at:', COOKIES_PATH);
    console.error('   Please run the login helper first:');
    console.error('   npx tsx scripts/cme-login.ts');
    process.exit(1);
  }

  const storageState = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  const cookieCount = storageState.cookies?.length ?? 0;
  console.log(`1. Loaded ${cookieCount} cookies from ${COOKIES_PATH}`);

  const { Camoufox } = await import('camoufox-js') as any;

  console.log('2. Launching headless browser...');
  const browser = await Camoufox({ headless: true });
  
  let context: any;
  let page: any;

  try {
    if (typeof browser.newContext === 'function') {
      context = await browser.newContext({ storageState: COOKIES_PATH });
      page = await context.newPage();
    } else {
      page = await browser.newPage();
      context = page.context();
      if (storageState.cookies && Array.isArray(storageState.cookies) && context.addCookies) {
        await context.addCookies(storageState.cookies);
      }
    }
  } catch (err) {
    console.log(`   ⚠ Context creation with storageState failed, using fallback...`);
    page = await browser.newPage();
    context = page.context();
    if (storageState.cookies && Array.isArray(storageState.cookies) && context.addCookies) {
      await context.addCookies(storageState.cookies);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  const productsToScrape = [
    { symbol: 'ZS', name: 'Soybeans', pid: '25', pf: '4' },
    { symbol: 'ES', name: 'S&P 500', pid: '103', pf: '26' },
    { symbol: 'NQ', name: 'NASDAQ 100', pid: '121', pf: '26' },
    { symbol: 'GC', name: 'Gold', pid: '40', pf: '6' }
  ];

  const scrapedSummary: Record<string, ExtractedVol2VolData> = {};

  async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, label = ''): Promise<T> {
    let lastError;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        console.warn(`   ⚠️ Retry ${i}/${maxRetries} for ${label} failed: ${err.message}`);
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 5000)); // wait 5s before retry
        }
      }
    }
    throw lastError;
  }

  try {
    console.log('3. Navigating to Vol2Vol wrapper on cmegroup.com...');
    let sessionParams: Vol2VolSessionParams | undefined;
    try {
      sessionParams = await withRetry(async () => {
        await page.goto(VOL2VOL_WRAPPER_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log('   Waiting 20 seconds for session initialization...');
        await new Promise(r => setTimeout(r, 20000));

        // Get the active frame URL to extract insid and qsid session parameters
        const qsFrame = page.frames().find((f: any) => f.url().includes('QuikStrikeView.aspx'));
        if (!qsFrame) {
          throw new Error('Could not find active QuikStrike iframe. Cookie session might have expired.');
        }

        const activeFrameUrl = qsFrame.url();
        const urlObj = new URL(activeFrameUrl);
        const insidParam = urlObj.searchParams.get('insid');
        const qsidParam = urlObj.searchParams.get('qsid');

        if (!insidParam || !qsidParam) {
          throw new Error('Could not extract active session identifiers (insid/qsid) from iframe URL.');
        }
        return { insid: insidParam, qsid: qsidParam };
      }, 3, 'Vol2Vol Wrapper Navigation');
    } catch (err: any) {
      console.warn(`   Wrapper session unavailable: ${err.message}`);
      console.warn('   Falling back to direct QuikStrike navigation with CME wrapper Referer.');
    }
    if (sessionParams) {
      console.log(
        `   Active Session Extracted (insid: ${sessionParams.insid}, qsid: ${sessionParams.qsid})`,
      );
    } else {
      console.log('   Using direct QuikStrike fallback for product pages.');
    }

    // Create raw output directory if it doesn't exist
    const rawDir = path.join(OUTPUT_DIR, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });

    // Scrape each product
    for (const prod of productsToScrape) {
      console.log(`\n4. Scraping ${prod.name} (${prod.symbol})...`);
      const directUrl = buildVol2VolToolUrl(prod, sessionParams);
      
      try {
        const settings = await withRetry(async () => {
          const gotoOptions: any = { waitUntil: 'domcontentloaded', timeout: 60000 };
          if (!sessionParams) {
            gotoOptions.referer = VOL2VOL_WRAPPER_URL;
          }
          await page.goto(directUrl, gotoOptions);
          // Wait for chart scripts to fully render
          await new Promise(r => setTimeout(r, 10000));

          const html = await page.content();
          const jsonSettingsRegex = /"JSONSettings"\s*:\s*"({[\s\S]*?})"\s*}/;
          const match = html.match(jsonSettingsRegex);

          if (!match) {
            throw new Error(`JSONSettings script block not found for ${prod.symbol}`);
          }

          const unescaped = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          return JSON.parse(unescaped);
        }, 3, `Fetch ${prod.symbol}`);

        // Save raw settings JSON
        const rawFilePath = path.join(rawDir, `vol2vol_raw_${prod.symbol}_${today}.json`);
        const rawSnapshot = writeSnapshotTextFileSync(rawFilePath, JSON.stringify(settings, null, 2), {
          snapshotTimestamp: runStartedAt,
        });
        console.log(`   Saved raw settings: ${rawFilePath}`);
        console.log(`   Archived raw settings: ${rawSnapshot.archivePath}`);

        // Parse extracted details
        const futurePrice = settings.FuturePrice;
        const atmVolatility = settings.ATMVol || 0;
        const dte = settings.DTE || 0;
        const title = settings.Title || `${prod.symbol} Expected Range`;
        const productName = settings.Product?.Name || prod.name;

        // Process standard deviation ranges
        const standardDeviations: StandardDeviationRange[] = [];
        if (settings.Ranges && Array.isArray(settings.Ranges.data)) {
          const ranges = settings.Ranges.data;
          
          // Group by SD level
          const groupedRanges: Record<number, any[]> = {};
          ranges.forEach((r: any) => {
            const rangeNum = r.Tag?.Range;
            if (rangeNum !== undefined) {
              if (!groupedRanges[rangeNum]) groupedRanges[rangeNum] = [];
              groupedRanges[rangeNum].push(r);
            }
          });

          // Process each SD level
          for (const [sdStr, items] of Object.entries(groupedRanges)) {
            const sd = parseInt(sdStr, 10);
            if (items.length >= 2) {
              // Sort by lower strike (x value) ascending so index 0 is downside and index 1 is upside
              items.sort((a, b) => (a.x || 0) - (b.x || 0));
              
              const downsideItem = items[0];
              const upsideItem = items[1];

              standardDeviations.push({
                sd,
                downside: {
                  width: parseFloat(downsideItem.dataLabels?.format || '0'),
                  strikeStart: downsideItem.x || 0,
                  strikeEnd: downsideItem.x2 || 0
                },
                upside: {
                  width: parseFloat(upsideItem.dataLabels?.format || '0'),
                  strikeStart: upsideItem.x || 0,
                  strikeEnd: upsideItem.x2 || 0
                }
              });
            }
          }
        }

        // Sort standard deviations by SD number ascending
        standardDeviations.sort((a, b) => a.sd - b.sd);

        // Process delta strikes
        const deltaStrikes: DeltaStrike[] = [];
        if (Array.isArray(settings.PlotLines)) {
          const filteredLines = settings.PlotLines.filter(
            (line: any) => line.label?.text && line.label.text !== `Future: ${futurePrice}`
          );
          
          filteredLines.forEach((line: any) => {
            deltaStrikes.push({
              label: line.label.text,
              strike: line.value || 0
            });
          });
        }

        // Process strike-level data (volumes and volatility)
        const strikeDataMap: Record<number, StrikeData> = {};
        
        const getOrCreateStrike = (strike: number) => {
          if (!strikeDataMap[strike]) {
            strikeDataMap[strike] = {
              strike, callVolume: 0, putVolume: 0, totalVolume: 0, impliedVol: null, settleVol: null
            };
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

        const strikeData: StrikeData[] = Object.keys(strikeDataMap)
          .map(Number)
          .sort((a, b) => a - b)
          .map(strike => {
            const entry = strikeDataMap[strike];
            entry.totalVolume = entry.callVolume + entry.putVolume;
            return entry;
          });

        const extractedData: ExtractedVol2VolData = {
          symbol: prod.symbol,
          productName,
          title,
          futurePrice,
          atmVolatility,
          dte,
          standardDeviations,
          deltaStrikes,
          strikeData,
          scrapedAt: new Date().toISOString()
        };

        // Save structured extracted JSON
        const cleanFilePath = path.join(OUTPUT_DIR, `vol2vol_${prod.symbol}_${today}.json`);
        const cleanSnapshot = writeSnapshotTextFileSync(cleanFilePath, JSON.stringify(extractedData, null, 2), {
          snapshotTimestamp: runStartedAt,
        });
        console.log(`   Saved structured data: ${cleanFilePath}`);
        console.log(`   Archived structured data: ${cleanSnapshot.archivePath}`);

        // Save screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `vol2vol_${prod.symbol}_${today}.png`);
        await page.screenshot({ path: screenshotPath });
        console.log(`   ✓ Saved screenshot: ${screenshotPath}`);

        // Keep copy in summary map
        scrapedSummary[prod.symbol] = extractedData;

        // Print quick console report
        console.log(`      Future Price: ${futurePrice} | ATM Vol: ${(atmVolatility * 100).toFixed(2)}% | DTE: ${dte.toFixed(2)}`);
        if (standardDeviations.length > 0) {
          const sd1 = standardDeviations.find(d => d.sd === 1);
          if (sd1) {
            console.log(`      1-SD Range: ${sd1.downside.strikeStart} to ${sd1.upside.strikeEnd} (Widths: -${sd1.downside.width} / +${sd1.upside.width})`);
          }
        }

      } catch (err: any) {
        console.error(`   ❌ Error scraping ${prod.symbol}:`, err.message);
      }
    }

    // Save summary files if we successfully scraped at least one instrument
    if (Object.keys(scrapedSummary).length > 0) {
      console.log('\n5. Saving consolidated summaries...');
      
      const summaryFileDated = path.join(OUTPUT_DIR, `vol2vol_summary_${today}.json`);
      const summaryFileLatest = path.join(OUTPUT_DIR, 'vol2vol_summary_latest.json');
      
      const summaryData = {
        fetchDate: new Date().toISOString(),
        scrapedSymbols: Object.keys(scrapedSummary),
        data: scrapedSummary
      };

      const summaryJson = JSON.stringify(summaryData, null, 2);
      const summarySnapshot = writeSnapshotTextFileSync(summaryFileDated, summaryJson, {
        snapshotTimestamp: runStartedAt,
      });
      fs.writeFileSync(summaryFileLatest, summaryJson);
      
      console.log(`   Summary saved to: ${summaryFileDated}`);
      console.log(`   Summary saved to: ${summaryFileLatest}`);
      console.log(`   Summary archived to: ${summarySnapshot.archivePath}`);
    } else {
      console.log('\n⚠️ No symbols were successfully scraped.');
    }

    console.log('\n=== Vol2Vol Scraping Finished Successfully ===\n');

  } catch (err: any) {
    console.error('\n❌ Vol2Vol Scraper Critical Failure:', err.message);
  } finally {
    console.log('Closing browser...');
    if (context && typeof context.close === 'function') {
      await context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

main();
