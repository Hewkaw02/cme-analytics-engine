export type MarketRegimeLabel = 'MeanReverting' | 'TrendFollowing' | 'HighVolatilityRisk' | 'Consolidating';

export interface MarketRegimeResult {
  symbol: string;
  regime: MarketRegimeLabel;
  gammaState: 'Positive' | 'Negative';
  bias: number; // -1.0 (Strongly Bearish) to +1.0 (Strongly Bullish)
  confidence: number; // 0 to 100
  factors: {
    gexState: string;
    spotToFlip: string;
    spotToVwap: string;
    spotToValueArea: string;
    volumeDelta: string;
  };
}

export interface MarketRegimeInput {
  symbol: string;
  spotPrice: number;
  netGex: number;
  gexFlipPrice: number | null;
  vwap: number | null;
  vwapUpperBand?: number | null;
  vwapLowerBand?: number | null;
  sd1Upper?: number | null;
  sd1Lower?: number | null;
  sd2Upper?: number | null;
  sd2Lower?: number | null;
  vah?: number | null;
  val?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
}

/**
 * Classifies the current market regime and bias using options exposure, price relative to bands, and volume.
 */
export function classifyMarketRegime(input: MarketRegimeInput): MarketRegimeResult {
  const {
    symbol,
    spotPrice,
    netGex,
    gexFlipPrice,
    vwap,
    sd2Upper,
    sd2Lower,
    vah,
    val,
    buyVolume,
    sellVolume,
  } = input;

  let biasPoints = 0;
  let maxBiasPoints = 0;

  // 1. GEX State & Flip Price
  const gexState = netGex >= 0 ? 'Positive' : 'Negative';
  let spotToFlip = 'N/A';
  if (gexFlipPrice !== null) {
    const isAboveFlip = spotPrice >= gexFlipPrice;
    spotToFlip = isAboveFlip ? 'Above Flip' : 'Below Flip';
    
    biasPoints += isAboveFlip ? 1.5 : -1.5;
    maxBiasPoints += 1.5;
  } else {
    biasPoints += netGex >= 0 ? 1.0 : -1.0;
    maxBiasPoints += 1.0;
  }

  // 2. Spot to VWAP
  let spotToVwap = 'At VWAP';
  if (vwap !== null) {
    const dev = (spotPrice - vwap) / vwap;
    if (dev > 0.002) {
      spotToVwap = 'Above VWAP';
      biasPoints += 1.0;
    } else if (dev < -0.002) {
      spotToVwap = 'Below VWAP';
      biasPoints -= 1.0;
    }
    maxBiasPoints += 1.0;
  }

  // 3. Spot to Value Area (Volume Profile)
  let spotToValueArea = 'Inside Value Area';
  if (vah !== undefined && vah !== null && val !== undefined && val !== null) {
    if (spotPrice > vah) {
      spotToValueArea = 'Above VAH';
      biasPoints += 2.0; // Strong breakout indicator
    } else if (spotPrice < val) {
      spotToValueArea = 'Below VAL';
      biasPoints -= 2.0; // Strong breakdown indicator
    } else {
      spotToValueArea = 'Inside Value Area';
      // Inside value area usually dampens the trend bias
      biasPoints *= 0.5; 
    }
    maxBiasPoints += 2.0;
  }

  // 4. Volume Delta
  let volumeDelta = 'Neutral';
  if (buyVolume !== undefined && buyVolume !== null && sellVolume !== undefined && sellVolume !== null) {
    const totalVol = buyVolume + sellVolume;
    if (totalVol > 0) {
      const netDelta = buyVolume - sellVolume;
      const deltaRatio = netDelta / totalVol;
      if (deltaRatio > 0.15) {
        volumeDelta = `Strong Buy Pressure (+${Math.round(deltaRatio * 100)}%)`;
        biasPoints += 1.0;
      } else if (deltaRatio < -0.15) {
        volumeDelta = `Strong Sell Pressure (${Math.round(deltaRatio * 100)}%)`;
        biasPoints -= 1.0;
      }
      maxBiasPoints += 1.0;
    }
  }

  // Determine Regime Label
  let regime: MarketRegimeLabel = 'Consolidating';
  
  if (gexState === 'Positive') {
    // Positive Gamma = Mean Reverting
    if (spotToValueArea === 'Inside Value Area') {
      regime = 'Consolidating';
    } else {
      regime = 'MeanReverting';
    }
  } else {
    // Negative Gamma = Trend Following / Volatile
    if (sd2Lower !== undefined && sd2Lower !== null && spotPrice < sd2Lower) {
      regime = 'HighVolatilityRisk';
    } else if (sd2Upper !== undefined && sd2Upper !== null && spotPrice > sd2Upper) {
      regime = 'TrendFollowing';
    } else if (spotToValueArea !== 'Inside Value Area') {
      regime = 'TrendFollowing';
    } else {
      regime = 'TrendFollowing'; // Negative Gamma defaults to trend/volatility risk
    }
  }

  // Calculate final bias score scaled between -1.0 and +1.0
  const bias = maxBiasPoints > 0 ? Number((biasPoints / maxBiasPoints).toFixed(2)) : 0;

  // Confidence is how aligned the factors are.
  // E.g. if bias is close to +1.0 or -1.0, confidence is high.
  // Also, GEX alignment increases confidence.
  const confidence = Math.round(Math.abs(bias) * 100);

  return {
    symbol,
    regime,
    gammaState: gexState,
    bias,
    confidence,
    factors: {
      gexState: `${gexState} Gamma (Net GEX: ${netGex.toFixed(0)})`,
      spotToFlip,
      spotToVwap,
      spotToValueArea,
      volumeDelta,
    },
  };
}
