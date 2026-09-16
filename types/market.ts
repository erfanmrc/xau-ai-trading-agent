export type Candle={time:string;open:number;high:number;low:number;close:number;volume:number};
export type StrategyName="SP2L"|"PRO_BTB"|"MICROMAP";
export type StrategySignal={strategy:StrategyName;valid:boolean;score:number;reason:string;direction?:"LONG"|"SHORT";entry?:number;entry2?:number;stop?:number;tp1?:number;tp2?:number};