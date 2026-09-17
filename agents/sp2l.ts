import { Candle, Direction, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median, resample } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';
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
  const h1b=summarizeStructure(h1,80).bias,m15b=summarizeStructure(m15,80).bias,m5b=summarizeStructure(m5,80).bias;
  // Daily price action is computed once in buildContext/UnifiedDecision.
  // This detector used to resample the M1 window into 1440-minute candles;
  // with a 240-360 minute window that can never produce the 5 daily candles
  // required below, so it always returned NEUTRAL while adding substantial cost.
  let score=0;
  if(h1b===d) score+=2;
  if(m15b===d) score+=1;
  if(m5b===d) score+=1;
  if(h1b!==d&&h1b!=='NEUTRAL') score-=2;
  return {score,h1:h1b,m15:m15b,m5:m5b,daily:'NEUTRAL' as const};
}

function nearOriginLevel(c:Candle[],price:number,a:number){
  const l=buildImportantLevels(c);
  const refs=[l.round5,l.round10,l.previousDayHigh,l.previousDayLow,l.previousDayMid,l.sma50M5,l.sma60M5,l.sma50M15,l.sma60M15,l.sma50H1,l.sma60H1,l.ema50M5,l.ema20M15].filter((x):x is number=>x!==null);
  return refs.filter(x=>Math.abs(x-price)<=Math.max(a*0.30,0.75)).slice(0,6);
}

function pressureGap(run:Candle[],d:Direction){
  if(run.length<3) return 0;
  const first=run[0];
  // SP2L pressure is measured by where subsequent candles CLOSE relative to
  // the first spike close. This matches the chart-language idea better than
  // requiring every later low/high to remain separated by an ATR-sized gap.
  return d==='LONG'
    ? Math.min(...run.slice(1).map(x=>x.close))-first.close
    : first.close-Math.max(...run.slice(1).map(x=>x.close));
}

function findRecentRun(c:Candle[],end:number,d:Direction){
  let s=end,count=0;
  while(s>=1&&end-s<4&&strong(c[s],d)){count++;s--;}
  if(count<C.analysis.spike.minStrongCandles) return null;
  const start=s+1;
  return {start,end,count,run:c.slice(start,end+1),pre:c[start-1]};
}

