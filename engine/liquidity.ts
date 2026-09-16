import {Candle} from "@/types/market";
export function mapLiquidity(c:Candle[]){
 if(!c.length)return {high:null,low:null};
 return {high:Math.max(...c.map(x=>x.high)),low:Math.min(...c.map(x=>x.low))};
}