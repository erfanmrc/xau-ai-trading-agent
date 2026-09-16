import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation } from '@/engine/indicators';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'MICROMAP',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

export function detectMicroMap(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for Micro-MAP');
  const end=c.length-1, s=summarizeStructure(c), a=atr(c,14)||0.1;
  for(const d of ['LONG','SHORT'] as const){
    for(let channelBars=C.analysis.microMap.maxChannelBars; channelBars>=C.analysis.microMap.minChannelBars; channelBars--){
      const start=end-channelBars-2; if(start<2) continue;
      const ch=c.slice(start,start+channelBars);
      const micro = d==='LONG'
        ? ch.every((x,i)=>i===0 || (x.low>ch[i-1].low && x.close>=ch[i-1].close))
        : ch.every((x,i)=>i===0 || (x.high<ch[i-1].high && x.close<=ch[i-1].close));
      if(!micro) continue;
      const pullStart=start+channelBars;
      const pull=c.slice(pullStart,end);
      if(!pull.length || pull.length>C.analysis.microMap.maxPullbackBars) continue;
      const pullValid=d==='LONG'?pull.every(x=>x.low>=ch[0].low):pull.every(x=>x.high<=ch[0].high);
      if(!pullValid) continue;
      const trigger=d==='LONG'?Math.max(...pull.map(x=>x.high),ch.at(-1)!.high):Math.min(...pull.map(x=>x.low),ch.at(-1)!.low);
      const triggerDistance=d==='LONG'?trigger-c.at(-1)!.close:c.at(-1)!.close-trigger;
      if(triggerDistance<0 || triggerDistance>a*C.analysis.microMap.maxTriggerDistanceATR) continue;
      const current=c.at(-1)!;
      const triggerHit=d==='LONG'?current.close>trigger:current.close<trigger;
      const confirmation=d==='LONG'?candleDirection(current)==='LONG' && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange && closeLocation(current)>=0.6:candleDirection(current)==='SHORT' && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange && closeLocation(current)<=0.4;
      if(!triggerHit || !confirmation){
        return {strategy:'MICROMAP',status:'WATCH',score:60+(s.bias===d?10:0),reason:'Micro-channel found; waiting for trigger/confirmation',reasons:[`${channelBars}-bar ${d} micro-channel detected`,'Pullback held channel extreme','Trigger or confirmation pending'],warnings:['Micro-MAP trigger is evaluated candle-by-candle'],direction:d,trigger,zone:null};
      }
      const entry=current.close;
      const stop=d==='LONG'?Math.min(...pull.map(x=>x.low),ch[0].low):Math.max(...pull.map(x=>x.high),ch[0].high);
      const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread);
      const score=Math.min(100,55+(s.bias===d?20:0)+(s.breakout===d?10:0)+15);
      const reasons=[`${channelBars}-bar ${d} micro-channel detected`,'Pullback preserved channel extreme','Breakout/trigger candle confirmed',s.bias===d?'Structure aligned':'Structure not aligned',s.breakout===d?'Current breakout agrees':'No structure breakout bonus'];
      if(!risk.tradable) return {strategy:'MICROMAP',status:'INVALID',score,reason:'Micro-MAP setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,trigger,stop,risk};
      return {strategy:'MICROMAP',status:'VALID',score,reason:'Micro-MAP confirmed',reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,trigger,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk};
    }
  }
  return invalid('No qualifying Micro-MAP pattern');
}
