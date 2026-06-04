import type { IntradayBar } from '../../types.js';
import type { Strategy, Position, TradeSignal, StrategyGexState } from './Strategy.js';

export class GEXReversalStrategy implements Strategy {
  name = 'GEXReversalStrategy';

  private atrMultiplierStop = 2.0;
  private useMaxPainForTarget = true;
  private minNetGex = 0;

  init(params: Record<string, any>): void {
    if (params.atrMultiplierStop !== undefined) this.atrMultiplierStop = params.atrMultiplierStop;
    if (params.useMaxPainForTarget !== undefined) this.useMaxPainForTarget = params.useMaxPainForTarget;
    if (params.minNetGex !== undefined) this.minNetGex = params.minNetGex;
  }

  onBar(
    bar: IntradayBar,
    currentPosition: Position | null,
    gexState: StrategyGexState | null
  ): TradeSignal | null {
    if (!gexState) return null;

    const closeVal = Number(bar.close);
    const openVal = Number(bar.open);
    const atr = bar.atr_14 ? Number(bar.atr_14) : 0;
    const vwap = bar.vwap_session ? Number(bar.vwap_session) : Number(bar.vwap || bar.close);

    const { netGex, maxPutOiStrike, maxCallOiStrike, maxPainStrike } = gexState;

    // 1. If currently in a position, manage exits
    if (currentPosition) {
      const isLong = currentPosition.direction === 'LONG';
      
      // Stop Loss calculation (using ATR if available, fallback to 1% of entry price)
      const stopDistance = atr > 0 ? atr * this.atrMultiplierStop : currentPosition.entryPrice * 0.01;
      const stopLossPrice = isLong 
        ? currentPosition.entryPrice - stopDistance 
        : currentPosition.entryPrice + stopDistance;

      // Target Price calculation (Max Pain Strike or VWAP)
      let targetPrice = vwap;
      if (this.useMaxPainForTarget && maxPainStrike) {
        targetPrice = maxPainStrike;
      }

      // Check Stop Loss
      if (isLong && closeVal <= stopLossPrice) {
        return { direction: 'EXIT', price: closeVal, reason: 'STOP_LOSS' };
      }
      if (!isLong && closeVal >= stopLossPrice) {
        return { direction: 'EXIT', price: closeVal, reason: 'STOP_LOSS' };
      }

      // Check Take Profit / Mean Reversion Target
      if (isLong && closeVal >= targetPrice) {
        return { direction: 'EXIT', price: closeVal, reason: 'TAKE_PROFIT' };
      }
      if (!isLong && closeVal <= targetPrice) {
        return { direction: 'EXIT', price: closeVal, reason: 'TAKE_PROFIT' };
      }

      return null;
    }

    // 2. If not in a position, look for entries
    const isPositiveGamma = netGex > this.minNetGex;

    if (isPositiveGamma) {
      // Mean Reversion entries in Positive Gamma (Dealers buying dips, selling rips)
      if (maxPutOiStrike && closeVal < maxPutOiStrike && closeVal > openVal) {
        // Price dipped below Put Wall (support) and showing a bullish response
        return {
          direction: 'LONG',
          price: closeVal,
          reason: `POSITIVE_GAMMA_PUT_WALL_REVERSAL(PutWall:${maxPutOiStrike})`,
        };
      }

      if (maxCallOiStrike && closeVal > maxCallOiStrike && closeVal < openVal) {
        // Price spiked above Call Wall (resistance) and showing a bearish response
        return {
          direction: 'SHORT',
          price: closeVal,
          reason: `POSITIVE_GAMMA_CALL_WALL_REVERSAL(CallWall:${maxCallOiStrike})`,
        };
      }
    } else {
      // Breakout entries in Negative Gamma (Dealers selling breakdowns, buying breakouts - momentum)
      if (maxPutOiStrike && closeVal < maxPutOiStrike) {
        // Price broke below Put Wall in negative gamma (dealer hedging fuels acceleration)
        return {
          direction: 'SHORT',
          price: closeVal,
          reason: `NEGATIVE_GAMMA_PUT_WALL_BREAKDOWN(PutWall:${maxPutOiStrike})`,
        };
      }

      if (maxCallOiStrike && closeVal > maxCallOiStrike) {
        // Price broke above Call Wall in negative gamma (dealer hedging fuels acceleration)
        return {
          direction: 'LONG',
          price: closeVal,
          reason: `NEGATIVE_GAMMA_CALL_WALL_BREAKOUT(CallWall:${maxCallOiStrike})`,
        };
      }
    }

    return null;
  }
}
