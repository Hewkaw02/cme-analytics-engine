import axios from 'axios';
import { logger } from '../utils/logger.js';
import { JobSummary } from './SlackNotifier.js';

export class LineNotifier {
  private token: string;
  private notifyOnSuccess: boolean;
  private notifyOnFailure: boolean;

  constructor() {
    this.token = process.env.LINE_NOTIFY_TOKEN || '';
    this.notifyOnSuccess = process.env.NOTIFY_ON_SUCCESS === 'true';
    this.notifyOnFailure = process.env.NOTIFY_ON_FAILURE === 'true';
  }

  public async sendSummary(summary: JobSummary): Promise<void> {
    if (!this.token) {
      logger.warn('LINE Notify token not configured. Skipping notification.');
      return;
    }

    const isSuccess = summary.status === 'SUCCESS';
    if (isSuccess && !this.notifyOnSuccess) return;
    if (!isSuccess && !this.notifyOnFailure) return;

    const emoji = isSuccess ? '✅' : '❌';
    const message = `
${emoji} CME Fetcher: ${summary.status}
Symbol: ${summary.symbol}
Type: ${summary.type}
Date: ${summary.date}
Rows: ${summary.recordsInserted}
Time: ${(summary.durationMs / 1000).toFixed(2)}s
${summary.errorMessage ? `Error: ${summary.errorMessage}` : ''}
`.trim();

    try {
      await axios.post(
        'https://notify-api.line.me/api/notify',
        new URLSearchParams({ message }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${this.token}`,
          },
        },
      );
      logger.info(`LINE notification sent for ${summary.symbol} ${summary.type}`);
    } catch (error: any) {
      logger.error('Failed to send LINE notification', { error: error.message });
    }
  }
}
