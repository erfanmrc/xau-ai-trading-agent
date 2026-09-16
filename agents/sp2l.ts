import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';
import { buildRisk } from '@/engine/risk';

function invalid(reason:string, warnings:string[]=[]):StrategySignal{
  return {strategy:'SP2L',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};
}

export function detectSP2L(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const end=c.length-1;
  const s=summarizeStructure(c);
  const a=Math.max(atr(c,14),0.05);

  // Search for a completed 3-6 candle impulse immediately before the current Leg-2 phase.
  // A pullback is intentionally NOT required to meet a minimum retracement percentage.
  let found:{dir:'LONG'|'SHORT';start:number;spikeEnd:number}|null=null;
  for(let spikeEnd=end-2; spikeEnd>=Math.max(2,end-C.analysis.spike.maxBars-3); spikeEnd--){
    for(const d of ['LONG','SHORT'] as const){
      let n=0,start=spikeEnd;
      for(let j=spikeEnd;j>=Math.max(1,spikeEnd-C.analysis.spike.maxBars+1);j--){
        const ok=candleDirection(c[j])===d && bodyRatio(c[j])>=C.analysis.spike.bodyToRangeMin &&
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
  const first=c[start], lastSpike=c[spikeEnd], pre=c[start-1];
  const spikeHigh=Math.max(...c.slice(start,spikeEnd+1).map(x=>x.high));
  const spikeLow=Math.min(...c.slice(start,spikeEnd+1).map(x=>x.low));
  const impulse=Math.max(spikeHigh-spikeLow,1e-9);
  const breakoutLevel=dir==='LONG'?pre.high:pre.low;
  const extension=(dir==='LONG'?c[end].close-breakoutLevel:breakoutLevel-c[end].close)/a;
  const stopDistanceRaw=dir==='LONG'?c[end].close-spikeLow:spikeHigh-c[end].close;

  if(extension>C.analysis.spike.maxExtensionATR || stopDistanceRaw>C.analysis.spike.maxStopATR*a){
    return {
      strategy:'SP2L',status:'WATCH',score:35,
      reason:'SP2L first leg extended too far; wait for BTB retest',
      reasons:[`${dir} spike breakout detected`,`Distance from breakout/start became excessive (${extension.toFixed(2)} ATR)`,`Stop distance became too wide (${(stopDistanceRaw/a).toFixed(2)} ATR)`],
      warnings:['SP2L hands off to BTB when the Leg-1 move is already extended'],direction:dir,trigger:breakoutLevel,zone:null
    };
  }

  const pull=c[end-1], current=c[end];
  const touchTolerance=Math.max(a*0.12,spread*2,0.05);
  const returned=dir==='LONG'?pull.low<=lastSpike.high+touchTolerance:pull.high>=lastSpike.low-touchTolerance;
  const pullbackDirection=candleDirection(pull);
  const stable=candleDirection(current);
  // One pullback candle touching/returning from the last spike extreme is enough.
  // Current candle must show stabilization/continuation into Leg-2.
  const confirmation=stable===dir && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange &&
    (dir==='LONG'?closeLocation(current)>=C.analysis.confirmation.closeInDirection:closeLocation(current)<=1-C.analysis.confirmation.closeInDirection);

  if(!returned){
    return {strategy:'SP2L',status:'WATCH',score:40+(s.bias===dir?10:0),reason:'Spike detected; waiting for a simple return from the last spike candle',reasons:[`${dir} spike breakout detected`,`No return to the last spike extreme yet`],warnings:['SP2L does not require a minimum pullback percentage'],direction:dir,trigger:breakoutLevel,zone:null};
  }
  if(!confirmation){
    return {strategy:'SP2L',status:'WATCH',score:50+(pullbackDirection&&pullbackDirection!==dir?5:0)+(s.bias===dir?10:0),reason:'SP2L return detected; waiting for Leg-2 stabilization candle',reasons:[`${dir} spike breakout detected`,'A single return/pullback candle is sufficient','Leg-2 stabilization candle not confirmed'],warnings:['Entry is taken at the start of Leg-2 after stabilization'],direction:dir,trigger:breakoutLevel,zone:null};
  }

  const entry=current.close;
  const stop=dir==='LONG'?Math.min(spikeLow,first.low):Math.max(spikeHigh,first.high);
  const stopDistance=dir==='LONG'?entry-stop:stop-entry;
  if(stopDistance<=0 || stopDistance>C.analysis.spike.maxStopATR*a){
    return {strategy:'SP2L',status:'WATCH',score:45,reason:'SP2L stop distance is too large; wait for a closer BTB entry',reasons:[`${dir} Leg-2 stabilization detected`,`Stop distance ${(stopDistance/Math.max(a,0.05)).toFixed(2)} ATR exceeds limit`],warnings:['Wide-stop SP2L setup is handed off to BTB'],direction:dir,entry,trigger:breakoutLevel,stop};
  }
  const confluence=assessEntryConfluence(c,entry);
  const risk=buildRisk(dir,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.targetRR,true);
  let score=58+(s.bias===dir?12:0)+(s.breakout===dir?5:0)+(confluence.score)+(stopDistance<=a?8:0);
  const reasons=[`${dir} spike breakout (${spikeEnd-start+1} strong candles)`,`Returned from last spike candle extreme`,`Leg-2 stabilization candle confirmed`,`Stop anchored below/above Leg-1`,confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
  if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score:Math.min(score,99),reason:'SP2L setup found but risk plan rejected',reasons,warnings:risk.warnings,direction:dir,entry,trigger:breakoutLevel,stop,risk,confluence};
  return {strategy:'SP2L',status:'VALID',score:Math.min(score,100),reason:'SP2L confirmed: Spike → simple return → Leg-2 stabilization',reasons,warnings:[],direction:dir,entry,entry2:risk.x2Entry??null,trigger:breakoutLevel,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence};
}
