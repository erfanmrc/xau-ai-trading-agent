import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation } from '@/engine/indicators';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'MICROMAP',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

export function detectMicroMap(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for Micro-MAP');
  const end=c.length-1, s=summarizeStructure(c), a=Math.max(atr(c,14),0.05);
  const current=c[end], pullCandidates=[c[end-1],c[end-2],c[end-3]].filter(Boolean) as Candle[];

  for(const d of ['LONG','SHORT'] as const){
    for(let channelBars=C.analysis.microMap.maxChannelBars;channelBars>=C.analysis.microMap.minChannelBars;channelBars--){
      const channelEnd=end-2;
      const start=channelEnd-channelBars+1;
      if(start<3) continue;
      const ch=c.slice(start,channelEnd+1);
      const micro=d==='LONG'
        ? ch.every((x,i)=>i===0 || (x.low>=ch[i-1].low && x.high>=ch[i-1].high && x.close>=ch[i-1].close))
        : ch.every((x,i)=>i===0 || (x.low<=ch[i-1].low && x.high<=ch[i-1].high && x.close<=ch[i-1].close));
      if(!micro) continue;
      const chRange=Math.max(Math.max(...ch.map(x=>x.high))-Math.min(...ch.map(x=>x.low)),1e-9);
      if(chRange>a*1.25) continue;

      const pull=[] as Candle[];
      for(const x of pullCandidates){
        if(x.time===current.time) continue;
        const holds=d==='LONG'?x.low>=Math.min(...ch.map(q=>q.low)):x.high<=Math.max(...ch.map(q=>q.high));
        if(holds) pull.push(x); else break;
      }
      if(!pull.length || pull.length>C.analysis.microMap.maxPullbackBars) continue;

      const trigger=d==='LONG'?Math.max(...pull.map(x=>x.high),ch.at(-1)!.high):Math.min(...pull.map(x=>x.low),ch.at(-1)!.low);
      const triggerDistance=d==='LONG'?trigger-current.close:current.close-trigger;
      if(triggerDistance<0 || triggerDistance>a*C.analysis.microMap.maxTriggerDistanceATR) continue;
      const triggerHit=d==='LONG'?current.close>trigger:current.close<trigger;
      const confirmation=d==='LONG'
        ?candleDirection(current)==='LONG' && bodyRatio(current)>=0.50 && closeLocation(current)>=0.70
        :candleDirection(current)==='SHORT' && bodyRatio(current)>=0.50 && closeLocation(current)<=0.30;
      if(!triggerHit || !confirmation){
        return {strategy:'MICROMAP',status:'WATCH',score:65+(s.bias===d?10:0),reason:'Strict Micro-MAP structure found; waiting for trigger confirmation',reasons:[`${channelBars}-bar micro-channel detected`,`Tight channel and shallow pullback preserved`,`Trigger or strong confirmation pending`],warnings:['Micro-MAP is intentionally the strictest/least frequent setup'],direction:d,trigger,zone:null};
      }

      const entry=current.close;
      const stop=d==='LONG'?Math.min(...pull.map(x=>x.low),ch[0].low):Math.max(...pull.map(x=>x.high),ch[0].high);
      const stopDistance=d==='LONG'?entry-stop:stop-entry;
      if(stopDistance<=0 || stopDistance>a*C.analysis.microMap.maxStopATR) return invalid('Micro-MAP stop is wider than the strict stop limit',['Micro-MAP requires a tight stop']);

      const confluence=assessEntryConfluence(c,entry);
      const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.analysis.microMap.targetRR,true);
      const score=Math.min(100,62+(s.bias===d?12:0)+(s.breakout===d?8:0)+confluence.score);
      const reasons=[`${channelBars}-bar micro-channel`,`${pull.length}-bar controlled pullback`,'Trigger breakout with strong confirmation',`Tight stop ${(stopDistance/a).toFixed(2)} ATR`,'High-RR target profile',confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
      if(!risk.tradable) return {strategy:'MICROMAP',status:'INVALID',score,reason:'Micro-MAP setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,trigger,stop,risk,confluence};
      return {strategy:'MICROMAP',status:'VALID',score,reason:'Strict Micro-MAP confirmed',reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,trigger,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence};
    }
  }
  return invalid('No qualifying strict Micro-MAP pattern',['Micro-MAP is intentionally rare and requires tight geometry']);
}
