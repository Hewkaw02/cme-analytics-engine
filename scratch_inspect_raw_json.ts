import * as fs from 'fs';
import * as path from 'path';

for (const sym of ['ZS', 'ES', 'NQ', 'GC']) {
  const filePath = path.resolve(`output/vol2vol/raw/vol2vol_raw_${sym}_20260521.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`${sym} raw file not found`);
    continue;
  }
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`\nSymbol: ${sym}`);
  console.log(`Title: ${content.Title}`);
  console.log(`Product Name: ${content.Product?.Name}`);
  console.log(`Call data points: ${content.Call?.data?.length ?? 0}`);
  console.log(`Put data points: ${content.Put?.data?.length ?? 0}`);
  console.log(`Vol data points: ${content.Vol?.data?.length ?? 0}`);
  console.log(`VolSettle data points: ${content.VolSettle?.data?.length ?? 0}`);
}
