
import { BrowserPool } from './src/browser/BrowserPool.js';
import { Orchestrator } from './src/orchestrator.js';
import { db } from './src/db/client.js';
import { logger } from './src/utils/logger.js';
import { env } from './src/config/env.js';

async function fullRun() {
  console.log('🌟 Starting FULL DATA FETCH PIPELINE...');
  
  const pool = new BrowserPool({
    headless: true,
    viewport: { width: 1280, height: 800 }
  }, { maxInstances: 2 });
  
  const orchestrator = new Orchestrator(pool);
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. Intraday (1m) - Using our new fixed fallback
    console.log('\n--- Phase 1: Intraday Data ---');
    const intradayResults = await orchestrator.runIntradayPipeline(today, '1m');

    // 2. Options & OI
    console.log('\n--- Phase 2: Options & Open Interest ---');
    const optionsResults = await orchestrator.runOptionsPipeline(today);

    // 3. Daily Settlements
    console.log('\n--- Phase 3: Daily Settlements ---');
    const settlementResults = await orchestrator.runSettlementPipeline(today);

    // 4. OI Summary (Analytics)
    console.log('\n--- Phase 4: Running Analytics (OI Summary) ---');
    await orchestrator.runOISummaryJob(today);

    console.log('\n✅ ALL PHASES COMPLETE');
    
    // Summary Table
    const allResults = [...intradayResults, ...optionsResults, ...settlementResults];
    console.log('\n--- Final Execution Report ---');
    console.table(allResults.map(r => ({
        Job: r.jobType,
        Symbol: r.symbol,
        Status: r.status,
        Inserted: r.recordsInserted,
        Duration: `${(r.durationMs / 1000).toFixed(1)}s`
    })));

  } catch (err) {
    console.error('Pipeline failed:', err);
  } finally {
    await orchestrator.shutdown();
    await db.destroy();
    process.exit(0);
  }
}

fullRun();
