import { CSVExporter } from './CSVExporter.js';
import type { FuturesOIRecord, IntradayBar, OISummaryRecord, StrikeOIRecord } from '../types.js';

export interface ForwardTestIntradayResult {
  symbol: string;
  timeframe: string;
  bars: IntradayBar[];
}

export interface ForwardTestCsvPayload {
  outputDir: string;
  symbol: string;
  tradeDate: string;
  futuresOI?: FuturesOIRecord[];
  strikeOI?: StrikeOIRecord[];
  oiSummaries?: OISummaryRecord[];
  intradayResults?: ForwardTestIntradayResult[];
}

export async function exportForwardTestCsvs(payload: ForwardTestCsvPayload): Promise<string[]> {
  const files: string[] = [];
  const { outputDir, symbol, tradeDate } = payload;

  if (payload.futuresOI?.length) {
    files.push(await CSVExporter.exportFuturesOI(payload.futuresOI, symbol, tradeDate, outputDir));
  }

  if (payload.strikeOI?.length) {
    files.push(await CSVExporter.exportOIByStrike(payload.strikeOI, symbol, tradeDate, outputDir));
  }

  if (payload.oiSummaries?.length) {
    files.push(await CSVExporter.exportOISummary(payload.oiSummaries, symbol, tradeDate, outputDir));
  }

  for (const result of payload.intradayResults ?? []) {
    if (result.bars.length > 0) {
      files.push(await CSVExporter.exportIntraday(result.bars, result.symbol || symbol, result.timeframe, tradeDate, outputDir));
    }
  }

  return files.filter(Boolean);
}
