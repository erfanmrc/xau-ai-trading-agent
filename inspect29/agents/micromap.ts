import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median } from '@/engine/indicators';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure, classifyMarketPhase } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'MICROMAP',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

export function detectMicroMap(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for Micro-MAP');
  const end=c.length-1, s=summarizeStructure(c), phase=classifyMarketPhase(c), a=Math.max(atr(c,14),0.05), current=c[end];
  if(phase==='RANGE') return {strategy:'MICROMAP',status:'INVALID',score:0,reason:'Market is in RANGE; Micro-MAP waits for a clean channel',reasons:['Range conditions detected','Micro-MAP is reserved for directional channel structure'],warnings:[],direction:null};
  for(const d of ['LONG','SHORT'] as const){
    for(let channelBars=C.analysis.microMap.maxChannelBars;channelBars>=C.analysis.microMap.minChannelBars;channelBars--){
      const channelEnd=end-2, start=channelEnd-channelBars+1;
      if(start<3) continue;
      const ch=c.slice(start,channelEnd+1);
      const ranges=ch.map(x=>x.high-x.low);
      const tight=median(ranges)<=a*0.65 && Math.max(...ranges)<=a*1.05;
      const directional=ch.filter(x=>candleDirection(x)===d).length;
      const closesDirectional=d==='LONG' ? ch.filter((x,i)=>i===0||x.close>=ch[i-1].close).length : ch.filter((x,i)=>i===0||x.close<=ch[i-1].close).length;
      if(!tight || directional<Math.max(3,channelBars-1) || closesDirectional<Math.max(2,channelBars-1)) continue;

      const pull=c.slice(end-1, end);
      if(!pull.length) continue;
      const p=pull[0];
      const channelExtreme=d==='LONG'?Math.min(...ch.map(x=>x.low)):Math.max(...ch.map(x=>x.high));
      const holds=d==='LONG'?p.low>=channelExtreme:p.high<=channelExtreme;
      if(!holds) continue;

      const trigger=d==='LONG'?Math.max(p.high,ch.at(-1)!.high):Math.min(p.low,ch.at(-1)!.low);
      const triggerDistance=d==='LONG'?trigger-current.close:current.close-trigger;
      if(triggerDistance<0 || triggerDistance>a*C.analysis.microMap.maxTriggerDistanceATR) continue;
      const triggerHit=d==='LONG'?current.close>trigger:current.close<trigger;
      const confirmation=d==='LONG'
        ?candleDirection(current)==='LONG' && bodyRatio(current)>=0.52 && closeLocation(current)>=0.72
        :candleDirection(current)==='SHORT' && bodyRatio(current)>=0.52 && closeLocation(current)<=0.28;
      if(!triggerHit || !confirmation){
        return {
          strategy:'MICROMAP',status:'WATCH',score:65+(s.bias===d?10:0),reason:'Strict Micro-MAP compression found; waiting for clean trigger',
          reasons:[`${channelBars}-bar tight micro-channel`,`Controlled one-bar pullback`,`Trigger/confirmation pending`],warnings:['Micro-MAP remains the rarest, highest-RR setup'],direction:d,trigger,zone:null
        };
      }

      const entry=current.close;
      const structure=summarizeStructure(c.slice(0,-1),120);
      const structuralStop=d==='LONG'?Math.min(...pull.map(x=>x.low),channelExtreme,structure.lastSwingLow??Infinity):Math.max(...pull.map(x=>x.high),channelExtreme,structure.lastSwingHigh??-Infinity);
      const stop=structuralStop;
      const stopDistance=d==='LONG'?entry-stop:stop-entry;
      if(stopDistance<=0 || stopDistance>a*C.analysis.microMap.maxStopATR) return invalid('Micro-MAP stop is wider than the strict limit',['Micro-MAP requires tight geometry']);

      // For Micro-MAP, the first directional leg is represented by the
      // channel's breakout span. TP remains exactly Leg-1 minus spread.
      const channelHigh=Math.max(...ch.map(x=>x.high));
      const channelLow=Math.min(...ch.map(x=>x.low));
      const leg1=Math.max(Math.abs(channelHigh-channelLow),Math.abs(trigger-channelExtreme));
      const targetDistance=Math.max(leg1-Math.max(spread,0),0);
      const targetRR=targetDistance/Math.max(stopDistance+spread,1e-9);
      if(targetDistance<=0 || targetRR<C.analysis.microMap.minRR){
        return {strategy:'MICROMAP',status:'WATCH',score:60,reason:'Micro-MAP setup exists but Leg-1 target is below the required 4R minimum',reasons:[`Micro Leg-1=${leg1.toFixed(4)}`,`Leg-1 minus spread=${targetDistance.toFixed(4)}`,`Projected RR=${targetRR.toFixed(2)}R`,`Minimum=${C.analysis.microMap.minRR.toFixed(2)}R`],warnings:['Micro-MAP target must remain Leg-1 length minus spread and projected RR must stay above 4R'],direction:d,entry,trigger,stop,targetLegSize:leg1,targetDistance,targetRR,targetMode:'MICRO_LEG1_MINUS_SPREAD'};
      }

      const confluence=assessEntryConfluence(c,entry);
      // Micro-MAP remains single-stage: 0.5% risk and no X2.
      const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,targetRR,false);
      const score=Math.min(100,70+(s.bias===d?12:0)+(s.breakout===d?8:0)+(phase==='CHANNEL'?8:0)+Math.min(confluence.score,10));
      const reasons=[`${channelBars}-bar tight micro-channel`,`${channelBars-1}-bar directional compression`,'One-bar controlled pullback','Trigger breakout with strong confirmation',`Tight stop ${(stopDistance/a).toFixed(2)} ATR`,`Leg-1 target=${targetDistance.toFixed(4)} (${targetRR.toFixed(2)}R)`,'Target rule: Leg-1 length minus spread','Micro-MAP requires >4R; target remains Leg-1 minus spread',confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
      if(!risk.tradable) return {strategy:'MICROMAP',status:'INVALID',score,reason:'Micro-MAP setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,trigger,stop,risk,confluence,targetLegSize:leg1,targetDistance,targetRR,targetMode:'MICRO_LEG1_MINUS_SPREAD'};
      return {strategy:'MICROMAP',status:'VALID',score,reason:'Strict Micro-MAP confirmed',reasons,warnings:[],direction:d,entry,entry2:null,trigger,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence,targetLegSize:leg1,targetDistance,targetRR,targetMode:'MICRO_LEG1_MINUS_SPREAD'};
    }
  }
  return invalid('No qualifying strict Micro-MAP pattern',['Micro-MAP is intentionally rare and requires tight geometry']);
}
