import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserPool } from '../src/browser/BrowserPool.js';
import { warmupSession } from '../src/browser/Warmup.js';
import type { SessionConfig } from '../src/types.js';

const sessionConfig: SessionConfig = {
  headless: process.env.HEADLESS !== 'false',
  proxy: process.env.PROXY_URL,
  userAgent: process.env.USER_AGENT || 'random',
  stealth: true,
  viewport: { width: 1440, height: 900 },
  timeout: 60_000,
  cookiePersist: false,
};

async function main() {
  const pool = new BrowserPool(sessionConfig, { maxInstances: 1 });
  const page = await pool.acquire();

  try {
    await warmupSession(page);

    const screenshotPath = path.resolve('output', 'test-session.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`CME browser session test completed: ${screenshotPath}`);
  } finally {
    await pool.release(page);
    await pool.closeAll();
  }
}

main().catch((error) => {
  console.error('CME browser session test failed:', error);
  process.exit(1);
});
