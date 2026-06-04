import * as fs from 'fs';
import * as path from 'path';

const htmlFile = path.resolve('scratch/quikstrike-view.html');
if (!fs.existsSync(htmlFile)) {
  console.error('File not found:', htmlFile);
  process.exit(1);
}

const html = fs.readFileSync(htmlFile, 'utf-8');

console.log('=== Testing Vol2Vol Parser ===');

// Regex to capture the JSONSettings value inside the $create call
const jsonSettingsRegex = /"JSONSettings"\s*:\s*"({[\s\S]*?})"\s*}/;
const match = html.match(jsonSettingsRegex);

if (match) {
  try {
    // The captured group has escaped quotes because it was a JSON string inside a JSON string.
    // Let's replace the escaped quotes (e.g. \") with normal quotes.
    // However, it could have twice-escaped quotes like \\\" or similar. Let's do a robust parse:
    const unescaped = match[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    
    const settings = JSON.parse(unescaped);
    console.log('✓ Successfully parsed JSONSettings!\n');
    
    const futurePrice = settings.FuturePrice;
    const atmVol = settings.ATMVol ? (settings.ATMVol * 100).toFixed(2) + '%' : 'N/A';
    const dte = settings.DTE ? settings.DTE.toFixed(2) : 'N/A';
    const title = settings.Title; // e.g. "OZSM6 Intraday Volume"
    
    console.log(`Product: ${settings.Product?.Name || 'Unknown'}`);
    console.log(`Title: ${title}`);
    console.log(`Future Price: ${futurePrice}`);
    console.log(`ATM Volatility: ${atmVol}`);
    console.log(`Days to Expiration (DTE): ${dte}`);
    console.log('');

    // Extract ranges
    console.log('--- Standard Deviation Ranges ---');
    if (settings.Ranges && Array.isArray(settings.Ranges.data)) {
      const ranges = settings.Ranges.data;
      // We have ranges like Range: 1 (1SD), Range: 2 (2SD), Range: 3 (3SD)
      // Group by range number
      const groupedRanges: { [key: number]: any[] } = {};
      ranges.forEach((r: any) => {
        const rangeNum = r.Tag?.Range;
        if (rangeNum !== undefined) {
          if (!groupedRanges[rangeNum]) groupedRanges[rangeNum] = [];
          groupedRanges[rangeNum].push(r);
        }
      });

      Object.keys(groupedRanges).forEach((rangeKey) => {
        const key = parseInt(rangeKey);
        const items = groupedRanges[key];
        console.log(`${key} Standard Deviation:`);
        items.forEach((item, idx) => {
          const val = item.dataLabels?.format;
          const strikeRange = `Strikes ${item.x?.toFixed(1)} to ${item.x2?.toFixed(1)}`;
          console.log(`  - Side ${idx + 1}: Width = ${val} (${strikeRange})`);
        });
      });
    }

    // Extract Delta strikes from PlotLines
    console.log('\n--- Delta Strike Estimates ---');
    if (Array.isArray(settings.PlotLines)) {
      const deltas = settings.PlotLines.filter((line: any) => line.label?.text && line.label.text !== `Future: ${futurePrice}`);
      deltas.forEach((d: any) => {
        console.log(`  - ${d.label.text}: Strike = ${d.value?.toFixed(2)}`);
      });
    }

  } catch (err: any) {
    console.error('❌ JSON parse error:', err.message);
    // Write out a snippet around the regex match to debug
    console.log('Match snippet (first 300 chars):');
    console.log(match[1].slice(0, 300));
  }
} else {
  console.log('❌ Could not match "JSONSettings" regex in the HTML.');
}
