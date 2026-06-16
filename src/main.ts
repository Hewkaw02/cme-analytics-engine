import { BrowserPool } from './browser/BrowserPool.js';
import { Orchestrator } from './orchestrator.js';
import { Scheduler } from './scheduler.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { SessionConfig } from './types.js';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { JobType } from './db/repositories/JobRepository.js';

// Suppress known Camoufox/Playwright unhandled exceptions and rejections
process.on('uncaughtException', (err) => {
  if (err.stack?.includes('playwright-core') && err.stack?.includes('location.url')) {
    return; // Suppress known Camoufox/Playwright bug
  }
  logger.error('Uncaught exception:', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const reasonStr = reason instanceof Error ? reason.stack || reason.message : String(reason);
  if (
    reasonStr.includes('location.url') ||
    (reasonStr.includes("reading 'url'") && reasonStr.includes('playwright-core'))
  ) {
    return; // Suppress known Camoufox/Playwright bug
  }
  logger.error('Unhandled rejection:', { reason: reasonStr });
});

/**
 * Parse CLI arguments for the CME Data Fetcher.
 *
 * Usage:
 *   npm start -- --mode scheduler               # Start cron scheduler (default)
 *   npm start -- --mode fetch --type OPTIONS --symbol ES --date 2026-05-12
 *   npm start -- --mode fetch --type ANALYSIS
 *   npm start -- --mode retry --date 2026-05-12  # Retry failed jobs
 */
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
    mode: (parsed.mode || 'scheduler') as 'scheduler' | 'fetch' | 'retry',
    type: (parsed.type || undefined) as JobType | undefined,
    symbol: parsed.symbol || undefined,
    date: parsed.date || format(toZonedTime(new Date(), env.TIMEZONE), 'yyyy-MM-dd'),
    timeframe: parsed.timeframe || undefined,
  };
}

/**
 * Bootstrap the application.
 */
async function main() {
  const args = parseArgs();

  logger.info('=== CME Data Fetcher ===');
  logger.info(`Mode: ${args.mode}`);
  logger.info(`Date: ${args.date}`);
  logger.info(`Timezone: ${env.TIMEZONE}`);

  // Initialize browser pool
  const sessionConfig: SessionConfig = {
    headless: env.HEADLESS,
    proxy: env.PROXY_URL,
    userAgent: env.USER_AGENT || 'random',
    stealth: true,
    viewport: { width: 1920, height: 1080 },
    timeout: 30_000,
    cookiePersist: false,
  };

  const pool = new BrowserPool(sessionConfig, {
    maxInstances: env.MAX_BROWSER_INSTANCES,
  });

  const orchestrator = new Orchestrator(pool);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (args.mode === 'scheduler') {
      scheduler.stop();
    }
    await orchestrator.shutdown();
    process.exit(0);
  };

  let scheduler: Scheduler;

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  switch (args.mode) {
    // ---- Scheduler Mode ----
    case 'scheduler': {
      scheduler = new Scheduler(orchestrator);
      scheduler.start();

      logger.info('Scheduler is running. Press Ctrl+C to stop.');
      logger.info('Registered jobs:');
      for (const job of scheduler.getJobs()) {
        logger.info(`  ${job.name}: ${job.expression} — ${job.description}`);
      }

      // Keep process alive
      await new Promise(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
      break;
    }

    // ---- Manual Fetch Mode ----
    case 'fetch': {
      if (!args.type) {
        logger.error('--type is required for fetch mode (OPTIONS, OI, INTRADAY, SETTLEMENT, BULLETIN, ANALYSIS)');
        process.exit(1);
      }

      logger.info(`Running single job: ${args.type} for ${args.symbol || 'ALL'} on ${args.date}`);
      const result = await orchestrator.runJob(args.type, args.date, args.symbol, args.timeframe);

      logger.info('Job result:', {
        jobId: result.jobId,
        status: result.status,
        recordsInserted: result.recordsInserted,
        durationMs: result.durationMs,
        error: result.error,
      });

      await orchestrator.shutdown();
      process.exit(result.status === 'FAILED' ? 1 : 0);
      break;
    }

    // ---- Retry Mode ----
    case 'retry': {
      logger.info(`Retrying failed jobs for ${args.date}`);
      const results = await orchestrator.retryFailedJobs(args.date);

      const succeeded = results.filter(r => r.status !== 'FAILED').length;
      const failed = results.filter(r => r.status === 'FAILED').length;

      logger.info(`Retry complete: ${succeeded} succeeded, ${failed} still failed`);

      await orchestrator.shutdown();
      process.exit(failed > 0 ? 1 : 0);
      break;
    }

    default:
      logger.error(`Unknown mode: ${args.mode}. Use: scheduler, fetch, retry`);
      process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
