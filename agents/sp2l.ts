import { Candle, Direction, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median, resample } from '@/engine/indicators';
import { summarizeStructure, detectMotherMoveOnTimeframe } from '@/engine/market-structure';
import { assessEntryConfluence, buildImportantLevels } from '@/engine/levels';
import { buildRisk } from '@/engine/risk';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'SP2L',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

function strong(c:Candle,d:Direction){
  const r=Math.max(c.high-c.low,1e-9);
  const upper=(c.high-Math.max(c.open,c.close))/r;
  const lower=(Math.min(c.open,c.close)-c.low)/r;
  const body=bodyRatio(c), cl=closeLocation(c);
  return candleDirection(c)===d && body>=C.analysis.spike.bodyToRangeMin &&
    (d==='LONG'?cl>=C.analysis.spike.closeLocationMin:cl<=1-C.analysis.spike.closeLocationMin) &&
    (d==='LONG'?lower<=C.analysis.spike.oppositeWickMax:upper<=C.analysis.spike.oppositeWickMax);
}

function relationScore(c:Candle[],d:Direction){
  const m5=resample(c,5),m15=resample(c,15),h1=resample(c,60);
  const daily=resample(c,1440);
  const h1b=summarizeStructure(h1,80).bias,m15b=summarizeStructure(m15,80).bias,m5b=summarizeStructure(m5,80).bias;
  const db=daily.length>=5?summarizeStructure(daily,30).bias:'NEUTRAL';
  let score=0;
  if(h1b===d) score+=2;
  if(m15b===d) score+=2;
  if(m5b===d) score+=1;
  if(db===d) score+=2;
  if(h1b!==d&&h1b!=='NEUTRAL') score-=2;
  if(db!==d&&db!=='NEUTRAL') score-=2;
  return {score,h1:h1b,m15:m15b,m5:m5b,daily:db};
}

function nearOriginLevel(c:Candle[],price:number,a:number){
  const l=buildImportantLevels(c);
  const refs=[l.round5,l.round10,l.previousDayHigh,l.previousDayLow,l.previousDayMid,l.sma50M5,l.sma60M5,l.sma50M15,l.sma60M15,l.sma50H1,l.sma60H1,l.ema50M5,l.ema20M15].filter((x):x is number=>x!==null);
  return refs.filter(x=>Math.abs(x-price)<=Math.max(a*0.30,0.75)).slice(0,6);
}

function pressureGap(run:Candle[],d:Direction){
  if(run.length<3) return 0;
  const first=run[0];
  return d==='LONG' ? Math.min(...run.slice(1).map(x=>x.low))-first.close : first.close-Math.max(...run.slice(1).map(x=>x.high));
}

