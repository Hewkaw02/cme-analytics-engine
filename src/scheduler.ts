import cron from 'node-cron';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Orchestrator } from './orchestrator.js';
import { HolidayCalendar } from './utils/HolidayCalendar.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { analysisConfig } from './config/analysis.js';
import { humanDelay } from './utils/Delay.js';

/**
 * Cron job definition per Spec §14.1.
 * Times are in America/Chicago (CT) unless a job overrides the scheduler timezone.
 */
interface CronJobDef {
  name: string;
  expression: string;      // node-cron expression (5-field, seconds not included)
  description: string;
  timezone?: string;
  handler: (orchestrator: Orchestrator, tradeDate: string) => Promise<void>;
}

/**
 * Get today's trade date in YYYY-MM-DD format (Chicago time).
 */
function getTradeDateCT(): string {
  const now = new Date();
  const chicagoNow = toZonedTime(now, env.TIMEZONE);
  return format(chicagoNow, 'yyyy-MM-dd');
}

/**
 * Holiday guard — wraps a handler to skip execution on holidays & weekends.
 */
function withHolidayGuard(
  jobName: string,
  handler: (orchestrator: Orchestrator, tradeDate: string) => Promise<void>,
) {
  return async (orchestrator: Orchestrator, tradeDate: string) => {
    const today = new Date();
    const chicagoNow = toZonedTime(today, env.TIMEZONE);

    if (await HolidayCalendar.isHolidayOrWeekend(chicagoNow)) {
      logger.info(`[Scheduler] Skipping ${jobName} — holiday/weekend (${tradeDate})`);
      return;
    }

    await handler(orchestrator, tradeDate);
  };
}

/**
 * Cron job definitions for the CME Data Fetcher.
 */
// Schedule reference (all CT / America/Chicago):
//   analysis_hourly    0 17-23,0-15 * * 1-5             Hourly intraday + daily OI guard
//   intraday_backfill  0 4 * * 1-5                       04:00 CT daily backfill
//   gc_options         30 14 * * 1-5                     14:30 CT (GC RTH close)
//   es_nq_options      30 16 * * 1-5                     16:30 CT (ES/NQ after close)
//   oi_summary         0 17 * * 1-5                      17:00 CT
//   daily_settlement   30 17 * * 1-5                     17:30 CT
//   resample           15 17 * * 1-5                     17:15 CT (resample intraday)
//   cme_bulletin       0 18 * * 1-5                      18:00 CT
//   retry              30 18 * * 1-5                     18:30 CT (retry all failed)
const CRON_JOBS: CronJobDef[] = [
  {
    name: 'vol2vol_intraday',
    expression: '*/15 * * * *',
    description: 'Fetch CME Vol2Vol expected range data every 15 minutes around the clock',
    timezone: env.SCHEDULER_TIMEZONE,
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running vol2vol_intraday');
      for (const symbol of ['ES', 'NQ', 'GC']) {
        try {
          await orch.runJob('VOL2VOL', tradeDate, symbol);
          await humanDelay(2000, 5000);
        } catch (err) {
          logger.error(`[Scheduler] Failed vol2vol_intraday for ${symbol}`, { error: String(err) });
        }
      }
    },
  },
  {
    name: 'intraday_1m_es_nq',
    expression: '*/5 17-23,0-15 * * 1-5',
    description: 'Fetch ES/NQ 1-minute intraday bars every 5 minutes during trading hours',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running intraday_1m_es_nq');
      await orch.runIntradayPipeline(tradeDate, '1m', ['ES', 'NQ']);
    },
  },
  {
    name: 'intraday_1m_gc',
    expression: '*/3 * * * *',
    description: 'Fetch GC 1-minute intraday bars every 3 minutes around the clock',
    timezone: env.SCHEDULER_TIMEZONE,
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running intraday_1m_gc');
      await orch.runIntradayPipeline(tradeDate, '1m', ['GC']);
    },
  },
  {
    name: 'analysis_hourly',
    expression: analysisConfig.cron,
    description: 'Fetch current-day intraday bars hourly and OI once daily for analysis',
    handler: async (orch, tradeDate) => {
      if (!analysisConfig.enabled) {
        logger.info('[Scheduler] Skipping analysis_hourly; ANALYSIS_ENABLED=false');
        return;
      }

      logger.info('[Scheduler] Running analysis_hourly');
      await orch.runAnalysisPipeline(tradeDate, analysisConfig);
    },
  },
  {
    name: 'intraday_backfill',
    expression: '0 4 * * 1-5',
    description: 'Backfill missing intraday bars at 04:00 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running intraday_backfill');
      await orch.runIntradayPipeline(tradeDate);
    },
  },
  {
    name: 'gc_options',
    expression: '30 14 * * 1-5',
    description: 'Fetch GC options after 14:30 CT RTH close',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running gc_options');
      await orch.runOptionsPipeline(tradeDate, ['GC']);
    },
  },
  {
    name: 'es_nq_options',
    expression: '30 16 * * 1-5',
    description: 'Fetch ES/NQ options after 16:30 CT market close',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running es_nq_options');
      await orch.runOptionsPipeline(tradeDate, ['ES', 'NQ']);
    },
  },
  {
    name: 'oi_summary',
    expression: '0 17 * * 1-5',
    description: 'Compute OI summary at 17:00 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running oi_summary');
      await orch.runOISummaryJob(tradeDate);
    },
  },
  {
    name: 'daily_settlement',
    expression: '30 17 * * 1-5',
    description: 'Fetch settlement prices at 17:30 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running daily_settlement');
      await orch.runSettlementPipeline(tradeDate);
    },
  },
  {
    name: 'resample',
    expression: '15 17 * * 1-5',
    description: 'Resample intraday data to higher timeframes at 17:15 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running resample');
      await orch.runJob('RESAMPLE', tradeDate);
    },
  },
  {
    name: 'cme_bulletin',
    expression: '0 18 * * 1-5',
    description: 'Fetch CME Daily Bulletin at 18:00 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running cme_bulletin');
      await orch.runBulletinJob(tradeDate);
    },
  },
  {
    name: 'retry',
    expression: '30 18 * * 1-5',
    description: 'Retry all failed jobs at 18:30 CT',
    handler: async (orch, tradeDate) => {
      logger.info('[Scheduler] Running retry sweep');
      await orch.retryFailedJobs(tradeDate);
    },
  },
];

