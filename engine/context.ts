import { Candle, EconomicEvent, MarketBias, MarketContext } from '@/types/market';
import { resample } from '@/engine/indicators';
import { assessDailyPriceAction, summarizeStructure } from '@/engine/market-structure';
import { buildImportantLevels } from '@/engine/levels';
import { buildEconomicContext } from '@/engine/economic';
import { buildLiquidityContext } from '@/engine/liquidity';
import { detectMarketRegime } from '@/engine/regime';

function sessionName(iso:string){
  const h=new Date(iso).getUTCHours();
  if(h>=7&&h<12) return 'LONDON';
  if(h>=12&&h<17) return 'NEW_YORK';
  if(h>=0&&h<7) return 'ASIA';
  return 'OFF_SESSION';
}
function dayKey(t:string){ return new Date(t).toISOString().slice(0,10); }

export function buildContext(m1:Candle[],dailyCandles?:Candle[],economicEvents?:EconomicEvent[]):MarketContext{
  const sorted=m1.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  if(!sorted.length) throw new Error('No M1 candles supplied');
  const m5=resample(sorted,5),m15=resample(sorted,15),h1=resample(sorted,60);
  const currentDay=dayKey(sorted.at(-1)!.time);
  const rawDaily=dailyCandles?.length?dailyCandles.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime()):resample(sorted,1440);
  const daily=rawDaily.filter(x=>dayKey(x.time)<currentDay);
  const weekly=resample(daily,10080);
  const h1s=summarizeStructure(h1,80),m15s=summarizeStructure(m15,80),m5s=summarizeStructure(m5,100),m1s=summarizeStructure(sorted,120);
  const dailys=daily.length>=5?summarizeStructure(daily,60):summarizeStructure([]);
  const weeklys=weekly.length>=3?summarizeStructure(weekly,24):summarizeStructure([]);
  const dailyPA=assessDailyPriceAction(daily);
  const dailyb=dailyPA.bias;
  const weeklyb=weeklys.bias;
  const levels=buildImportantLevels(sorted);
  const liquidityMap=buildLiquidityContext(sorted,levels);
  const regime=detectMarketRegime(sorted,dailyb);
  const vals=[h1s.bias,m15s.bias,m5s.bias,m1s.bias];
  const long=vals.filter(x=>x==='LONG').length,short=vals.filter(x=>x==='SHORT').length;
  const localBias:MarketBias=long>short?'LONG':short>long?'SHORT':'NEUTRAL';
  // Daily price action is the global direction; lower timeframes describe local regime.
  const bias:MarketBias=dailyb!=='NEUTRAL'?dailyb:localBias;
  return {
    bias,h1:h1s.bias,m15:m15s.bias,m5:m5s.bias,m1:m1s.bias,dailyBias:dailyb,weeklyBias:weeklyb,dailyPriceAction:dailyPA,
    phase:regime.phase,regime,motherMove:null,
    alignmentScore:regime.alignmentScore,aligned:regime.executionAligned,
    session:sessionName(sorted.at(-1)!.time),
    structure:{m1:m1s,m5:m5s,m15:m15s,h1:h1s,daily:dailys,weekly:weeklys},
    liquidity:{
      previousDayHigh:levels.previousDayHigh,previousDayLow:levels.previousDayLow,
      sessionHigh:levels.sessionHigh,sessionLow:levels.sessionLow,
      rangeHigh:levels.rangeHigh,rangeLow:levels.rangeLow,
      pools:liquidityMap.pools,orderBlocks:liquidityMap.orderBlocks,sweeps:liquidityMap.sweeps,
      volumeProfile:liquidityMap.volumeProfile,executionScore:liquidityMap.executionScore,
      executionLabels:liquidityMap.executionLabels,nearestLowPool:liquidityMap.nearestLowPool,
      nearestHighPool:liquidityMap.nearestHighPool,nearestOrderBlock:liquidityMap.nearestOrderBlock,
      activeSweep:liquidityMap.activeSweep,methodology:liquidityMap.methodology,atrReference:liquidityMap.atrReference
    },
    importantLevels:levels,
    economic:buildEconomicContext(sorted.at(-1)!.time,economicEvents)
  };
}
