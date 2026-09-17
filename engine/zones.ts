import { Candle, Direction } from '@/types/market';
import { atr, bodyRatio, candleDirection, closeLocation, median, resample } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { detectMotherMoveOnTimeframe } from '@/engine/market-structure';

export type StrategyZone={
  direction:Direction,
  low:number,
  high:number,
  source:'SPIKE'|'FVG'|'BREAKOUT'|'BTB_5M'|'BTB_15M',
  strength:number,
  startIndex:number,
  endIndex:number,
  timeframe:'M1'|'M5'|'M15'
};

function fvg(c:Candle[],i:number):StrategyZone|null{
  if(i<2) return null;
  const a=c[i-2],d=c[i],aVal=Math.max(atr(c.slice(0,i+1),C.analysis.imbalance.atrLength),0.1);
  if(a.high<d.low && d.low-a.high>=aVal*C.analysis.imbalance.minGapATR)
    return {direction:'LONG',low:a.high,high:d.low,source:'FVG',strength:70,startIndex:i-2,endIndex:i,timeframe:'M1'};
  if(a.low>d.high && a.low-d.high>=aVal*C.analysis.imbalance.minGapATR)
    return {direction:'SHORT',low:d.high,high:a.low,source:'FVG',strength:70,startIndex:i-2,endIndex:i,timeframe:'M1'};
  return null;
}

function strong(c:Candle,d:Direction){
  const r=Math.max(c.high-c.low,1e-9);
  const body=bodyRatio(c);
  const cl=closeLocation(c);
  const upper=(c.high-Math.max(c.open,c.close))/r;
  const lower=(Math.min(c.open,c.close)-c.low)/r;
  return candleDirection(c)===d && body>=C.analysis.spike.bodyToRangeMin &&
    (d==='LONG'?cl>=C.analysis.spike.closeLocationMin:cl<=1-C.analysis.spike.closeLocationMin) &&
    (d==='LONG'?lower<=C.analysis.spike.oppositeWickMax:upper<=C.analysis.spike.oppositeWickMax);
}

export function buildStrategyZones(c:Candle[]):StrategyZone[]{
  const out:StrategyZone[]=[];
  for(let i=2;i<c.length;i++){
    const g=fvg(c,i); if(g) out.push(g);
  }
  // Keep the legacy M1 zones as context only. BTB execution uses M5/M15 zones below.
  return out.slice(-120);
}

function buildMotherZone(c:Candle[],minutes:5|15):StrategyZone[] {
  const tf=resample(c,minutes);
  const out:StrategyZone[]=[];
  if(tf.length<30) return out;
  for(let i=4;i<tf.length-1;i++){
    const window=tf.slice(0,i+2);
    const mm=detectMotherMoveOnTimeframe(window,minutes===5?'M5':'M15',18);
    if(!mm || mm.endIndex!==i) continue;
    const pre=tf[mm.startIndex-1];
    const first=tf[mm.startIndex];
    if(!pre || !first) continue;
    const a=Math.max(atr(tf.slice(0,mm.endIndex+1),14),0.1);
    const pad=Math.max(a*C.analysis.btb.zonePaddingATR,0.03);
    const bodyLow=Math.min(pre.open,pre.close), bodyHigh=Math.max(pre.open,pre.close);
    const breakout=mm.breakoutLevel;
    const low=Math.min(bodyLow,breakout)-pad;
    const high=Math.max(bodyHigh,breakout)+pad;
    const width=high-low;
    if(width>a*0.55) continue;
    out.push({
      direction:mm.direction,
      low,
      high,
      source:minutes===5?'BTB_5M':'BTB_15M',
      strength:Math.min(100,mm.strength+(minutes===15?4:0)),
      startIndex:mm.startIndex-1,
      endIndex:mm.endIndex,
      timeframe:minutes===5?'M5':'M15'
    });
  }
  return out.slice(-30);
}

export function buildMultiTimeframeBTBZones(c:Candle[]):StrategyZone[]{
  const out:StrategyZone[]=[];
  if(C.analysis.btb.m5Enabled) out.push(...buildMotherZone(c,5));
  if(C.analysis.btb.m15Enabled) out.push(...buildMotherZone(c,15));
  return out.filter((z,i,a)=>a.findIndex(x=>x.source===z.source&&x.direction===z.direction&&x.endIndex===z.endIndex)===i);
}

export function touchesZoneAfterDeparture(tf:Candle[],z:StrategyZone):boolean{
  const last=tf.length-1;
  if(last<=z.endIndex) return false;
  const from=Math.max(z.endIndex+1,last-C.analysis.btb.returnWindowBars);
  let departed=false;
  for(let i=from;i<last;i++){
    if(z.direction==='LONG'&&tf[i].low>z.high) departed=true;
    if(z.direction==='SHORT'&&tf[i].high<z.low) departed=true;
  }
  const cur=tf[last];
  return departed&&cur.high>=z.low&&cur.low<=z.high;
}
