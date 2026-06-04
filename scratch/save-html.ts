import * as fs from 'fs';
import * as path from 'path';

const file = path.resolve('output/vol2vol/vol2vol_20260521.json');
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

const req = data.capturedData.find((req: any) => req.url.includes('QuikStrikeView.aspx') && req.body.length > 50000);

if (req) {
  const htmlFile = path.resolve('scratch/quikstrike-view.html');
  fs.writeFileSync(htmlFile, req.body);
  console.log(`Saved QuikStrikeView.aspx HTML to ${htmlFile} (${req.body.length} bytes)`);
} else {
  console.log('Could not find QuikStrikeView.aspx with full body');
}
