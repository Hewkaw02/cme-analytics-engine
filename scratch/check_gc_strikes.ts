import * as fs from 'fs';
import * as path from 'path';

const GC_FILE = path.resolve('output/vol2vol/vol2vol_GC_20260521.json');
if (fs.existsSync(GC_FILE)) {
  const data = JSON.parse(fs.readFileSync(GC_FILE, 'utf-8'));
  console.log('GC Future Price:', data.futurePrice);
  console.log('GC Strikes sample:', data.strikeData.slice(0, 10).map((s: any) => s.strike));
  console.log('GC Strikes with volume > 0 sample:', data.strikeData.filter((s: any) => s.callVolume > 0 || s.putVolume > 0).slice(0, 10).map((s: any) => ({ strike: s.strike, callVolume: s.callVolume, putVolume: s.putVolume })));
  
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  console.log('GC SD1:', sd1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);
  console.log(`GC Bounds: ${boundsDown} to ${boundsUp}`);
  
  const filtered = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  console.log('GC Filtered strikes count:', filtered.length);
} else {
  console.log('GC File not found');
}
