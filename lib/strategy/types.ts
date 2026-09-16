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

  structureQuality?: number;

  swingHighs?: number[];
  swingLows?: number[];

  trendDirection?: Direction | null;

  bos?: boolean;
  bosDirection?: Direction | null;
}

export interface Spike {
  direction: Direction;
  startIndex: number;
  endIndex: number;
  strongCandles: number;
  expansion: number;
  imbalance: boolean;
  score: number;
}

export interface Leg2 {
  direction: Direction;
  confirmed: boolean;

  pullback?: boolean;
  pullbackIndex?: number;
  confirmationIndex?: number;

  entry?: number | null;
  stop?: number | null;

  retrace?: number;
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

export interface StrategyScores {
  context: number;
  structure: number;
  spike: number;
  pullback: number;
  confirmation: number;
  alignment: number;
  setup: number;
  final: number;
}

export interface StrategyResult {
  symbol: 'XAUUSD';

  timeframe:
    | 'M1'
    | 'M5';

  signal: Signal;

  quality_score: number;

  scores?: StrategyScores;

  market_state: MarketState;

  structure: Structure;

  setup: Setup;

  risk: RiskPlan | null;

  reasons: string[];

  warnings: string[];

  invalidation: number | null;
}

export type StrategyName =
  | 'SP2L'
  | 'PRO_BTB'
  | 'MICRO_MAP';

export type StrategyStatus =
  | 'VALID'
  | 'WATCH'
  | 'INVALID';

export type NewsRisk =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'EXTREME';

export type MacroBias =
  | 'BULLISH'
  | 'BEARISH'
  | 'NEUTRAL'
  | 'MIXED';

export interface StrategySignal {
  strategy: StrategyName;

  status: StrategyStatus;

  direction: Direction | null;

  score: number;

  entry: number | null;

  stopLoss: number | null;

  takeProfit: number | null;

  risk: RiskPlan | null;

  reasons: string[];

  warnings: string[];
}

export interface ImbalanceZone {
  direction: Direction;

  high: number;

  low: number;

  startIndex?: number;

  endIndex?: number;
}

export interface SpikeZone {
  direction: Direction;

  high: number;

  low: number;

  startIndex?: number;

  endIndex?: number;
}

export interface LiquidityMap {
  buySide: number[];

  sellSide: number[];

  previousDayHigh: number | null;

  previousDayLow: number | null;

  sessionHigh: number | null;

  sessionLow: number | null;

  equalHighs: number[];

  equalLows: number[];

  imbalanceZones: ImbalanceZone[];

  spikeZones: SpikeZone[];
}

export interface MarketContext {
  trend: Direction | null;

  state: MarketState;

  higherTimeframe: MarketState;

  intermediateTimeframe: MarketState;

  executionTimeframe: MarketState;

  structureAlignment: boolean;

  liquidity: LiquidityMap;

  volatility: number | null;

  newsRisk: NewsRisk;

  macroBias: MacroBias;

  reasons: string[];

  warnings: string[];
}

export interface StrategyEvaluation {
  strategy: StrategyName;

  status: StrategyStatus;

  direction: Direction | null;

  score: number;

  signal: StrategySignal;
}

export interface MultiStrategyResult {
  symbol: 'XAUUSD';

  marketContext: MarketContext;

  strategies: {
    SP2L: StrategySignal;
    PRO_BTB: StrategySignal;
    MICRO_MAP: StrategySignal;
  };

  activeSignals: StrategySignal[];

  primaryDirection: Direction | null;

  overallScore: number;

  signal: Signal;

  reasons: string[];

  warnings: string[];
}
