import {Candle} from "@/types/market";
export function summarizeStructure(c:Candle[]){
 if(!c.length)return {bias:"NEUTRAL" as const,lastClose:null};
 const a=c[c.length-2]||c[0],b=c[c.length-1];
 return {bias:b.close>a.close?"BULLISH":b.close<a.close?"BEARISH":"NEUTRAL",lastClose:b.close};
}