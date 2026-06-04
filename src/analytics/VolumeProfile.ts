import type { IntradayBar } from '../types.js';

export interface VolumeBin {
  price: number;
  volume: number;
  tpoCount: number; // Time Price Opportunity (number of times price visited this bin)
  isPOC: boolean;
  isInValueArea: boolean;
}

export interface VolumeProfileResult {
  symbol: string;
  timeframe: string;
  totalVolume: number;
  poc: number; // Point of Control (price level with max volume)
  vah: number; // Value Area High (70% boundary upper)
  val: number; // Value Area Low (70% boundary lower)
  hvns: number[]; // High Volume Nodes (peaks in distribution)
  lvns: number[]; // Low Volume Nodes (valleys in distribution)
  profile: VolumeBin[];
}

/**
 * Calculates the Volume Profile from a series of intraday bars.
 * 
 * @param bars Array of intraday bars
 * @param binSize Custom bin size (e.g., 1.0 for ES, 5.0 for NQ). If not provided, it auto-calculates 100 bins.
 * @param valueAreaPct Percentage of volume to include in the Value Area (defaults to 0.70 for 70%)
 */
export function calculateVolumeProfile(
  bars: IntradayBar[],
  binSize?: number,
  valueAreaPct: number = 0.70
): VolumeProfileResult | null {
  if (!bars || bars.length === 0) return null;

  const symbol = bars[0].symbol;
  const timeframe = bars[0].timeframe;

  // Find price range
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const bar of bars) {
    if (bar.low < minPrice) minPrice = bar.low;
    if (bar.high > maxPrice) maxPrice = bar.high;
    totalVolume += bar.volume;
  }

  if (minPrice === Infinity || maxPrice === -Infinity || totalVolume === 0) {
    return null;
  }

  // Auto-calculate bin size if not provided (default to 100 bins)
  const resolvedBinSize = binSize || Math.max(0.01, (maxPrice - minPrice) / 100);

  // Helper to round price to the nearest bin center
  const getBinCenter = (price: number): number => {
    return Math.round(price / resolvedBinSize) * resolvedBinSize;
  };

  // Bin map: Key is the center price of the bin
  const binMap = new Map<number, { volume: number; tpoCount: number }>();

  // Initialize bins from minPrice to maxPrice
  const startBin = getBinCenter(minPrice);
  const endBin = getBinCenter(maxPrice);
  
  for (let p = startBin; p <= endBin; p = getBinCenter(p + resolvedBinSize)) {
    binMap.set(p, { volume: 0, tpoCount: 0 });
    // Guard against infinite loop if bin size is 0 or rounding fails
    if (resolvedBinSize <= 0) break;
  }

  // Populate volume and TPO count
  for (const bar of bars) {
    const barLowBin = getBinCenter(bar.low);
    const barHighBin = getBinCenter(bar.high);

    // List all bins this bar spans
    const spannedBins: number[] = [];
    for (let p = barLowBin; p <= barHighBin; p = getBinCenter(p + resolvedBinSize)) {
      spannedBins.push(p);
    }

    if (spannedBins.length === 0) continue;

    // Distribute volume equally across spanned bins (range distribution)
    const volumeShare = bar.volume / spannedBins.length;

    for (const binCenter of spannedBins) {
      if (!binMap.has(binCenter)) {
        binMap.set(binCenter, { volume: 0, tpoCount: 0 });
      }
      const bin = binMap.get(binCenter)!;
      bin.volume += volumeShare;
      bin.tpoCount += 1; // Mark that price visited this level in this bar timeframe
    }
  }

  // Convert binMap to sorted array
  const profile: VolumeBin[] = Array.from(binMap.entries())
    .map(([price, data]) => ({
      price,
      volume: data.volume,
      tpoCount: data.tpoCount,
      isPOC: false,
      isInValueArea: false,
    }))
    .sort((a, b) => a.price - b.price);

  if (profile.length === 0) return null;

  // 1. Find POC (Point of Control)
  let maxVol = -1;
  let pocIdx = 0;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i].volume > maxVol) {
      maxVol = profile[i].volume;
      pocIdx = i;
    }
  }
  profile[pocIdx].isPOC = true;
  const poc = profile[pocIdx].price;

  // 2. Find Value Area (VA) - standard 70% volume expansion
  const targetVAVolume = totalVolume * valueAreaPct;
  let currentVAVolume = profile[pocIdx].volume;
  profile[pocIdx].isInValueArea = true;

  let upperIdx = pocIdx;
  let lowerIdx = pocIdx;

  while (currentVAVolume < targetVAVolume) {
    const nextUpperIdx = upperIdx + 1;
    const nextLowerIdx = lowerIdx - 1;

    const upperVol = nextUpperIdx < profile.length ? profile[nextUpperIdx].volume : 0;
    const lowerVol = nextLowerIdx >= 0 ? profile[nextLowerIdx].volume : 0;

    if (upperVol === 0 && lowerVol === 0) {
      break; // No more bins left to expand
    }

    if (upperVol >= lowerVol) {
      upperIdx = nextUpperIdx;
      currentVAVolume += upperVol;
      profile[upperIdx].isInValueArea = true;
    } else {
      lowerIdx = nextLowerIdx;
      currentVAVolume += lowerVol;
      profile[lowerIdx].isInValueArea = true;
    }
  }

  const vah = profile[upperIdx].price;
  const val = profile[lowerIdx].price;

  // 3. Find High Volume Nodes (HVNs) and Low Volume Nodes (LVNs)
  // We use a simple 3-bin sliding window to detect local peaks and valleys
  const hvns: number[] = [];
  const lvns: number[] = [];

  for (let i = 2; i < profile.length - 2; i++) {
    const v = profile[i].volume;
    const v_prev1 = profile[i - 1].volume;
    const v_prev2 = profile[i - 2].volume;
    const v_next1 = profile[i + 1].volume;
    const v_next2 = profile[i + 2].volume;

    // High Volume Node: local peak
    if (v > v_prev1 && v > v_prev2 && v > v_next1 && v > v_next2) {
      // Don't mark POC twice since POC is already the ultimate peak
      hvns.push(profile[i].price);
    }

    // Low Volume Node: local valley
    if (v < v_prev1 && v < v_prev2 && v < v_next1 && v < v_next2 && v > 0) {
      lvns.push(profile[i].price);
    }
  }

  return {
    symbol,
    timeframe,
    totalVolume,
    poc,
    vah,
    val,
    hvns,
    lvns,
    profile,
  };
}
