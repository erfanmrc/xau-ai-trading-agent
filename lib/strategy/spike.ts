import { Candle, Direction, Spike } from './types';
import { CONFIG } from './config';
import { atr,bodyRatio,closeLocation,dir,medianRange } from './math';
function fvg(c:Candle[],i:number,d:Direction){if(i<2)return false;const gap=d==='LONG'?c[i].low-c[i-2].high:c[i-2].low-c[i].high;return gap>=atr(c.slice(0,i+1),CONFIG.imbalance.atrLength)*CONFIG.imbalance.minGapATR}
export function detectSpike(c:Candle[]):Spike|null{
 const end=c.length-1, start=Math.max(0,end-CONFIG.spike.maxBars+1), med=medianRange(c.slice(0,end),20)||1, a=atr(c.slice(0,end+1),14)||med;
 for(let i=end;i>=start;i--){for(const d of ['LONG','SHORT'] as Direction[]){let count=0,first=i;for(let j=i;j>=Math.max(0,i-CONFIG.spike.maxBars+1);j--){const same=dir(c[j])===d&&bodyRatio(c[j])>=CONFIG.spike.bodyToRangeMin&&(d==='LONG'?closeLocation(c[j])>=CONFIG.spike.closeLocationMin:closeLocation(c[j])<=1-CONFIG.spike.closeLocationMin);if(!same)break;count++;first=j}if(count>=CONFIG.spike.minStrongCandles){const ex=c.slice(first,i+1).reduce((s,x)=>s+(x.high-x.low),0)/count/med;const imb=fvg(c,i,d);const score=Math.min(100,40+count*10+(ex>=CONFIG.spike.expansionVsMedian?20:0)+(imb?20:0));return {direction:d,startIndex:first,endIndex:i,strongCandles:count,expansion:ex,imbalance:imb,score}}}}
 return null;
}
