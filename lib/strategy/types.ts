export type Direction = 'LONG' | 'SHORT';
export type Signal = Direction | 'WAIT';
export type MarketState = 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'UNCLEAR';

export interface Candle { time:number; open:number; high:number; low:number; close:number; volume?:number }
export interface Structure { state:MarketState; hh:number[]; hl:number[]; lh:number[]; ll:number[]; breakout:Direction|null; lastSwingHigh?:number; lastSwingLow?:number }
export interface Spike { direction:Direction; startIndex:number; endIndex:number; strongCandles:number; expansion:number; imbalance:boolean; score:number }
export interface Leg2 { confirmed:boolean; direction:Direction; pullbackIndex?:number; confirmationIndex?:number; entry?:number; stop?:number; retrace?:number }
export interface RiskPlan { tradable:boolean; riskPercent:number; riskMoney:number; stopDistance:number; lotSize:number|null; takeProfit?:number; rr:number; x2Entry?:number; x2LotSize?:number; combinedRiskPercent?:number; warnings:string[] }
export interface StrategyResult { signal:Signal; score:number; symbol:string; timeframe:string; marketState:MarketState; structure:Structure; spike:Spike|null; leg2:Leg2|null; risk:RiskPlan|null; reasons:string[]; warnings:string[] }
