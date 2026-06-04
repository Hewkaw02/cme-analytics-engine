import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
  const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const sym = 'NQ';
  const data = summary.data[sym];

  const { Camoufox } = await import('camoufox-js') as any;
  console.log('Launching browser to test NQ category with SD2...');
  const browser = await Camoufox({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 850 });

  page.on('console', (msg: any) => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err: any) => console.error(`[PAGE ERROR] ${err.message}`));

  console.log(`Processing NQ...`);
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

  // Helper to find closest strike
  const getClosestStrike = (val: number) => {
    return fStrikes.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
  };

  const atmClosest = getClosestStrike(data.futurePrice);
  const sd1DownClosest = getClosestStrike(sd1Down);
  const sd1UpClosest = getClosestStrike(sd1Up);
  const sd2DownClosest = getClosestStrike(sd2Down);
  const sd2UpClosest = getClosestStrike(sd2Up);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>NQ test</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
</head>
<body class="bg-[#0b0f19] p-8 text-white">
  <h1>NQ</h1>
  <div id="volumeChart" style="height: 580px;"></div>
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
        labels: ${JSON.stringify(fStrikes)},
        xaxis: {
          type: 'category'
        },
        annotations: {
          xaxis: [
            { x: ${atmClosest}, borderColor: '#f59e0b', label: { text: 'ATM' } },
            { x: ${sd1DownClosest}, borderColor: '#06b6d4', label: { text: '-1 SD' } },
            { x: ${sd1UpClosest}, borderColor: '#06b6d4', label: { text: '+1 SD' } },
            { x: ${sd2DownClosest}, borderColor: '#8b5cf6', label: { text: '-2 SD' } },
            { x: ${sd2UpClosest}, borderColor: '#8b5cf6', label: { text: '+2 SD' } }
          ]
        }
      };
      console.log("Creating chart...");
      const chart = new ApexCharts(document.querySelector("#volumeChart"), options);
      chart.render().then(() => console.log("Rendered!"));
    } catch(err) {
      console.error("Catch block err:", err);
    }
  </script>
</body>
</html>
  `;

  await page.setContent(htmlContent);
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.resolve('scratch_test_category_NQ.png') });
  console.log('Done!');
  await browser.close();
}

main().catch(console.error);
