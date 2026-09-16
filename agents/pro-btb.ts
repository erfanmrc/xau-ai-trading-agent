import { Candle, StrategySignal } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median, resample } from '@/engine/indicators';
import { buildMultiTimeframeBTBZones, touchesZoneAfterDeparture, buildStrategyZones, zoneReturned, StrategyZone } from '@/engine/zones';
import { buildRisk } from '@/engine/risk';
import { summarizeStructure } from '@/engine/market-structure';
import { assessEntryConfluence } from '@/engine/levels';

function sourceRank(s:StrategyZone['source']){ return s==='BTB_15M'?3:s==='BTB_5M'?2:1; }
const clamp=(n:number)=>Math.max(0,Math.min(100,n));

function strengthConfirmation(c:Candle[], z:StrategyZone, direction:'LONG'|'SHORT', a:number){
  const current=c.at(-1)!, prev=c.at(-2)!;
  const dirOk=candleDirection(current)===direction;
  const bodyOk=bodyRatio(current)>=C.analysis.confirmation.minBodyToRange;
  const closeOk=direction==='LONG'?closeLocation(current)>=C.analysis.confirmation.closeInDirection:closeLocation(current)<=1-C.analysis.confirmation.closeInDirection;
  const currentTouch=direction==='LONG'
    ? current.low<=z.high+a*0.08 && current.high>=z.low
    : current.high>=z.low-a*0.08 && current.low<=z.high;
  const prevTouch=direction==='LONG'
    ? prev.low<=z.high+a*0.12 && prev.high>=z.low
    : prev.high>=z.low-a*0.12 && prev.low<=z.high;
  const closeBeyond=direction==='LONG'
    ? current.close>=z.high+a*C.analysis.btb.rejectionCloseATR
    : current.close<=z.low-a*C.analysis.btb.rejectionCloseATR;
  const prevAgainst=direction==='LONG'?prev.close<=prev.open:prev.close>=prev.open;
  const twoStep = C.analysis.btb.requireTwoStepM1Rejection && z.timeframe==='M1'
    ? (prevTouch && prevAgainst && dirOk && closeBeyond)
    : (currentTouch && dirOk && closeBeyond);
  return {ok:twoStep&&bodyOk&&closeOk,dirOk,bodyOk,closeOk,touch:currentTouch||prevTouch,closeBeyond,prevAgainst,twoStep};
}


function directionalZoneDistance(entry:number,z:StrategyZone,direction:'LONG'|'SHORT'){
  if(direction==='LONG') return Math.max(0,entry-z.high);
  return Math.max(0,z.low-entry);
}

