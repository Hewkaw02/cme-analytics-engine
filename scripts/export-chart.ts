/**
 * CME Option Volume Profile & Volatility Bar Chart Exporter
 * 
 * Reads the latest scraped CME Vol2Vol JSON data and uses Camoufox/Playwright 
 * to render beautiful, institutional-grade dark mode Bar Charts of Call/Put Volume
 * and Implied Volatility (IV) with Standard Deviation bounds.
 * 
 * Usage: npx tsx scripts/export-chart.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';

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

const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
const OUTPUT_DIR = path.resolve('output/vol2vol');

interface StrikeData {
  strike: number;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  impliedVol: number | null;
  settleVol: number | null;
}

interface StandardDeviationRange {
  sd: number;
  downside: { width: number; strikeStart: number; strikeEnd: number };
  upside: { width: number; strikeStart: number; strikeEnd: number };
}

interface ExtractedVol2VolData {
  symbol: string;
  productName: string;
  title: string;
  futurePrice: number;
  atmVolatility: number;
  dte: number;
  standardDeviations: StandardDeviationRange[];
  deltaStrikes: any[];
  strikeData: StrikeData[];
  scrapedAt: string;
}

async function main() {
  const today = format(new Date(), 'yyyyMMdd');
  console.log(`=== Option Volume & Volatility Chart Exporter (${today}) ===\n`);

  if (!fs.existsSync(INPUT_PATH)) {
    console.error('❌ Scraped data summary not found at:', INPUT_PATH);
    console.error('   Please run the scraper first:');
    console.error('   npx tsx scripts/fetch-vol2vol.ts');
    process.exit(1);
  }

  const rawData = fs.readFileSync(INPUT_PATH, 'utf-8');
  const summary = JSON.parse(rawData);
  const symbols = summary.scrapedSymbols || Object.keys(summary.data);

  const { Camoufox } = await import('camoufox-js') as any;
  console.log('1. Launching headless browser to render charts...');
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', (msg: any) => console.log(`   [PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err: any) => console.error(`   [PAGE ERROR] ${err.message}`));
  
  // Set larger viewport for high-quality chart screenshots
  await page.setViewportSize({ width: 1400, height: 850 });

  for (const sym of symbols) {
    const data: ExtractedVol2VolData = summary.data[sym];
    if (!data || !data.strikeData || data.strikeData.length === 0) {
      console.log(`   ⚠️ No strike data found for ${sym}. Skipping...`);
      continue;
    }

    console.log(`2. Generating Bar Chart for ${data.productName} (${sym})...`);

    // 1. Calculate smart boundaries for the chart
    // Option 2 Selected: Restrict strictly to a narrow ATM range (±1.5 Standard Deviations)
    // to focus on the active volume region and prevent far-OTM illiquid strikes from stretching the chart.
    const sd1 = data.standardDeviations.find(d => d.sd === 1);
    const sd2 = data.standardDeviations.find(d => d.sd === 2);
    
    const sd1Down = sd1?.downside.strikeStart ?? (data.futurePrice * 0.98);
    const sd1Up = sd1?.upside.strikeEnd ?? (data.futurePrice * 1.02);
    const sd2Down = sd2?.downside.strikeStart ?? (data.futurePrice * 0.96);
    const sd2Up = sd2?.upside.strikeEnd ?? (data.futurePrice * 1.04);
    
    // Narrow ATM bounds (±1.5 SDs)
    const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
    const boundsDown = data.futurePrice - (sdWidth * 1.5);
    const boundsUp = data.futurePrice + (sdWidth * 1.5);

    const filteredStrikes = data.strikeData.filter(s => {
      // Show strikes strictly within ±1.5 SDs of future price
      return s.strike >= boundsDown && s.strike <= boundsUp;
    });

    console.log(`   - Selected ${filteredStrikes.length} strikes (narrow ATM ±1.5 SD range) out of ${data.strikeData.length} total for visualization`);

    // Prepare series data for ApexCharts category x-axis
    const fStrikes = filteredStrikes.map(s => s.strike);
    const fCallVols = filteredStrikes.map(s => s.callVolume);
    const fPutVols = filteredStrikes.map(s => s.putVolume);
    const fIvs = filteredStrikes.map(s => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);

    // Helper to find closest strike
    const getClosestStrike = (val: number) => {
      if (fStrikes.length === 0) return val;
      return fStrikes.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
    };

    const atmClosest = getClosestStrike(data.futurePrice);
    const sd1DownClosest = getClosestStrike(sd1Down);
    const sd1UpClosest = getClosestStrike(sd1Up);
    const sd2DownClosest = getClosestStrike(sd2Down);
    const sd2UpClosest = getClosestStrike(sd2Up);

    // 2. Build premium HTML containing ApexCharts
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.productName} Option Volume Profile</title>
  <!-- Tailwind CSS Play CDN (v3) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- ApexCharts CDN -->
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  <!-- Google Fonts -->
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
      <div class="text-xs font-semibold text-emerald-400 tracking-wider uppercase">${data.title}</div>
      <h1 class="title-font text-3xl font-extrabold text-white flex items-center gap-3">
        ${data.productName} <span class="text-slate-400 text-xl font-normal">(${sym})</span>
      </h1>
    </div>
    
    <div class="flex gap-6 text-sm text-slate-400 bg-slate-900/50 border border-slate-800/80 px-5 py-2.5 rounded-xl shadow-lg backdrop-blur-md">
      <div>
        <span class="block text-xs text-slate-500 font-medium">FUTURE PRICE</span>
        <span class="text-base font-semibold text-yellow-400">${data.futurePrice}</span>
      </div>
      <div class="w-px h-8 bg-slate-800"></div>
      <div>
        <span class="block text-xs text-slate-500 font-medium">ATM VOLATILITY</span>
        <span class="text-base font-semibold text-emerald-400">${(data.atmVolatility * 100).toFixed(2)}%</span>
      </div>
      <div class="w-px h-8 bg-slate-800"></div>
      <div>
        <span class="block text-xs text-slate-500 font-medium">DAYS TO EXPIRY</span>
        <span class="text-base font-semibold text-cyan-400">${data.dte.toFixed(2)} Days</span>
      </div>
    </div>
  </div>

  <!-- Chart Container -->
  <div class="relative bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-2xl backdrop-blur-md flex-grow">
    <!-- Chart Element -->
    <div id="volumeChart" class="w-full" style="height: 580px;"></div>
  </div>

  <!-- Footer/Legend info -->
  <div class="mt-4 flex justify-between items-center text-xs text-slate-500">
    <div>Generated automatically via CME Vol2Vol Scraper • Live Intraday Expiry Snapshot</div>
    <div>Scraped At: ${new Date(data.scrapedAt).toLocaleString()}</div>
  </div>

  <script>
    const options = {
      series: [
        {
          name: 'Call Volume',
          type: 'column',
          data: ${JSON.stringify(fCallVols)}
        },
        {
          name: 'Put Volume',
          type: 'column',
          data: ${JSON.stringify(fPutVols)}
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
        animations: { enabled: false } // Disabled for instant snapshot rendering
      },
      stroke: {
        width: [0, 0, 3],
        curve: 'smooth',
        dashArray: [0, 0, 0]
      },
      colors: ['#10b981', '#f43f5e', '#eab308'], // emerald green, rose red, yellow
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
      markers: {
        size: [0, 0, 0]
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
            text: 'Option Volume (Contracts)',
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
        labels: { colors: '#94a3b8' },
        markers: { radius: 12 }
      },
      // Draw Expected Range standard deviations and ATM future price bounds
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
              text: 'ATM: ${data.futurePrice}'
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

    const chart = new ApexCharts(document.querySelector("#volumeChart"), options);
    chart.render();
  </script>
</body>
</html>
    `;

    // Render HTML page and save screenshot
    await page.setContent(htmlContent);
    
    // Give ApexCharts a split second to draw fully
    await new Promise(r => setTimeout(r, 1000));

    const exportPath = path.join(OUTPUT_DIR, `vol2vol_bar_chart_${sym}_${today}.png`);
    await page.screenshot({ path: exportPath });
    console.log(`   ✓ Saved beautiful bar chart to: ${exportPath}`);
  }

  await browser.close();
  console.log('\n=== Export Completed Successfully ===');
}

main().catch(err => {
  console.error('Fatal Error during Chart Export:', err);
  process.exit(1);
});
