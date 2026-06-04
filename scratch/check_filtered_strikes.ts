import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const INPUT_PATH = path.resolve('output/vol2vol/vol2vol_summary_latest.json');
const rawData = fs.readFileSync(INPUT_PATH, 'utf-8');
const summary = JSON.parse(rawData);
const symbols = summary.scrapedSymbols || Object.keys(summary.data);

console.log('=== Volume Chart Filter Simulation ===');
for (const sym of symbols) {
  const data = summary.data[sym];
  if (!data || !data.strikeData) {
    console.log(`${sym}: No strike data`);
    continue;
  }
  const sd1 = data.standardDeviations.find((d: any) => d.sd === 1);
  const sdWidth = sd1 ? (data.futurePrice - sd1.downside.strikeStart) : (data.futurePrice * 0.02);
  const boundsDown = data.futurePrice - (sdWidth * 1.5);
  const boundsUp = data.futurePrice + (sdWidth * 1.5);
  
  const filtered = data.strikeData.filter((s: any) => s.strike >= boundsDown && s.strike <= boundsUp);
  console.log(`${sym}: Total strikes: ${data.strikeData.length} | Filtered (±1.5 SD): ${filtered.length}`);
  const nonZero = filtered.filter((s: any) => s.callVolume > 0 || s.putVolume > 0);
  console.log(`  - Non-zero volume strikes: ${nonZero.length}`);
}

console.log('\n=== OI Chart Filter Simulation ===');
const OPTIONS_DIR = path.resolve('output/options');
for (const sym of ['ES', 'NQ', 'GC']) {
  const files = fs.readdirSync(OPTIONS_DIR)
    .filter(f => f.startsWith(`${sym}_options_`) && f.endsWith('.csv'))
    .sort((a, b) => b.localeCompare(a));
  
  if (files.length === 0) {
    console.log(`${sym}: No CSV files`);
    continue;
  }
  
  const latestFile = path.join(OPTIONS_DIR, files[0]);
  const content = fs.readFileSync(latestFile, 'utf-8');
  const rows = Papa.parse(content, { header: true, skipEmptyLines: true }).data as any[];
  
  const expiryOIMap: Record<string, number> = {};
  rows.forEach(r => {
    const oi = parseInt(r.open_interest || '0', 10) || 0;
    expiryOIMap[r.expiry_code] = (expiryOIMap[r.expiry_code] || 0) + oi;
  });

  let bestExpiry = '';
  let maxOI = -1;
  for (const [exp, oi] of Object.entries(expiryOIMap)) {
    if (oi > maxOI) {
      maxOI = oi;
      bestExpiry = exp;
    }
  }
  
  if (!bestExpiry) {
    console.log(`${sym}: No expiry found`);
    continue;
  }
  
  const expiryRows = rows.filter(r => r.expiry_code === bestExpiry);
  const underlyingPrice = parseFloat(expiryRows[0].underlying_price) || 0;
  
  const v2vProduct = summary?.data?.[sym];
  let futurePrice = underlyingPrice;
  let sdWidth = futurePrice * 0.02;
  
  if (v2vProduct) {
    futurePrice = v2vProduct.futurePrice;
    const sd1 = v2vProduct.standardDeviations.find((d: any) => d.sd === 1);
    if (sd1) {
      sdWidth = futurePrice - sd1.downside.strikeStart;
    }
  }
  
  const boundsDown = futurePrice - (sdWidth * 1.5);
  const boundsUp = futurePrice + (sdWidth * 1.5);
  
  const uniqueStrikes = new Set(expiryRows.map(r => parseFloat(r.strike)));
  const strikeList = Array.from(uniqueStrikes).sort((a, b) => a - b);
  const filtered = strikeList.filter(s => s >= boundsDown && s <= boundsUp);
  
  console.log(`${sym}: Expiry: ${bestExpiry} | Total strikes: ${strikeList.length} | Filtered (±1.5 SD): ${filtered.length} | Max OI in CSV: ${maxOI}`);
}
