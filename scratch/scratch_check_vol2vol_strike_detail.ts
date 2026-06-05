import * as fs from 'fs';
import * as path from 'path';

const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));

for (const sym of ['ES', 'NQ', 'GC']) {
  const data = summary.data[sym];
  console.log(`\n================== ${sym} ==================`);
  console.log(`Product Name: ${data.productName}`);
  console.log(`Future Price: ${data.futurePrice}`);
  console.log(`Total strikes: ${data.strikeData.length}`);
  
  // Find some strikes around the future price
  const future = data.futurePrice;
  const nearby = data.strikeData
    .map((s: any) => ({ ...s, dist: Math.abs(s.strike - future) }))
    .sort((a: any, b: any) => a.dist - b.dist)
    .slice(0, 5);
  
  console.log('Nearby strikes in Vol2Vol summary:');
  nearby.forEach((s: any) => {
    console.log(JSON.stringify(s, null, 2));
  });
}
