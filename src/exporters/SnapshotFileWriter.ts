import fs from 'fs-extra';
import path from 'path';

export interface SnapshotFileOptions {
  snapshotTimestamp?: Date | string;
}

export interface SnapshotWriteResult {
  latestPath: string;
  archivePath: string;
}

export async function writeSnapshotTextFile(
  filePath: string,
  content: string,
  options: SnapshotFileOptions = {},
): Promise<SnapshotWriteResult> {
  const archivePath = buildArchivePath(filePath, options.snapshotTimestamp);

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  await fs.ensureDir(path.dirname(archivePath));
  await fs.writeFile(archivePath, content);

  return { latestPath: filePath, archivePath };
}

export function writeSnapshotTextFileSync(
  filePath: string,
  content: string,
  options: SnapshotFileOptions = {},
): SnapshotWriteResult {
  const archivePath = buildArchivePath(filePath, options.snapshotTimestamp);

  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  fs.ensureDirSync(path.dirname(archivePath));
  fs.writeFileSync(archivePath, content);

  return { latestPath: filePath, archivePath };
}

export function buildArchivePath(filePath: string, snapshotTimestamp: Date | string = new Date()): string {
  const parsed = path.parse(filePath);
  const timestamp = formatSnapshotTimestamp(snapshotTimestamp);
  const day = timestamp.slice(0, 8);
  const time = timestamp.slice(9);
  return path.join(parsed.dir, 'archive', day, `${parsed.name}_${time}${parsed.ext}`);
}

function formatSnapshotTimestamp(snapshotTimestamp: Date | string): string {
  const date = snapshotTimestamp instanceof Date ? snapshotTimestamp : new Date(snapshotTimestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid snapshot timestamp: ${snapshotTimestamp}`);
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '_',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
}
