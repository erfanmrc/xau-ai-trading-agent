import { Candle, MarketContext, MarketBias } from '@/types/market';
import { resample } from '@/engine/indicators';
import { summarizeStructure } from '@/engine/market-structure';

function latestBias(c: Candle[]): MarketBias { return summarizeStructure(c).bias; }
function sessionName(iso: string) {
  const h = new Date(iso).getUTCHours();
  if (h >= 7 && h < 12) return 'LONDON';
  if (h >= 12 && h < 17) return 'NEW_YORK';
  if (h >= 0 && h < 7) return 'ASIA';
  return 'OFF_SESSION';
}
function dayKey(t:string) { return new Date(t).toISOString().slice(0,10); }
function levels(c:Candle[]) {
  if (!c.length) return {previousDayHigh:null,previousDayLow:null,sessionHigh:null,sessionLow:null,rangeHigh:null,rangeLow:null};
  const currentDay=dayKey(c.at(-1)!.time);
  const previous=c.filter(x=>dayKey(x.time)!==currentDay);
  const prevDayKey=previous.length ? dayKey(previous.at(-1)!.time) : null;
  const prev=previous.filter(x=>dayKey(x.time)===prevDayKey);
  const session=sessionName(c.at(-1)!.time);
  const sameSession=c.filter(x=>sessionName(x.time)===session && dayKey(x.time)===currentDay);
  const recent=c.slice(-20);
  return {
    previousDayHigh: prev.length ? Math.max(...prev.map(x=>x.high)) : null,
    previousDayLow: prev.length ? Math.min(...prev.map(x=>x.low)) : null,
    sessionHigh: sameSession.length ? Math.max(...sameSession.map(x=>x.high)) : null,
    sessionLow: sameSession.length ? Math.min(...sameSession.map(x=>x.low)) : null,
    rangeHigh: recent.length ? Math.max(...recent.map(x=>x.high)) : null,
    rangeLow: recent.length ? Math.min(...recent.map(x=>x.low)) : null,
  };
}
export function buildContext(m1:Candle[]): MarketContext {
  const m5=resample(m1,5), m15=resample(m1,15), h1=resample(m1,60);
  const h1b=latestBias(h1), m15b=latestBias(m15), m5b=latestBias(m5), m1b=latestBias(m1);
  const vals=[h1b,m15b,m5b,m1b];
  const long=vals.filter(x=>x==='LONG').length, short=vals.filter(x=>x==='SHORT').length;
  const bias:MarketBias=long>short?'LONG':short>long?'SHORT':'NEUTRAL';
  const aligned=bias!=='NEUTRAL' && vals.every(x=>x===bias);
  const alignmentScore = (vals.filter(x=>x!=='NEUTRAL' && x===bias).length / vals.length) * 100;
  return {bias,h1:h1b,m15:m15b,m5:m5b,m1:m1b,alignmentScore,aligned,session:sessionName(m1.at(-1)!.time),liquidity:levels(m1)};
}
