import * as fs from 'fs';
import * as path from 'path';

const VOL2VOL_DIR = path.resolve('output/vol2vol');

function checkVol2VolFile(filename: string) {
  const filePath = path.join(VOL2VOL_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  let totalCallVol = 0;
  let totalPutVol = 0;
  let nonZeroStrikes = 0;
  
  if (Array.isArray(data.strikeData)) {
    data.strikeData.forEach((s: any) => {
      totalCallVol += s.callVolume || 0;
      totalPutVol += s.putVolume || 0;
      if ((s.callVolume || 0) > 0 || (s.putVolume || 0) > 0) {
        nonZeroStrikes++;
      }
    });
  }
  
  console.log(`\n=== ${filename} ===`);
  console.log(`Symbol: ${data.symbol}`);
  console.log(`Product Name: ${data.productName}`);
  console.log(`Future Price: ${data.futurePrice}`);
  console.log(`Total Strikes in data: ${data.strikeData?.length || 0}`);
  console.log(`Strikes with volume > 0: ${nonZeroStrikes}`);
  console.log(`Total Call Volume: ${totalCallVol}`);
  console.log(`Total Put Volume: ${totalPutVol}`);
}

checkVol2VolFile('vol2vol_ES_20260521.json');
checkVol2VolFile('vol2vol_NQ_20260521.json');
checkVol2VolFile('vol2vol_GC_20260521.json');
checkVol2VolFile('vol2vol_ZS_20260521.json');