export function detectSP2L(c:Candle[],balance=C.balance,spread=0):StrategySignal{
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const end=c.length-1;
  const a=Math.max(atr(c,14),0.05);
  const candidates:{dir:Direction;start:number;end:number;strength:number;expansion:number;displacement:number;efficiency:number;gap:number}[]=[];

  // SP2L is event-based: the current bar must be the simple pullback
  // immediately after the 3-4 candle mother spike. A completed older setup
  // is not re-issued on every later bar; those later returns belong to BTB.
  const eventEnd=end-1;
  if(eventEnd<4) return {strategy:'SP2L',status:'INVALID',score:0,reason:'No recent SP2L mother-spike event',reasons:['Current bar is not immediately after a complete mother-spike run'],warnings:[],direction:null};
  for(const e of [eventEnd]){
    for(const d of ['LONG','SHORT'] as const){
      const found=findRecentRun(c,e,d);
      if(!found) continue;
      const {start,run,count,pre}=found;
      if(!pre) continue;
      const breakout=d==='LONG'?run[0].high>pre.high:run[0].low<pre.low;
      if(!breakout) continue;
      const base=c.slice(Math.max(1,start-20),start).map(x=>x.high-x.low);
      const baseMedian=base.length?median(base):a;
      const expansion=median(run.map(x=>x.high-x.low))/Math.max(baseMedian,1e-9);
      const displacement=d==='LONG'?run.at(-1)!.close-run[0].open:run[0].open-run.at(-1)!.close;
      const efficiency=displacement/Math.max(run.reduce((sum,x)=>sum+x.high-x.low,0),1e-9);
      const gap=Math.max(0,pressureGap(run,d))/a;
      const extension=Math.abs((d==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low)))-(d==='LONG'?pre.high:pre.low))/a;
      if(displacement<a*0.45 || efficiency<0.38) continue;
      if(extension>C.analysis.spike.maxExtensionATR) continue;
      const strength=count*14+Math.min(expansion,2)*8+efficiency*18+Math.min(gap,0.5)*20;
      candidates.push({dir:d,start,end:e,strength,expansion,displacement,efficiency,gap});
    }
  }
  if(!candidates.length) return invalid('No qualifying SP2L mother spike');
  candidates.sort((x,y)=>y.strength-x.strength || y.end-x.end);
  const best=candidates[0];
  const {dir,start,end:spikeEnd}=best;
  const run=c.slice(start,spikeEnd+1),pre=c[start-1];
  if(!pre) return invalid('SP2L mother spike has no valid origin candle');
  const breakoutLevel=dir==='LONG'?pre.high:pre.low;
  const extreme=dir==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low));
  const leg1=Math.abs(extreme-breakoutLevel);
  if(leg1<=Math.max(a*0.20,0.05)) return invalid('SP2L Leg-1 is too small');

  const rel=relationScore(c,dir);
  const priorStructure=summarizeStructure(c.slice(0,Math.max(start,1)),120);
  const structuralLevel=dir==='LONG'?priorStructure.lastSwingHigh:priorStructure.lastSwingLow;
  const structuralBreak=structuralLevel!==null && (dir==='LONG'?extreme>structuralLevel+Math.max(spread,0):extreme<structuralLevel-Math.max(spread,0));
  if(C.analysis.spike.requireStructuralBreak && !structuralBreak){
    return {strategy:'SP2L',status:'INVALID',score:0,reason:'SP2L blocked: mother spike did not break a confirmed structural H/L',reasons:[`Structural ${dir==='LONG'?'swing high':'swing low'}=${structuralLevel??'none'}`,`Spike extreme=${extreme}`,'SP2L requires a meaningful H/L break before the pullback entry'],warnings:[],direction:null};
  }
  const originLevels=nearOriginLevel(c,breakoutLevel,a);
  const originKey=originLevels.length>0;
  const h1Opp=rel.h1!==dir&&rel.h1!=='NEUTRAL';
  // H1 is the only hard higher-timeframe filter. M15/M5/daily context can
  // strengthen or weaken the score, but does not create a separate veto.
  if(h1Opp && !originKey) return {strategy:'SP2L',status:'INVALID',score:0,reason:'SP2L blocked by higher-timeframe direction',reasons:[`H1=${rel.h1} opposes ${dir}`,'No strong spike-origin level to justify the counter-context move'],warnings:['H1 remains the primary direction filter'],direction:null};

  const pull=c[spikeEnd+1];
  if(!pull || end!==spikeEnd+1){
    // The detector is called on the current bar. If the pullback candle is not
    // exactly this bar, the SP2L event is either not ready or already stale.
    return {strategy:'SP2L',status:'WATCH',score:60+Math.max(0,rel.score)*4+(originKey?6:0),reason:'Mother spike detected; waiting for the immediate simple pullback candle',reasons:[`${dir} spike: ${run.length} strong candles`,`Pressure=${best.gap.toFixed(2)} ATR`,'SP2L signal is valid only on the first pullback candle'],warnings:['Later returns are handed off to PRO_BTB rather than reusing the old SP2L setup'],direction:dir,trigger:breakoutLevel};
  }

  const touchTol=Math.max(a*0.03,spread*2,0.03);
  const pullCounter=dir==='LONG'?candleDirection(pull)==='SHORT':candleDirection(pull)==='LONG';
  const returnDistance=dir==='LONG'?Math.max(0,extreme-pull.low):Math.max(0,pull.high-extreme);
  const returnDepth=returnDistance/Math.max(leg1,1e-9);
  const returnHasMovement=returnDistance>=touchTol;
  const holdsBreakout=dir==='LONG'?pull.close>=breakoutLevel-a*0.25:pull.close<=breakoutLevel+a*0.25;
  const returnRange=(pull.high-pull.low)/a;
  const returnClean=pullCounter&&returnHasMovement&&holdsBreakout&&returnDepth<=Math.min(C.analysis.spike.maxReturnDepth,0.80)&&returnRange<=Math.max(C.analysis.spike.maxReturnCandleATR,1.15);

  if(!returnClean){
    return {strategy:'SP2L',status:'WATCH',score:56+Math.max(0,rel.score)*4+(originKey?5:0),reason:'Mother spike found; waiting for a controlled return',reasons:[`${dir} mother spike: ${run.length} strong candles`,`Simple return candle: ${pullCounter?'yes':'no'}`,`Return depth ${returnDepth.toFixed(2)} of Leg-1`,`Breakout preserved: ${holdsBreakout?'yes':'no'}`,`Return range ${returnRange.toFixed(2)} ATR`],warnings:['The pullback may remain simple; it only needs to stabilize the first leg'],direction:dir,trigger:breakoutLevel};
  }

  // The simple pullback itself is the setup confirmation. Entry is taken on
  // the next candle, consistent with the requested "pullback then entry" idea.
  const entry=end>=0?pull.close:0;
  const buffer=Math.max(spread*2,0.03);
  // The SP2L stop is structural: behind the completed pullback, not blindly
  // behind the far pre-spike origin. This keeps the stop aligned with the
  // actual entry structure and prevents a valid Leg-2 from being discarded
  // merely because the mother candle was large.
  const pullStructure=summarizeStructure(c.slice(0,spikeEnd+2),60);
  const structuralStop=dir==='LONG'?(pullStructure.lastSwingLow??pull.low):(pullStructure.lastSwingHigh??pull.high);
  const stop=dir==='LONG'?Math.min(pull.low,structuralStop)-buffer:Math.max(pull.high,structuralStop)+buffer;
  return buildConfirmed(dir,start,spikeEnd,run,pre,breakoutLevel,extreme,leg1,rel,originLevels,best,a,stop,pull,balance,spread,end,originKey,'Simple pullback confirmation',structuralLevel);
}


