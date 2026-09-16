import { Candle } from '@/types/market';
import { atr, resample } from '@/engine/indicators';

export type ImportantLevels={
  round5:number;
  round10:number;
  previousDayMid:number|null;
  sessionMid:number|null;
  rangeMid:number|null;
  ema20M5:number|null;
  ema50M5:number|null;
  ema20M15:number|null;
};

function ema(c:Candle[], n:number):number|null{
  if(c.length<n) return c.at(-1)?.close??null;
  const k=2/(n+1);
  let value=c.slice(0,n).reduce((s,x)=>s+x.close,0)/n;
  for(const x of c.slice(n)) value=x.close*k+value*(1-k);
  return value;
}

function dayKey(t:string){return new Date(t).toISOString().slice(0,10);}
function sessionName(iso:string){
  const h=new Date(iso).getUTCHours();
  if(h>=7 && h<12) return 'LONDON';
  if(h>=12 && h<17) return 'NEW_YORK';
  if(h>=0 && h<7) return 'ASIA';
  return 'OFF_SESSION';
}
function nearestRound(price:number, step:number){ return Math.round(price/step)*step; }

export function buildImportantLevels(c:Candle[]):ImportantLevels{
  if(!c.length) return {round5:0,round10:0,previousDayMid:null,sessionMid:null,rangeMid:null,ema20M5:null,ema50M5:null,ema20M15:null};
  const currentDay=dayKey(c.at(-1)!.time);
  const previous=c.filter(x=>dayKey(x.time)!==currentDay);
  const prevDay=previous.length ? dayKey(previous.at(-1)!.time) : null;
  const prev=previous.filter(x=>dayKey(x.time)===prevDay);
  const session=sessionName(c.at(-1)!.time);
  const sameSession=c.filter(x=>dayKey(x.time)===currentDay && sessionName(x.time)===session);
  const recent=c.slice(-60);
  const close=c.at(-1)!.close;
  const m5=resample(c,5), m15=resample(c,15);
  return {
    round5:nearestRound(close,5),
    round10:nearestRound(close,10),
    previousDayMid:prev.length?(Math.max(...prev.map(x=>x.high))+Math.min(...prev.map(x=>x.low)))/2:null,
    sessionMid:sameSession.length?(Math.max(...sameSession.map(x=>x.high))+Math.min(...sameSession.map(x=>x.low)))/2:null,
    rangeMid:recent.length?(Math.max(...recent.map(x=>x.high))+Math.min(...recent.map(x=>x.low)))/2:null,
    ema20M5:ema(m5,20),
    ema50M5:ema(m5,50),
    ema20M15:ema(m15,20),
  };
}

export type EntryConfluence={score:number;labels:string[];nearest:number|null;distance:number|null;atrReference:number};

export function assessEntryConfluence(c:Candle[], entry:number):EntryConfluence{
  if(!c.length) return {score:0,labels:[],nearest:null,distance:null,atrReference:0};
  const a=Math.max(atr(resample(c,5),14),0.25);
  const l=buildImportantLevels(c);
  const refs:[string,number|null][]=[
    ['ROUND_5',l.round5],['ROUND_10',l.round10],['PREV_DAY_MID',l.previousDayMid],['SESSION_MID',l.sessionMid],['RANGE_MID',l.rangeMid],
    ['EMA20_M5',l.ema20M5],['EMA50_M5',l.ema50M5],['EMA20_M15',l.ema20M15]
  ];
  const hits=refs.filter(([,v])=>v!==null).map(([name,v])=>({name,v:v!,d:Math.abs(entry-v!)}));
  const nearest=hits.sort((a,b)=>a.d-b.d)[0];
  const labels:string[]=[];
  const roundTol=Math.max(0.15*a,0.35);
  const meanTol=Math.max(0.25*a,0.5);
  for(const x of hits){
    const tol=x.name.startsWith('ROUND_')?roundTol:meanTol;
    if(x.d<=tol) labels.push(x.name);
  }
  let score=0;
  if(labels.some(x=>x.startsWith('ROUND_'))) score+=8;
  if(labels.some(x=>!x.startsWith('ROUND_'))) score+=7;
  if(labels.length>=2) score+=5;
  return {score:Math.min(score,20),labels,nearest:nearest?.v??null,distance:nearest?.d??null,atrReference:a};
}
