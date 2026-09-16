import { Candle, Direction } from '@/types/market';
import { atr, bodyRatio, candleDirection } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

export type StrategyZone={direction:Direction,low:number,high:number,source:'SPIKE'|'FVG'|'BREAKOUT',strength:number,startIndex:number,endIndex:number};

function fvg(c:Candle[],i:number): StrategyZone | null {
  if(i<2) return null;
  const a=c[i-2], d=c[i], aVal=atr(c.slice(0,i+1),C.analysis.imbalance.atrLength)||1e-9;
  if(a.high < d.low && d.low-a.high >= aVal*C.analysis.imbalance.minGapATR) return {direction:'LONG',low:a.high,high:d.low,source:'FVG',strength:75,startIndex:i-2,endIndex:i};
  if(a.low > d.high && a.low-d.high >= aVal*C.analysis.imbalance.minGapATR) return {direction:'SHORT',low:d.high,high:a.low,source:'FVG',strength:75,startIndex:i-2,endIndex:i};
  return null;
}
export function buildStrategyZones(c:Candle[]): StrategyZone[] {
  const out:StrategyZone[]=[];
  for(let i=2;i<c.length;i++) {
    const f=fvg(c,i); if(f) out.push(f);
    if(i>=2){
      const a=c[i-2],b=c[i-1],d=c[i];
      if([a,b,d].every(x=>candleDirection(x)==='LONG') && [a,b,d].every(x=>bodyRatio(x)>=C.analysis.spike.bodyToRangeMin)) out.push({direction:'LONG',low:Math.min(a.low,b.low,d.low),high:Math.max(a.high,b.high,d.high),source:'SPIKE',strength:78,startIndex:i-2,endIndex:i});
      if([a,b,d].every(x=>candleDirection(x)==='SHORT') && [a,b,d].every(x=>bodyRatio(x)>=C.analysis.spike.bodyToRangeMin)) out.push({direction:'SHORT',low:Math.min(a.low,b.low,d.low),high:Math.max(a.high,b.high,d.high),source:'SPIKE',strength:78,startIndex:i-2,endIndex:i});
    }
    if(i>=C.analysis.btb.breakoutLookback){
      const prev=c.slice(i-C.analysis.btb.breakoutLookback,i), hi=Math.max(...prev.map(x=>x.high)), lo=Math.min(...prev.map(x=>x.low));
      if(c[i].close>hi) out.push({direction:'LONG',low:hi,high:c[i].close,source:'BREAKOUT',strength:70,startIndex:i-C.analysis.btb.breakoutLookback,endIndex:i});
      if(c[i].close<lo) out.push({direction:'SHORT',low:c[i].close,high:lo,source:'BREAKOUT',strength:70,startIndex:i-C.analysis.btb.breakoutLookback,endIndex:i});
    }
  }
  return out.filter((z,idx,a)=>a.findIndex(x=>x.source===z.source&&x.direction===z.direction&&Math.abs(x.low-z.low)<1e-6&&Math.abs(x.high-z.high)<1e-6)===idx).slice(-100);
}
export function zoneReturned(c:Candle[],z:StrategyZone):boolean {
  const last=c.length-1;
  if(last<=z.endIndex) return false;
  const from=Math.max(z.endIndex+1,last-C.analysis.btb.returnWindowBars);
  let departed=false;
  for(let i=from;i<last;i++) {
    if(z.direction==='LONG' && c[i].low>z.high) departed=true;
    if(z.direction==='SHORT' && c[i].high<z.low) departed=true;
  }
  const cur=c[last];
  const returned=cur.high>=z.low && cur.low<=z.high;
  return departed && returned;
}
