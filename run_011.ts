import * as fs from 'fs';
import { query, closePool } from './src/db/client.js';

async function main() {
  try {
    const sql = fs.readFileSync('src/db/migrations/011_create_vol2vol_archive.sql', 'utf8');
    await query(sql);
    console.log('Migration 011 applied successfully!');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await closePool();
    process.exit(0);
  }
}
main();
