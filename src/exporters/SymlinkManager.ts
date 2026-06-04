import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';
import { subDays, isBefore, parse } from 'date-fns';

export class SymlinkManager {
  /**
   * Create output directory for a specific date
   */
  static async prepareDirectory(baseDir: string, date: string): Promise<string> {
    const dirName = date.replace(/-/g, '');
    const fullPath = path.join(baseDir, dirName);
    await fs.ensureDir(fullPath);
    return fullPath;
  }

  /**
   * Update 'latest' symlink to point to the current date directory
   */
  static async updateLatestSymlink(baseDir: string, date: string): Promise<void> {
    const latestPath = path.join(baseDir, 'latest');
    const targetDir = date.replace(/-/g, '');

    try {
      // Remove existing latest (file, symlink or dir)
      if (await fs.pathExists(latestPath)) {
        await fs.remove(latestPath);
      }

      // On Windows, symlinks to directories need 'junction' or 'dir' type
      // Using junction is often safer on Windows without admin rights
      const type = process.platform === 'win32' ? 'junction' : 'dir';

      await fs.ensureSymlink(targetDir, latestPath, type);
      logger.info(`Updated 'latest' symlink to ${targetDir}`);
    } catch (error) {
      logger.error(`Failed to update 'latest' symlink:`, error);
    }
  }

  /**
   * Delete directories older than KEEP_DAYS
   */
  static async cleanupOldDirectories(baseDir: string, keepDays: number): Promise<void> {
    try {
      if (!(await fs.pathExists(baseDir))) return;

      const entries = await fs.readdir(baseDir);
      const cutoffDate = subDays(new Date(), keepDays);

      for (const entry of entries) {
        // Only look at YYYYMMDD directories
        if (!/^\d{8}$/.test(entry)) continue;

        try {
          const entryDate = parse(entry, 'yyyyMMdd', new Date());
          if (isBefore(entryDate, cutoffDate)) {
            const fullPath = path.join(baseDir, entry);
            await fs.remove(fullPath);
            logger.info(`Cleaned up old directory: ${fullPath}`);
          }
        } catch (e) {
          // Ignore parse errors for non-date directories
        }
      }
    } catch (error) {
      logger.error(`Failed during directory cleanup:`, error);
    }
  }
}
