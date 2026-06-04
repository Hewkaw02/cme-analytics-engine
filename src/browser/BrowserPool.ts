import { logger } from '../utils/logger.js';
import { SessionConfig } from '../types.js';

/**
 * Browser page wrapper — thin facade that adapts camofox-browser or any
 * Puppeteer-compatible page object for use by scrapers.
 */
export interface BrowserPage {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  waitForNetworkIdle?(options?: { idleTime?: number }): Promise<void>;
  setRequestInterception(value: boolean): Promise<void>;
  route(url: string | RegExp | ((url: URL) => boolean), handler: (route: any, request: any) => void): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $$eval<T>(selector: string, fn: (elements: any[]) => T): Promise<T>;
  select(selector: string, ...values: string[]): Promise<string[]>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
}

/**
 * Manages a pool of browser instances with acquire/release semantics.
 * Limits concurrency to maxInstances to prevent resource exhaustion.
 */
export class BrowserPool {
  private maxInstances: number;
  private activeSessions: Set<BrowserPage> = new Set();
  private waitQueue: Array<(page: BrowserPage) => void> = [];
  private config: SessionConfig;
  private closed = false;

  constructor(config: SessionConfig, options: { maxInstances: number }) {
    this.config = config;
    this.maxInstances = options.maxInstances;
    logger.info(`BrowserPool initialized (max: ${this.maxInstances})`);
  }

  /**
   * Acquire a browser page from the pool.
   * If max instances reached, waits until one is released.
   */
  async acquire(): Promise<BrowserPage> {
    if (this.closed) {
      throw new Error('BrowserPool is closed');
    }

    if (this.activeSessions.size < this.maxInstances) {
      return this.createSession();
    }

    // Wait for a session to be released
    logger.debug(
      `BrowserPool at capacity (${this.activeSessions.size}/${this.maxInstances}), waiting...`,
    );
    return new Promise<BrowserPage>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a browser page back to the pool.
   */
  async release(page: BrowserPage): Promise<void> {
    this.activeSessions.delete(page);

    try {
      await page.close();
    } catch (err) {
      logger.warn('Failed to close browser page', { error: String(err) });
    }

    // If someone is waiting, create a new session for them
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      try {
        const newPage = await this.createSession();
        resolve(newPage);
      } catch (err) {
        logger.error('Failed to create session for waiting caller', { error: String(err) });
      }
    }
  }

  /**
   * Close all active sessions and reject pending waiters.
   */
  async closeAll(): Promise<void> {
    this.closed = true;

    // Reject all waiting callers
    for (const resolve of this.waitQueue) {
      // Resolve with a dummy that immediately throws
      resolve(null as unknown as BrowserPage);
    }
    this.waitQueue = [];

    // Close all active sessions
    const closePromises = Array.from(this.activeSessions).map(async (page) => {
      try {
        await page.close();
      } catch (err) {
        logger.warn('Error closing browser page during shutdown', { error: String(err) });
      }
    });

    await Promise.all(closePromises);
    this.activeSessions.clear();
    logger.info('BrowserPool closed all sessions');
  }

  /**
   * Current pool utilization.
   */
  get activeCount(): number {
    return this.activeSessions.size;
  }

  get waitingCount(): number {
    return this.waitQueue.length;
  }

  /**
   * Create a new browser session. Attempts camofox-browser first, falls back
   * to a warning stub if the package is not installed.
   */
  private async createSession(): Promise<BrowserPage> {
    try {
      // Dynamic import — camoufox-js may not be installed in dev
      const camoufoxModule = (await import('camoufox-js').catch(() => null)) as any;

      if (camoufoxModule && typeof camoufoxModule.Camoufox === 'function') {
        let browser;
        try {
          // FORCE DISABLE PROXY for now due to persistent timeouts
          const useProxy = false; // this.config.proxy
          logger.info(`Attempting to create browser session (Proxy: ${useProxy})`);
          browser = await camoufoxModule.Camoufox({
            headless: this.config.headless,
            proxy: useProxy ? { server: this.config.proxy } : undefined,
          });
        } catch (proxyErr) {
          if (this.config.proxy) {
            logger.warn('Failed to create browser with proxy, falling back to direct connection', {
              error: String(proxyErr),
            });
            browser = await camoufoxModule.Camoufox({
              headless: this.config.headless,
            });
          } else {
            throw proxyErr;
          }
        }

        const page = await browser.newPage();

        // Configure viewport
        await page.setViewportSize(this.config.viewport);

        this.activeSessions.add(page as unknown as BrowserPage);
        logger.info('Browser session created via camofox-browser');
        return page as unknown as BrowserPage;
      }
    } catch (err) {
      logger.warn('camofox-browser not available, using stub page', { error: String(err) });
    }

    // Fallback: create a stub page for development / testing without browser
    const stubPage = this.createStubPage();
    this.activeSessions.add(stubPage);
    logger.warn('Using STUB browser page — install camofox-browser for real scraping');
    return stubPage;
  }

  /**
   * Creates a stub BrowserPage for development without camofox-browser.
   * Methods log calls but don't perform real browser actions.
   */
  private createStubPage(): BrowserPage {
    return {
      async goto(url: string) {
        logger.debug(`[STUB] goto: ${url}`);
      },
      async waitForSelector(selector: string) {
        logger.debug(`[STUB] waitForSelector: ${selector}`);
      },
      async waitForNetworkIdle() {
        logger.debug('[STUB] waitForNetworkIdle');
      },
      async setRequestInterception(_value: boolean) {
        logger.debug('[STUB] setRequestInterception');
      },
      async route(_url: any, _handler: any) {
        logger.debug('[STUB] route');
      },
      on(_event: string, _handler: (...args: unknown[]) => void) {
        logger.debug(`[STUB] on(${_event})`);
      },
      async evaluate<T>(): Promise<T> {
        logger.debug('[STUB] evaluate');
        return null as T;
      },
      async $$eval<T>(): Promise<T> {
        logger.debug('[STUB] $$eval');
        return [] as unknown as T;
      },
      async select(): Promise<string[]> {
        logger.debug('[STUB] select');
        return [];
      },
      async screenshot(): Promise<Buffer> {
        logger.debug('[STUB] screenshot');
        return Buffer.alloc(0);
      },
      async close() {
        logger.debug('[STUB] close');
      },
      async setViewportSize(_size: any) {
        logger.debug('[STUB] setViewportSize');
      },
    };
  }
}
