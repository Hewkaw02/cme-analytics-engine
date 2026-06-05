import * as fs from 'fs';
import * as path from 'path';

const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');

if (!fs.existsSync(INPUT_PATH)) {
  console.error('File not found:', INPUT_PATH);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
console.log('Scraped symbols:', summary.scrapedSymbols);
for (const [sym, data] of Object.entries(summary.data) as any[]) {
  console.log(`\nSymbol: ${sym}`);
  console.log(`Product Name: ${data.productName}`);
  console.log(`Future Price: ${data.futurePrice}`);
  console.log(`Total strikes: ${data.strikeData.length}`);
  
  const withVolume = data.strikeData.filter((s: any) => s.callVolume > 0 || s.putVolume > 0);
  console.log(`Strikes with volume: ${withVolume.length}`);
  const totalCallVol = data.strikeData.reduce((acc: number, s: any) => acc + (s.callVolume || 0), 0);
  const totalPutVol = data.strikeData.reduce((acc: number, s: any) => acc + (s.putVolume || 0), 0);
  console.log(`Total Call Volume: ${totalCallVol}`);
  console.log(`Total Put Volume: ${totalPutVol}`);
  
  if (withVolume.length > 0) {
    console.log('Sample strikes with volume (first 5):');
    console.log(withVolume.slice(0, 5).map((s: any) => `Strike: ${s.strike}, C: ${s.callVolume}, P: ${s.putVolume}`).join('\n'));
  }
}
