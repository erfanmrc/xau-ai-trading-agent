export type Direction = 'LONG' | 'SHORT';
export type SignalStatus = 'VALID' | 'WATCH' | 'INVALID';
export type StrategyName = 'SP2L' | 'PRO_BTB' | 'MICROMAP';
export type MarketBias = 'LONG' | 'SHORT' | 'NEUTRAL';
export type MarketPhase = 'SPIKE' | 'CHANNEL' | 'RANGE' | 'TRANSITION' | 'UNCLEAR';

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MotherMove = {
  timeframe: 'M1'|'M5'|'M15';
  direction: Direction;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  breakoutLevel: number;
  extreme: number;
  legSize: number;
  candleCount: number;
  pressureGap: number;
  expansionRatio: number;
  efficiency: number;
  strength: number;
};

export type EconomicEvent = {
  time: string;
  currency?: string;
  title: string;
  impact: 'LOW'|'MEDIUM'|'HIGH';
  actual?: number|null;
  forecast?: number|null;
  previous?: number|null;
};

export type EconomicContext = {
  status: 'AVAILABLE'|'UNAVAILABLE';
  risk: 'NONE'|'ELEVATED'|'HIGH_IMPACT_NEAR';
  bias: MarketBias;
  upcoming: EconomicEvent[];
  notes: string[];
};

export type StructureSummary = {
  state: 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'UNCLEAR';
  bias: MarketBias;
  trendConfirmed: boolean;
  correction: boolean;
  lastClose: number | null;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  previousSwingHigh: number | null;
  previousSwingLow: number | null;
  highLabel: 'HH' | 'LH' | null;
  lowLabel: 'HL' | 'LL' | null;
  protectedHigh: number | null;
  protectedLow: number | null;
  reversalToLong: boolean;
  reversalToShort: boolean;
  breakout: Direction | null;
};

export type EntryConfluence = { score:number; labels:string[]; nearest:number|null; distance:number|null; atrReference:number; };

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
  targetLegSize?: number | null;
  targetDistance?: number | null;
  targetRR?: number | null;
  targetMode?: 'SINGLE_LEG1_MINUS_SPREAD'|'X2_LEG1_MINUS_SPREAD'|'BTB_LEG1_MINUS_SPREAD'|'MICRO_LEG1_MINUS_SPREAD'|'TREND_EXIT';
};

export type ImportantLevels = {
  round5:number;
  round10:number;
  previousDayHigh:number|null;
  previousDayLow:number|null;
  previousDayMid:number|null;
  sessionHigh:number|null;
  sessionLow:number|null;
  sessionMid:number|null;
  rangeHigh:number|null;
  rangeLow:number|null;
  rangeMid:number|null;
  sma50M5:number|null;
  sma60M5:number|null;
  sma50M15:number|null;
  sma60M15:number|null;
  sma50H1:number|null;
  sma60H1:number|null;
  ema20M5:number|null;
  ema50M5:number|null;
  ema20M15:number|null;
  m15SwingHigh:number|null;
  m15SwingLow:number|null;
  m5SwingHigh:number|null;
  m5SwingLow:number|null;
  h1SwingHigh:number|null;
  h1SwingLow:number|null;
  m1SwingHigh:number|null;
  m1SwingLow:number|null;
};

export type DailyPriceAction = {
  state: 'UPTREND' | 'DOWNTREND' | 'CORRECTION' | 'RANGE' | 'UNCLEAR';
  bias: MarketBias;
  confirmed: boolean;
  entryReady: boolean;
  correction: boolean;
  score: number;
  pressure: number;
  recentImpulse: number;
  candleQuality: number;
  reason: string;
};

export type MarketContext = {
  bias: MarketBias;
  h1: MarketBias;
  m15: MarketBias;
  m5: MarketBias;
  m1: MarketBias;
  dailyBias: MarketBias;
  weeklyBias: MarketBias;
  dailyPriceAction: DailyPriceAction;
  phase: MarketPhase;
  motherMove: MotherMove | null;
  alignmentScore: number;
  aligned: boolean;
  session?: string;
  importantLevels: ImportantLevels;
  structure: {m1:StructureSummary;m5:StructureSummary;m15:StructureSummary;h1:StructureSummary;daily:StructureSummary;weekly:StructureSummary};
  liquidity: {
    previousDayHigh: number | null;
    previousDayLow: number | null;
    sessionHigh: number | null;
    sessionLow: number | null;
    rangeHigh: number | null;
    rangeLow: number | null;
  };
  economic: EconomicContext;
};