/**
 * Scheduler class — manages cron job lifecycle.
 *
 * Usage:
 *   const scheduler = new Scheduler(orchestrator);
 *   scheduler.start();
 *   // ... on shutdown:
 *   scheduler.stop();
 */
export class Scheduler {
  private tasks: cron.ScheduledTask[] = [];
  private orchestrator: Orchestrator;
  private running = false;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Start all cron jobs.
   */
  start(): void {
    if (this.running) {
      logger.warn('[Scheduler] Already running');
      return;
    }

    logger.info(
      `[Scheduler] Starting ${CRON_JOBS.length} cron jobs (Market TZ: ${env.TIMEZONE}, Scheduler TZ: ${env.SCHEDULER_TIMEZONE})`,
    );

    for (const jobDef of CRON_JOBS) {
      const guarded = withHolidayGuard(jobDef.name, jobDef.handler);

      const task = cron.schedule(
        jobDef.expression,
        async () => {
          const tradeDate = getTradeDateCT();
          try {
            await guarded(this.orchestrator, tradeDate);
          } catch (err) {
            logger.error(`[Scheduler] Job "${jobDef.name}" threw unhandled error`, {
              error: err instanceof Error ? err.message : String(err),
              tradeDate,
            });
          }
        },
        {
          timezone: jobDef.timezone ?? env.TIMEZONE,
          scheduled: true,
        },
      );

      this.tasks.push(task);
      logger.info(
        `[Scheduler] Registered: ${jobDef.name} — ${jobDef.expression} (${jobDef.timezone ?? env.TIMEZONE}) — ${jobDef.description}`,
      );
    }

    this.running = true;
    logger.info(`[Scheduler] All ${CRON_JOBS.length} cron jobs started`);
  }

  /**
   * Stop all cron jobs.
   */
  stop(): void {
    logger.info('[Scheduler] Stopping all cron jobs...');
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    this.running = false;
    logger.info('[Scheduler] All cron jobs stopped');
  }

  /**
   * Check if the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the list of registered job names and their cron expressions.
   */
  getJobs(): Array<{ name: string; expression: string; description: string; timezone: string }> {
    return CRON_JOBS.map(j => ({
      name: j.name,
      expression: j.expression,
      description: j.description,
      timezone: j.timezone ?? env.TIMEZONE,
    }));
  }
}
