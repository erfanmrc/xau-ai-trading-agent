import { Candle, Direction } from '@/types/market';
import { atr, bodyRatio, candleDirection, resample } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

export type StrategyZone={direction:Direction,low:number,high:number,source:'SPIKE'|'FVG'|'BREAKOUT'|'BTB_5M'|'BTB_15M',strength:number,startIndex:number,endIndex:number,timeframe:'M1'|'M5'|'M15'};

function fvg(c:Candle[],i:number): StrategyZone | null {
  if(i<2) return null;
  const a=c[i-2], d=c[i], aVal=atr(c.slice(0,i+1),C.analysis.imbalance.atrLength)||1e-9;
  if(a.high < d.low && d.low-a.high >= aVal*C.analysis.imbalance.minGapATR) return {direction:'LONG',low:a.high,high:d.low,source:'FVG',strength:75,startIndex:i-2,endIndex:i,timeframe:'M1'};
  if(a.low > d.high && a.low-d.high >= aVal*C.analysis.imbalance.minGapATR) return {direction:'SHORT',low:d.high,high:a.low,source:'FVG',strength:75,startIndex:i-2,endIndex:i,timeframe:'M1'};
  return null;
}

export function buildStrategyZones(c:Candle[]): StrategyZone[] {
  const out:StrategyZone[]=[];
  for(let i=2;i<c.length;i++) {
    const f=fvg(c,i); if(f) out.push(f);
    if(i>=2){
      const a=c[i-2],b=c[i-1],d=c[i];
      if([a,b,d].every(x=>candleDirection(x)==='LONG') && [a,b,d].every(x=>bodyRatio(x)>=C.analysis.spike.bodyToRangeMin)) out.push({direction:'LONG',low:Math.min(a.low,b.low,d.low),high:Math.max(a.high,b.high,d.high),source:'SPIKE',strength:78,startIndex:i-2,endIndex:i,timeframe:'M1'});
      if([a,b,d].every(x=>candleDirection(x)==='SHORT') && [a,b,d].every(x=>bodyRatio(x)>=C.analysis.spike.bodyToRangeMin)) out.push({direction:'SHORT',low:Math.min(a.low,b.low,d.low),high:Math.max(a.high,b.high,d.high),source:'SPIKE',strength:78,startIndex:i-2,endIndex:i,timeframe:'M1'});
    }
    if(i>=C.analysis.btb.breakoutLookback){
      const prev=c.slice(i-C.analysis.btb.breakoutLookback,i), hi=Math.max(...prev.map(x=>x.high)), lo=Math.min(...prev.map(x=>x.low));
      if(c[i].close>hi) out.push({direction:'LONG',low:hi,high:c[i].close,source:'BREAKOUT',strength:70,startIndex:i-C.analysis.btb.breakoutLookback,endIndex:i,timeframe:'M1'});
      if(c[i].close<lo) out.push({direction:'SHORT',low:c[i].close,high:lo,source:'BREAKOUT',strength:70,startIndex:i-C.analysis.btb.breakoutLookback,endIndex:i,timeframe:'M1'});
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
  return departed && cur.high>=z.low && cur.low<=z.high;
}

function buildMultiTF(c:Candle[],minutes:5|15):StrategyZone[] {
  const tf=resample(c,minutes), out:StrategyZone[]=[];
  if(tf.length<C.analysis.minCandles/Math.max(1,minutes)) return out;
  for(let i=3;i<tf.length;i++){
    const first=tf[i-3],a=tf[i-2],b=tf[i-1],d=tf[i];
    const group=[first,a,b,d];
    const longCount=group.filter(x=>candleDirection(x)==='LONG').length;
    const shortCount=group.filter(x=>candleDirection(x)==='SHORT').length;
    const strongLong=group.filter(x=>candleDirection(x)==='LONG' && bodyRatio(x)>=C.analysis.spike.bodyToRangeMin).length;
    const strongShort=group.filter(x=>candleDirection(x)==='SHORT' && bodyRatio(x)>=C.analysis.spike.bodyToRangeMin).length;
    const dir:'LONG'|'SHORT'|null=strongLong>=3 && longCount>=3 ? 'LONG' : strongShort>=3 && shortCount>=3 ? 'SHORT' : null;
    if(!dir) continue;
    const pre=tf[i-4]; if(!pre) continue;
    const breakoutLevel=dir==='LONG'?pre.high:pre.low;
    const impulseExtreme=dir==='LONG'?d.close:d.close;
    const atrRef=Math.max(atr(tf.slice(0,i+1),14),0.1);
    const departure=Math.abs(impulseExtreme-breakoutLevel);
    if(departure<atrRef*C.analysis.btb.minDepartureATR) continue;
    const pad=Math.max(atrRef*C.analysis.btb.zonePaddingATR,0.05);
    const z:StrategyZone={direction:dir,low:breakoutLevel-pad,high:breakoutLevel+pad,source:minutes===5?'BTB_5M':'BTB_15M',strength:88+(minutes===15?6:0),startIndex:i-3,endIndex:i,timeframe:minutes===5?'M5':'M15'};
    out.push(z);
  }
  return out.slice(-30);
}

function touchesZoneAfterDeparture(tf:Candle[],z:StrategyZone):boolean{
  const last=tf.length-1;
  const from=Math.max(z.endIndex+1,last-C.analysis.btb.returnWindowBars);
  let departed=false;
  for(let i=from;i<last;i++){
    if(z.direction==='LONG' && tf[i].low>z.high) departed=true;
    if(z.direction==='SHORT' && tf[i].high<z.low) departed=true;
  }
  const cur=tf[last];
  return departed && cur.high>=z.low && cur.low<=z.high;
}

export function buildMultiTimeframeBTBZones(c:Candle[]):StrategyZone[]{
  const out:StrategyZone[]=[];
  if(C.analysis.btb.m5Enabled) out.push(...buildMultiTF(c,5));
  if(C.analysis.btb.m15Enabled) out.push(...buildMultiTF(c,15));
  return out;
}

export { touchesZoneAfterDeparture };
