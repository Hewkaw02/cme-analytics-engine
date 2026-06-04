export interface TimeframeConfig {
  period: string;
  seconds: number;
  retentionDays: number;
}

export const TIMEFRAMES: Record<string, TimeframeConfig> = {
  '1m': { period: '1m', seconds: 60, retentionDays: 90 },
  '5m': { period: '5m', seconds: 300, retentionDays: 180 },
  '15m': { period: '15m', seconds: 900, retentionDays: 365 },
  '30m': { period: '30m', seconds: 1800, retentionDays: 730 },
  '1h': { period: '1h', seconds: 3600, retentionDays: 1825 },
  '4h': { period: '4h', seconds: 14400, retentionDays: 1825 },
  '1D': { period: '1D', seconds: 86400, retentionDays: 0 }, // 0 means no retention
};
