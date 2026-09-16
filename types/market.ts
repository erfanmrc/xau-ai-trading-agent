export type Direction = 'LONG' | 'SHORT';
export type SignalStatus = 'VALID' | 'WATCH' | 'INVALID';
export type StrategyName = 'SP2L' | 'PRO_BTB' | 'MICROMAP';
export type MarketBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StructureSummary = {
  state: 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'UNCLEAR';
  bias: MarketBias;
  lastClose: number | null;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  breakout: Direction | null;
};

export type EntryConfluence = { score:number; labels:string[]; nearest:number|null; distance:number|null; atrReference:number; };

export type StrategySignal = {
  strategy: StrategyName;
  status: SignalStatus;
  score: number;
  reason: string;
  reasons: string[];
  warnings: string[];
  direction?: Direction | null;
  entry?: number | null;
  entry2?: number | null;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  trigger?: number | null;
  zone?: { low: number; high: number; source: string } | null;
  risk?: RiskPlan | null;
  confluence?: EntryConfluence | null;
};

export type RiskPlan = {
  tradable: boolean;
  riskPercent: number;
  riskMoney: number;
  stopDistance: number;
  lotSize: number | null;
  rr: number;
  takeProfit?: number | null;
  x2Entry?: number | null;
  x2LotSize?: number | null;
  combinedRiskPercent?: number | null;
  warnings: string[];
};

export type MarketContext = {
  bias: MarketBias;
  h1: MarketBias;
  m15: MarketBias;
  m5: MarketBias;
  m1: MarketBias;
  alignmentScore: number;
  aligned: boolean;
  session?: string;
  importantLevels: {round5:number;round10:number;previousDayMid:number|null;sessionMid:number|null;rangeMid:number|null;ema20M5:number|null;ema50M5:number|null;ema20M15:number|null};
  liquidity: {
    previousDayHigh: number | null;
    previousDayLow: number | null;
    sessionHigh: number | null;
    sessionLow: number | null;
    rangeHigh: number | null;
    rangeLow: number | null;
  };
};
