import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { bodyRatio, candleDirection } from '@/engine/indicators';
import { buildStrategyZones, zoneReturned } from '@/engine/zones';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';

export function detectProBTB(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Insufficient candles for BTB',reasons:['Insufficient candles for BTB'],warnings:[],direction:null};
  const zones=buildStrategyZones(c), current=c.at(-1)!, prev=c.at(-2)!, s=summarizeStructure(c);
  const candidates=zones.filter(z=>c.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars).reverse();
  for(const z of candidates){
    if(!zoneReturned(c,z)) continue;
    const d=z.direction;
    const confirmation=d==='LONG'?candleDirection(current)==='LONG' && current.close>prev.close && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange:candleDirection(current)==='SHORT' && current.close<prev.close && bodyRatio(current)>=C.analysis.confirmation.minBodyToRange;
    if(!confirmation) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(75,z.strength),reason:'BTB return detected; waiting for confirmation',reasons:[`Returned to ${z.source} zone`,'Directional confirmation pending'],warnings:[],direction:d,zone:{low:z.low,high:z.high,source:z.source}};
    const entry=current.close, stop=d==='LONG'?Math.min(current.low,z.low):Math.max(current.high,z.high);
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread);
    const score=Math.min(100,z.strength+(s.bias===d?15:0)+10);
    if(!risk.tradable) return {strategy:'PRO_BTB',status:'INVALID',score,reason:'BTB setup rejected by risk engine',reasons:[`BTB ${z.source} return confirmed`],warnings:risk.warnings,direction:d,entry,stop,risk,zone:{low:z.low,high:z.high,source:z.source}};
    return {strategy:'PRO_BTB',status:'VALID',score,reason:'BTB confirmed',reasons:[`Price departed ${z.source} zone and returned`,'Directional confirmation candle detected',s.bias===d?'Structure aligned':'Structure not aligned'],warnings:[],direction:d,entry,entry2:risk.x2Entry??null,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,zone:{low:z.low,high:z.high,source:z.source}};
  }
  const near=candidates.find(z=>current.high>=z.low && current.low<=z.high);
  if(near) return {strategy:'PRO_BTB',status:'WATCH',score:Math.min(60,near.strength),reason:'Price is at an active BTB zone',reasons:[`Near ${near.source} zone`,'Return/confirmation incomplete'],warnings:[],direction:near.direction,zone:{low:near.low,high:near.high,source:near.source}};
  return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'No BTB setup',reasons:['No qualifying zone return'],warnings:candidates.length?[]:['No active zones available'],direction:null};
}
