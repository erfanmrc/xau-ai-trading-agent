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
  id:number; strategy:StrategyName; direction:Direction; signalTime:string; entryTime:string; exitTime:string;
  entry:number; exit:number; stop:number; tp:number; lot:number; lot2:number; entry2:number|null;
  pnl:number; rMultiple:number; plannedRiskPercent:number; outcome:'TP'|'SL'|'EOD';
};

export type BacktestResult={
  config:BacktestConfig; initialBalance:number; finalBalance:number; netPnl:number; returnPct:number;
  trades:BacktestTrade[]; tradeCount:number; wins:number; losses:number; eod:number; winRate:number;
  grossProfit:number; grossLoss:number; profitFactor:number|null; avgR:number;
  maxDrawdownPct:number; maxDailyDrawdownPct:number; maxDailyLossDollars:number; maxDailyRiskUsedPercent:number;
  propRules:{profitTargetPct:number;maxTotalDrawdownPct:number;maxDailyDrawdownPct:number;minTradingDays:number};
  reachedProfitTarget:boolean; breachedMaxDrawdown:boolean; breachedDailyDrawdown:boolean; tradingDays:number; tradingDaySet:string[];
  opportunityCount:number;
  validOpportunities:BacktestOpportunity[];
  opportunityStats:BacktestStrategyStats[];
  rejectionReasons:{reason:string;count:number}[];
  dataCoverage:{start:string|null;end:string|null;calendarDays:number;tradingDaysWithData:number;candles:number};
};

export type BacktestInput={candles:Candle[]; config?:Partial<BacktestConfig>; propRules?:Partial<BacktestResult['propRules']>};
