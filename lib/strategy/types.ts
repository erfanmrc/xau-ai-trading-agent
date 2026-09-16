export type Direction = 'LONG' | 'SHORT';

export type Signal =
  | 'LONG'
  | 'SHORT'
  | 'WAIT';

export type MarketState =
  | 'UPTREND'
  | 'DOWNTREND'
  | 'RANGE'
  | 'UNCLEAR';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Structure {
  state: MarketState;
  breakout:
    | 'BULLISH'
    | 'BEARISH'
    | 'NONE';

  hh: number | null;
  hl: number | null;
  lh: number | null;
  ll: number | null;
}

export interface Spike {
  direction: Direction;

  startIndex: number;
  endIndex: number;

  strongCandles: number;

  imbalance: boolean;

  score: number;
}

export interface Leg2 {
  /*
   * Direction of the original spike.
   * Required by the existing leg2 detector.
   */
  direction?: Direction;

  pullback: boolean;

  confirmed: boolean;

  entry: number | null;

  stopLoss: number | null;
}

export interface RiskPlan {
  riskPercent: number;

  rr: number;

  entry: number;

  stopLoss: number;

  takeProfit: number;

  stopDistance: number;

  x2Enabled: boolean;

  x2Entry: number | null;

  x2RiskPercent: number | null;

  combinedRiskPercent: number | null;

  tradable: boolean;

  noTradeReason?: string;
}

export interface Setup {
  type:
    | 'SP2L'
    | 'NONE';

  spike: Spike | null;

  leg2: Leg2 | null;

  entry: number | null;

  stop_loss: number | null;

  take_profit: number | null;
}

export interface StrategyResult {
  symbol: 'XAUUSD';

  timeframe:
    | 'M1'
    | 'M5';

  signal: Signal;

  quality_score: number;

  market_state: MarketState;

  structure: Structure;

  setup: Setup;

  risk: RiskPlan | null;

  reasons: string[];

  warnings: string[];

  invalidation: number | null;
}
