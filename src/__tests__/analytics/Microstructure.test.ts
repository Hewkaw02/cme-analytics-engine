import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateVolumeProfile } from '../../analytics/VolumeProfile.js';
import { classifyMarketRegime } from '../../analytics/MarketRegime.js';
import type { IntradayBar } from '../../types.js';

function makeBar(overrides: Partial<IntradayBar>): IntradayBar {
  return {
    bar_time: new Date().toISOString(),
    bar_close_time: new Date().toISOString(),
    symbol: 'ES',
    timeframe: '1m',
    open: 5500,
    high: 5505,
    low: 5495,
    close: 5502,
    volume: 1000,
    vwap: null,
    buy_volume: null,
    sell_volume: null,
    delta_volume: null,
    trade_count: null,
    session: 'RTH',
    is_rth: true,
    vwap_session: null,
    ema_9: null,
    ema_21: null,
    atr_14: null,
    rsi_14: null,
    bb_upper: null,
    bb_lower: null,
    cvd: null,
    vwap_sd1_upper: null,
    vwap_sd1_lower: null,
    vwap_sd2_upper: null,
    vwap_sd2_lower: null,
    fetched_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Volume Profile', () => {
  it('should return null for empty bars', () => {
    const r = calculateVolumeProfile([]);
    assert.equal(r, null);
  });

  it('should compute correct POC, VAH, VAL', () => {
    // Generate some mock bars concentrated around 5500
    const bars = [
      makeBar({ open: 5490, high: 5490, low: 5490, close: 5490, volume: 100 }), // bin 5490
      makeBar({ open: 5500, high: 5500, low: 5500, close: 5500, volume: 1000 }), // bin 5500 (POC)
      makeBar({ open: 5510, high: 5510, low: 5510, close: 5510, volume: 200 }), // bin 5510
    ];

    const r = calculateVolumeProfile(bars, 2.0); // binSize 2.0
    assert.ok(r);
    assert.equal(r.symbol, 'ES');
    assert.equal(r.poc, 5500);
    assert.ok(r.vah >= 5500);
    assert.ok(r.val <= 5500);
    assert.equal(r.totalVolume, 1300);
  });
});

describe('Market Regime Classification', () => {
  it('should classify Consolidating in positive gamma inside value area', () => {
    const r = classifyMarketRegime({
      symbol: 'ES',
      spotPrice: 5500,
      netGex: 15000,
      gexFlipPrice: 5480,
      vwap: 5500,
      vah: 5510,
      val: 5490,
      buyVolume: 500,
      sellVolume: 500,
    });

    assert.equal(r.regime, 'Consolidating');
    assert.equal(r.gammaState, 'Positive');
    assert.ok(r.bias >= 0); // Neutral / Slightly positive bias
  });

  it('should classify TrendFollowing in negative gamma below VAL', () => {
    const r = classifyMarketRegime({
      symbol: 'ES',
      spotPrice: 5470,
      netGex: -50000,
      gexFlipPrice: 5480,
      vwap: 5490,
      vah: 5510,
      val: 5490,
      buyVolume: 100,
      sellVolume: 900,
    });

    assert.equal(r.regime, 'TrendFollowing');
    assert.equal(r.gammaState, 'Negative');
    assert.ok(r.bias < 0); // Bearish bias
  });

  it('should classify HighVolatilityRisk in negative gamma below SD2 lower band', () => {
    const r = classifyMarketRegime({
      symbol: 'ES',
      spotPrice: 5440,
      netGex: -75000,
      gexFlipPrice: 5480,
      vwap: 5495,
      sd2Lower: 5450,
      vah: 5510,
      val: 5490,
      buyVolume: 100,
      sellVolume: 1000,
    });

    assert.equal(r.regime, 'HighVolatilityRisk');
    assert.equal(r.gammaState, 'Negative');
    assert.ok(r.bias < -0.5); // Strong bearish bias
  });
});
