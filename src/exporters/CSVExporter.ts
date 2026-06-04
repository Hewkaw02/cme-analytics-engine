import fs from 'fs-extra';
import path from 'path';
import Papa from 'papaparse';
import { logger } from '../utils/logger.js';
import {
  OptionRecord,
  StrikeOIRecord,
  OISummaryRecord,
  FuturesOIRecord,
  IntradayBar,
  SettlementRecord,
} from '../types.js';

export class CSVExporter {
  static async exportOptions(
    data: OptionRecord[],
    symbol: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_options_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'options', fileName);
    return this.writeFile(data, filePath, 'Options');
  }

  static async exportOIByStrike(
    data: StrikeOIRecord[],
    symbol: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_options_oi_by_strike_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'OI by Strike');
  }

  static async exportOISummary(
    data: OISummaryRecord[],
    symbol: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_oi_summary_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'OI Summary');
  }

  static async exportFuturesOI(
    data: FuturesOIRecord[],
    symbol: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_futures_oi_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'oi', fileName);
    return this.writeFile(data, filePath, 'Futures OI');
  }

  static async exportIntraday(
    data: IntradayBar[],
    symbol: string,
    tf: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_${tf}_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'intraday', fileName);
    return this.writeFile(data, filePath, `Intraday ${tf}`);
  }

  static async exportSettlement(
    data: SettlementRecord[],
    symbol: string,
    date: string,
    outputDir: string,
  ): Promise<string> {
    const fileName = `${symbol}_settlement_${date.replace(/-/g, '')}.csv`;
    const filePath = path.join(outputDir, 'settlement', fileName);
    return this.writeFile(data, filePath, 'Settlement');
  }

  private static async writeFile(data: any[], filePath: string, label: string): Promise<string> {
    try {
      if (data.length === 0) {
        logger.warn(`No data to export for ${label} to ${filePath}`);
        return '';
      }

      await fs.ensureDir(path.dirname(filePath));
      const csv = Papa.unparse(data, { header: true });
      await fs.writeFile(filePath, csv);
      logger.info(`Successfully exported ${label} to ${filePath} (${data.length} records)`);
      return filePath;
    } catch (error) {
      logger.error(`Failed to export ${label} to ${filePath}:`, error);
      throw error;
    }
  }
}
