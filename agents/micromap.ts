import {Candle,StrategySignal} from "@/types/market";
export function detectMicroMap(c:Candle[]):StrategySignal{
 return {strategy:"MICROMAP",valid:false,score:0,reason:c.length<5?"Insufficient candles":"Waiting for M1 microstructure HH/HL or LH/LL + MicroChannel + breakout/breakback."};
}