import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface JobStatus {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  [key: string]: any;
}

export interface FetchSummary {
  run_date: string;
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  jobs: {
    [symbol: string]: {
      [jobType: string]: JobStatus;
    };
  };
  totals: {
    [key: string]: number;
  };
  errors: any[];
}

export class SummaryExporter {
  static async exportSummary(summary: FetchSummary, outputDir: string): Promise<string> {
    const fileName = `fetch_summary_${summary.run_date.replace(/-/g, '')}.json`;
    const filePath = path.join(outputDir, fileName);

    try {
      await fs.ensureDir(outputDir);
      await fs.writeJson(filePath, summary, { spaces: 2 });
      logger.info(`Successfully exported fetch summary to ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`Failed to export fetch summary to ${filePath}:`, error);
      throw error;
    }
  }
}
