import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, resample } from '@/engine/indicators';
import { buildMultiTimeframeBTBZones, touchesZoneAfterDeparture, buildStrategyZones, zoneReturned, StrategyZone } from '@/engine/zones';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

function sourceRank(s:StrategyZone['source']){ return s==='BTB_15M'?3:s==='BTB_5M'?2:1; }

export function detectProBTB(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Insufficient candles for BTB',reasons:['Insufficient candles for BTB'],warnings:[],direction:null};
  const current=c.at(-1)!, prev=c.at(-2)!, s=summarizeStructure(c);
  const zones=[...buildMultiTimeframeBTBZones(c),...buildStrategyZones(c)].sort((a,b)=>sourceRank(b.source)-sourceRank(a.source) || b.endIndex-a.endIndex);
  const recent=zones.filter(z=>{
    if(z.timeframe==='M1') return c.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars;
    const tf=resample(c,z.timeframe==='M15'?15:5);
    return tf.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars;
  });

  for(const z of recent.slice(0,20)){
    let returned=false;
    if(z.timeframe==='M1') returned=zoneReturned(c,z);
    else {
      const tf=resample(c,z.timeframe==='M15'?15:5);
      if(!tf.length) continue;
      const age=tf.length-1-z.endIndex;
      if(age<1 || age>C.analysis.btb.maxZoneAgeBars) continue;
      returned=touchesZoneAfterDeparture(tf,z);
    }
    if(!returned) continue;
    const d=z.direction;
    const confirmation=d==='LONG'
      ? candleDirection(current)==='LONG' && current.close>prev.close && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange && current.close>=z.low
      : candleDirection(current)==='SHORT' && current.close<prev.close && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange && current.close<=z.high;
    if(!confirmation) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(85,z.strength),reason:'BTB retest detected; waiting for rejection-strength confirmation',reasons:[`${z.source} breakout level retested`,`Directional confirmation candle not strong enough yet`],warnings:['BTB entry requires departure, return and visible rejection strength'],direction:d,zone:{low:z.low,high:z.high,source:z.source}};

    const entry=current.close;
    const stop=d==='LONG'?Math.min(current.low,z.low):Math.max(current.high,z.high);
    const confluence=assessEntryConfluence(c,entry);
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.targetRR,true);
    const score=Math.min(100,z.strength+(s.bias===d?12:0)+(s.breakout===d?6:0)+confluence.score);
    const reasons=[`${z.source} breakout level retested after strong departure`,`Reversal-strength candle confirmed at the level`,s.bias===d?'Structure aligned':'Structure not aligned',confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'];
    if(!risk.tradable) return {strategy:'PRO_BTB',status:'INVALID',score,reason:'BTB setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,stop,risk,zone:{low:z.low,high:z.high,source:z.source},confluence};
    return {strategy:'PRO_BTB',status:'VALID',score,reason:`BTB confirmed on ${z.timeframe}`,reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,zone:{low:z.low,high:z.high,source:z.source},confluence};
  }

  const watch=recent.slice(0,20).find(z=>{
    const d=z.direction;
    if(z.timeframe==='M1') return c.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars && c.at(-1)!.high>=z.low && c.at(-1)!.low<=z.high;
    const tf=resample(c,z.timeframe==='M15'?15:5);
    return tf.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars && c.at(-1)!.high>=z.low && c.at(-1)!.low<=z.high;
  });
  if(watch) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(70,watch.strength),reason:'Price is at an active BTB retest level',reasons:[`${watch.source} level is being tested`,'Waiting for rejection-strength candle'],warnings:[],direction:watch.direction,zone:{low:watch.low,high:watch.high,source:watch.source}};
  return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'No BTB retest setup',reasons:['No active M5/M15 or M1 breakout level has a valid return'],warnings:[],direction:null};
}
