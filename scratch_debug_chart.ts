import * as fs from 'fs';
import * as path from 'path';

async function testChartRender() {
  const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
  if (!fs.existsSync(INPUT_PATH)) {
    console.error('No summary file found');
    return;
  }
  const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const sym = 'ES';
  const data = summary.data[sym];
  
  const strikes = data.strikeData.map((s: any) => s.strike);
  const callVols = data.strikeData.map((s: any) => s.callVolume);
  const putVols = data.strikeData.map((s: any) => s.putVolume);
  const ivs = data.strikeData.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Chart</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
</head>
<body class="bg-black text-white p-4">
  <div id="volumeChart" style="width: 1000px; height: 500px; background: #000;"></div>
  <script>
    console.log("In HTML script, initializing ApexCharts...");
    try {
      if (typeof ApexCharts === 'undefined') {
        console.error("ApexCharts is undefined!");
      } else {
        console.log("ApexCharts is defined. Version:", ApexCharts.name);
      }
      const options = {
        series: [
          { name: 'Call Volume', type: 'column', data: ${JSON.stringify(callVols)} },
          { name: 'Put Volume', type: 'column', data: ${JSON.stringify(putVols)} }
        ],
        chart: { height: '100%', type: 'line', background: 'transparent', animations: { enabled: false } },
        labels: ${JSON.stringify(strikes)}
      };
      console.log("Creating chart object...");
      const chart = new ApexCharts(document.querySelector("#volumeChart"), options);
      console.log("Rendering chart...");
      chart.render();
      console.log("Chart rendered successfully!");
    } catch(e) {
      console.error("Error inside page script:", e);
    }
  </script>
</body>
</html>
  `;
  
  const { Camoufox } = await import('camoufox-js') as any;
  console.log('Launching browser...');
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', (msg: any) => {
    console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on('pageerror', (err: any) => {
    console.error(`[PAGE ERROR] ${err.message}`);
  });
  
  page.on('requestfailed', (req: any) => {
    console.warn(`[PAGE REQUEST FAILED] ${req.url()} - ${req.failure()?.errorText}`);
  });
  
  console.log('Setting page content...');
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Closing browser...');
  await browser.close();
}

testChartRender().catch(console.error);
