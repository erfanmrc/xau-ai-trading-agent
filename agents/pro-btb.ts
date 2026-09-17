import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, resample } from '@/engine/indicators';
import { buildMultiTimeframeBTBZones, touchesZoneAfterDeparture, StrategyZone } from '@/engine/zones';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

const clamp=(n:number)=>Math.max(0,Math.min(100,n));
function sourceRank(s:StrategyZone['source']){return s==='BTB_15M'?3:2;}

function rejection(c:Candle[],z:StrategyZone,d:'LONG'|'SHORT',a:number){
  if(c.length<3) return {ok:false,reason:'Not enough candles for BTB confirmation'};
  const prev=c.at(-2)!,cur=c.at(-1)!;
  const touchPrev=d==='LONG'?prev.low<=z.high+a*0.15&&prev.high>=z.low:prev.high>=z.low-a*0.15&&prev.low<=z.high;
  const touchCur=d==='LONG'?cur.low<=z.high+a*0.10&&cur.high>=z.low:cur.high>=z.low-a*0.10&&cur.low<=z.high;
  const touch=touchPrev||touchCur;
  const dir=candleDirection(cur)===d;
  const body=bodyRatio(cur)>=C.analysis.btb.minM1RejectionBodyToRange;
  const close=d==='LONG'?closeLocation(cur)>=C.analysis.btb.minM1RejectionCloseInDirection:closeLocation(cur)<=1-C.analysis.btb.minM1RejectionCloseInDirection;
  const breakZone=d==='LONG'?cur.close>=z.high+a*C.analysis.btb.rejectionCloseATR:cur.close<=z.low-a*C.analysis.btb.rejectionCloseATR;
  const awayFromZone=d==='LONG'?cur.close>z.high:cur.close<z.low;
  // M5/M15 defines the BTB zone and the return. M1 only needs to supply a
  // decisive rejection; the previous M1 bar does not have to be a second
  // touch or an opposite candle.
  const valid=touch&&dir&&body&&close&&breakZone&&awayFromZone;
  return {ok:valid,reason:`touch=${touch?'yes':'no'}, direction=${dir?'yes':'no'}, body=${body?'yes':'no'}, close=${close?'yes':'no'}, break=${breakZone?'yes':'no'}`,touch};
}

export function detectProBTB(c:Candle[],balance=C.balance,spread=0):StrategySignal{
  if(c.length<C.analysis.minCandles) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Insufficient candles for BTB',reasons:['Insufficient candles for BTB'],warnings:[],direction:null};
  const current=c.at(-1)!;
  const m15=resample(c,15),m5=resample(c,5),a=Math.max(atr(m5,14),0.25);
  const zones=buildMultiTimeframeBTBZones(c).sort((x,y)=>sourceRank(y.source)-sourceRank(x.source)||y.endIndex-x.endIndex);
  for(const z of zones.slice(0,20)){
    const tf=z.timeframe==='M15'?m15:m5;
    const age=tf.length-1-z.endIndex;
    if(age<1||age>C.analysis.btb.maxZoneAgeBars) continue;
    if(!touchesZoneAfterDeparture(tf,z)) continue;
    const d=z.direction;
    const conf=rejection(c,z,d,a);
    if(!conf.ok) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(80,z.strength),reason:'BTB retest detected; waiting for rejection confirmation',reasons:[`${z.source} mother-spike breakout level retested`,conf.reason,'M1 is used as trigger context'],warnings:['BTB requires a real departure, return, touch and reversal-strength candle'],direction:d,zone:{low:z.low,high:z.high,source:z.source}};
    const entry=current.close;
    const buffer=Math.max(a*0.04,spread*2,0.03);
    const stop=d==='LONG'?Math.min(z.low,current.low)-buffer:Math.max(z.high,current.high)+buffer;
    const stopDistance=d==='LONG'?entry-stop:stop-entry;
    if(stopDistance<=0||stopDistance>a*C.analysis.btb.maxStopATR) return {strategy:'PRO_BTB',status:'WATCH',score:55,reason:'BTB confirmed but stop geometry is too wide',reasons:[`Stop ${(stopDistance/a).toFixed(2)} ATR exceeds limit`,`Wait for a closer retest/rejection`],warnings:['Do not compensate for a wide stop by shrinking the lot'],direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}};
    const distanceFromZone=d==='LONG'?Math.max(0,entry-z.high):Math.max(0,z.low-entry);
    if(distanceFromZone>a*C.analysis.btb.maxEntryFromZoneATR) return {strategy:'PRO_BTB',status:'WATCH',score:54,reason:'BTB reaction is already too far from the level',reasons:[`Entry is ${(distanceFromZone/a).toFixed(2)} ATR from zone`,'Avoid chasing the rebound'],warnings:[],direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}};
    const s=summarizeStructure(c),confluence=assessEntryConfluence(c,entry);
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.analysis.btb.targetRR,C.x2Enabled);
    if(!risk.tradable) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'BTB setup rejected by risk engine',reasons:['Risk plan rejected'],warnings:risk.warnings,direction:d,entry,stop,risk,zone:{low:z.low,high:z.high,source:z.source},confluence};
    const h1=summarizeStructure(resample(c,60),80).bias;
    const m15b=summarizeStructure(m15,80).bias;
    let score=z.strength+(z.timeframe==='M15'?10:6)+(h1===d?10:0)+(m15b===d?8:0)+(candleDirection(current)===d?8:0)+Math.min(confluence.score,12);
    if(h1!==d&&h1!=='NEUTRAL') score-=25;
    if(m15b!==d&&m15b!=='NEUTRAL') score-=5;
    score=clamp(score);
    const reasons=[`${z.source} derived from a mother-spike breakout`,`Return reached the breakout/OB zone`,`M1 rejection candle confirmed`,h1===d?'H1 agrees with BTB direction':h1==='NEUTRAL'?'H1 neutral':'H1 context opposes but is handled by decision filter',m15b===d?'M15 supports direction':m15b==='NEUTRAL'?'M15 neutral':'M15 opposes direction',confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
    return {strategy:'PRO_BTB',status:'VALID',score,reason:`BTB confirmed on ${z.timeframe}`,reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,zone:{low:z.low,high:z.high,source:z.source},confluence};
  }
  const watch=zones.slice(0,12).find(z=>{const tf=z.timeframe==='M15'?m15:m5;const age=tf.length-1-z.endIndex;return age>=0&&age<=C.analysis.btb.maxZoneAgeBars&&current.high>=z.low&&current.low<=z.high;});
  if(watch) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(70,watch.strength),reason:'Price is approaching/testing an active BTB mother-spike level',reasons:[`${watch.source} breakout/OB level is active`,'Waiting for a confirmed rejection'],warnings:[],direction:watch.direction,zone:{low:watch.low,high:watch.high,source:watch.source}};
  return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'No BTB retest setup',reasons:['No active M5/M15 mother-spike breakout level has a valid return'],warnings:[],direction:null};
}
