import { Candle, EntryConfluence, ImportantLevels } from '@/types/market';
import { atr, resample } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';

function sma(c:Candle[], n:number):number|null{
  if(c.length<n) return c.length?c.at(-1)!.close:null;
  return c.slice(-n).reduce((s,x)=>s+x.close,0)/n;
}
function ema(c:Candle[], n:number):number|null{
  if(c.length<n) return c.length?c.at(-1)!.close:null;
  const k=2/(n+1);
  let value=c.slice(0,n).reduce((s,x)=>s+x.close,0)/n;
  for(const x of c.slice(n)) value=x.close*k+value*(1-k);
  return value;
}
function dayKey(t:string){return new Date(t).toISOString().slice(0,10);}
function sessionName(iso:string){
  const h=new Date(iso).getUTCHours();
  if(h>=7&&h<12) return 'LONDON';
  if(h>=12&&h<17) return 'NEW_YORK';
  if(h>=0&&h<7) return 'ASIA';
  return 'OFF_SESSION';
}
function nearestRound(price:number, step:number){return Math.round(price/step)*step;}

export function buildImportantLevels(c:Candle[]):ImportantLevels{
  if(!c.length) return {
    round5:0,round10:0,previousDayHigh:null,previousDayLow:null,previousDayMid:null,
    sessionHigh:null,sessionLow:null,sessionMid:null,rangeHigh:null,rangeLow:null,rangeMid:null,
    sma50M5:null,sma60M5:null,sma50M15:null,sma60M15:null,sma50H1:null,sma60H1:null,
    ema20M5:null,ema50M5:null,ema60M5:null,ema50M1:null,ema60M1:null,ema20M15:null,m15SwingHigh:null,m15SwingLow:null,
    m5SwingHigh:null,m5SwingLow:null,h1SwingHigh:null,h1SwingLow:null,m1SwingHigh:null,m1SwingLow:null
  };
  const currentDay=dayKey(c.at(-1)!.time);
  const historical=c.length>1?c.slice(0,-1):c;
  const previous=historical.filter(x=>dayKey(x.time)!==currentDay);
  const prevDayKey=previous.length?dayKey(previous.at(-1)!.time):null;
  const prev=previous.filter(x=>dayKey(x.time)===prevDayKey);
  const session=sessionName(c.at(-1)!.time);
  const sameSession=historical.filter(x=>dayKey(x.time)===currentDay&&sessionName(x.time)===session);
  const recent=historical.slice(-60);
  const m5=resample(c,5),m15=resample(c,15),h1=resample(c,60);
  const m15s=summarizeStructure(m15);
  const m5s=summarizeStructure(m5);
  const h1s=summarizeStructure(h1);
  const m1s=summarizeStructure(c);
  const rHi=recent.length?Math.max(...recent.map(x=>x.high)):null;
  const rLo=recent.length?Math.min(...recent.map(x=>x.low)):null;
  const sHi=sameSession.length?Math.max(...sameSession.map(x=>x.high)):null;
  const sLo=sameSession.length?Math.min(...sameSession.map(x=>x.low)):null;
  const pHi=prev.length?Math.max(...prev.map(x=>x.high)):null;
  const pLo=prev.length?Math.min(...prev.map(x=>x.low)):null;
  return {
    round5:nearestRound(c.at(-1)!.close,5),
    round10:nearestRound(c.at(-1)!.close,10),
    previousDayHigh:pHi,previousDayLow:pLo,previousDayMid:pHi!==null&&pLo!==null?(pHi+pLo)/2:null,
    sessionHigh:sHi,sessionLow:sLo,sessionMid:sHi!==null&&sLo!==null?(sHi+sLo)/2:null,
    rangeHigh:rHi,rangeLow:rLo,rangeMid:rHi!==null&&rLo!==null?(rHi+rLo)/2:null,
    sma50M5:sma(m5,50),sma60M5:sma(m5,60),sma50M15:sma(m15,50),sma60M15:sma(m15,60),
    sma50H1:sma(h1,50),sma60H1:sma(h1,60),ema20M5:ema(m5,20),ema50M5:ema(m5,50),ema60M5:ema(m5,60),ema50M1:ema(c,50),ema60M1:ema(c,60),ema20M15:ema(m15,20),
    m15SwingHigh:m15s.lastSwingHigh,m15SwingLow:m15s.lastSwingLow,
    m5SwingHigh:m5s.lastSwingHigh,m5SwingLow:m5s.lastSwingLow,
    h1SwingHigh:h1s.lastSwingHigh,h1SwingLow:h1s.lastSwingLow,
    m1SwingHigh:m1s.lastSwingHigh,m1SwingLow:m1s.lastSwingLow
  };
}

