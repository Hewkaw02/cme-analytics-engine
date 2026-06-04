import { db } from '../src/db/client.js';
import { Indicators } from '../src/analytics/Indicators.js';
import { logger } from '../src/utils/logger.js';
import { Symbol } from '../src/types.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  return {
    timeframe: parsed.timeframe || '1D',
    symbol: parsed.symbol || 'ALL',
  };
}

async function runRecompute() {
  const { timeframe, symbol } = parseArgs();

  logger.info(`=== Technical Indicators Recomputation Utility ===`);
  logger.info(`Timeframe: ${timeframe}`);
  logger.info(`Symbol:    ${symbol}`);

  const symbolsToProcess: Symbol[] = symbol === 'ALL' ? ['ES', 'NQ', 'GC'] : [symbol as Symbol];

  for (const sym of symbolsToProcess) {
    try {
      logger.info(`[Recompute] Calculating derived technical indicators for ${sym} (${timeframe})...`);
      await Indicators.computeIntradayIndicators(db, sym, timeframe);
      logger.info(`[Recompute] Indicators successfully calculated and persisted for ${sym} (${timeframe}).`);
    } catch (err: any) {
      logger.error(`[Recompute] Failed to recompute indicators for ${sym} (${timeframe}): ${err.message}`);
    }
  }

  logger.info('=== Recomputation Utility Completed ===');
  process.exit(0);
}

runRecompute().catch((err) => {
  logger.error('Recomputation Utility Fatal Error', { error: String(err) });
  process.exit(1);
});
