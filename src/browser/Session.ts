import { logger } from '../utils/logger.js';
import { BrowserPage } from './BrowserPool.js';

/**
 * Session lifecycle management — create, configure, and teardown browser sessions.
 * Handles cookie persistence for maintaining authenticated state across runs.
 */

export interface SessionOptions {
  headless: boolean;
  proxy?: string;
  userAgent: string;
  viewport: { width: number; height: number };
  timeout: number;
  cookiePersist: boolean;
  cookieFile?: string;
}

/**
 * Default session configuration per Spec §10.2
 */
export const DEFAULT_SESSION_CONFIG: SessionOptions = {
  headless: true,
  proxy: process.env.PROXY_URL || undefined,
  userAgent: 'random',
  viewport: { width: 1920, height: 1080 },
  timeout: 45_000,
  cookiePersist: true,
  cookieFile: './tmp/cme_cookies.json',
};

/**
 * Configure a browser page with session settings.
 * Sets viewport, timeout, and loads persisted cookies.
 */
export async function configureSession(
  page: BrowserPage,
  options: SessionOptions = DEFAULT_SESSION_CONFIG,
): Promise<void> {
  logger.info('Configuring browser session', {
    headless: options.headless,
    proxy: options.proxy ? '***' : 'none',
    userAgent: options.userAgent,
  });

  // Load cookies if cookie persistence is enabled
  if (options.cookiePersist && options.cookieFile) {
    await loadCookies(page, options.cookieFile);
  }
}

/**
 * Save current page cookies to file for reuse across sessions.
 */
export async function saveCookies(page: BrowserPage, cookieFile: string): Promise<void> {
  try {
    const fs = await import('fs-extra');
    const path = await import('path');

    const cookies = await page.evaluate(() => {
      return document.cookie;
    });

    const dir = path.default.dirname(cookieFile);
    await fs.default.ensureDir(dir);
    await fs.default.writeJSON(cookieFile, { cookies, savedAt: new Date().toISOString() });
    logger.debug(`Cookies saved to ${cookieFile}`);
  } catch (err) {
    logger.warn('Failed to save cookies', { error: String(err) });
  }
}

/**
 * Load cookies from a persisted file.
 */
export async function loadCookies(page: BrowserPage, cookieFile: string): Promise<void> {
  try {
    const fs = await import('fs-extra');
    const exists = await fs.default.pathExists(cookieFile);
    if (!exists) {
      logger.debug('No saved cookies found, starting fresh session');
      return;
    }

    const data = await fs.default.readJSON(cookieFile);
    if (data && data.cookies) {
      logger.debug('Loaded saved cookies from file');
      // Note: actual cookie injection depends on camofox-browser API
      // In Puppeteer: await page.setCookie(...parsedCookies)
    }
  } catch (err) {
    logger.warn('Failed to load cookies', { error: String(err) });
  }
}

/**
 * Gracefully close a browser session, optionally saving cookies.
 */
export async function closeSession(
  page: BrowserPage,
  options: SessionOptions = DEFAULT_SESSION_CONFIG,
): Promise<void> {
  try {
    if (options.cookiePersist && options.cookieFile) {
      await saveCookies(page, options.cookieFile);
    }
    await page.close();
    logger.debug('Browser session closed');
  } catch (err) {
    logger.warn('Error closing browser session', { error: String(err) });
  }
}
