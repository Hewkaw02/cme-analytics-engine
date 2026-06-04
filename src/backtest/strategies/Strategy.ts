import type { IntradayBar } from '../../types.js';

export interface Position {
  entryTime: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
}

export interface TradeSignal {
  direction: 'LONG' | 'SHORT' | 'EXIT';
  price: number;
  reason: string;
}

export interface StrategyGexState {
  netGex: number;
  gexFlip: number | null;
  maxCallOiStrike: number | null;
  maxPutOiStrike: number | null;
  maxPainStrike: number | null;
}

export interface Strategy {
  name: string;
  init(params: Record<string, any>): void;
  onBar(
    bar: IntradayBar,
    currentPosition: Position | null,
    gexState: StrategyGexState | null
  ): TradeSignal | null;
}
