import { Candle, StrategySignal } from '@/types/market';
import type { MarketContext } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, resample } from '@/engine/indicators';
import { buildMultiTimeframeBTBZones, touchesZoneAfterDeparture } from '@/engine/zones';
import { findFVGs, nearestFVG } from '@/engine/regime';
import { buildRisk } from '@/engine/risk';
import { buildContext } from '@/engine/context';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

const clamp=(n:number)=>Math.max(0,Math.min(100,n));

function rejection(c:Candle[],z:{low:number;high:number},d:'LONG'|'SHORT',a:number){
  if(c.length<2) return {ok:false,reason:'Not enough candles for BTB confirmation'};
  const cur=c.at(-1)!;
  const touch=d==='LONG'?cur.low<=z.high+a*0.15&&cur.high>=z.low:cur.high>=z.low-a*0.15&&cur.low<=z.high;
  const dir=candleDirection(cur)===d;
  const body=bodyRatio(cur)>=C.analysis.btb.minM1RejectionBodyToRange;
  const close=d==='LONG'?closeLocation(cur)>=C.analysis.btb.minM1RejectionCloseInDirection:closeLocation(cur)<=1-C.analysis.btb.minM1RejectionCloseInDirection;
  const breakZone=d==='LONG'?cur.close>=z.high+a*C.analysis.btb.rejectionCloseATR:cur.close<=z.low-a*C.analysis.btb.rejectionCloseATR;
  return {ok:touch&&dir&&body&&close&&breakZone,reason:`touch=${touch?'yes':'no'}, direction=${dir?'yes':'no'}, body=${body?'yes':'no'}, close=${close?'yes':'no'}, break=${breakZone?'yes':'no'}`};
}

export function detectProBTB(c:Candle[],balance=C.balance,spread=0,precomputedContext?:MarketContext):StrategySignal{
  if(c.length<C.analysis.minCandles) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Insufficient candles for BTB',reasons:['Insufficient candles for BTB'],warnings:[],direction:null};
  const current=c.at(-1)!;
  const context=precomputedContext??buildContext(c);
  const regime=context.regime;
  const m5=resample(c,5),m15=resample(c,15);
  const a=Math.max(atr(m5,14),0.25);
  const zones=buildMultiTimeframeBTBZones(c).sort((x,y)=>y.strength-x.strength);
  let watched:{low:number;high:number;direction:'LONG'|'SHORT';strength:number;source:string}|null=null;
  for(const z of zones.slice(0,20)){
    const tf=z.timeframe==='M15'?m15:m5;
    if(z.endIndex<0 || z.endIndex>=tf.length) continue;
    const age=tf.length-1-z.endIndex;
    if(age<1 || age>C.analysis.btb.maxZoneAgeBars) continue;
    if(!touchesZoneAfterDeparture(c,tf,z)) continue;
    const d=z.direction;
    const conf=rejection(c,z,d,a);
    if(!conf.ok){ if(!watched || z.strength>watched.strength) watched={low:z.low,high:z.high,direction:d,strength:z.strength,source:z.source}; continue; }

    const entry=current.close;
    const structure=summarizeStructure(c.slice(0,-1),120);
    const structuralStop=d==='LONG'?Math.min(z.low,current.low,structure.lastSwingLow??Infinity):Math.max(z.high,current.high,structure.lastSwingHigh??-Infinity);
    const stop=d==='LONG'?structuralStop-Math.max(spread*2,0.03):structuralStop+Math.max(spread*2,0.03);
    const stopDistance=d==='LONG'?entry-stop:stop-entry;
    if(stopDistance<=0 || stopDistance>a*C.analysis.btb.maxStopATR){
      return {strategy:'PRO_BTB',status:'WATCH',score:58,reason:'BTB confirmed but stop geometry is too wide',reasons:[`Stop ${(stopDistance/a).toFixed(2)} ATR exceeds limit`],warnings:['Wait for a closer retest/rejection'],direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}};
    }
    const distanceFromZone=d==='LONG'?Math.max(0,entry-z.high):Math.max(0,z.low-entry);
    if(distanceFromZone>a*C.analysis.btb.maxEntryFromZoneATR){
      return {strategy:'PRO_BTB',status:'WATCH',score:55,reason:'BTB reaction is already too far from the retest level',reasons:[`Entry ${(distanceFromZone/a).toFixed(2)} ATR from zone`,'Avoid chasing the rebound'],warnings:[],direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}};
    }
    const fvg=nearestFVG(c,entry,d,'M1',0.90);
    const confluence=assessEntryConfluence(c,entry);
    const leg1=z.legSize??Math.abs(z.high-z.low);
    const targetDistance=Math.max(leg1-Math.max(spread,0),0);
    const targetRR=targetDistance/Math.max(stopDistance+spread,1e-9);
    if(leg1<=0 || targetDistance<=0 || targetRR<C.btbMinRR){
      return {strategy:'PRO_BTB',status:'WATCH',score:56,reason:'BTB retest exists but target geometry is below the required 2R',reasons:[`Leg-1=${leg1.toFixed(4)}`,`Projected RR=${targetRR.toFixed(2)}R`,`Minimum=${C.btbMinRR.toFixed(2)}R`],warnings:[],direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source},fvg};
    }
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,targetRR,C.x2Enabled&&targetRR>2);
    if(!risk.tradable) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'BTB setup rejected by risk engine',reasons:['Risk plan rejected'],warnings:risk.warnings,direction:d,entry,stop,risk,zone:{low:z.low,high:z.high,source:z.source},confluence,fvg};
    const score=clamp(62+z.strength*0.22+(regime.m5Trend.trend===d?10:0)+(regime.m1Trend.trend===d?6:0)+(fvg?6:0)+Math.min(10,confluence.score));
    const reasons=[
      `${z.source} breakout/retest zone`,
      'Real departure followed by return to the level',
      'M1 rejection candle confirmed',
      `EMA M5=${regime.m5Trend.trend} | EMA M1=${regime.m1Trend.trend}`,
      `FVG context=${fvg?'present':'none'}`,
      `Leg-1 target=${targetDistance.toFixed(4)} (${targetRR.toFixed(2)}R)`,
      'Target rule: Leg-1 length minus spread',
      confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'
    ];
    return {strategy:'PRO_BTB',status:'VALID',score,reason:`BTB confirmed on ${z.timeframe} Spike zone`,reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,zone:{low:z.low,high:z.high,source:z.source},confluence,fvg,targetLegSize:leg1,targetDistance,targetRR,targetMode:'BTB_LEG1_MINUS_SPREAD',regime};
  }
  if(watched){
    return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(82,watched.strength),reason:'BTB retest detected; waiting for directional rejection',reasons:[`${watched.source} Spike level is active`,'M1 rejection confirmation is incomplete'],warnings:[],direction:watched.direction,zone:{low:watched.low,high:watched.high,source:watched.source},regime};
  }
  const recentFvg=findFVGs(m5,'M5',24).at(-1);
  return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'No active Spike breakout retest setup',reasons:[`Spike zones detected: ${zones.length}`,recentFvg?'Recent M5 FVG exists but no BTB return is ready':'No recent M5 FVG/Spike retest is ready'],warnings:[],direction:null,regime};
}
