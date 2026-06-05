import { BrowserPool } from './src/browser/BrowserPool.js';

async function investigateCMEChart() {
  const pool = new BrowserPool({
    headless: false, // We want to see what is happening if needed, or headless
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 1 });

  const page = await pool.acquire();
  console.log('1. เปิดหน้าเว็บ CME E-mini S&P 500 Quotes...');
  
  // Array to store interesting endpoints
  const apiCalls: { url: string, method: string, type: string }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const type = response.request().resourceType();
    
    // We are looking for data feeds (fetch, xhr) related to charts or TV (TradingView)
    if (type === 'fetch' || type === 'xhr' || type === 'websocket') {
      if (
        url.includes('tv') || 
        url.includes('chart') || 
        url.includes('history') || 
        url.includes('md') || 
        url.includes('udf') || 
        url.includes('graphql')
      ) {
        apiCalls.push({ url, method: response.request().method(), type });
        console.log(`[FOUND ENDPOINT] ${response.status()} ${response.request().method()} ${url}`);
      }
    }
  });

  try {
    await page.goto('https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html', { waitUntil: 'networkidle', timeout: 60000 });
    console.log('2. โหลดหน้าเว็บเสร็จสมบูรณ์');

    // Wait a bit before clicking
    await new Promise(r => setTimeout(r, 2000));

    console.log('3. กำลังค้นหาและคลิกที่แท็บ "Chart" เพื่อโหลดกราฟ...');
    
    // Trying to click the Chart tab on the CME website
    // On CME, tabs usually have IDs or specific text. Let's try finding the Chart button.
    const chartTabSelector = 'a:has-text("Chart"), button:has-text("Chart"), .tabs-nav a:has-text("Chart"), [role="tab"]:has-text("Chart")';
    
    // Evaluate to find the exact element if playwright strict mode fails
    const chartClicked = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a, button, li'));
        const chartTab = tabs.find(t => t.textContent?.trim().toLowerCase() === 'chart');
        if (chartTab) {
            (chartTab as HTMLElement).click();
            return true;
        }
        return false;
    });

    if (chartClicked) {
         console.log('4. คลิกปุ่ม Chart แล้ว! กำลังรอให้กราฟโหลดข้อมูล (รอ 10 วินาที)...');
         await new Promise(r => setTimeout(r, 10000));
    } else {
         console.log('❌ ไม่พบแท็บ Chart บนหน้าเว็บหลัก');
    }

    console.log('\n=== สรุป Endpoint ที่น่าสงสัย (Chart API) ===');
    const uniqueUrls = [...new Set(apiCalls.map(c => c.url))];
    uniqueUrls.forEach(url => console.log(`- ${url}`));
    console.log('============================================\n');

  } catch (err) {
    console.error('Error during investigation:', err);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

investigateCMEChart();
