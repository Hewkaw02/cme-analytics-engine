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
  
  const filtered = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  
  console.log(`\nSymbol: ${sym}`);
  console.log(`Future Price: ${data.futurePrice}`);
  console.log(`SD1 Downside strikeStart: ${sd1?.downside.strikeStart}`);
  console.log(`SD Width: ${sdWidth}`);
  console.log(`Bounds: ${boundsDown} to ${boundsUp}`);
  console.log(`Total strikes in data: ${data.strikeData.length}`);
  console.log(`Filtered strikes in range: ${filtered.length}`);
  if (filtered.length > 0) {
    console.log(`Strikes range: ${filtered[0].strike} to ${filtered[filtered.length - 1].strike}`);
    const withVol = filtered.filter((s: any) => s.callVolume > 0 || s.putVolume > 0);
    console.log(`Strikes with volume inside filter: ${withVol.length}`);
  }
}
