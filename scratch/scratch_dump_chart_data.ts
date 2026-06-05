import * as fs from 'fs';
import * as path from 'path';

const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');

if (!fs.existsSync(INPUT_PATH)) {
  console.error('File not found');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));

for (const sym of ['ZS', 'ES', 'NQ', 'GC']) {
  const data = summary.data[sym];
  if (!data) {
    console.log(`${sym} has no data`);
    continue;
  }
  
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);

  const filteredStrikes = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  
  const callVols = filteredStrikes.map((s: any) => s.callVolume);
  const putVols = filteredStrikes.map((s: any) => s.putVolume);
  
  console.log(`\nSymbol: ${sym}`);
  console.log(`Filtered Strikes length: ${filteredStrikes.length}`);
  console.log(`Call Volume array sum: ${callVols.reduce((a: number, b: number) => a + b, 0)}`);
  console.log(`Put Volume array sum: ${putVols.reduce((a: number, b: number) => a + b, 0)}`);
  console.log(`First 10 strikes and volumes:`);
  console.log(filteredStrikes.slice(0, 10).map((s: any) => `Strike: ${s.strike}, C: ${s.callVolume}, P: ${s.putVolume}`).join('\n'));
}
