import { BrowserPool, BrowserPage } from '../browser/BrowserPool.js';
import { logger } from '../utils/logger.js';
import { humanDelay } from '../utils/Delay.js';
import path from 'path';
import fs from 'fs-extra';

/**
 * Error types for classification per Spec §15.1
 */
export enum ScraperErrorType {
  TRANSIENT = 'TRANSIENT', // Timeout, network issues → retry 3x
  BOT_DETECT = 'BOT_DETECT', // 403, challenge page → rotate proxy/UA → retry 2x
  PARSE_ERROR = 'PARSE_ERROR', // Bad JSON, missing fields → screenshot + fallback
  VALIDATION = 'VALIDATION', // Data quality issue → mark invalid, save anyway
  DB_ERROR = 'DB_ERROR', // Insert failure → buffer in memory → retry
  FATAL = 'FATAL', // Unrecoverable → alert + stop
}

/**
 * Retry configuration per error type (Spec §15.1)
 */
const RETRY_CONFIG: Record<ScraperErrorType, { maxRetries: number; backoffMs: number[] }> = {
  [ScraperErrorType.TRANSIENT]: { maxRetries: 3, backoffMs: [5_000, 30_000, 120_000] }, // Reduced initial retry to 5s
  [ScraperErrorType.BOT_DETECT]: { maxRetries: 2, backoffMs: [60_000, 120_000] },
  [ScraperErrorType.PARSE_ERROR]: { maxRetries: 1, backoffMs: [30_000] },
  [ScraperErrorType.VALIDATION]: { maxRetries: 0, backoffMs: [] },
  [ScraperErrorType.DB_ERROR]: { maxRetries: 3, backoffMs: [5_000, 15_000, 30_000] },
  [ScraperErrorType.FATAL]: { maxRetries: 0, backoffMs: [] },
};

/**
 * Abstract base class for all CME scrapers.
 * Provides retry logic, error classification, and screenshot-on-error.
 */
export abstract class BaseScraper {
  protected pool: BrowserPool;

  constructor(pool: BrowserPool) {
    this.pool = pool;
  }

  /**
   * Main scrape method — must be implemented by subclasses.
   */
  abstract scrape(symbol: string, ...args: unknown[]): Promise<unknown>;

  /**
   * Retry wrapper with exponential backoff based on error type.
   */
  protected async retry<T>(
    fn: () => Promise<T>,
    label: string,
    errorType: ScraperErrorType = ScraperErrorType.TRANSIENT,
  ): Promise<T> {
    const config = RETRY_CONFIG[errorType];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isLastAttempt = attempt === config.maxRetries;

        logger.warn(`${label} attempt ${attempt + 1}/${config.maxRetries + 1} failed`, {
          error: lastError.message,
          errorType,
          isLastAttempt,
        });

        if (isLastAttempt) break;

        // Wait before retry
        const backoff = config.backoffMs[attempt] || config.backoffMs[config.backoffMs.length - 1];
        logger.info(`${label} retrying in ${backoff / 1000}s...`);
        await humanDelay(backoff, backoff + 5_000);
      }
    }

    throw lastError!;
  }

  /**
   * Classify an error into a ScraperErrorType.
   */
  protected classifyError(err: Error): ScraperErrorType {
    const msg = err.message.toLowerCase();

    // Bot detection
    if (
      msg.includes('403') ||
      msg.includes('challenge') ||
      msg.includes('captcha') ||
      msg.includes('blocked')
    ) {
      return ScraperErrorType.BOT_DETECT;
    }

    // Network / timeout
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('socket') ||
      msg.includes('network') ||
      msg.includes('aborted')
    ) {
      return ScraperErrorType.TRANSIENT;
    }

    // Parse errors
    if (
      msg.includes('json') ||
      msg.includes('parse') ||
      msg.includes('unexpected token') ||
      msg.includes('undefined is not')
    ) {
      return ScraperErrorType.PARSE_ERROR;
    }

    // DB errors
    if (
      msg.includes('relation') ||
      msg.includes('constraint') ||
      msg.includes('duplicate') ||
      (msg.includes('connection') && msg.includes('pool'))
    ) {
      return ScraperErrorType.DB_ERROR;
    }

    return ScraperErrorType.FATAL;
  }

  /**
   * Take a screenshot on error for debugging (Spec §3.3).
   */
  protected async screenshotOnError(
    page: BrowserPage,
    symbol: string,
    context: string,
  ): Promise<void> {
    try {
      const errorsDir = path.join(process.cwd(), 'errors');
      await fs.ensureDir(errorsDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '');
      const filename = `${timestamp}_${symbol}_${context}.png`;
      const filepath = path.join(errorsDir, filename);

      await page.screenshot({ path: filepath, fullPage: true });
      logger.info(`Error screenshot saved: ${filepath}`);
    } catch (err) {
      logger.warn('Failed to take error screenshot', { error: String(err) });
    }
  }
}
