import pg from 'pg';
import dotenv from 'dotenv';
import { Kysely, PostgresDialect } from 'kysely';
import { logger } from '../utils/logger.js';
import { Database } from '../types.js';

dotenv.config();

const { Pool } = pg;

/**
 * Shared Kysely instance for type-safe queries.
 */
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      min: parseInt(process.env.DB_MIN_POOL || '2', 10),
      max: parseInt(process.env.DB_MAX_POOL || '10', 10),
    }),
  }),
});

/**
 * PostgreSQL connection pool singleton.
 * Configured from environment variables per Spec §18.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_MIN_POOL || '2', 10),
  max: parseInt(process.env.DB_MAX_POOL || '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Log pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

// Log pool connection
pool.on('connect', () => {
  logger.debug('New database client connected');
});

/**
 * Get the shared connection pool.
 */
export function getPool(): pg.Pool {
  return pool;
}

/**
 * Get a client from the pool for transaction use.
 */
export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

/**
 * Execute a single query against the pool.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      text: text.substring(0, 80),
      duration,
      rows: result.rowCount,
    });
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    logger.error('Query failed', { 
      text: text.substring(0, 80), 
      duration, 
      error: errorMessage 
    });

    // If database is not available, return a mock empty result instead of crashing
    // This allows the fetcher to continue even if logging/persistence fails
    const errorLower = errorMessage.toLowerCase();
    const isConnectionError = 
      !errorMessage || // AggregateError might have empty message
      errorLower.includes('econnrefused') || 
      errorLower.includes('aggregateerror') ||
      errorLower.includes('no pg_hba.conf entry') ||
      errorLower.includes('connection') ||
      errorLower.includes('pool');

    if (isConnectionError) {
      logger.warn('Database unavailable. Returning mock empty result.');
      return {
        rows: [],
        rowCount: 0,
        command: 'MOCK',
        oid: 0,
        fields: [],
      } as unknown as pg.QueryResult<T>;
    }
    
    throw err;
  }
}

/**
 * Graceful shutdown — close all pool connections.
 */
export async function closePool(): Promise<void> {
  logger.info('Closing database connection pool...');
  await pool.end();
  await db.destroy();
  logger.info('Database pool closed');
}

// Register shutdown handlers
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

export default pool;
