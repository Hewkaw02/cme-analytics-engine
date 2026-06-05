import { db } from './src/db/client.js';

async function listJobs() {
  const jobs = await db
    .selectFrom('fetch_jobs')
    .selectAll()
    .where('run_date', '=', '2026-05-13' as any)
    .orderBy('started_at', 'asc')
    .execute();

  console.log('Jobs for 2026-05-13:', jobs);
  process.exit(0);
}

listJobs();
