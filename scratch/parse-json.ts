import * as fs from 'fs';
import * as path from 'path';

const file = path.resolve('output/vol2vol/vol2vol_20260521.json');
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

console.log('=== Vol2Vol JSON Analyzer ===');
console.log(`Fetch Date: ${data.fetchDate}`);
console.log(`Captured Requests: ${data.capturedRequests}`);
console.log(`QuikStrike Data Items: ${data.quikstrikeDataItems}\n`);

console.log('--- List of URLs in capturedData ---');
data.capturedData.forEach((req: any, idx: number) => {
  console.log(`[${idx}] ${req.method} ${req.status} - ${req.contentType} - ${req.url}`);
  if (req.contentType?.includes('json')) {
    try {
      const parsedBody = JSON.parse(req.body);
      console.log('    Keys:', Object.keys(parsedBody).slice(0, 10));
    } catch {
      console.log('    (Could not parse body as JSON)');
    }
  }
});
