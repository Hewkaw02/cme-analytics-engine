import * as fs from 'fs';
import * as path from 'path';

async function testNQRender() {
  const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
  const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const sym = 'NQ';
  const data = summary.data[sym];
  
  const strikes = data.strikeData.map((s: any) => s.strike);
  const callVols = data.strikeData.map((s: any) => s.callVolume);
  const putVols = data.strikeData.map((s: any) => s.putVolume);
  const ivs = data.strikeData.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);
  
  // Calculate SD bounds
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);
  
  const filteredStrikes = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  const fStrikes = filteredStrikes.map((s: any) => s.strike);
  const fCallVols = filteredStrikes.map((s: any) => s.callVolume);
  const fPutVols = filteredStrikes.map((s: any) => s.putVolume);
  const fIvs = filteredStrikes.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);
  
  const sd1Down = sd1?.downside.strikeStart ?? (data.futurePrice * 0.98);
  const sd1Up = sd1?.upside.strikeEnd ?? (data.futurePrice * 1.02);
  const sd2 = data.standardDeviations.find((d: any) => d.sd === 2);
  const sd2Down = sd2?.downside.strikeStart ?? (data.futurePrice * 0.96);
  const sd2Up = sd2?.upside.strikeEnd ?? (data.futurePrice * 1.04);
  
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
  
  <style>
    body {
      background-color: #0b0f19;
    }
  </style>
</head>
<body class="p-8 text-slate-100 min-h-screen flex flex-col justify-between">

  <!-- Header Section -->
  <div class="flex justify-between items-end border-b border-slate-800 pb-4 mb-6">
    <div>
      <div class="text-xs font-semibold text-emerald-400 tracking-wider uppercase">${data.title}</div>
      <h1 class="text-3xl font-extrabold text-white flex items-center gap-3">
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
    <!-- Chart Element - EXPLICIT HEIGHT AND WIDTH -->
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
        { name: 'Call Volume', type: 'column', data: ${JSON.stringify(fCallVols)} },
        { name: 'Put Volume', type: 'column', data: ${JSON.stringify(fPutVols)} },
        { name: 'Implied Volatility (IV)', type: 'line', data: ${JSON.stringify(fIvs)} }
      ],
      chart: {
        height: '100%',
        type: 'line',
        background: 'transparent',
        toolbar: { show: false },
        animations: { enabled: false }
      },
      stroke: { width: [0, 0, 3], curve: 'smooth' },
      colors: ['#10b981', '#f43f5e', '#eab308'],
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
      plotOptions: { bar: { columnWidth: '65%', borderRadius: 3 } },
      labels: ${JSON.stringify(fStrikes)},
      xaxis: {
        type: 'numeric',
        title: { text: 'Strike Price', style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 } },
        labels: { style: { colors: '#64748b', fontSize: '10px' } }
      },
      yaxis: [
        {
          title: { text: 'Option Volume (Contracts)', style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 } },
          labels: {
            style: { colors: '#64748b', fontSize: '10px' },
            formatter: function (val) { return val.toLocaleString(); }
          }
        },
        {
          opposite: true,
          title: { text: 'Implied Volatility (IV %)', style: { color: '#eab308', fontSize: '11px', fontWeight: 600 } },
          labels: {
            style: { colors: '#eab308', fontSize: '10px' },
            formatter: function (val) { return val !== null ? val + '%' : ''; }
          }
        }
      ],
      grid: { borderColor: '#1e293b', strokeDashArray: 4, xaxis: { lines: { show: true } } },
      legend: { position: 'top', horizontalAlign: 'center', fontSize: '12px', labels: { colors: '#94a3b8' } },
      annotations: {
        xaxis: [
          {
            x: ${data.futurePrice},
            borderColor: '#f59e0b',
            borderWidth: 2,
            strokeDashArray: 3,
            label: {
              borderColor: '#f59e0b',
              style: { color: '#0b0f19', background: '#f59e0b', fontSize: '10px', fontWeight: 700 },
              text: 'ATM Future: ${data.futurePrice}'
            }
          },
          {
            x: ${sd1Down},
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: '#06b6d4',
              style: { color: '#fff', background: '#06b6d4', fontSize: '9px', fontWeight: 600 },
              text: '-1 SD'
            }
          },
          {
            x: ${sd1Up},
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: '#06b6d4',
              style: { color: '#fff', background: '#06b6d4', fontSize: '9px', fontWeight: 600 },
              text: '+1 SD'
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
  
  const { Camoufox } = await import('camoufox-js') as any;
  console.log('Launching browser for NQ screenshot test...');
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 850 });
  
  console.log('Setting NQ page content with v3 tailwind...');
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 3 seconds for chart to draw...');
  await new Promise(r => setTimeout(r, 3000));
  
  const exportPath = path.resolve('output/vol2vol/vol2vol_bar_chart_NQ_20260521.png');
  await page.screenshot({ path: exportPath });
  console.log('Screenshot saved to', exportPath);
  
  await browser.close();
}

testNQRender().catch(console.error);
