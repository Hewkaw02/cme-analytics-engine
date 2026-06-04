import * as fs from 'fs';
import * as path from 'path';

async function debugGC() {
  const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
  const summary = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const sym = 'GC';
  const data = summary.data[sym];
  
  const strikes = data.strikeData.map((s: any) => s.strike);
  const callVols = data.strikeData.map((s: any) => s.callVolume);
  const putVols = data.strikeData.map((s: any) => s.putVolume);
  const ivs = data.strikeData.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);
  
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);
  
  const filteredStrikes = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  const fStrikes = filteredStrikes.map((s: any) => s.strike);
  const fCallVols = filteredStrikes.map((s: any) => s.callVolume);
  const fPutVols = filteredStrikes.map((s: any) => s.putVolume);
  const fIvs = filteredStrikes.map((s: any) => s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null);
  
  console.log('GC strikes count:', fStrikes.length);
  console.log('GC ATM volatility:', data.atmVolatility);
  console.log('GC standardDeviations:', data.standardDeviations);
}

debugGC().catch(console.error);
