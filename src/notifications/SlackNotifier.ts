import axios from 'axios';
import { logger } from '../utils/logger.js';
import { JobStatus, JobType } from '../db/repositories/JobRepository.js';

export interface JobSummary {
  symbol: string;
  type: JobType;
  date: string;
  status: JobStatus;
  recordsInserted: number;
  recordsSkipped: number;
  recordsInvalid: number;
  durationMs: number;
  errorMessage?: string;
}

export class SlackNotifier {
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
  }

  public async sendSummary(summary: JobSummary): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn('Slack Webhook URL not configured. Skipping notification.');
      return;
    }

    const isSuccess = summary.status === 'SUCCESS';
    const color = isSuccess ? '#36a64f' : summary.status === 'PARTIAL' ? '#ffcc00' : '#ff0000';
    const emoji = isSuccess ? '✅' : '⚠️';

    const payload = {
      attachments: [
        {
          color,
          title: `${emoji} CME Data Fetcher: ${summary.status}`,
          fields: [
            { title: 'Symbol', value: summary.symbol, short: true },
            { title: 'Type', value: summary.type, short: true },
            { title: 'Date', value: summary.date, short: true },
            { title: 'Inserted', value: summary.recordsInserted.toString(), short: true },
            { title: 'Duration', value: `${(summary.durationMs / 1000).toFixed(2)}s`, short: true },
            { title: 'Errors', value: summary.errorMessage || 'None', short: false },
          ],
          footer: 'CME Data Fetcher Bot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    try {
      await axios.post(this.webhookUrl, payload);
      logger.info(`Slack notification sent for ${summary.symbol} ${summary.type}`);
    } catch (error: any) {
      logger.error('Failed to send Slack notification', { error: error.message });
    }
  }

  public async sendAlert(message: string, error?: any): Promise<void> {
    if (!this.webhookUrl) return;

    const payload = {
      text: `🚨 *CME Data Fetcher Alert*\n${message}\n${error ? `\`\`\`${JSON.stringify(error, null, 2)}\`\`\`` : ''}`,
    };

    try {
      await axios.post(this.webhookUrl, payload);
      logger.info('Slack alert sent');
    } catch (err: any) {
      logger.error('Failed to send Slack alert', { error: err.message });
    }
  }
}