export function assessEntryConfluence(c:Candle[],entry:number):EntryConfluence{
  if(!c.length) return {score:0,labels:[],nearest:null,distance:null,atrReference:0};
  const a=Math.max(atr(resample(c,5),14),0.25);
  const l=buildImportantLevels(c);
  const refs:[string,number|null][]=[
    ['ROUND_5',l.round5],['ROUND_10',l.round10],['PREV_DAY_HIGH',l.previousDayHigh],['PREV_DAY_LOW',l.previousDayLow],['PREV_DAY_MID',l.previousDayMid],
    ['SESSION_HIGH',l.sessionHigh],['SESSION_LOW',l.sessionLow],['SESSION_MID',l.sessionMid],['RANGE_HIGH',l.rangeHigh],['RANGE_LOW',l.rangeLow],['RANGE_MID',l.rangeMid],
    ['SMA50_M5',l.sma50M5],['SMA60_M5',l.sma60M5],['SMA50_M15',l.sma50M15],['SMA60_M15',l.sma60M15],
    ['SMA50_H1',l.sma50H1],['SMA60_H1',l.sma60H1],['EMA20_M5',l.ema20M5],['EMA50_M5',l.ema50M5],['EMA20_M15',l.ema20M15],
    ['M15_SWING_HIGH',l.m15SwingHigh],['M15_SWING_LOW',l.m15SwingLow],
    ['M5_SWING_HIGH',l.m5SwingHigh],['M5_SWING_LOW',l.m5SwingLow],
    ['H1_SWING_HIGH',l.h1SwingHigh],['H1_SWING_LOW',l.h1SwingLow],
    ['M1_SWING_HIGH',l.m1SwingHigh],['M1_SWING_LOW',l.m1SwingLow]
  ];
  const hits=refs.filter(([,v])=>v!==null).map(([name,v])=>({name,v:v!,d:Math.abs(entry-v!)}));
  const nearest=hits.sort((a,b)=>a.d-b.d)[0];
  const labels:string[]=[];
  const roundTol=Math.max(0.12*a,0.30);
  const meanTol=Math.max(0.18*a,0.40);
  for(const x of hits){
    const tol=x.name.startsWith('ROUND_')?roundTol:meanTol;
    if(x.d<=tol) labels.push(x.name);
  }
  let score=0;
  if(labels.some(x=>x.startsWith('ROUND_'))) score+=6;
  if(labels.some(x=>/SMA|EMA|SWING|PREV_DAY|SESSION|RANGE/.test(x))) score+=6;
  if(labels.length>=2) score+=4;
  return {score:Math.min(score,16),labels,nearest:nearest?.v??null,distance:nearest?.d??null,atrReference:a};
}


export type DirectionalLocation = {
  score:number;
  labels:string[];
  supportDistanceATR:number|null;
  resistanceDistanceATR:number|null;
  favorableDistanceATR:number|null;
  opposingDistanceATR:number|null;
  hardOpposition:boolean;
};

export function assessDirectionalLocation(c:Candle[],entry:number,d:'LONG'|'SHORT',aRef?:number):DirectionalLocation{
  if(!c.length) return {score:0,labels:[],supportDistanceATR:null,resistanceDistanceATR:null,favorableDistanceATR:null,opposingDistanceATR:null,hardOpposition:false};
  const historical=c.length>1?c.slice(0,-1):c;
  const a=Math.max(aRef??atr(resample(historical,5),14),0.25);
  const l=buildImportantLevels(c);
  const supports:[string,number|null][]=[
    ['PREV_DAY_LOW',l.previousDayLow],['SESSION_LOW',l.sessionLow],['RANGE_LOW',l.rangeLow],
    ['M15_SWING_LOW',l.m15SwingLow],['M5_SWING_LOW',l.m5SwingLow],['M1_SWING_LOW',l.m1SwingLow]
  ];
  const resistances:[string,number|null][]=[
    ['PREV_DAY_HIGH',l.previousDayHigh],['SESSION_HIGH',l.sessionHigh],['RANGE_HIGH',l.rangeHigh],
    ['M15_SWING_HIGH',l.m15SwingHigh],['M5_SWING_HIGH',l.m5SwingHigh],['M1_SWING_HIGH',l.m1SwingHigh]
  ];
  const nearest=(xs:[string,number|null][])=>xs.filter(([,v])=>v!==null&&Number.isFinite(v)).map(([name,v])=>({name,v:v!,d:Math.abs(entry-v!)})).sort((x,y)=>x.d-y.d)[0]??null;
  const s=nearest(supports),r=nearest(resistances);
  const supportDistanceATR=s?s.d/a:null,resistanceDistanceATR=r?r.d/a:null;
  const favorable=d==='LONG'?supportDistanceATR:resistanceDistanceATR;
  const opposing=d==='LONG'?resistanceDistanceATR:supportDistanceATR;
  let score=0; const labels:string[]=[];
  if(favorable!==null){
    if(favorable<=0.30){score+=10;labels.push(`${d}_SUPPORTIVE_LOCATION_NEAR`)}
    else if(favorable<=0.60){score+=6;labels.push(`${d}_SUPPORTIVE_LOCATION`)}
    else if(favorable<=1.0){score+=2;labels.push(`${d}_LOCATION_ACCEPTABLE`)}
  }
  if(opposing!==null){
    if(opposing<=0.20){score-=12;labels.push(`${d}_OPPOSING_LEVEL_TOO_NEAR`)}
    else if(opposing<=0.40){score-=7;labels.push(`${d}_OPPOSING_LEVEL_NEAR`)}
    else if(opposing<=0.70){score-=3;labels.push(`${d}_OPPOSING_LEVEL_WITHIN_TARGET_PATH`)}
  }
  const hardOpposition=opposing!==null&&opposing<=0.20&&(favorable===null||favorable>0.60);
  return {score,labels,supportDistanceATR: supportDistanceATR===null?null:Number(supportDistanceATR.toFixed(3)),resistanceDistanceATR:resistanceDistanceATR===null?null:Number(resistanceDistanceATR.toFixed(3)),favorableDistanceATR:favorable===null?null:Number(favorable.toFixed(3)),opposingDistanceATR:opposing===null?null:Number(opposing.toFixed(3)),hardOpposition};
}
