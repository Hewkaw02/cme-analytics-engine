import { BrowserPool } from './browser/BrowserPool.js';
import { JobRepository, JobType, JobStatus } from './db/repositories/JobRepository.js';
import { CircuitBreaker, CircuitOpenError } from './utils/CircuitBreaker.js';
import { HolidayCalendar } from './utils/HolidayCalendar.js';
import { SlackNotifier, JobSummary } from './notifications/SlackNotifier.js';
import { LineNotifier } from './notifications/LineNotifier.js';
import { logger } from './utils/logger.js';
import { humanDelay } from './utils/Delay.js';
import { format } from 'date-fns';
import { Symbol, Timeframe } from './types.js';
import { analysisConfig, AnalysisConfig } from './config/analysis.js';

/**
 * Symbol ordering per Spec §9 Architecture.
 */
const SYMBOLS = ['ES', 'NQ', 'GC'] as const;
type SymbolName = (typeof SYMBOLS)[number];

/**
 * Job ordering per Spec §9 Architecture.
 */
const JOB_ORDER: JobType[] = ['OPTIONS', 'OI', 'INTRADAY', 'SETTLEMENT', 'BULLETIN'];

/**
 * Retry configuration per error class (Spec §15.1).
 * Maps to backoff delays in milliseconds.
 */
const RETRY_BACKOFF: Record<string, number[]> = {
  TRANSIENT:   [120_000, 300_000, 600_000],  // 2m → 5m → 10m
  BOT_DETECT:  [60_000, 120_000],            // 1m → 2m
  PARSE_ERROR: [30_000],                     // 30s
  DB_ERROR:    [5_000, 15_000, 30_000],      // 5s → 15s → 30s
};

/**
 * Result from running a single job.
 */
interface JobResult {
  jobId: string;
  jobType: JobType;
  symbol?: string;
  status: JobStatus;
  recordsInserted: number;
  recordsSkipped: number;
  recordsInvalid: number;
  durationMs: number;
  error?: string;
}

/**
 * Orchestrator — central job execution engine (Spec §9, §14, §15).
 *
 * Responsibilities:
 *   - Manage job queue: [OPTIONS, OI, INTRADAY, SETTLEMENT, BULLETIN]
 *   - Execute symbols in order: [ES, NQ, GC]
 *   - Control concurrency: max 2 browser sessions (via BrowserPool)
 *   - Failover chain: browser → direct API → retry
 *   - Log every job to `fetch_jobs` table
 *   - Notify via Slack/LINE on completion or failure
 */
export class Orchestrator {
  private pool: BrowserPool;
  private jobRepo: JobRepository;
  private circuitBreaker: CircuitBreaker;
  private slack: SlackNotifier;
  private line: LineNotifier;

