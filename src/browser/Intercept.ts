import { logger } from '../utils/logger.js';
import { BrowserPage } from './BrowserPool.js';
import { CmeOptionsRaw } from '../parsers/OptionsParser.js';

/**
 * Data queue for collecting intercepted network responses.
 */
export class InterceptQueue<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  drain(): T[] {
    const result = [...this.items];
    this.items = [];
    return result;
  }

  size(): number {
    return this.items.length;
  }
}

/**
 * All intercept queues used during a scraping session.
 */
export interface DataQueues {
  options: InterceptQueue<{ raw: CmeOptionsRaw; url: string }>;
  intraday: InterceptQueue<{ url: string; raw: unknown }>;
  settlement: InterceptQueue<unknown>;
}

/**
 * Create a fresh set of intercept queues.
 */
export function createDataQueues(): DataQueues {
  return {
    options: new InterceptQueue(),
    intraday: new InterceptQueue(),
    settlement: new InterceptQueue(),
  };
}

/**
 * Resource types to block during scraping to save bandwidth and speed things up.
 */
const BLOCKED_RESOURCE_TYPES = ['image', 'stylesheet', 'font', 'media'];

/**
 * Setup network intercept on a browser page per Spec §5.4 / §10.4.
 *
 * - Blocks unnecessary resources (images, fonts, CSS, media)
 * - Captures /CmeWS/mvc/Quotes/Option/ responses (options chain JSON)
 * - Captures /CmeWS/mvc/md/c/ chart responses (intraday data)
 * - Captures /CmeWS/mvc/Settlements/ responses (settlement/OI data)
 */
export async function setupIntercept(page: BrowserPage, queues: DataQueues): Promise<void> {
  logger.info('Setting up network intercept');

  // Block unnecessary resource types using Playwright's route
  await page.route('**/*', (route: any, request: any) => {
    if (BLOCKED_RESOURCE_TYPES.includes(request.resourceType())) {
      route.abort();
    } else {
      route.continue();
    }
  });

  // Capture API responses
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on('response', async (res: any) => {
    const url = res.url();

    if (url.includes('/CmeWS/mvc/')) {
        logger.debug(`Saw CME API request: ${url}`);
    }

    // Options Chain JSON
    if (/\/CmeWS\/mvc\/Quotes\/Option\/\d+\//.test(url)) {
      try {
        const raw = (await res.json()) as CmeOptionsRaw;
        const rows = raw.strikePrices || (raw as any).optionContractQuotes;
        if (raw && rows) {
          queues.options.push({ raw, url });
          logger.debug(`Intercepted options data from ${url}`, {
            strikes: rows.length ?? 0,
          });
        }
      } catch {
        // Non-JSON response on this URL — ignore
      }
    }

    // Intraday Chart Data
    if (/\/CmeWS\/mvc\/md\/c\/\d+\/\w+\/chart/.test(url)) {
      try {
        const raw = await res.json();
        if (raw) {
          queues.intraday.push({ url, raw });
          logger.debug(`Intercepted intraday data from ${url}`);
        }
      } catch {
        // ignore
      }
    }

    // Settlement / OI Data
    if (/\/CmeWS\/mvc\/Settlements\/futures/.test(url)) {
      try {
        const raw = await res.json();
        if (raw) {
          queues.settlement.push(raw);
          logger.debug(`Intercepted settlement data from ${url}`);
        }
      } catch {
        // ignore
      }
    }
  });

  logger.info('Network intercept configured');
}
