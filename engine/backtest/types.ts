import { Candle, StrategyName, Direction } from '@/types/market';

export type BacktestConfig={
  balance:number;
  riskPercent:number;
  dailyRiskLimitPercent:number;
  maxTradesPerDay:number;
  spread:number;
  startIndex?:number;
  execution:'NEXT_OPEN'|'SIGNAL_CLOSE';
  allowX2:boolean;
  cooldownBars:number;
  cooldownAfterLossBars:number;
  analysisWindowBars:number;
};

export type BacktestOpportunity={
  index:number;
  time:string;
  strategy:StrategyName;
  direction:Direction|null;
  status:'VALID'|'WATCH'|'INVALID';
  action:'EXECUTE'|'WATCH'|'REJECT';
  score:number;
  reason:string;
  rejectionReason:string|null;
  entry:number|null;
  stop:number|null;
  h1:'LONG'|'SHORT'|'NEUTRAL';
  m15:'LONG'|'SHORT'|'NEUTRAL';
  m5:'LONG'|'SHORT'|'NEUTRAL';
  m1:'LONG'|'SHORT'|'NEUTRAL';
  dailyBias:'LONG'|'SHORT'|'NEUTRAL';
  weeklyBias:'LONG'|'SHORT'|'NEUTRAL';
  phase:'SPIKE'|'CHANNEL'|'RANGE'|'TRANSITION'|'UNCLEAR';
  phaseRelation:'PRIMARY'|'SUPPORTIVE'|'NEUTRAL'|'OPPOSE';
  confluenceScore:number;
  confluenceLabels:string[];
};

export type BacktestStrategyStats={
  strategy:StrategyName;
  opportunities:number;
  valid:number;
  watch:number;
  invalid:number;
  executed:number;
  rejected:number;
  wins:number;
  losses:number;
  pnl:number;
  totalR:number;
  avgR:number;
  winRate:number;
  profitFactor:number|null;
};

export type BacktestTrade={
  id:number;
  strategy:StrategyName;
  direction:Direction;
  signalTime:string;
  entryTime:string;
  exitTime:string;
  entry:number;
  exit:number;
  stop:number;
  tp:number;
  lot:number;
  lot2:number;
  entry2:number|null;
  x2Triggered:boolean;
  x2ActivationTime:string|null;
  initialRiskPercent:number;
  x2RiskPercent:number;
  plannedRiskPercent:number;
  actualRiskPercent:number;
  pnl:number;
  rMultiple:number;
  outcome:'TP'|'SL'|'EOD';
  diagnostics?: { x2TriggeredAtR:number|null; mfeR:number; setupScore:number; marketPhase?:string; dailyBias?:string; weeklyBias?:string; };
};

export type BacktestPerformance={mode:'TWO_STAGE_FAST';scannedCandles:number;deepAnalysisCount:number;fastGateSkipCount:number;deepAnalysisPct:number};

export type BacktestResult={
  config:BacktestConfig;
  initialBalance:number;
  finalBalance:number;
  netPnl:number;
  returnPct:number;
  trades:BacktestTrade[];
  tradeCount:number;
  wins:number;
  losses:number;
  eod:number;
  winRate:number;
  grossProfit:number;
  grossLoss:number;
  profitFactor:number|null;
  avgR:number;
  maxDrawdownPct:number;
  maxDailyDrawdownPct:number;
  maxDailyLossDollars:number;
  maxDailyRiskUsedPercent:number;
  maxDailyActualRiskPercent:number;
  propRules:{profitTargetPct:number;maxTotalDrawdownPct:number;maxDailyDrawdownPct:number;minTradingDays:number};
  reachedProfitTarget:boolean;
  breachedMaxDrawdown:boolean;
  breachedDailyDrawdown:boolean;
  tradingDays:number;
  tradingDaySet:string[];
  opportunityCount:number;
  validOpportunities:BacktestOpportunity[];
  opportunityStats:BacktestStrategyStats[];
  rejectionReasons:{reason:string;count:number}[];
  performance:BacktestPerformance;
  dataCoverage:{start:string|null;end:string|null;calendarDays:number;tradingDaysWithData:number;candles:number};
};

export type BacktestInput={candles:Candle[];dailyCandles?:Candle[];economicEvents?:import('@/types/market').EconomicEvent[];config?:Partial<BacktestConfig>;propRules?:Partial<BacktestResult['propRules']>};
