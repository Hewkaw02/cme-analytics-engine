import { query } from '../client.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Job status types matching Spec §15 & DB schema `fetch_jobs`.
 */
export type JobStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type JobType =
  | 'OPTIONS'
  | 'OI'
  | 'INTRADAY'
  | 'SETTLEMENT'
  | 'BULLETIN'
  | 'OI_SUMMARY'
  | 'RESAMPLE'
  | 'ANALYSIS'
  | 'VOL2VOL';

export interface CreateJobInput {
  run_date: string;           // YYYY-MM-DD
  job_type: JobType;
  symbol?: string;            // null for cross-symbol jobs like BULLETIN
  timeframe?: string;         // only for INTRADAY jobs
}

export interface UpdateJobInput {
  status: JobStatus;
  records_inserted?: number;
  records_skipped?: number;
  records_invalid?: number;
  error_message?: string;
  retry_count?: number;
}

export interface FetchJobRow {
  id: number;
  job_id: string;
  run_date: string;
  job_type: JobType;
  symbol: string | null;
  timeframe: string | null;
  status: JobStatus;
  records_inserted: number;
  records_skipped: number;
  records_invalid: number;
  error_message: string | null;
  retry_count: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

/**
 * Repository for the `fetch_jobs` table.
 * Tracks every scraping job lifecycle: RUNNING → SUCCESS / PARTIAL / FAILED.
 */
export class JobRepository {
  /**
   * Create a new job record when a job starts.
   * Returns the generated job_id (UUID).
   */
  async createJob(input: CreateJobInput): Promise<string> {
    const jobId = randomUUID();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO fetch_jobs (job_id, run_date, job_type, symbol, timeframe, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'RUNNING', $6)`,
      [jobId, input.run_date, input.job_type, input.symbol || null, input.timeframe || null, now]
    );

    logger.info('Job created', {
      job_id: jobId,
      job_type: input.job_type,
      symbol: input.symbol,
      run_date: input.run_date,
    });

    return jobId;
  }

  /**
   * Update a job record on completion or failure.
   */
  async updateJob(jobId: string, updates: UpdateJobInput): Promise<void> {
    const now = new Date().toISOString();

    await query(
      `UPDATE fetch_jobs
       SET status = $1,
           records_inserted = COALESCE($2, records_inserted),
           records_skipped = COALESCE($3, records_skipped),
           records_invalid = COALESCE($4, records_invalid),
           error_message = COALESCE($5, error_message),
           retry_count = COALESCE($6, retry_count),
           finished_at = $7
       WHERE job_id = $8`,
      [
        updates.status,
        updates.records_inserted ?? null,
        updates.records_skipped ?? null,
        updates.records_invalid ?? null,
        updates.error_message ?? null,
        updates.retry_count ?? null,
        now,
        jobId,
      ]
    );

    logger.info('Job updated', {
      job_id: jobId,
      status: updates.status,
      records_inserted: updates.records_inserted,
    });
  }

  /**
   * Get all failed jobs for a given date — used by the retry scheduler.
   */
  async getFailedJobs(runDate: string): Promise<FetchJobRow[]> {
    const result = await query<FetchJobRow>(
      `SELECT * FROM fetch_jobs
       WHERE run_date = $1
         AND status IN ('FAILED', 'PARTIAL')
       ORDER BY started_at ASC`,
      [runDate]
    );
    return result.rows;
  }

  /**
   * Get all jobs for a given date — used by the summary exporter.
   */
  async getJobsByDate(runDate: string): Promise<FetchJobRow[]> {
    const result = await query<FetchJobRow>(
      `SELECT * FROM fetch_jobs
       WHERE run_date = $1
       ORDER BY started_at ASC`,
      [runDate]
    );
    return result.rows;
  }

  /**
   * Check if a specific job already ran successfully today — for idempotency.
   */
  async hasSuccessfulJob(runDate: string, jobType: JobType, symbol?: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM fetch_jobs
       WHERE run_date = $1
         AND job_type = $2
         AND ($3::VARCHAR IS NULL OR symbol = $3)
         AND status = 'SUCCESS'
       LIMIT 1`,
      [runDate, jobType, symbol || null]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