export function detectSP2L(c:Candle[],balance=C.balance,spread=0):StrategySignal{
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const end=c.length-1;
  const a=Math.max(atr(c,14),0.05);
  const candidates:{dir:Direction;start:number;end:number;strength:number;expansion:number;displacement:number;efficiency:number;gap:number}[]=[];

  for(let e=end-2;e>=Math.max(6,end-C.analysis.spike.maxSpikeAgeBars);e--){
    for(const d of ['LONG','SHORT'] as const){
      let s=e,count=0;
      while(s>=1&&e-s<4&&strong(c[s],d)){count++;s--;}
      if(count<C.analysis.spike.minStrongCandles) continue;
      const start=s+1,pre=c[start-1],run=c.slice(start,e+1);
      if(!pre) continue;
      const breakout=d==='LONG'?run[0].high>pre.high:run[0].low<pre.low;
      if(!breakout) continue;
      const base=c.slice(Math.max(1,start-20),start).map(x=>x.high-x.low);
      const baseMedian=base.length?median(base):a;
      const expansion=median(run.map(x=>x.high-x.low))/Math.max(baseMedian,1e-9);
      const displacement=d==='LONG'?run.at(-1)!.close-run[0].open:run[0].open-run.at(-1)!.close;
      const efficiency=displacement/Math.max(run.reduce((sum,x)=>sum+x.high-x.low,0),1e-9);
      const gapRaw=pressureGap(run,d);
      const gap=gapRaw/a;
      const nonOverlap=d==='LONG'
        ? Math.min(...run.slice(1).map(x=>x.low))-run[0].close
        : run[0].close-Math.max(...run.slice(1).map(x=>x.high));
      if(expansion<C.analysis.spike.expansionVsMedian||displacement<a*C.analysis.spike.minDisplacementATR||efficiency<C.analysis.spike.minEfficiency||gap<C.analysis.spike.minPressureGapATR||nonOverlap<a*C.analysis.spike.minNonOverlapGapATR) continue;
      const extension=Math.abs((d==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low)))-(d==='LONG'?pre.high:pre.low))/a;
      if(extension>C.analysis.spike.maxExtensionATR) continue;
      candidates.push({dir:d,start,end:e,strength:count*10+extension*8+efficiency*20+gap*12,expansion,displacement,efficiency,gap});
    }
  }
  if(!candidates.length) return invalid('No qualifying SP2L mother spike');
  candidates.sort((x,y)=>y.strength-x.strength || y.end-x.end);
  const best=candidates[0];
  const {dir,start, end:spikeEnd}=best;
  const run=c.slice(start,spikeEnd+1),pre=c[start-1],first=run[0],last=run.at(-1)!;
  const breakoutLevel=dir==='LONG'?pre.high:pre.low;
  const extreme=dir==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low));
  const leg1=Math.abs(extreme-breakoutLevel);
  const rel=relationScore(c,dir);
  const originLevels=nearOriginLevel(c,breakoutLevel,a);
  const contextGood=rel.score>=1 || originLevels.length>0;
  const originKey=originLevels.length>0;
  const h1Opp=rel.h1!==dir&&rel.h1!=='NEUTRAL';
  if(h1Opp && !originKey) return {strategy:'SP2L',status:'INVALID',score:0,reason:'SP2L blocked by higher-timeframe direction',reasons:[`H1=${rel.h1} opposes ${dir}`,'No strong spike-origin level to justify counter-context entry'],warnings:['SP2L should follow the broader market direction'],direction:null};
  if(!contextGood) return {strategy:'SP2L',status:'WATCH',score:52,reason:'Mother spike lacks sufficient market context',reasons:[`${dir} mother spike detected`,`H1=${rel.h1} M15=${rel.m15} M5=${rel.m5} Daily=${rel.daily}`,'No nearby round/50/60/important level at the breakout origin'],warnings:['Wait for context or BTB rather than forcing a spike entry'],direction:dir,trigger:breakoutLevel};

  const next=c[spikeEnd+1],confirm=c[spikeEnd+2];
  if(!next||!confirm) return {strategy:'SP2L',status:'WATCH',score:58+Math.max(0,rel.score)*4,reason:'Mother spike detected; waiting for simple return and Leg-2 trigger',reasons:[`${dir} spike: ${run.length} strong candles`,`Pressure gap ${best.gap.toFixed(2)} ATR`,`Waiting for the first clean return candle then Leg-2 confirmation`],warnings:['No fixed pullback percentage is required'],direction:dir,trigger:breakoutLevel};

  const touchTol=Math.max(a*0.06,spread*2,0.03);
  const pullCounter=dir==='LONG'?candleDirection(next)==='SHORT':candleDirection(next)==='LONG';
  const returnDistance=dir==='LONG'?Math.max(0,extreme-next.low):Math.max(0,next.high-extreme);
  const returnDepth=returnDistance/Math.max(leg1,1e-9);
  const returnHasMovement=returnDistance>=touchTol;
  const holdsBreakout=dir==='LONG'?next.close>=breakoutLevel-a*C.analysis.spike.maxReturnBeyondBreakoutATR:next.close<=breakoutLevel+a*C.analysis.spike.maxReturnBeyondBreakoutATR;
  const returnRange=(next.high-next.low)/a;
  const returnClean=pullCounter&&returnHasMovement&&holdsBreakout&&returnDepth<=C.analysis.spike.maxReturnDepth&&returnRange<=C.analysis.spike.maxReturnCandleATR;
  if(!returnClean) return {strategy:'SP2L',status:'WATCH',score:55+Math.max(0,rel.score)*4+(originKey?5:0),reason:'Mother spike found; waiting for a controlled return',reasons:[`${dir} mother spike: ${run.length} strong candles`,`Counter-direction return candle: ${pullCounter?'yes':'no'}`,`Return depth ${returnDepth.toFixed(2)} of Leg-1`,`Breakout preserved: ${holdsBreakout?'yes':'no'}`,`Return candle range ${returnRange.toFixed(2)} ATR`],warnings:['The pullback may be simple; it only needs to stabilize Leg-1'],direction:dir,trigger:breakoutLevel};

  const triggerDirection=candleDirection(confirm)===dir;
  const triggerBody=bodyRatio(confirm)>=C.analysis.spike.minLeg2BodyToRange;
  const triggerClose=dir==='LONG'?closeLocation(confirm)>=C.analysis.spike.leg2CloseInDirection:closeLocation(confirm)<=1-C.analysis.spike.leg2CloseInDirection;
  const triggerBreak=dir==='LONG'?confirm.close>next.high:confirm.close<next.low;
  if(!triggerDirection||!triggerBody||!triggerClose||!triggerBreak) return {strategy:'SP2L',status:'WATCH',score:62+Math.max(0,rel.score)*4+(originKey?5:0),reason:'Return stabilized; waiting for the first true Leg-2 break',reasons:[`Leg-2 direction=${triggerDirection?'yes':'no'}`,`Body=${triggerBody?'strong':'weak'}`,`Close location=${triggerClose?'good':'weak'}`,`Break of return extreme=${triggerBreak?'yes':'no'}`],warnings:['Entry is taken at the beginning of Leg-2, not after an extended run'],direction:dir,trigger:breakoutLevel};

  const entry=confirm.close;
  const buffer=Math.max(spread*2,0.03);
  const stop=dir==='LONG'?Math.min(pre.low,...run.map(x=>x.low))-buffer:Math.max(pre.high,...run.map(x=>x.high))+buffer;
  const stopDistance=dir==='LONG'?entry-stop:stop-entry;
  const stopATR=stopDistance/a;
  const projectedRR=leg1/Math.max(stopDistance+spread,1e-9);
  if(stopDistance<=0||stopATR>C.analysis.spike.maxStopATR||projectedRR<C.minRR){
    return {strategy:'SP2L',status:'WATCH',score:48,reason:'SP2L found but the equal-Leg-2 reward does not justify the stop',reasons:[`Stop=${stopATR.toFixed(2)} ATR`,`Projected Leg-2=${projectedRR.toFixed(2)}R`,`Required minimum=${C.minRR.toFixed(2)}R`],warnings:['If the equal second leg is too small relative to risk, wait for a better BTB entry'],direction:dir,entry,trigger:breakoutLevel,stop};
  }

  const targetRR=Math.min(C.maxRR,projectedRR);
  const confluence=assessEntryConfluence(c,entry);
  const originConfluence=originKey?Math.min(8,originLevels.length*3):0;
  const mother=detectMotherMoveOnTimeframe(resample(c,5),'M5',18);
  const sameTFSupport=mother?.direction===dir;
  const risk=buildRisk(dir,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,targetRR,C.x2Enabled);
  const score=Math.min(100,58+rel.score*6+(originKey?8:0)+confluence.score+(best.gap>=0.10?6:0)+(sameTFSupport?5:0)+(projectedRR>=3?5:0));
  const reasons=[
    `${dir} mother spike: ${run.length} strong candles`,`Pressure gap ${best.gap.toFixed(2)} ATR`,`Expansion ${best.expansion.toFixed(2)}x baseline`,`Efficiency ${best.efficiency.toFixed(2)}`,
    'Single controlled return from the spike extreme','Leg-2 broke the return-candle extreme',`Equal-Leg-2 projection=${projectedRR.toFixed(2)}R`,
    originKey?`Spike origin near key level: ${originLevels.join(', ')}`:'No major origin-level confluence',sameTFSupport?'M5 mother-move direction agrees':'No current M5 mother-move agreement',
    confluence.labels.length?`Entry confluence: ${confluence.labels.join(', ')}`:'No entry-level confluence'
  ];
  if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score,reason:'SP2L setup rejected by risk engine',reasons,warnings:risk.warnings,direction:dir,entry,trigger:breakoutLevel,stop,risk,confluence};
  return {strategy:'SP2L',status:'VALID',score,reason:'SP2L confirmed: mother spike → simple return → Leg-2',reasons,warnings:[],direction:dir,entry,entry2:risk.x2Entry??null,trigger:breakoutLevel,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence};
}
