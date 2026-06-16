import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DB_MIN_POOL: z.string().transform(Number).default('2'),
  DB_MAX_POOL: z.string().transform(Number).default('10'),

  HEADLESS: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  PROXY_URL: z.string().optional(),
  USER_AGENT: z.string().default('random'),
  MAX_BROWSER_INSTANCES: z.string().transform(Number).default('2'),

  OUTPUT_DIR: z.string().default('./output'),
  KEEP_DAYS: z.string().transform(Number).default('90'),

  SLACK_WEBHOOK_URL: z.string().optional(),
  LINE_NOTIFY_TOKEN: z.string().optional(),

  // Notification toggles
  NOTIFY_ON_SUCCESS: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  NOTIFY_ON_FAILURE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: z.string().transform(Number).default('5'),
  CIRCUIT_BREAKER_RESET_MS: z.string().transform(Number).default('300000'),

  TIMEZONE: z.string().default('America/Chicago'),
  SCHEDULER_TIMEZONE: z.string().default('Asia/Bangkok'),

  // Hourly analysis job
  ANALYSIS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ANALYSIS_CRON: z.string().default('0 17-23,0-15 * * 1-5'),
  ANALYSIS_SYMBOLS: z.string().default('ES,NQ,GC'),
  ANALYSIS_TIMEFRAMES: z.string().default('1m'),
  ANALYSIS_FETCH_OI: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
});

export const env = envSchema.parse(process.env);
