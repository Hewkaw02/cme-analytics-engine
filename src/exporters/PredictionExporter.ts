import path from 'path';
import fs from 'fs-extra';
import { parseISO } from 'date-fns';
import { logger } from '../utils/logger.js';
import type { PredictionSnapshot } from '../types.js';

export interface PredictionExportResult {
  latestPath: string;
  archivePath: string;
}

export interface PredictionBuildInput {
  symbol: PredictionSnapshot['symbol'];
  asOfUtc: string;
  sourceTradeDate: string;
  targetTradeDate: string;
  hasFreshIntraday: boolean;
  hasCurrentOfficialOi: boolean;
  currentPrice: number;
  callWall: number | null;
  putWall: number | null;
  sourceFiles: string[];
}

export function buildPredictionSnapshot(input: PredictionBuildInput): PredictionSnapshot {
  const dataMode = input.hasFreshIntraday
    ? (input.hasCurrentOfficialOi ? 'CURRENT' : 'CURRENT_WITH_STALE_OI')
    : 'PREDICTION_ONLY';
  const isTradable = dataMode !== 'PREDICTION_ONLY';
  const midpoint = input.currentPrice;
  const wallMidpoint =
    input.callWall != null && input.putWall != null
      ? (input.callWall + input.putWall) / 2
      : input.currentPrice;
  const direction =
    input.currentPrice > wallMidpoint
      ? 'BULLISH'
      : input.currentPrice < wallMidpoint
        ? 'BEARISH'
        : 'NEUTRAL';
  const preferredDirection = direction === 'BULLISH' ? 'LONG' : direction === 'BEARISH' ? 'SHORT' : 'NONE';
  const expectedMove = Math.max(
    5,
    Math.abs((input.callWall ?? midpoint + 20) - (input.putWall ?? midpoint - 20)) * 0.1,
  );

  return {
    schemaVersion: 1,
    symbol: input.symbol,
    asOfUtc: input.asOfUtc,
    sourceTradeDate: input.sourceTradeDate,
    targetTradeDate: input.targetTradeDate,
    horizon: 'current_session',
    dataMode,
    isTradable,
    reason: isTradable
      ? 'fresh intraday available; official OI may be latest available'
      : 'fresh intraday unavailable; prediction is advisory only',
    bias: {
      direction,
      confidence: dataMode === 'CURRENT' ? 0.7 : dataMode === 'CURRENT_WITH_STALE_OI' ? 0.6 : 0.45,
      drivers: [`callWall=${input.callWall ?? 'NA'}`, `putWall=${input.putWall ?? 'NA'}`],
    },
    plan: {
      preferredDirection,
      entryZones: [{ label: 'current_price', lower: midpoint - 5, upper: midpoint + 5 }],
      invalidationLevel:
        preferredDirection === 'LONG'
          ? midpoint - expectedMove
          : preferredDirection === 'SHORT'
            ? midpoint + expectedMove
            : null,
      tp1:
        preferredDirection === 'LONG'
          ? midpoint + expectedMove
          : preferredDirection === 'SHORT'
            ? midpoint - expectedMove
            : null,
      tp2:
        preferredDirection === 'LONG'
          ? midpoint + expectedMove * 2
          : preferredDirection === 'SHORT'
            ? midpoint - expectedMove * 2
            : null,
      allowedSlots: preferredDirection === 'LONG' ? ['A', 'F'] : preferredDirection === 'SHORT' ? ['B', 'F'] : [],
      blockedSlots: preferredDirection === 'LONG' ? ['B'] : preferredDirection === 'SHORT' ? ['A'] : ['A', 'B', 'F'],
    },
    sourceFiles: input.sourceFiles,
  };
}

export async function exportPredictionSnapshot(
  snapshot: PredictionSnapshot,
  outputDir: string,
): Promise<PredictionExportResult> {
  validatePredictionSnapshot(snapshot);

  const predictionDir = path.join(outputDir, 'Data-prediction');
  const latestPath = path.join(predictionDir, 'prediction_latest.json');
  const asOf = parseISO(snapshot.asOfUtc);
  const archiveDate = formatUtcDate(asOf);
  const archiveTime = formatUtcTime(asOf);
  const archiveDir = path.join(predictionDir, 'archive', archiveDate);
  const archivePath = path.join(
    archiveDir,
    `${snapshot.symbol}_prediction_${archiveDate}_${archiveTime}.json`,
  );

  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.ensureDir(predictionDir);
  await fs.ensureDir(archiveDir);
  await fs.writeFile(latestPath, text, 'utf8');
  await fs.writeFile(archivePath, text, 'utf8');
  logger.info(`Prediction snapshot exported to ${latestPath}`);
  logger.info(`Prediction snapshot archived to ${archivePath}`);

  return { latestPath, archivePath };
}

function formatUtcDate(value: Date): string {
  return [
    value.getUTCFullYear(),
    pad2(value.getUTCMonth() + 1),
    pad2(value.getUTCDate()),
  ].join('');
}

function formatUtcTime(value: Date): string {
  return [
    pad2(value.getUTCHours()),
    pad2(value.getUTCMinutes()),
    pad2(value.getUTCSeconds()),
  ].join('');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function validatePredictionSnapshot(snapshot: PredictionSnapshot): void {
  if (snapshot.schemaVersion !== 1) {
    throw new Error('Prediction snapshot schemaVersion must be 1');
  }
  if (!snapshot.symbol) {
    throw new Error('Prediction snapshot symbol is required');
  }
  if (!snapshot.asOfUtc) {
    throw new Error('Prediction snapshot asOfUtc is required');
  }
  if (!snapshot.sourceTradeDate) {
    throw new Error('Prediction snapshot sourceTradeDate is required');
  }
  if (!snapshot.targetTradeDate) {
    throw new Error('Prediction snapshot targetTradeDate is required');
  }
  if (snapshot.bias.confidence < 0 || snapshot.bias.confidence > 1) {
    throw new Error('Prediction snapshot bias confidence must be between 0 and 1');
  }
  if (snapshot.dataMode === 'PREDICTION_ONLY' && snapshot.isTradable) {
    throw new Error('PREDICTION_ONLY snapshots must not be tradable');
  }
}
