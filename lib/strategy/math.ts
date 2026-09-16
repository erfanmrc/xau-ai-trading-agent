import { Candle } from './types';
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const body=(c:Candle)=>Math.abs(c.close-c.open);
export const range=(c:Candle)=>Math.max(c.high-c.low,1e-9);
export const bodyRatio=(c:Candle)=>body(c)/range(c);
export const closeLocation=(c:Candle)=> (c.close-c.low)/range(c);
export const dir=(c:Candle)=>c.close>c.open?'LONG':c.close<c.open?'SHORT':null;
export function median(xs:number[]){if(!xs.length)return 0;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export function atr(c:Candle[],n=14){if(c.length<2)return 0;const tr=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close)));return median(tr.slice(-n));}
export function medianRange(c:Candle[],n=20){return median(c.slice(-n).map(range));}
export const roundPrice=(p:number,decimals=2)=>Number(p.toFixed(decimals));
