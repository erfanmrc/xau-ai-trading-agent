import {Candle,StrategySignal} from "@/types/market";
export function detectSP2L(c:Candle[]):StrategySignal{
 return {strategy:"SP2L",valid:false,score:0,reason:c.length<5?"Insufficient candles":"Waiting for liquidity interaction + displacement + structure break + imbalance/rejection confirmation."};
}