import { db } from './src/db/client.js';

async function checkJob() {
  const job = await db
    .selectFrom('fetch_jobs')
    .selectAll()
    .orderBy('started_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  console.log('Latest Job Record:', job);
  process.exit(0);
}

checkJob();
