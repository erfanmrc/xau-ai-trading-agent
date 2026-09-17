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
  // 360 M1 bars produce only 24 M15 candles; requiring 30 would disable
  // M15 BTB completely during normal backtest windows. The detector itself
  // only needs a much smaller history and can use the available base range.
  if(tf.length<18) return out;
  // BTB only needs zones that can still be active. Scanning the entire
  // historical TF series here made every backtest candle increasingly
  // expensive (O(n^2)). Keep a bounded recent tail instead.
  const age=Math.max(C.analysis.btb.maxZoneAgeBars,C.analysis.btb.returnWindowBars)+12;
  const firstIndex=Math.max(4,tf.length-age-6);
  for(let i=firstIndex;i<tf.length-1;i++){
    const window=tf.slice(Math.max(0,i-30),i+2);
    const mm=detectMotherMoveOnTimeframe(window,minutes===5?'M5':'M15',18);
    if(!mm || mm.endIndex!==window.length-2) continue;
    const localStart=mm.startIndex;
    const localEnd=mm.endIndex;
    const pre=window[localStart-1];
    const first=window[localStart];
    if(!pre || !first) continue;
    const a=Math.max(atr(window,14),0.1);
    const pad=Math.max(a*C.analysis.btb.zonePaddingATR,0.03);
    const bodyLow=Math.min(pre.open,pre.close), bodyHigh=Math.max(pre.open,pre.close);
    const breakout=mm.breakoutLevel;
    const low=Math.min(bodyLow,breakout)-pad;
    const high=Math.max(bodyHigh,breakout)+pad;
    const width=high-low;
    if(width>a*0.55) continue;
    out.push({
      direction:mm.direction,low,high,source:minutes===5?'BTB_5M':'BTB_15M',
      strength:Math.min(100,mm.strength+(minutes===15?4:0)),
      startIndex:i-(localEnd-localStart+1)-1,endIndex:i,
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

export function touchesZoneAfterDeparture(raw:Candle[],tf:Candle[],z:StrategyZone):boolean{
  const zoneEnd=tf[z.endIndex];
  const current=raw.at(-1);
  if(!zoneEnd||!current) return false;
  const zoneEndMs=new Date(zoneEnd.time).getTime();
  const lastMs=new Date(current.time).getTime();
  if(lastMs<=zoneEndMs) return false;

  // The mother spike/BTB level is defined on M5/M15, but the actual return
  // happens on M1. Require a real departure on the raw M1 stream, then allow
  // the current M1 candle to be the retest. This avoids missing a BTB return
  // merely because the higher-TF candle has not closed exactly on the zone.
  const returnMinutes=z.timeframe==='M15'?15:5;
  const maxReturnMs=C.analysis.btb.returnWindowBars*returnMinutes*60_000;
  const fromMs=Math.max(zoneEndMs,lastMs-maxReturnMs);
  const start=raw.findIndex(x=>new Date(x.time).getTime()>fromMs);
  if(start<0) return false;

  let departedBars=0;
  let departed=false;
  for(let i=start;i<raw.length-1;i++){
    const x=raw[i];
    const away=z.direction==='LONG'?x.low>z.high:x.high<z.low;
    if(away){
      departedBars++;
      if(departedBars>=Math.max(2,C.analysis.btb.minDepartureBars)) departed=true;
    }else{
      departedBars=0;
    }
  }
  if(!departed) return false;

  return current.high>=z.low&&current.low<=z.high;
}
