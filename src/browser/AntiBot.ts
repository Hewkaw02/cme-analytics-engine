import { logger } from '../utils/logger.js';

/**
 * Anti-bot evasion utilities per Spec §10.1.
 *
 * CME uses Cloudflare/Akamai Bot Manager with TLS fingerprinting,
 * behavioral analysis, and IP-based rate limiting. These helpers
 * rotate user agents and provide proxy rotation support.
 */

/**
 * Curated list of realistic desktop user agents.
 * Kept intentionally small and recent to avoid fingerprint detection.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

/**
 * Standard desktop viewport sizes to randomize.
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
];

/**
 * Get a random user agent string, or return a specific one if configured.
 */
export function getRandomUserAgent(configured?: string): string {
  if (configured && configured !== 'random') {
    return configured;
  }
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get a random viewport with slight jitter to avoid fingerprinting.
 */
export function getRandomViewport(): { width: number; height: number } {
  const base = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  // Add slight random jitter (±10px) to avoid exact matches
  return {
    width: base.width + Math.floor(Math.random() * 21) - 10,
    height: base.height + Math.floor(Math.random() * 21) - 10,
  };
}

/**
 * Proxy rotation helper.
 * Supports a pool of proxy URLs; rotates on each call.
 */
export class ProxyRotator {
  private proxies: string[];
  private currentIndex = 0;

  constructor(proxyUrls: string[]) {
    this.proxies = proxyUrls.filter(Boolean);
    if (this.proxies.length > 0) {
      logger.info(`ProxyRotator initialized with ${this.proxies.length} proxies`);
    } else {
      logger.warn('ProxyRotator: no proxies configured, requests will use direct connection');
    }
  }

  /**
   * Get the next proxy URL in rotation.
   * Returns undefined if no proxies are configured.
   */
  next(): string | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Get a random proxy from the pool.
   */
  random(): string | undefined {
    if (this.proxies.length === 0) return undefined;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  /**
   * Remove a failing proxy from the pool.
   */
  remove(proxyUrl: string): void {
    this.proxies = this.proxies.filter((p) => p !== proxyUrl);
    logger.warn(`Removed proxy ${proxyUrl}, ${this.proxies.length} remaining`);
  }

  get size(): number {
    return this.proxies.length;
  }
}
