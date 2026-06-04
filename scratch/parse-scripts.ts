import * as fs from 'fs';
import * as path from 'path';

const file = path.resolve('output/vol2vol/vol2vol_20260521.json');
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

console.log('=== QuikStrike Script Analyzer ===');
const quikstrikeViewReqs = data.capturedData.filter((req: any) => req.url.includes('QuikStrikeView.aspx'));

console.log(`Found ${quikstrikeViewReqs.length} requests to QuikStrikeView.aspx\n`);

quikstrikeViewReqs.forEach((req: any, idx: number) => {
  console.log(`--- Req ${idx} (Length: ${req.body.length}) ---`);
  // Look for script tags
  const body = req.body;
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
  let match;
  let scriptCount = 0;
  
  while ((match = scriptRegex.exec(body)) !== null) {
    scriptCount++;
    const scriptContent = match[1];
    if (scriptContent.includes('Highcharts') || scriptContent.includes('chart') || scriptContent.includes('series')) {
      console.log(`Script #${scriptCount} mentions Highcharts/series/chart (length ${scriptContent.length}):`);
      // Print first 500 chars and last 500 chars of this script block
      if (scriptContent.length > 1000) {
        console.log(scriptContent.slice(0, 500) + '\n... [TRUNCATED] ...\n' + scriptContent.slice(-500));
      } else {
        console.log(scriptContent);
      }
      console.log('-'.repeat(40));
    }
  }
});
