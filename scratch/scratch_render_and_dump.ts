import * as fs from 'fs';
import * as path from 'path';
import { BrowserPool } from './src/browser/BrowserPool.js';

async function main() {
  const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
  const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const sym = 'ES';
  const data = summary.data[sym];
  
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);
  
  const filteredStrikes = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  const fStrikes = filteredStrikes.map((s: any) => s.strike);
  const fCallVols = filteredStrikes.map((s: any) => s.callVolume);
  const fPutVols = filteredStrikes.map((s: any) => s.putVolume);
  const fIvs = filteredStrikes.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test ES</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
</head>
<body class="bg-[#0b0f19] p-8 text-white">
  <h1 class="text-2xl font-bold mb-4">ES Volume Profile</h1>
  <div id="chartContainer" class="bg-slate-900 p-6 rounded-xl" style="height: 580px;">
    <div id="volumeChart" style="height: 100%;"></div>
  </div>
  <script>
    console.log("Script starting...");
    try {
      const options = {
        series: [
          { name: 'Call Volume', type: 'column', data: ${JSON.stringify(fCallVols)} },
          { name: 'Put Volume', type: 'column', data: ${JSON.stringify(fPutVols)} },
          { name: 'IV', type: 'line', data: ${JSON.stringify(fIvs)} }
        ],
        chart: {
          height: '100%',
          type: 'line',
          animations: { enabled: false }
        },
        labels: ${JSON.stringify(fStrikes)}
      };
      console.log("Chart options prepared.");
      const chart = new ApexCharts(document.querySelector("#volumeChart"), options);
      console.log("Chart instance created.");
      chart.render().then(() => {
        console.log("Chart render finished promise resolved!");
        document.body.setAttribute('data-rendered', 'true');
      }).catch(err => {
        console.error("Chart render promise rejected:", err);
      });
      console.log("Chart.render() called.");
    } catch (e) {
      console.error("Error in page execution:", e);
    }
  </script>
</body>
</html>
  `;

  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1400, height: 850 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  
  page.on('console', (msg: any) => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err: any) => console.error(`[PAGE ERROR] ${err.message}`));

  console.log('Loading page...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  
  console.log('Checking for rendered attribute...');
  const isRendered = await page.evaluate(() => document.body.getAttribute('data-rendered'));
  console.log('data-rendered attribute value:', isRendered);

  // Check the height of volumeChart and if it has SVG child
  const chartDetails = await page.evaluate(() => {
    const chartEl = document.querySelector('#volumeChart');
    if (!chartEl) return 'No #volumeChart element found';
    return {
      innerHTML: chartEl.innerHTML.substring(0, 200) + '...',
      childCount: chartEl.children.length,
      height: chartEl.clientHeight,
      width: chartEl.clientWidth
    };
  });
  console.log('Chart Details:', JSON.stringify(chartDetails, null, 2));

  await page.screenshot({ path: path.resolve('scratch_test_es_screenshot.png') });
  console.log('Saved screenshot to scratch_test_es_screenshot.png');

  await pool.release(page);
  await pool.closeAll();
}

main().catch(console.error);
