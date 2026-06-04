import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const fileES = 'output/options/ES_options_20260521.csv';
const fileNQ = 'output/options/NQ_options_20260521.csv';
const fileGC = 'output/options/GC_options_20260521.csv';

function analyzeFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<any>(content, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const expiries = new Set<string>();
  let totalRows = rows.length;
  let nonZeroOI = 0;
  let maxOI = 0;
  let maxOIRow: any = null;

  rows.forEach(r => {
    expiries.add(r.expiry_code);
    const oi = parseInt(r.open_interest || '0', 10) || 0;
    if (oi > 0) {
      nonZeroOI++;
      if (oi > maxOI) {
        maxOI = oi;
        maxOIRow = r;
      }
    }
  });

  console.log(`\n=== Analysis for ${path.basename(filePath)} ===`);
  console.log(`Total Rows: ${totalRows}`);
  console.log(`Expiries: ${Array.from(expiries).join(', ')}`);
  console.log(`Rows with OI > 0: ${nonZeroOI} / ${totalRows} (${((nonZeroOI/totalRows)*100).toFixed(2)}%)`);
  if (maxOIRow) {
    console.log(`Max OI: ${maxOI} at Strike ${maxOIRow.strike} (${maxOIRow.option_type}) Expiry ${maxOIRow.expiry_code}`);
  }
}

analyzeFile(fileES);
analyzeFile(fileNQ);
analyzeFile(fileGC);
