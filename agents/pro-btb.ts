import {Candle,StrategySignal} from "@/types/market";
export function detectProBTB(c:Candle[]):StrategySignal{
 return {strategy:"PRO_BTB",valid:false,score:0,reason:c.length<5?"Insufficient candles":"Waiting for real breakout close + test + breakback/continuation confirmation."};
}