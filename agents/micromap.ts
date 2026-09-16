import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median } from '@/engine/indicators';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'MICROMAP',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

export function detectMicroMap(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for Micro-MAP');
  const end=c.length-1, s=summarizeStructure(c), a=Math.max(atr(c,14),0.05), current=c[end];
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
      const stop=d==='LONG'?Math.min(...pull.map(x=>x.low),channelExtreme):Math.max(...pull.map(x=>x.high),channelExtreme);
      const stopDistance=d==='LONG'?entry-stop:stop-entry;
      if(stopDistance<=0 || stopDistance>a*C.analysis.microMap.maxStopATR) return invalid('Micro-MAP stop is wider than the strict limit',['Micro-MAP requires tight geometry']);

      const confluence=assessEntryConfluence(c,entry);
      // Micro-MAP deliberately does not use X2: a tight stop + high RR profile
      // already gives asymmetric payoff and avoids compounding its higher stop-out rate.
      const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.analysis.microMap.targetRR,C.analysis.microMap.x2Enabled);
      const score=Math.min(100,70+(s.bias===d?12:0)+(s.breakout===d?8:0)+Math.min(confluence.score,10));
      const reasons=[`${channelBars}-bar tight micro-channel`,`${channelBars-1}-bar directional compression`,'One-bar controlled pullback','Trigger breakout with strong confirmation',`Tight stop ${(stopDistance/a).toFixed(2)} ATR`,'4R target profile',confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
      if(!risk.tradable) return {strategy:'MICROMAP',status:'INVALID',score,reason:'Micro-MAP setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,trigger,stop,risk,confluence};
      return {strategy:'MICROMAP',status:'VALID',score,reason:'Strict Micro-MAP confirmed',reasons,warnings:[],direction:d,entry,entry2:null,trigger,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence};
    }
  }
  return invalid('No qualifying strict Micro-MAP pattern',['Micro-MAP is intentionally rare and requires tight geometry']);
}
