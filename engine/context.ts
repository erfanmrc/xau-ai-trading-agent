import { Candle, EconomicEvent, MarketBias, MarketContext } from '@/types/market';
import { resample } from '@/engine/indicators';
import { classifyMarketPhase, detectMotherMove, summarizeStructure } from '@/engine/market-structure';
import { buildImportantLevels } from '@/engine/levels';
import { buildEconomicContext } from '@/engine/economic';

function sessionName(iso:string){
  const h=new Date(iso).getUTCHours();
  if(h>=7&&h<12) return 'LONDON';
  if(h>=12&&h<17) return 'NEW_YORK';
  if(h>=0&&h<7) return 'ASIA';
  return 'OFF_SESSION';
}
function dayKey(t:string){ return new Date(t).toISOString().slice(0,10); }
function latestBias(c:Candle[],lookback=80):MarketBias{return c.length?summarizeStructure(c,Math.min(lookback,c.length)).bias:'NEUTRAL';}

export function buildContext(m1:Candle[],dailyCandles?:Candle[],economicEvents?:EconomicEvent[]):MarketContext{
  const sorted=m1.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  if(!sorted.length) throw new Error('No M1 candles supplied');
  const m5=resample(sorted,5),m15=resample(sorted,15),h1=resample(sorted,60);
  const currentDay=dayKey(sorted.at(-1)!.time);
  const rawDaily=dailyCandles?.length?dailyCandles.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime()):resample(sorted,1440);
  const daily=rawDaily.filter(x=>dayKey(x.time)<currentDay);
  const weekly=resample(daily,10080);
  const h1b=latestBias(h1),m15b=latestBias(m15),m5b=latestBias(m5),m1b=latestBias(sorted);
  const dailyb=daily.length>=5?latestBias(daily,30):'NEUTRAL';
  const weeklyb=weekly.length>=3?latestBias(weekly,12):'NEUTRAL';
  const vals=[h1b,m15b,m5b,m1b];
  const long=vals.filter(x=>x==='LONG').length,short=vals.filter(x=>x==='SHORT').length;
  const bias:MarketBias=long>short?'LONG':short>long?'SHORT':'NEUTRAL';
  const aligned=bias!=='NEUTRAL'&&vals.every(x=>x===bias);
  const alignmentScore=(vals.filter(x=>x!=='NEUTRAL'&&x===bias).length/vals.length)*100;
  const motherCandidates=[
    detectMotherMove(m15,'M15'),detectMotherMove(m5,'M5'),detectMotherMove(sorted,'M1')
  ].filter(Boolean).map(x=>x!);
  const currentTime=new Date(sorted.at(-1)!.time).getTime();
  const motherMove=motherCandidates
    .filter(x=>currentTime-new Date(x.endTime).getTime()<=90*60_000)
    .sort((a,b)=>b.strength-a.strength || new Date(b.endTime).getTime()-new Date(a.endTime).getTime())[0]??null;
  return {
    bias,h1:h1b,m15:m15b,m5:m5b,m1:m1b,dailyBias:dailyb,weeklyBias:weeklyb,
    phase:classifyMarketPhase(sorted),motherMove,alignmentScore,aligned,
    session:sessionName(sorted.at(-1)!.time),
    liquidity:{
      previousDayHigh:buildImportantLevels(sorted).previousDayHigh, previousDayLow:buildImportantLevels(sorted).previousDayLow,
      sessionHigh:buildImportantLevels(sorted).sessionHigh, sessionLow:buildImportantLevels(sorted).sessionLow,
      rangeHigh:buildImportantLevels(sorted).rangeHigh, rangeLow:buildImportantLevels(sorted).rangeLow
    },
    importantLevels:buildImportantLevels(sorted),
    economic:buildEconomicContext(sorted.at(-1)!.time,economicEvents)
  };
}