export function detectProBTB(c:Candle[], balance=C.balance, spread=0):StrategySignal {
  if(c.length<C.analysis.minCandles) return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Insufficient candles for BTB',reasons:['Insufficient candles for BTB'],warnings:[],direction:null};
  const current=c.at(-1)!, s=summarizeStructure(c), a=Math.max(atr(resample(c,5),14),0.25);
  const zones=[...buildMultiTimeframeBTBZones(c),...buildStrategyZones(c)].sort((x,y)=>sourceRank(y.source)-sourceRank(x.source)||y.endIndex-x.endIndex);
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
    const confirmation=strengthConfirmation(c,z,d,a);
    if(!confirmation.ok){
      return {
        strategy:'PRO_BTB',status:'WATCH',score:Math.min(85,z.strength),
        reason:'BTB retest detected; waiting for clear rejection-strength confirmation',
        reasons:[`${z.source} breakout level retested`,`Touch=${confirmation.touch?'yes':'no'}`,`Directional body=${confirmation.dirOk&&confirmation.bodyOk?'yes':'no'}`,`Close beyond zone=${confirmation.closeBeyond?'yes':'no'}`],
        warnings:['BTB entry requires departure, return, touch and a decisive rejection candle'],
        direction:d,zone:{low:z.low,high:z.high,source:z.source}
      };
    }

    const entry=current.close;
    const buffer=Math.max(a*0.05,spread*2,0.03);
    const stop=d==='LONG'?Math.min(current.low,z.low)-buffer:Math.max(current.high,z.high)+buffer;
    const stopDistance=d==='LONG'?entry-stop:stop-entry;
    if(stopDistance<=0 || stopDistance>a*C.analysis.btb.maxStopATR){
      return {
        strategy:'PRO_BTB',status:'WATCH',score:55,
        reason:'BTB retest confirmed but stop geometry is too wide',
        reasons:[`${z.source} retest confirmed`,`Stop distance ${(stopDistance/a).toFixed(2)} ATR exceeds ${C.analysis.btb.maxStopATR.toFixed(2)} ATR limit`,'Wait for a cleaner retest with tighter risk'],
        warnings:['Wide-stop BTB entries are rejected rather than forcing a small lot'],
        direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}
      };
    }

    const distanceFromZone=directionalZoneDistance(entry,z,d);
    if(distanceFromZone>a*C.analysis.btb.maxEntryFromZoneATR){
      return {
        strategy:'PRO_BTB',status:'WATCH',score:55,
        reason:'BTB confirmation occurred too far from the retest zone',
        reasons:[`${z.source} rejection confirmed`,`Entry is ${(distanceFromZone/a).toFixed(2)} ATR from the zone`,'Wait for a closer reaction entry'],
        warnings:['BTB avoids chasing a move after the retest'],
        direction:d,entry,stop,zone:{low:z.low,high:z.high,source:z.source}
      };
    }
    const confluence=assessEntryConfluence(c,entry);
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,C.targetRR,true);
    const sourceBonus=z.timeframe==='M15'?8:z.timeframe==='M5'?5:0;
    const structureBonus=s.bias===d?10:0;
    const triggerBonus=candleDirection(current)===d?8:0;
    const confluenceBonus=Math.min(confluence.score,12); // confluence strengthens; it must not override weak price action
    const score=clamp(z.strength+sourceBonus+structureBonus+triggerBonus+confluenceBonus);
    const reasons=[
      `${z.source} breakout level retested after strong departure`,
      'Touch + rejection-strength candle confirmed',
      s.bias===d?'Structure supports direction':'Structure is contextual/not fully aligned',
      `Stop geometry ${(stopDistance/a).toFixed(2)} ATR`,
      confluence.labels.length?`Price confluence: ${confluence.labels.join(', ')}`:'No major price-level confluence'
    ];
    if(!risk.tradable) return {strategy:'PRO_BTB',status:'INVALID',score,reason:'BTB setup rejected by risk engine',reasons,warnings:risk.warnings,direction:d,entry,stop,risk,zone:{low:z.low,high:z.high,source:z.source},confluence};
    return {
      strategy:'PRO_BTB',status:'VALID',score,reason:`BTB confirmed on ${z.timeframe}`,reasons,warnings:[],direction:d,entry,entry2:risk.x2Entry??null,stop,
      tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,zone:{low:z.low,high:z.high,source:z.source},confluence
    };
  }

  const watch=recent.slice(0,20).find(z=>{
    if(z.timeframe==='M1') return c.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars && current.high>=z.low && current.low<=z.high;
    const tf=resample(c,z.timeframe==='M15'?15:5);
    return tf.length-1-z.endIndex<=C.analysis.btb.maxZoneAgeBars && current.high>=z.low && current.low<=z.high;
  });
  if(watch) return {
    strategy:'PRO_BTB',status:'WATCH',score:Math.min(70,watch.strength),reason:'Price is approaching/testing an active BTB level',
    reasons:[`${watch.source} level is being tested`,'Waiting for clean departure→return→rejection sequence'],warnings:[],direction:watch.direction,zone:{low:watch.low,high:watch.high,source:watch.source}
  };
  return {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'No BTB retest setup',reasons:['No active M5/M15 or M1 breakout level has a valid return'],warnings:[],direction:null};
}
