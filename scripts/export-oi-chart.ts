/**
 * CME Option Open Interest Profile & Skew Chart Exporter
 * 
 * Reads the latest scraped CME Options CSV data and uses Camoufox/Playwright 
 * to render beautiful, institutional-grade dark mode Bar Charts of Call/Put Open Interest (OI)
 * and Implied Volatility (IV) with Standard Deviation bounds.
 * 
 * Usage: npx tsx scripts/export-oi-chart.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import Papa from 'papaparse';

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

const OPTIONS_DIR = path.resolve('output/options');
const VOL2VOL_SUMMARY_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
const OUTPUT_DIR = path.resolve('output/vol2vol');

interface OptionCsvRow {
  trade_date: string;
  fetched_at: string;
  symbol: string;
  expiry_code: string;
  expiry_date: string;
  days_to_expiry: string;
  strike: string;
  option_type: string;
  last_price: string;
  settle_price: string;
  bid: string;
  ask: string;
  volume: string;
  open_interest: string;
  oi_change: string;
  implied_vol: string;
  underlying_price: string;
}

interface StrikeOIRecord {
  strike: number;
  callOI: number;
  putOI: number;
  totalOI: number;
  impliedVol: number | null;
}

async function main() {
  const today = format(new Date(), 'yyyyMMdd');
  console.log(`=== Option Open Interest Chart Exporter (${today}) ===\n`);

  if (!fs.existsSync(OPTIONS_DIR)) {
    console.error('❌ Options data directory not found at:', OPTIONS_DIR);
    process.exit(1);
  }

  // Load Vol2Vol summary for SD bounds and Future Price matching
  let vol2volSummary: any = null;
  if (fs.existsSync(VOL2VOL_SUMMARY_PATH)) {
    try {
      vol2volSummary = JSON.parse(fs.readFileSync(VOL2VOL_SUMMARY_PATH, 'utf-8'));
      console.log('✓ Successfully loaded Vol2Vol summary for statistical boundary overlays.');
    } catch (e) {
      console.warn('⚠️ Could not parse Vol2Vol summary, will use fallbacks for standard deviation lines.');
    }
  }

  const symbols = ['ES', 'NQ', 'GC'];
  const { Camoufox } = await import('camoufox-js') as any;
  console.log('1. Launching headless browser to render charts...');
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 850 });

  for (const sym of symbols) {
    console.log(`\nProcessing Open Interest Profile for ${sym}...`);

    // 1. Find the latest options CSV file for this symbol
    const files = fs.readdirSync(OPTIONS_DIR)
      .filter(f => f.startsWith(`${sym}_options_`) && f.endsWith('.csv'))
      .sort((a, b) => b.localeCompare(a)); // Descending sort to get latest first

    if (files.length === 0) {
      console.log(`   ⚠️ No options CSV found for ${sym}. Skipping...`);
      continue;
    }

    const latestFile = path.join(OPTIONS_DIR, files[0]);
    console.log(`   - Reading latest options chain: ${latestFile}`);
    const csvContent = fs.readFileSync(latestFile, 'utf-8');

    // 2. Parse Options CSV using PapaParse
    const parsed = Papa.parse<OptionCsvRow>(csvContent, {
      header: true,
      skipEmptyLines: true
    });

    const rows = parsed.data;
    if (rows.length === 0) {
      console.log(`   ⚠️ Options CSV is empty for ${sym}. Skipping...`);
      continue;
    }

    // 3. Auto-detect the most active expiry by summing Open Interest
    const expiryOIMap: Record<string, number> = {};
    rows.forEach(r => {
      const oi = parseInt(r.open_interest || '0', 10) || 0;
      expiryOIMap[r.expiry_code] = (expiryOIMap[r.expiry_code] || 0) + oi;
    });

    let bestExpiry = '';
    let maxOI = -1;
    for (const [exp, oi] of Object.entries(expiryOIMap)) {
      if (oi > maxOI) {
        maxOI = oi;
        bestExpiry = exp;
      }
    }

    if (!bestExpiry || maxOI === 0) {
      // Fallback: take the first expiry code with rows
      bestExpiry = rows[0].expiry_code;
      console.log(`   ⚠️ No active Open Interest found. Falling back to first expiry: ${bestExpiry}`);
    } else {
      console.log(`   - Selected most active expiry series: ${bestExpiry} (Total OI: ${maxOI.toLocaleString()} contracts)`);
    }

    // Filter rows to only our active expiry
    const expiryRows = rows.filter(r => r.expiry_code === bestExpiry);
    const expiryDate = expiryRows[0].expiry_date || 'N/A';
    const dteDays = parseFloat(expiryRows[0].days_to_expiry) || 0;

    // 4. Align Calls/Puts by Strike Price
    const strikeMap: Record<number, StrikeOIRecord> = {};
    let underlyingPrice = parseFloat(expiryRows[0].underlying_price) || 0;

    expiryRows.forEach(r => {
      const strike = parseFloat(r.strike);
      if (isNaN(strike)) return;

      if (!strikeMap[strike]) {
        strikeMap[strike] = {
          strike,
          callOI: 0,
          putOI: 0,
          totalOI: 0,
          impliedVol: null
        };
      }

      const rec = strikeMap[strike];
      const oi = parseInt(r.open_interest || '0', 10) || 0;
      const iv = parseFloat(r.implied_vol) || null;

      if (r.option_type === 'C') {
        rec.callOI = oi;
        if (iv !== null) rec.impliedVol = iv;
      } else if (r.option_type === 'P') {
        rec.putOI = oi;
        // If Call IV is not set, or we prefer Put IV for puts, combine or select
        if (rec.impliedVol === null && iv !== null) {
          rec.impliedVol = iv;
        } else if (rec.impliedVol !== null && iv !== null) {
          // Average IV for skew plotting
          rec.impliedVol = (rec.impliedVol + iv) / 2;
        }
      }
    });

    const strikeRecords: StrikeOIRecord[] = Object.values(strikeMap)
      .map(rec => {
        rec.totalOI = rec.callOI + rec.putOI;
        return rec;
      })
      .sort((a, b) => a.strike - b.strike);

    // 5. Establish Vol2Vol boundaries or construct synthetic ones
    let futurePrice = underlyingPrice;
    let sdWidth = futurePrice * 0.02; // Default 2% width
    let sd1Down = futurePrice - sdWidth;
    let sd1Up = futurePrice + sdWidth;
    let sd2Down = futurePrice - sdWidth * 2;
    let sd2Up = futurePrice + sdWidth * 2;
    let atmVolatility = 0.15;
    let title = `${sym} Open Interest Profile`;
    let productName = sym === 'ES' ? 'S&P 500' : sym === 'NQ' ? 'NASDAQ 100' : 'Gold';

    const v2vProduct = vol2volSummary?.data?.[sym];
    if (v2vProduct) {
      futurePrice = v2vProduct.futurePrice;
      atmVolatility = v2vProduct.atmVolatility;
      title = `${v2vProduct.productName} Options Open Interest`;
      productName = v2vProduct.productName;

      const sd1 = v2vProduct.standardDeviations.find((d: any) => d.sd === 1);
      const sd2 = v2vProduct.standardDeviations.find((d: any) => d.sd === 2);
      if (sd1) {
        sdWidth = futurePrice - sd1.downside.strikeStart;
        sd1Down = sd1.downside.strikeStart;
        sd1Up = sd1.upside.strikeEnd;
      }
      if (sd2) {
        sd2Down = sd2.downside.strikeStart;
        sd2Up = sd2.upside.strikeEnd;
      }
    }

    // 6. Restrict to narrow ±1.5 SD ATM Range (Option 2)
    const boundsDown = futurePrice - (sdWidth * 1.5);
    const boundsUp = futurePrice + (sdWidth * 1.5);

    const filteredStrikes = strikeRecords.filter(s => s.strike >= boundsDown && s.strike <= boundsUp);
    console.log(`   - Selected ${filteredStrikes.length} strikes strictly inside narrow ATM ±1.5 SD range`);

    if (filteredStrikes.length === 0) {
      console.log(`   ⚠️ No strikes fell in the ±1.5 SD range for ${sym}. Skipping...`);
      continue;
    }

    const fStrikes = filteredStrikes.map(s => s.strike);
    const fCallOis = filteredStrikes.map(s => s.callOI);
    const fPutOis = filteredStrikes.map(s => s.putOI);
    const fIvs = filteredStrikes.map(s => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);

    // Helper to find closest strike
    const getClosestStrike = (val: number) => {
      if (fStrikes.length === 0) return val;
      return fStrikes.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
    };

    const atmClosest = getClosestStrike(futurePrice);
    const sd1DownClosest = getClosestStrike(sd1Down);
    const sd1UpClosest = getClosestStrike(sd1Up);
    const sd2DownClosest = getClosestStrike(sd2Down);
    const sd2UpClosest = getClosestStrike(sd2Up);

    // 7. Render Premium ApexCharts HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${productName} Option Open Interest Profile</title>
  <!-- Tailwind CSS Play CDN (v3) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
  
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background-color: #0b0f19;
    }
    .title-font {
      font-family: 'Outfit', sans-serif;
    }
  </style>
</head>
<body class="p-8 text-slate-100 min-h-screen flex flex-col justify-between">

  <!-- Header Section -->
  <div class="flex justify-between items-end border-b border-slate-800 pb-4 mb-6">
    <div>
      <div class="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Open Interest Profile (Expiry: ${expiryDate})</div>
      <h1 class="title-font text-3xl font-extrabold text-white flex items-center gap-3">
        ${productName} <span class="text-slate-400 text-xl font-normal">(${sym} Options OI)</span>
      </h1>
    </div>
    
    <div class="flex gap-6 text-sm text-slate-400 bg-slate-900/50 border border-slate-800/80 px-5 py-2.5 rounded-xl shadow-lg backdrop-blur-md">
      <div>
        <span class="block text-xs text-slate-500 font-medium">FUTURE PRICE</span>
        <span class="text-base font-semibold text-yellow-400">${futurePrice}</span>
      </div>
      <div class="w-px h-8 bg-slate-800"></div>
      <div>
        <span class="block text-xs text-slate-500 font-medium">ATM VOLATILITY</span>
        <span class="text-base font-semibold text-emerald-400">${(atmVolatility * 100).toFixed(2)}%</span>
      </div>
      <div class="w-px h-8 bg-slate-800"></div>
      <div>
        <span class="block text-xs text-slate-500 font-medium">DAYS TO EXPIRY</span>
        <span class="text-base font-semibold text-cyan-400">${dteDays.toFixed(2)} Days</span>
      </div>
    </div>
  </div>

  <!-- Chart Container -->
  <div class="relative bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-2xl backdrop-blur-md flex-grow">
    <div id="oiChart" class="w-full" style="height: 580px;"></div>
  </div>

  <!-- Footer Info -->
  <div class="mt-4 flex justify-between items-center text-xs text-slate-500">
    <div>Generated automatically via CME Daily Options Scraper • Open Interest (OI) Profile</div>
    <div>Trade Date: ${expiryRows[0].trade_date} • Scraped At: ${new Date(expiryRows[0].fetched_at).toLocaleString()}</div>
  </div>

  <script>
    const options = {
      series: [
        {
          name: 'Call Open Interest',
          type: 'column',
          data: ${JSON.stringify(fCallOis)}
        },
        {
          name: 'Put Open Interest',
          type: 'column',
          data: ${JSON.stringify(fPutOis)}
        },
        {
          name: 'Implied Volatility (IV)',
          type: 'line',
          data: ${JSON.stringify(fIvs)}
        }
      ],
      chart: {
        height: '100%',
        type: 'line',
        background: 'transparent',
        toolbar: { show: false },
        animations: { enabled: false }
      },
      stroke: {
        width: [0, 0, 3],
        curve: 'smooth'
      },
      colors: ['#10b981', '#f43f5e', '#eab308'], // emerald green, rose red, gold yellow
      fill: {
        opacity: [0.85, 0.85, 1],
        gradient: {
          inverseColors: false,
          shade: 'dark',
          type: "vertical",
          opacityFrom: [0.85, 0.85, 1],
          opacityTo: [0.55, 0.55, 1],
        }
      },
      plotOptions: {
        bar: {
          columnWidth: '65%',
          borderRadius: 3
        }
      },
      labels: ${JSON.stringify(fStrikes)},
      xaxis: {
        type: 'category',
        title: {
          text: 'Strike Price',
          style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 }
        },
        labels: {
          style: { colors: '#64748b', fontSize: '10px' }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: [
        {
          title: {
            text: 'Open Interest (Contracts)',
            style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 }
          },
          labels: {
            style: { colors: '#64748b', fontSize: '10px' },
            formatter: function (val) {
              return val.toLocaleString();
            }
          }
        },
        {
          opposite: true,
          title: {
            text: 'Implied Volatility (IV %)',
            style: { color: '#eab308', fontSize: '11px', fontWeight: 600 }
          },
          labels: {
            style: { colors: '#eab308', fontSize: '10px' },
            formatter: function (val) {
              return val !== null ? val + '%' : '';
            }
          }
        }
      ],
      grid: {
        borderColor: '#1e293b',
        strokeDashArray: 4,
        xaxis: { lines: { show: true } }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'center',
        fontSize: '12px',
        labels: { colors: '#94a3b8' }
      },
      annotations: {
        xaxis: [
          // ATM Future Line
          {
            x: ${atmClosest},
            borderColor: '#f59e0b',
            borderWidth: 2,
            strokeDashArray: 3,
            label: {
              borderColor: '#f59e0b',
              style: { color: '#0b0f19', background: '#f59e0b', fontSize: '10px', fontWeight: 700 },
              text: 'ATM: ${futurePrice}'
            }
          },
          // 1 SD downside
          {
            x: ${sd1DownClosest},
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: '#06b6d4',
              style: { color: '#fff', background: '#06b6d4', fontSize: '9px', fontWeight: 600 },
              text: '-1 SD: ${sd1Down.toFixed(1)}'
            }
          },
          // 1 SD upside
          {
            x: ${sd1UpClosest},
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: '#06b6d4',
              style: { color: '#fff', background: '#06b6d4', fontSize: '9px', fontWeight: 600 },
              text: '+1 SD: ${sd1Up.toFixed(1)}'
            }
          },
          // 2 SD downside
          {
            x: ${sd2DownClosest},
            borderColor: '#8b5cf6',
            borderWidth: 1.5,
            strokeDashArray: 5,
            label: {
              borderColor: '#8b5cf6',
              style: { color: '#fff', background: '#8b5cf6', fontSize: '9px', fontWeight: 600 },
              text: '-2 SD: ${sd2Down.toFixed(1)}'
            }
          },
          // 2 SD upside
          {
            x: ${sd2UpClosest},
            borderColor: '#8b5cf6',
            borderWidth: 1.5,
            strokeDashArray: 5,
            label: {
              borderColor: '#8b5cf6',
              style: { color: '#fff', background: '#8b5cf6', fontSize: '9px', fontWeight: 600 },
              text: '+2 SD: ${sd2Up.toFixed(1)}'
            }
          }
        ]
      }
    };

    const chart = new ApexCharts(document.querySelector("#oiChart"), options);
    chart.render();
  </script>
</body>
</html>
    `;

    // Render HTML and take screenshot
    await page.setContent(htmlContent);
    await new Promise(r => setTimeout(r, 1000)); // wait for chart render

    const exportPath = path.join(OUTPUT_DIR, `vol2vol_oi_chart_${sym}_${today}.png`);
    await page.screenshot({ path: exportPath });
    console.log(`   ✓ Saved beautiful Open Interest chart to: ${exportPath}`);
  }

  await browser.close();
  console.log('\n=== Open Interest Export Completed Successfully ===');
}

main().catch(err => {
  console.error('Fatal Error during Open Interest Chart Export:', err);
  process.exit(1);
});
