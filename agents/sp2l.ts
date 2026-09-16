import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';
import { buildRisk } from '@/engine/risk';

function invalid(reason:string, warnings:string[]=[]):StrategySignal{
  return {strategy:'SP2L',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};
}

function recentImbalance(c:Candle[], start:number, end:number, a:number){
  for(let i=Math.max(start+2,2);i<=end;i++){
    const left=c[i-2], right=c[i];
    if(left.high<right.low && right.low-left.high>=a*C.analysis.imbalance.minGapATR) return 'LONG';
    if(left.low>right.high && left.low-right.high>=a*C.analysis.imbalance.minGapATR) return 'SHORT';
  }
  return null;
}

export function detectSP2L(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const end=c.length-1;
  const s=summarizeStructure(c);
  const a=Math.max(atr(c,14),0.05);
  let found:{dir:'LONG'|'SHORT';start:number;spikeEnd:number}|null=null;

  // Find the most recent 3-6 strong candles. One simple return from the
  // last spike candle is enough; no minimum pullback ratio is required.
  for(let spikeEnd=end-2; spikeEnd>=Math.max(2,end-C.analysis.spike.maxBars-4); spikeEnd--){
    for(const d of ['LONG','SHORT'] as const){
      let n=0,start=spikeEnd;
      for(let j=spikeEnd;j>=Math.max(1,spikeEnd-C.analysis.spike.maxBars+1);j--){
        const ok=candleDirection(c[j])===d &&
          bodyRatio(c[j])>=C.analysis.spike.bodyToRangeMin &&
          (d==='LONG'?closeLocation(c[j])>=C.analysis.spike.closeLocationMin:closeLocation(c[j])<=1-C.analysis.spike.closeLocationMin);
        if(!ok) break;
        n++; start=j;
      }
      if(n<C.analysis.spike.minStrongCandles) continue;
      const pre=c[start-1];
      const breakoutOk=d==='LONG'?c[start].high>pre.high:c[start].low<pre.low;
      if(!breakoutOk) continue;
      found={dir:d,start,spikeEnd};
      break;
    }
    if(found) break;
  }
  if(!found) return invalid('No qualifying SP2L spike breakout');

  const {dir,start,spikeEnd}=found;
  const spike=c.slice(start,spikeEnd+1);
  const first=spike[0], lastSpike=spike[spike.length-1], pre=c[start-1];
  const spikeHigh=Math.max(...spike.map(x=>x.high));
  const spikeLow=Math.min(...spike.map(x=>x.low));
  const breakoutLevel=dir==='LONG'?pre.high:pre.low;
  const extension=Math.max(0,(dir==='LONG'?c[end].close-breakoutLevel:breakoutLevel-c[end].close))/a;
  const stopDistanceRaw=dir==='LONG'?c[end].close-spikeLow:spikeHigh-c[end].close;

  // Do not chase a move whose entry has become too far from the breakout.
  if(extension>C.analysis.spike.maxExtensionATR || stopDistanceRaw>C.analysis.spike.maxStopATR*a){
    return {
      strategy:'SP2L',status:'WATCH',score:35+(s.bias===dir?8:0),
      reason:'SP2L first leg extended too far; wait for BTB retest',
      reasons:[`${dir} spike breakout detected`,`Move is ${extension.toFixed(2)} ATR from breakout`,`Stop geometry is ${(stopDistanceRaw/a).toFixed(2)} ATR`],
      warnings:['SP2L hands off to BTB when the first leg is already stretched'],
      direction:dir,trigger:breakoutLevel,zone:null
    };
  }

  const pull=c[end-1], current=c[end];
  const touchTolerance=Math.max(a*0.10,spread*2,0.05);
  const returned=dir==='LONG'
    ? pull.low<=lastSpike.high+touchTolerance
    : pull.high>=lastSpike.low-touchTolerance;
  const pullIsCounter=dir==='LONG' ? candleDirection(pull)==='SHORT' : candleDirection(pull)==='LONG';
  const pullBreakLevel=dir==='LONG'?pull.high:pull.low;
  const leg2Break=dir==='LONG'?current.close>pullBreakLevel:current.close<pullBreakLevel;
  const returnDepth=dir==='LONG'
    ? Math.max(0,lastSpike.high-pull.low)/Math.max(spikeHigh-spikeLow,1e-9)
    : Math.max(0,pull.high-lastSpike.low)/Math.max(spikeHigh-spikeLow,1e-9);

  if(!returned){
    return {
      strategy:'SP2L',status:'WATCH',score:42+(s.bias===dir?8:0),
      reason:'Spike detected; waiting for a simple return from the last spike candle',
      reasons:[`${dir} spike breakout detected`,'No return to the last spike extreme yet'],
      warnings:['No minimum pullback percentage is required'],
      direction:dir,trigger:breakoutLevel,zone:null
    };
  }

  const pullbackDirection=candleDirection(pull);
  const confirmation=candleDirection(current)===dir &&
    bodyRatio(current)>=C.analysis.confirmation.minBodyToRange &&
    (dir==='LONG'?closeLocation(current)>=C.analysis.confirmation.closeInDirection:closeLocation(current)<=1-C.analysis.confirmation.closeInDirection) &&
    leg2Break &&
    (pullIsCounter || bodyRatio(pull)<=0.45);
  if(!confirmation){
    return {
      strategy:'SP2L',status:'WATCH',score:52+(pullbackDirection&&pullbackDirection!==dir?5:0)+(s.bias===dir?8:0),
      reason:'SP2L return detected; waiting for Leg-2 stabilization candle',
      reasons:[`${dir} spike breakout detected`,'Single return candle is sufficient',`Return depth ${(returnDepth*100).toFixed(0)}% of spike range`,`Leg-2 candle must break the return-candle extreme`,`Leg-2 stabilization/continuation is not confirmed`],
      warnings:['Entry is intended at the start of Leg-2'],
      direction:dir,trigger:breakoutLevel,zone:null
    };
  }

  const entry=current.close;
  const stop=dir==='LONG'?Math.min(spikeLow,first.low):Math.max(spikeHigh,first.high);
  const stopDistance=dir==='LONG'?entry-stop:stop-entry;
  if(stopDistance<=0 || stopDistance>C.analysis.spike.maxStopATR*a){
    return {
      strategy:'SP2L',status:'WATCH',score:48,
      reason:'SP2L stop distance is too large; wait for a closer BTB entry',
      reasons:[`${dir} Leg-2 stabilization detected`,`Stop distance ${(stopDistance/Math.max(a,0.05)).toFixed(2)} ATR exceeds limit`],
      warnings:['Wide-stop SP2L setup is handed off to BTB'],
      direction:dir,entry,trigger:breakoutLevel,stop
    };
  }

  const imbalance=recentImbalance(c,start,spikeEnd,a);
  const confluence=assessEntryConfluence(c,entry);
  const risk=buildRisk(dir,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,3,true);
  const tightness=stopDistance<=a?8:0;
  const triggerBonus=leg2Break?8:0;
  const structurePenalty=(s.bias!==dir && s.bias!=='NEUTRAL')?6:0;
  const score=Math.min(100,60+(s.bias===dir?10:0)+(s.breakout===dir?5:0)+tightness+triggerBonus+confluence.score+(imbalance===dir?5:0)-structurePenalty);
  const reasons=[
    `${dir} spike breakout (${spike.length} strong candles)`,
    'Simple return from last spike candle extreme',
    'Leg-2 stabilization candle confirmed',
    `Stop anchored beyond Leg-1 extreme`,
    imbalance===dir?'Imbalance agrees with spike direction':'No directional imbalance bonus',
    confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'
  ];
  if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score,reason:'SP2L setup found but risk plan rejected',reasons,warnings:risk.warnings,direction:dir,entry,trigger:breakoutLevel,stop,risk,confluence};
  return {
    strategy:'SP2L',status:'VALID',score,reason:'SP2L confirmed: Spike → simple return → Leg-2 stabilization',reasons,warnings:[],
    direction:dir,entry,entry2:risk.x2Entry??null,trigger:breakoutLevel,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence
  };
}
