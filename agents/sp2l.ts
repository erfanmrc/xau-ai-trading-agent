import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';
import { buildRisk } from '@/engine/risk';

function invalid(reason:string, warnings:string[]=[]):StrategySignal{return {strategy:'SP2L',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}
export function detectSP2L(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const s=summarizeStructure(c), end=c.length-1;
  const a=atr(c,14)||0.1;
  let spikeEnd=-1, dir:null|'LONG'|'SHORT'=null, start=-1;
  for(let i=end;i>=Math.max(2,end-C.analysis.spike.maxBars+1);i--){
    for(const d of ['LONG','SHORT'] as const){
      let n=0, first=i;
      for(let j=i;j>=Math.max(0,i-C.analysis.spike.maxBars+1);j--){
        const ok=candleDirection(c[j])===d && bodyRatio(c[j])>=C.analysis.spike.bodyToRangeMin && (d==='LONG'?closeLocation(c[j])>=C.analysis.spike.closeLocationMin:closeLocation(c[j])<=1-C.analysis.spike.closeLocationMin);
        if(!ok) break; n++; first=j;
      }
      if(n>=C.analysis.spike.minStrongCandles){ spikeEnd=i;dir=d;start=first;break; }
    }
    if(dir) break;
  }
  if(!dir) return invalid('No qualifying spike');
  const hi=Math.max(...c.slice(start,spikeEnd+1).map(x=>x.high)), lo=Math.min(...c.slice(start,spikeEnd+1).map(x=>x.low));
  const impulse=hi-lo;
  let fvg=false; if(spikeEnd>=2) { const a0=c[spikeEnd-2], d0=c[spikeEnd]; fvg=dir==='LONG'?(a0.high<d0.low && d0.low-a0.high>=a*C.analysis.imbalance.minGapATR):(a0.low>d0.high && a0.low-d0.high>=a*C.analysis.imbalance.minGapATR); }
  for(let i=spikeEnd+1;i<Math.min(c.length,spikeEnd+1+C.analysis.pullback.maxBarsAfterImpulse);i++){
    const p=dir==='LONG'?c[i].low:c[i].high;
    const retrace=dir==='LONG'?(hi-p)/Math.max(impulse,1e-9):(p-lo)/Math.max(impulse,1e-9);
    if(retrace<C.analysis.pullback.minRetrace || retrace>C.analysis.pullback.maxRetrace) continue;
    const j=i+1; if(j>=c.length) break;
    const conf=c[j];
    const good=candleDirection(conf)===dir && bodyRatio(conf)>=C.analysis.confirmation.minBodyToRange && (dir==='LONG'?closeLocation(conf)>=C.analysis.confirmation.closeInDirection:closeLocation(conf)<=1-C.analysis.confirmation.closeInDirection);
    if(!good) continue;
    const entry=conf.close;
    const stop=dir==='LONG'?Math.min(c[i].low,lo):Math.max(c[i].high,hi);
    const risk=buildRisk(dir,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread);
    let score=45+(fvg?15:0)+(s.bias===dir?20:0)+15+(s.breakout===dir?5:0);
    const reasons=[`${dir} spike (${spikeEnd-start+1} strong candles)`,`Leg-2 pullback retrace ${(retrace*100).toFixed(1)}%`,'Confirmation candle detected',fvg?'Imbalance/FVG detected':'No minimum FVG bonus',s.bias===dir?'Structure aligned':'Structure not aligned',s.breakout===dir?'Breakout agrees':'No current structure breakout'];
    if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score:Math.min(score,99),reason:'SP2L setup found but risk plan rejected',reasons,warnings:risk.warnings,direction:dir,entry,stop,risk};
    return {strategy:'SP2L',status:'VALID',score:Math.min(score,100),reason:'SP2L confirmed',reasons,warnings:[],direction:dir,entry,entry2:risk.x2Entry??null,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk};
  }
  return {strategy:'SP2L',status:'WATCH',score:35+(fvg?10:0)+(s.bias===dir?10:0),reason:'Spike detected; waiting for Leg-2 confirmation',reasons:[`${dir} spike detected`,'Leg-2 confirmation not complete'],warnings:['No completed confirmation candle yet'],direction:dir};
}
