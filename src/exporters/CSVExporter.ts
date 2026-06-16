import path from 'path';
import Papa from 'papaparse';
import { logger } from '../utils/logger.js';
import { SnapshotFileOptions, writeSnapshotTextFile } from './SnapshotFileWriter.js';
import {
  OptionRecord,
  StrikeOIRecord,
  OISummaryRecord,
  FuturesOIRecord,
  IntradayBar,
  SettlementRecord,
} from '../types.js';

export type CSVExportOptions = SnapshotFileOptions;

export class CSVExporter {
  static async exportOptions(
    data: OptionRecord[],
    symbol: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_options_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'options', fileName);
    return this.writeFile(data, filePath, 'Options', options);
  }

  static async exportOIByStrike(
    data: StrikeOIRecord[],
    symbol: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_options_oi_by_strike_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'OI by Strike', options);
  }

  static async exportOISummary(
    data: OISummaryRecord[],
    symbol: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_oi_summary_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'OI Summary', options);
  }

  static async exportFuturesOI(
    data: FuturesOIRecord[],
    symbol: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_futures_oi_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'Futures OI', options);
  }

  static async exportIntraday(
    data: IntradayBar[],
    symbol: string,
    tf: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_${tf}_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'intraday', fileName);
    return this.writeFile(data, filePath, `Intraday ${tf}`, options);
  }

  static async exportSettlement(
    data: SettlementRecord[],
    symbol: string,
    date: string,
    outputDir: string,
    options: CSVExportOptions = {},
  ): Promise<string> {
    const fileName = `${symbol}_settlement_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'settlement', fileName);
    return this.writeFile(data, filePath, 'Settlement', options);
  }

  private static async writeFile<T extends object>(
    data: T[],
    filePath: string,
    label: string,
    options: CSVExportOptions,
  ): Promise<string> {
    try {
      if (data.length === 0) {
        logger.warn(`No data to export for ${label} to ${filePath}`);
        return '';
      }

      const csv = Papa.unparse(data, { header: true });
      const { archivePath } = await writeSnapshotTextFile(filePath, csv, options);
      logger.info(`Successfully exported ${label} to ${filePath} (${data.length} records)`);
      logger.info(`Archived ${label} snapshot to ${archivePath}`);

      return filePath;
    } catch (error) {
      logger.error(`Failed to export ${label} to ${filePath}:`, error);
      throw error;
    }
  }
}
