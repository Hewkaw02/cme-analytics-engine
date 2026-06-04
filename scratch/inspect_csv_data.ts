import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const OPTIONS_DIR = path.resolve('output/options');

function checkFile(filename: string) {
  const filePath = path.join(OPTIONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
  const rows = parsed.data as any[];
  console.log(`\n=== ${filename} ===`);
  console.log(`Total rows: ${rows.length}`);
  
  const expiries: Record<string, { rows: number; vol: number; oi: number }> = {};
  rows.forEach(r => {
    const exp = r.expiry_code || 'UNKNOWN';
    const vol = parseInt(r.volume || '0', 10) || 0;
    const oi = parseInt(r.open_interest || '0', 10) || 0;
    if (!expiries[exp]) {
      expiries[exp] = { rows: 0, vol: 0, oi: 0 };
    }
    expiries[exp].rows++;
    expiries[exp].vol += vol;
    expiries[exp].oi += oi;
  });
  
  console.log('Expiries summary:');
  Object.entries(expiries).forEach(([exp, summary]) => {
    console.log(`  - Expiry: ${exp} | Rows: ${summary.rows} | Volume: ${summary.vol} | OI: ${summary.oi}`);
  });
}

checkFile('ES_options_20260521.csv');
checkFile('NQ_options_20260521.csv');
checkFile('GC_options_20260521.csv');
