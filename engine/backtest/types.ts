import { Candle, StrategyName, Direction } from '@/types/market';
export type BacktestConfig={
  balance:number; riskPercent:number; dailyRiskLimitPercent:number; maxTradesPerDay:number; spread:number;
  startIndex?:number; execution:'NEXT_OPEN'|'SIGNAL_CLOSE'; allowX2:boolean;
};
export type BacktestTrade={
  id:number; strategy:StrategyName; direction:Direction; signalTime:string; entryTime:string; exitTime:string;
  entry:number; exit:number; stop:number; tp:number; lot:number; lot2:number; entry2:number|null;
  pnl:number; rMultiple:number; outcome:'TP'|'SL'|'EOD';
};
export type BacktestResult={
  config:BacktestConfig; initialBalance:number; finalBalance:number; netPnl:number; returnPct:number;
  trades:BacktestTrade[]; tradeCount:number; wins:number; losses:number; eod:number; winRate:number;
  grossProfit:number; grossLoss:number; profitFactor:number|null; avgR:number;
  maxDrawdownPct:number; maxDailyDrawdownPct:number; maxDailyLossDollars:number;
  propRules:{profitTargetPct:number;maxTotalDrawdownPct:number;maxDailyDrawdownPct:number;minTradingDays:number};
  reachedProfitTarget:boolean; breachedMaxDrawdown:boolean; breachedDailyDrawdown:boolean; tradingDays:number; tradingDaySet:string[];
};
export type BacktestInput={candles:Candle[]; config?:Partial<BacktestConfig>; propRules?:Partial<BacktestResult['propRules']>};
