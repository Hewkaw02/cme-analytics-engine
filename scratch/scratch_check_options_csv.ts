import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const OPTIONS_DIR = path.resolve('output/options');
const files = fs.readdirSync(OPTIONS_DIR).filter(f => f.endsWith('.csv') && f.includes('20260521'));

console.log('Files:', files);

for (const file of files) {
  const filePath = path.join(OPTIONS_DIR, file);
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<any>(csvContent, {
    header: true,
    skipEmptyLines: true
  });
  
  const rows = parsed.data;
  console.log(`\nFile: ${file}`);
  console.log(`Total rows: ${rows.length}`);
  
  const expiries = new Set(rows.map((r: any) => r.expiry_code));
  console.log(`Unique expiries:`, Array.from(expiries));
  
  const totalVolume = rows.reduce((acc: number, r: any) => acc + (parseInt(r.volume || '0') || 0), 0);
  const totalOI = rows.reduce((acc: number, r: any) => acc + (parseInt(r.open_interest || '0') || 0), 0);
  console.log(`Total Option Volume in CSV: ${totalVolume}`);
  console.log(`Total Option Open Interest in CSV: ${totalOI}`);
  
  const withVolume = rows.filter((r: any) => (parseInt(r.volume || '0') || 0) > 0);
  const withOI = rows.filter((r: any) => (parseInt(r.open_interest || '0') || 0) > 0);
  console.log(`Rows with volume > 0: ${withVolume.length}`);
  console.log(`Rows with OI > 0: ${withOI.length}`);
}