  constructor(pool: BrowserPool) {
    this.pool = pool;
    this.jobRepo = new JobRepository();
    this.slack = new SlackNotifier();
    this.line = new LineNotifier();

    // Initialize circuit breaker with env-configurable options
    const threshold = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10);
    const resetMs = parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '300000', 10);

    this.circuitBreaker = new CircuitBreaker('CME_ORCHESTRATOR', {
      threshold,
      resetTimeoutMs: resetMs,
    });

    // Wire circuit breaker alerts to notification channels
    this.circuitBreaker.onStateChange(async (newState, oldState, failures) => {
      if (newState === 'OPEN') {
        const message = `🔴 Circuit breaker OPENED after ${failures} failures. All jobs paused for ${resetMs / 1000}s.`;
        logger.error(message);
        await this.slack.sendAlert(message);
      } else if (newState === 'CLOSED' && oldState === 'OPEN') {
        const message = '🟢 Circuit breaker CLOSED — resuming normal operation.';
        logger.info(message);
        await this.slack.sendAlert(message);
      }
    });
  }

  // =============================================
  //  Public API
  // =============================================

  /**
   * Run a single job for one symbol.
   * Creates a fetch_jobs record, executes the scraper, updates the record.
   */
  async runJob(jobType: JobType, tradeDate: string, symbol?: string, timeframe?: string): Promise<JobResult> {
    const startTime = Date.now();
    const jobId = await this.jobRepo.createJob({
      run_date: tradeDate,
      job_type: jobType,
      symbol,
      timeframe,
    });

    logger.info(`Job started: ${jobType} ${symbol || 'ALL'} for ${tradeDate}`, { jobId });

    try {
      // Execute through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        return this.executeJob(jobType, tradeDate, symbol, timeframe);
      });

      const durationMs = Date.now() - startTime;
      const status: JobStatus = result.recordsInvalid > 0 ? 'PARTIAL' : 'SUCCESS';

      await this.jobRepo.updateJob(jobId, {
        status,
        records_inserted: result.recordsInserted,
        records_skipped: result.recordsSkipped,
        records_invalid: result.recordsInvalid,
      });

      const jobResult: JobResult = {
        jobId,
        jobType,
        symbol,
        status,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped,
        recordsInvalid: result.recordsInvalid,
        durationMs,
      };

      // Send success notification
      await this.notifyJobComplete(jobResult);
      return jobResult;

    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isCircuitOpen = err instanceof CircuitOpenError;

      await this.jobRepo.updateJob(jobId, {
        status: 'FAILED',
        error_message: errorMessage,
      });

      const jobResult: JobResult = {
        jobId,
        jobType,
        symbol,
        status: 'FAILED',
        recordsInserted: 0,
        recordsSkipped: 0,
        recordsInvalid: 0,
        durationMs,
        error: errorMessage,
      };

      // Send failure notification
      await this.notifyJobComplete(jobResult);

      if (isCircuitOpen) {
        logger.error(`Job ${jobType} ${symbol || ''} blocked by circuit breaker`, { jobId });
      } else {
        logger.error(`Job ${jobType} ${symbol || ''} failed`, { jobId, error: errorMessage });
      }

      return jobResult;
    }
  }

  /**
   * Run the full daily pipeline for all job types and symbols.
   * Called by scheduler at appropriate times.
   */
  async runOptionsPipeline(tradeDate: string, symbols: readonly string[] = SYMBOLS): Promise<JobResult[]> {
    const results: JobResult[] = [];

    for (const symbol of symbols) {
      // Options
      const optResult = await this.runJob('OPTIONS', tradeDate, symbol);
      results.push(optResult);
      await humanDelay(2000, 4000);

      // OI (depends on options data)
      const oiResult = await this.runJob('OI', tradeDate, symbol);
      results.push(oiResult);
      await humanDelay(1500, 3000);
    }

    return results;
  }

  /**
   * Run intraday scraping for all symbols for a specific timeframe window.
   */
  async runIntradayPipeline(
    tradeDate: string,
    timeframe?: string,
    symbols: readonly string[] = SYMBOLS,
  ): Promise<JobResult[]> {
    const results: JobResult[] = [];

    for (const symbol of symbols) {
      const result = await this.runJob('INTRADAY', tradeDate, symbol, timeframe);
      results.push(result);
      await humanDelay(800, 1500);
    }

    return results;
  }

  async runAnalysisPipeline(
    tradeDate: string,
    config: AnalysisConfig = analysisConfig,
  ): Promise<JobResult[]> {
    const results: JobResult[] = [];
    const timeframe = config.timeframes.join(',');

    results.push(...await this.runIntradayPipeline(tradeDate, timeframe, config.symbols));

    // Post-scraping: Trigger indicator calculations for all processed symbols and timeframes
    logger.info('[Analysis] Computing derived technical indicators for fetched timeframes');
    try {
      const { Indicators } = await import('./analytics/Indicators.js');
      const { db: kyselyDb } = await import('./db/client.js');
      for (const symbol of config.symbols) {
        for (const tf of config.timeframes) {
          await Indicators.computeIntradayIndicators(kyselyDb, symbol, tf);
        }
      }
    } catch (err) {
      logger.error('[Analysis] Error computing technical indicators', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (config.fetchOi) {
      for (const symbol of config.symbols) {
        const alreadyFetched = await this.jobRepo.hasSuccessfulJob(tradeDate, 'OI', symbol);
        if (alreadyFetched) {
          logger.info(`[Analysis] Skipping OI for ${symbol}; successful OI job already exists for ${tradeDate}`);
          continue;
        }

        const result = await this.runJob('OI', tradeDate, symbol);
        results.push(result);
        await humanDelay(1500, 3000);
      }
    }

    // Post-analysis: Update option summaries and render the beautiful console chart + stats
    logger.info('[Analysis] Completing post-analysis visualizations and summaries');

    // 1. Compute/refresh OISummaries so our visualizer is 100% up-to-date with GEX, Max Pain, Skew, etc.
    for (const symbol of config.symbols) {
      try {
        await this.runJob('OI_SUMMARY', tradeDate, symbol);
      } catch (err) {
        logger.warn(`[Analysis] Failed to run OI_SUMMARY job for ${symbol} on ${tradeDate}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Import and trigger the premium console visualizer charts
    try {
      const { ConsoleVisualizer } = await import('./utils/ConsoleVisualizer.js');
      const primaryTf = config.timeframes[0] || '1m';
      for (const symbol of config.symbols) {
        await ConsoleVisualizer.displayAnalysis(symbol, tradeDate, primaryTf, 40);
      }
    } catch (err) {
      logger.error('[Analysis] Error executing visualizer charts', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return results;
  }

  /**
   * Run settlement scraper for all symbols.
   */
  async runSettlementPipeline(tradeDate: string): Promise<JobResult[]> {
    const results: JobResult[] = [];

    for (const symbol of SYMBOLS) {
      const result = await this.runJob('SETTLEMENT', tradeDate, symbol);
      results.push(result);
      await humanDelay(1000, 2000);
    }

    return results;
  }

  /**
   * Run the CME Daily Bulletin scraper (cross-symbol).
   */
  async runBulletinJob(tradeDate: string): Promise<JobResult> {
    return this.runJob('BULLETIN', tradeDate);
  }

  /**
   * Run OI Summary computation (post-options analytics).
   */
  async runOISummaryJob(tradeDate: string): Promise<JobResult[]> {
    const results: JobResult[] = [];
    for (const symbol of SYMBOLS) {
      const result = await this.runJob('OI_SUMMARY', tradeDate, symbol);
      results.push(result);
    }
    return results;
  }

  /**
   * Retry all failed jobs from today (Spec §14.1 — 18:30 CT).
   */
  async retryFailedJobs(tradeDate: string): Promise<JobResult[]> {
    const failedJobs = await this.jobRepo.getFailedJobs(tradeDate);
    const results: JobResult[] = [];

    if (failedJobs.length === 0) {
      logger.info(`No failed jobs to retry for ${tradeDate}`);
      return results;
    }

    logger.info(`Retrying ${failedJobs.length} failed jobs for ${tradeDate}`);

    for (const job of failedJobs) {
      // Determine retry backoff based on retry count
      const retryCount = job.retry_count + 1;
      const backoffKey = this.classifyJobError(job.error_message || '');
      const backoffs = RETRY_BACKOFF[backoffKey] || RETRY_BACKOFF.TRANSIENT;
      const backoffIdx = Math.min(retryCount - 1, backoffs.length - 1);

      logger.info(`Retrying job ${job.job_type} ${job.symbol || ''} (attempt ${retryCount})`, {
        originalJobId: job.job_id,
        backoffMs: backoffs[backoffIdx],
      });

      // Wait backoff period
      await humanDelay(backoffs[backoffIdx], backoffs[backoffIdx] + 5_000);

      const result = await this.runJob(
        job.job_type as JobType,
        tradeDate,
        job.symbol || undefined,
        job.timeframe || undefined,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Get current circuit breaker state (for health checks / monitoring).
   */
  getCircuitState() {
    return {
      state: this.circuitBreaker.getState(),
      failures: this.circuitBreaker.getFailureCount(),
      errorRate: this.circuitBreaker.getErrorRate(),
    };
  }

  /**
   * Graceful shutdown — close browser pool, destroy circuit breaker.
   */
  async shutdown(): Promise<void> {
    logger.info('Orchestrator shutting down...');
    this.circuitBreaker.destroy();
    await this.pool.closeAll();
    logger.info('Orchestrator shutdown complete');
  }

  // =============================================
  //  Internal
  // =============================================

  /**
   * Execute the actual scraper logic for a given job type.
   * This is where the scraper modules are called.
   *
   * Returns record counts for job tracking.
   */
  private async executeJob(
    jobType: JobType,
    tradeDate: string,
    symbol?: string,
    _timeframe?: string,
  ): Promise<{ recordsInserted: number; recordsSkipped: number; recordsInvalid: number }> {
    // Each job type delegates to its respective scraper.
    // The scrapers are imported lazily to avoid circular deps and allow
    // this module to work even if some scrapers aren't yet fully wired.

    switch (jobType) {
      case 'OPTIONS': {
        logger.info(`Executing OPTIONS job for ${symbol} on ${tradeDate}`);
        // OptionsScraper is instantiated with the pool and called
        // In production, this would do:
        //   const scraper = new OptionsScraper(this.pool);
        //   const result = await scraper.scrape(symbol);
        //   await repo.upsertOptionsChain(result.records);
        // For now, delegate to scraper infrastructure:
        return this.executeScraper('OptionsScraper', symbol!, tradeDate);
      }

      case 'OI': {
        logger.info(`Executing OI job for ${symbol} on ${tradeDate}`);
        return this.executeScraper('OIScraper', symbol!, tradeDate);
      }

      case 'INTRADAY': {
        logger.info(`Executing INTRADAY job for ${symbol} on ${tradeDate}`);
        return this.executeScraper('IntradayScraper', symbol!, tradeDate, _timeframe);
      }

      case 'ANALYSIS': {
        logger.info(`Executing ANALYSIS job for ${tradeDate}`);
        const results = await this.runAnalysisPipeline(tradeDate);
        return {
          recordsInserted: results.reduce((sum, result) => sum + result.recordsInserted, 0),
          recordsSkipped: results.reduce((sum, result) => sum + result.recordsSkipped, 0),
          recordsInvalid: results.reduce((sum, result) => sum + result.recordsInvalid, 0),
        };
      }

      case 'SETTLEMENT': {
        logger.info(`Executing SETTLEMENT job for ${symbol} on ${tradeDate}`);
        return this.executeScraper('SettlementScraper', symbol!, tradeDate);
      }

      case 'VOL2VOL': {
        logger.info(`Executing VOL2VOL job for ${symbol} on ${tradeDate}`);
        return this.executeScraper('Vol2VolScraper', symbol!, tradeDate);
      }

      case 'BULLETIN': {
        logger.info(`Executing BULLETIN job for ${tradeDate}`);
        return this.executeScraper('BulletinScraper', undefined, tradeDate);
      }

      case 'OI_SUMMARY': {
        logger.info(`Executing OI_SUMMARY computation for ${symbol} on ${tradeDate}`);
        const { computeOISummary, upsertOISummaries } = await import('./analytics/OISummary.js');
        const { computeOIByStrike } = await import('./analytics/OIByStrike.js');
        const { exportForwardTestCsvs } = await import('./exporters/ForwardTestExporter.js');
        const { env } = await import('./config/env.js');
        const { getPool } = await import('./db/client.js');
        const { OptionsRepository } = await import('./db/repositories/OptionsRepository.js');

        const pgPool = getPool();
        const optRepo = new OptionsRepository();
        // Fetch today's options data for the symbol from DB
        const optionsData = await optRepo.getOptionsForDate(symbol!, tradeDate);
        const summaries = await computeOISummary(pgPool, optionsData, symbol!, tradeDate);
        const strikeOI = computeOIByStrike(optionsData, symbol!, tradeDate);
        await upsertOISummaries(pgPool, summaries);
        try {
          await exportForwardTestCsvs({
            outputDir: env.OUTPUT_DIR,
            symbol: symbol!,
            tradeDate,
            oiSummaries: summaries,
            strikeOI: strikeOI,
          });
        } catch (e) {
          logger.warn('Failed to export OI summary to CSV', { error: String(e) });
        }
        try {
          const { buildPredictionSnapshot, exportPredictionSnapshot } = await import('./exporters/PredictionExporter.js');
          const summary = summaries[0];
          if (summary) {
            const currentPrice =
              summary.underlying_price ??
              summary.max_pain_strike ??
              summary.max_call_oi_strike ??
              summary.max_put_oi_strike;
            if (currentPrice != null) {
              const snapshot = buildPredictionSnapshot({
                symbol: symbol! as Symbol,
                asOfUtc: new Date().toISOString(),
                sourceTradeDate: tradeDate,
                targetTradeDate: tradeDate,
                hasFreshIntraday: true,
                hasCurrentOfficialOi: true,
                currentPrice,
                callWall: summary.max_call_oi_strike,
                putWall: summary.max_put_oi_strike,
                sourceFiles: [
                  `oi/${symbol}_oi_summary_${tradeDate.replace(/-/g, '')}.csv`,
                  `oi/${symbol}_options_oi_by_strike_${tradeDate.replace(/-/g, '')}.csv`,
                ],
              });
              await exportPredictionSnapshot(snapshot, env.OUTPUT_DIR);
            }
          }
        } catch (e) {
          logger.warn('Failed to export prediction snapshot', { error: String(e) });
        }

        return {
          recordsInserted: summaries.length,
          recordsSkipped: 0,
          recordsInvalid: 0,
        };
      }

      case 'RESAMPLE': {
        logger.info(`Executing RESAMPLE for ${tradeDate}`);
        const { Indicators } = await import('./analytics/Indicators.js');
        const { db: kyselyDb } = await import('./db/client.js');

        const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'];
        const symbols = ['ES', 'NQ', 'GC'];
        let totalComputed = 0;

        for (const sym of symbols) {
          for (const tf of timeframes) {
            await Indicators.computeIntradayIndicators(kyselyDb, sym, tf);
            totalComputed++;
          }
        }

        return { recordsInserted: totalComputed, recordsSkipped: 0, recordsInvalid: 0 };
      }

      default: {
        logger.warn(`Unknown job type: ${jobType}`);
        return { recordsInserted: 0, recordsSkipped: 0, recordsInvalid: 0 };
      }
    }
  }

  /**
   * Generic scraper execution wrapper.
   * Dynamically imports and runs the appropriate scraper.
   */
  private async executeScraper(
    scraperName: string,
    symbol: string | undefined,
    tradeDate: string,
    timeframe?: string,
  ): Promise<{ recordsInserted: number; recordsSkipped: number; recordsInvalid: number }> {
    try {
      switch (scraperName) {
        case 'OptionsScraper': {
          const { OptionsScraper } = await import('./scrapers/OptionsScraper.js');
          const { OptionsRepository } = await import('./db/repositories/OptionsRepository.js');
          const { CSVExporter } = await import('./exporters/CSVExporter.js');
          const { env } = await import('./config/env.js');
          
          const scraper = new OptionsScraper(this.pool);
          const repo = new OptionsRepository();
          
          const result = await scraper.scrape(symbol! as Symbol, tradeDate);
          const records = Array.isArray(result) ? result : (result as any)?.records ?? [];
          const summary = (result as any)?.summary || { valid: records.length, invalid: 0, skipped: 0 };

          if (records.length > 0) {
            await repo.upsertOptionsChain(records);
            try {
              await CSVExporter.exportOptions(records, symbol!, tradeDate, env.OUTPUT_DIR);
            } catch (exportErr) {
              logger.warn('Failed to export options to CSV', { error: String(exportErr) });
            }
          }

          return {
            recordsInserted: summary.valid || records.length,
            recordsSkipped: summary.skipped || 0,
            recordsInvalid: summary.invalid || 0,
          };
        }

        case 'OIScraper': {
          const { OIScraper } = await import('./scrapers/OIScraper.js');
          const { OIRepository } = await import('./db/repositories/OIRepository.js');
          const { exportForwardTestCsvs } = await import('./exporters/ForwardTestExporter.js');
          const { env } = await import('./config/env.js');
          const { db: kyselyInstance } = await import('./db/client.js');
          
          const scraper = new OIScraper(this.pool);
          const repo = new OIRepository(kyselyInstance);
          
          const result = await scraper.scrape(symbol!, tradeDate);
          if (result.futuresOI.length > 0) {
            await repo.upsertFuturesOI(result.futuresOI);
          }

          if (result.futuresOI.length > 0 || result.strikeOI.length > 0) {
            try {
              await exportForwardTestCsvs({
                outputDir: env.OUTPUT_DIR,
                symbol: symbol!,
                tradeDate,
                futuresOI: result.futuresOI,
                strikeOI: result.strikeOI,
              });
            } catch (e) {
              logger.warn('Failed to export OI to CSV', { error: String(e) });
            }
          }

          return {
            recordsInserted: result.futuresOI.length + result.strikeOI.length,
            recordsSkipped: 0,
            recordsInvalid: 0,
          };
        }

        case 'IntradayScraper': {
          const { IntradayScraper } = await import('./scrapers/IntradayScraper.js');
          const { IntradayRepository } = await import('./db/repositories/IntradayRepository.js');
          const { exportForwardTestCsvs } = await import('./exporters/ForwardTestExporter.js');
          const { env } = await import('./config/env.js');
          const repo = new IntradayRepository();
          const scraper = new IntradayScraper(this.pool, repo);
          const timeframes = (timeframe ? timeframe.split(',') : ['1m']).map((tf) => tf.trim()).filter(Boolean);
          const result = await scraper.scrapeAllTimeframes(symbol!, tradeDate, timeframes as Timeframe[]);
          try {
            await exportForwardTestCsvs({
              outputDir: env.OUTPUT_DIR,
              symbol: symbol!,
              tradeDate,
              intradayResults: result.results,
            });
          } catch (e) {
            logger.warn('Failed to export intraday to CSV', { error: String(e) });
          }
          return { recordsInserted: result.recordsInserted, recordsSkipped: 0, recordsInvalid: 0 };
        }

        case 'Vol2VolScraper': {
          const { Vol2VolScraper } = await import('./scrapers/Vol2VolScraper.js');
          const scraper = new Vol2VolScraper(this.pool);
          return await scraper.scrape(symbol!, tradeDate);
        }

        case 'SettlementScraper': {
          const { SettlementScraper } = await import('./scrapers/SettlementScraper.js');
          const { CSVExporter } = await import('./exporters/CSVExporter.js');
          const { env } = await import('./config/env.js');
          const { db } = await import('./db/client.js');
          const scraper = new SettlementScraper(this.pool, db);
          const records = await scraper.scrape(symbol!, tradeDate);
          
          if (records.length > 0) {
            try {
              await CSVExporter.exportSettlement(records, symbol!, tradeDate, env.OUTPUT_DIR);
            } catch (e) {
              logger.warn('Failed to export settlement to CSV', { error: String(e) });
            }
          }

          return {
            recordsInserted: records.length,
            recordsSkipped: 0,
            recordsInvalid: 0,
          };
        }

        case 'BulletinScraper': {
          const { BulletinScraper } = await import('./scrapers/BulletinScraper.js');
          const { db } = await import('./db/client.js');
          const scraper = new BulletinScraper(this.pool, db);
          const records = await scraper.scrape(tradeDate);
          return {
            recordsInserted: records.length,
            recordsSkipped: 0,
            recordsInvalid: 0,
          };
        }

        default:
          logger.warn(`Unknown scraper: ${scraperName}`);
          return { recordsInserted: 0, recordsSkipped: 0, recordsInvalid: 0 };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Scraper ${scraperName} execution failed`, { symbol, error: errorMsg });
      throw err;
    }
  }

  /**
   * Classify an error message into a retry backoff category.
   */
  private classifyJobError(errorMessage: string): string {
    const msg = errorMessage.toLowerCase();
    if (msg.includes('403') || msg.includes('challenge') || msg.includes('captcha')) return 'BOT_DETECT';
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return 'TRANSIENT';
    if (msg.includes('json') || msg.includes('parse')) return 'PARSE_ERROR';
    if (msg.includes('relation') || msg.includes('constraint') || msg.includes('pool')) return 'DB_ERROR';
    return 'TRANSIENT';
  }

  /**
   * Send notifications for a completed job.
   */
  private async notifyJobComplete(result: JobResult): Promise<void> {
    const summary: JobSummary = {
      symbol: result.symbol || 'ALL',
      type: result.jobType,
      date: new Date().toISOString().slice(0, 10),
      status: result.status,
      recordsInserted: result.recordsInserted,
      recordsSkipped: result.recordsSkipped,
      recordsInvalid: result.recordsInvalid,
      durationMs: result.durationMs,
      errorMessage: result.error,
    };

    try {
      await this.slack.sendSummary(summary);
    } catch (err) {
      logger.warn('Failed to send Slack notification', { error: String(err) });
    }

    try {
      await this.line.sendSummary(summary);
    } catch (err) {
      logger.warn('Failed to send LINE notification', { error: String(err) });
    }
  }
}