function buildConfirmed(
  dir:Direction,start:number,spikeEnd:number,run:Candle[],pre:Candle,breakoutLevel:number,extreme:number,leg1:number,
  rel:{score:number;h1:string;m15:string;m5:string;daily:string},originLevels:number[],best:{expansion:number;efficiency:number;gap:number},a:number,
  stop:number,trigger:Candle,balance:number,spread:number,signalIndex:number,originKey:boolean,mode:string,structuralLevel:number|null
):StrategySignal{
  const entry=trigger.close;
  const stopDistance=dir==='LONG'?entry-stop:stop-entry;
  const stopATR=stopDistance/a;
  // Target is not an arbitrary R multiple: it is exactly the projected
  // Leg-1 length minus spread. The resulting R decides whether this is a
  // single-stage (1-2R) or X2/two-stage (2-5R) geometry.
  const targetDistance=Math.max(leg1-Math.max(spread,0),0);
  const projectedRR=targetDistance/Math.max(stopDistance+spread,1e-9);
  if(stopDistance<=0||stopATR>C.analysis.spike.maxStopATR||targetDistance<=0){
    return {strategy:'SP2L',status:'WATCH',score:50,reason:'SP2L structure is present but stop/Leg-1 geometry is invalid',reasons:[`Stop=${stopATR.toFixed(2)} ATR`,`Leg-1 minus spread=${targetDistance.toFixed(4)}`],warnings:['Do not chase an extended spike; hand-off to BTB if needed'],direction:dir,entry,trigger:breakoutLevel,stop};
  }
  if(projectedRR<C.singleStageMinRR || projectedRR>C.twoStageMaxRR){
    return {strategy:'SP2L',status:'WATCH',score:50,reason:'SP2L structure is present but Leg-1 target falls outside the allowed R band',reasons:[`Leg-1 target RR=${projectedRR.toFixed(2)}R`,`Allowed: ${C.singleStageMinRR.toFixed(2)}-${C.twoStageMaxRR.toFixed(2)}R`,`Single-stage: ${C.singleStageMinRR.toFixed(2)}-${C.singleStageMaxRR.toFixed(2)}R`,`X2/two-stage: ${C.twoStageMinRR.toFixed(2)}-${C.twoStageMaxRR.toFixed(2)}R`],warnings:['The take-profit must remain equal to Leg-1 length minus spread'],direction:dir,entry,trigger:breakoutLevel,stop};
  }
  const twoStage=projectedRR>C.singleStageMaxRR;
  const confluence=assessEntryConfluence(run.length>=1?[...run,trigger]:[trigger],entry);
  const motherSupport=rel.m5===dir;
  const risk=buildRisk(dir,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,projectedRR,C.x2Enabled);
  if(twoStage && (!risk.x2Entry || !risk.x2LotSize || (risk.combinedRiskPercent??0)>C.x2CombinedRiskPercent+1e-9)){
    return {strategy:'SP2L',status:'WATCH',score:55,reason:'SP2L has a 2-5R Leg-1 target and therefore requires the X2 risk plan',reasons:[`Leg-1 target RR=${projectedRR.toFixed(2)}R`,'X2 plan is unavailable at the requested combined 1% risk'],warnings:['Wait for a geometry where the X2 position can be sized safely'],direction:dir,entry,trigger:breakoutLevel,stop,risk,confluence};
  }
  const score=Math.min(100,60+rel.score*5+(originKey?8:0)+confluence.score+(best.gap>=0.05?4:0)+(motherSupport?4:0)+(projectedRR>=3?4:0));
  const reasons=[
    `${dir} mother spike: ${run.length} strong candles`,`Pressure=${best.gap.toFixed(2)} ATR`,`Expansion=${best.expansion.toFixed(2)}x`,`Efficiency=${best.efficiency.toFixed(2)}`,
    mode,`Confirmed structural break: ${structuralLevel!==null?structuralLevel.toFixed(4):'N/A'}`,`Leg-1 target=${targetDistance.toFixed(4)} (${projectedRR.toFixed(2)}R)`,`Target rule: Leg-1 length minus spread`,twoStage?'X2/two-stage geometry (2-5R)':'Single-stage geometry (1-2R)',originKey?`Spike origin near key level: ${originLevels.join(', ')}`:'No major origin-level confluence',
    motherSupport?'M5 context supports direction':'M5 context is neutral/opposed',confluence.labels.length?`Entry confluence: ${confluence.labels.join(', ')}`:'No entry-level confluence'
  ];
  if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score,reason:'SP2L setup rejected by risk engine',reasons,warnings:risk.warnings,direction:dir,entry,trigger:breakoutLevel,stop,risk,confluence,targetLegSize:leg1,targetDistance,targetRR:projectedRR,targetMode:twoStage?'X2_LEG1_MINUS_SPREAD':'SINGLE_LEG1_MINUS_SPREAD'};
  return {strategy:'SP2L',status:'VALID',score,reason:'SP2L confirmed: mother spike → simple pullback → Leg-2 continuation',reasons,warnings:[],direction:dir,entry,entry2:risk.x2Entry??null,trigger:breakoutLevel,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence,targetLegSize:leg1,targetDistance,targetRR:projectedRR,targetMode:twoStage?'X2_LEG1_MINUS_SPREAD':'SINGLE_LEG1_MINUS_SPREAD'};
}
