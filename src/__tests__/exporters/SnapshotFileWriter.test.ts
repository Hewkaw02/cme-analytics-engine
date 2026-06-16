import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { writeSnapshotTextFileSync } from '../../exporters/SnapshotFileWriter.js';

describe('SnapshotFileWriter', () => {
  const outputDir = path.join(process.cwd(), 'output_test_snapshot_writer');

  beforeEach(async () => {
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);
  });

  after(async () => {
    await fs.remove(outputDir);
  });

  it('writes the latest text file and a timestamped archive copy', async () => {
    const latestPath = path.join(outputDir, 'vol2vol', 'vol2vol_GC_20260616.json');

    const result = writeSnapshotTextFileSync(latestPath, '{"futurePrice":2400}', {
      snapshotTimestamp: '2026-06-16T12:30:45',
    });

    assert.equal(result.latestPath, latestPath);
    assert.equal(
      path.relative(outputDir, result.archivePath).replaceAll('\\', '/'),
      'vol2vol/archive/20260616/vol2vol_GC_20260616_123045.json',
    );
    assert.equal(await fs.readFile(latestPath, 'utf8'), '{"futurePrice":2400}');
    assert.equal(await fs.readFile(result.archivePath, 'utf8'), '{"futurePrice":2400}');
  });
});
