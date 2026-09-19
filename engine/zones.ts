import { Candle, Direction, SpikeEvent } from '@/types/market';
import { atr, candleDirection, resample } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { detectSpikeCandidates, findFVGs } from '@/engine/regime';

export type StrategyZone={
  direction:Direction,
  low:number,
  high:number,
  source:'SPIKE'|'FVG'|'BREAKOUT'|'BTB_5M'|'BTB_15M',
  strength:number,
  startIndex:number,
  endIndex:number,
  timeframe:'M1'|'M5'|'M15',
  legSize?:number,
  fvg?:{low:number;high:number;strength:number}|null
};

export function buildStrategyZones(c:Candle[]):StrategyZone[]{
  const out:StrategyZone[]=[];
  for(const g of findFVGs(c,'M1',160)) out.push({direction:g.direction,low:g.low,high:g.high,source:'FVG',strength:g.strength,startIndex:g.startIndex,endIndex:g.endIndex,timeframe:'M1'});
  return out.slice(-120);
}

function spikeToZone(c:Candle[],tf:Candle[],event:SpikeEvent,source:'BTB_5M'|'BTB_15M'):StrategyZone|null{
  const first=tf[event.startIndex],pre=tf[Math.max(0,event.startIndex-1)];
  if(!first||!pre) return null;
  const a=Math.max(atr(tf.slice(0,event.endIndex+1),14),0.1);
  const pad=Math.max(a*C.analysis.btb.zonePaddingATR,0.03);
  const breakout=event.breakoutLevel;
  const bodyLow=Math.min(first.open,first.close),bodyHigh=Math.max(first.open,first.close);
  const low=Math.min(bodyLow,breakout)-pad;
  const high=Math.max(bodyHigh,breakout)+pad;
  if(high-low>a*0.90) return null;
  const fvg=event.fvg?{low:event.fvg.low,high:event.fvg.high,strength:event.fvg.strength}:null;
  return {direction:event.direction,low,high,source,strength:event.strength,startIndex:event.startIndex,endIndex:event.endIndex,timeframe:source==='BTB_5M'?'M5':'M15',legSize:event.legSize,fvg};
}

function buildSpikeZones(c:Candle[],minutes:5|15):StrategyZone[]{
  const tf=resample(c,minutes);
  if(tf.length<12) return [];
  const spikes=detectSpikeCandidates(tf,minutes===5?'M5':'M15',Math.min(60,tf.length));
  const zones=spikes.map(x=>spikeToZone(c,tf,x,minutes===5?'BTB_5M':'BTB_15M')).filter(Boolean) as StrategyZone[];
  return zones.slice(0,24);
}

export function buildMultiTimeframeBTBZones(c:Candle[]):StrategyZone[]{
  const out:StrategyZone[]=[];
  if(C.analysis.btb.m5Enabled) out.push(...buildSpikeZones(c,5));
  if(C.analysis.btb.m15Enabled) out.push(...buildSpikeZones(c,15));
  return out.filter((z,i,a)=>a.findIndex(x=>x.source===z.source&&x.direction===z.direction&&x.endIndex===z.endIndex)===i);
}

export function touchesZoneAfterDeparture(raw:Candle[],tf:Candle[],z:StrategyZone):boolean{
  const zoneEnd=tf[z.endIndex],current=raw.at(-1);
  if(!zoneEnd||!current) return false;
  const zoneEndMs=new Date(zoneEnd.time).getTime(),lastMs=new Date(current.time).getTime();
  if(lastMs<=zoneEndMs) return false;
  const returnMinutes=z.timeframe==='M15'?15:5;
  const maxReturnMs=C.analysis.btb.returnWindowBars*returnMinutes*60_000;
  const fromMs=Math.max(zoneEndMs,lastMs-maxReturnMs);
  const start=raw.findIndex(x=>new Date(x.time).getTime()>fromMs);
  if(start<0) return false;

  let departureBars=0,maxAway=0;
  for(let i=start;i<raw.length-1;i++){
    const x=raw[i];
    const away=z.direction==='LONG'?x.low>z.high:x.high<z.low;
    if(away){departureBars++;maxAway=Math.max(maxAway,departureBars);} else departureBars=0;
  }
  if(maxAway<C.analysis.btb.minDepartureBars) return false;
  const currentTouches=z.direction==='LONG'
    ? current.low<=z.high+0.18*(z.high-z.low) && current.high>=z.low-0.18*(z.high-z.low)
    : current.high>=z.low-0.18*(z.high-z.low) && current.low<=z.high+0.18*(z.high-z.low);
  return currentTouches;
}

export function detectBreakoutCandle(c:Candle[],d:Direction){
  if(c.length<3) return false;
  const cur=c.at(-1)!,prev=c.at(-2)!;
  if(candleDirection(cur)!==d) return false;
  return d==='LONG'?cur.close>prev.high:cur.close<prev.low;
}
