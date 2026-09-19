import { Candle, Direction } from '@/types/market';
import { atr, bodyRatio, candleDirection, closeLocation, median, range, resample } from '@/engine/indicators';
import { findFVGs, classifyEmaTrend } from '@/engine/regime';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

export type FastGate={deepAnalysis:boolean;possibleSP2L:boolean;possibleBTB:boolean;possibleMicroMap:boolean};

function strongEntry(c:Candle){
  if(!c) return false;
  return bodyRatio(c)>=C.analysis.confirmation.minBodyToRange && !!candleDirection(c) &&
    (candleDirection(c)==='LONG'?closeLocation(c)>=C.analysis.confirmation.closeInDirection:closeLocation(c)<=1-C.analysis.confirmation.closeInDirection);
}

function nearLevel(price:number,level:number|undefined|null,a:number,toleranceATR:number){
  return level!=null && Math.abs(price-level)<=a*toleranceATR;
}

function spikeStartIsDistinct(c:Candle[],start:number,d:Direction){
  if(start<=0) return true;
  const lookback=Math.max(1,C.analysis.spike.resetLookbackBars??3);
  const prior=c.slice(Math.max(0,start-lookback),start);
  const resetBodyThreshold=C.analysis.spike.minBodyQuality*0.80;
  if(prior.some(x=>candleDirection(x)!==d || bodyRatio(x)<resetBodyThreshold)) return true;
  const baseline=prior.map(range);
  const med=baseline.length?Math.max(median(baseline),1e-9):0;
  return range(c[start])>=med*Math.max(1,C.analysis.spike.minStartExpansionRatio??1.15);
}

/**
 * Cheap causal Spike hint for the backtest fast path. It deliberately does not
 * call the full Spike detector: the full detector is reserved for Deep Analysis.
 * The hint requires the same conceptual ingredients: 3+ directional candles,
 * displacement, pressure/imbalance and a causal FVG in the active impulse.
 */
function recentSpikeHint(c:Candle[],timeframe:'M1'|'M5'|'M15'):{direction:Direction;strength:number;breakoutLevel:number;extreme:number;fvgLow:number;fvgHigh:number;ageBars:number}|null{
  const minCount=C.analysis.spike.minCandles;
  if(c.length<minCount+2) return null;
  const maxAge=timeframe==='M1'?C.analysis.pullback.maxBarsAfterImpulse:Math.max(1,Math.ceil(C.analysis.btb.maxZoneAgeBars/12));
  const lookback=Math.min(Math.max(C.analysis.spike.maxCandles+maxAge+3,18),28);
  const window=c.slice(-lookback);
  const fvgs=findFVGs(c,timeframe,Math.min(c.length,32));
  const startBase=c.length-window.length;
  const refAtr=Math.max(atr(c.slice(0,startBase),C.analysis.imbalance.atrLength),atr(c,C.analysis.imbalance.atrLength),0.05);
  let best:null|{direction:Direction;strength:number;breakoutLevel:number;extreme:number;fvgLow:number;fvgHigh:number;ageBars:number}=null;

  for(let age=0;age<=maxAge;age++){
    const end=window.length-1-age;
    if(end<minCount-1) break;
    for(const d of ['LONG','SHORT'] as const){
      if(candleDirection(window[end])!==d) continue;
      let start=end;
      const resetBody=C.analysis.spike.minBodyQuality*0.80;
      while(start>0 && end-start<C.analysis.spike.maxCandles-1 && candleDirection(window[start-1])===d && bodyRatio(window[start-1])>=resetBody) start--;
      const run=window.slice(start,end+1);
      if(run.length<minCount || !spikeStartIsDistinct(window,start,d)) continue;
      const dirBodies=run.reduce((s,x)=>s+(candleDirection(x)===d?bodyRatio(x):0),0)/run.length;
      let good=0,total=0;for(let i=1;i<run.length;i++){const delta=run[i].close-run[i-1].close;if(!delta)continue;total++;if((delta>0?'LONG':'SHORT')===d)good++;}
      const progress=total?good/total:0;
      const displacement=d==='LONG'?run.at(-1)!.close-run[0].open:run[0].open-run.at(-1)!.close;
      const totalRange=run.reduce((s,x)=>s+range(x),0);
      const efficiency=displacement/Math.max(totalRange,1e-9);
      const pressure=run.reduce((s,x)=>s+(d==='LONG'?Math.max(0,x.close-x.open):Math.max(0,x.open-x.close)),0)/Math.max(totalRange,1e-9);
      const displacementATR=displacement/refAtr;
      const fvg=fvgs.filter(x=>x.direction===d && x.endIndex>=c.length-window.length+start && x.endIndex<=c.length-window.length+end).sort((a,b)=>b.endIndex-a.endIndex||b.strength-a.strength)[0]??null;
      if(!fvg) continue;
      if(displacementATR<C.analysis.spike.minDisplacementATR || efficiency<C.analysis.spike.minEfficiency || pressure<C.analysis.spike.minPressure || dirBodies<C.analysis.spike.minBodyQuality || progress<C.analysis.spike.minCloseProgress) continue;
      const breakoutLevel=d==='LONG'?window[Math.max(0,start-1)].high:window[Math.max(0,start-1)].low;
      const extreme=d==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low));
      const strength=Math.min(100,run.length*10+displacementATR*12+efficiency*20+pressure*25+Math.min(15,fvg.sizeATR)*1.4);
      const candidate={direction:d,strength,breakoutLevel,extreme,fvgLow:fvg.low,fvgHigh:fvg.high,ageBars:age};
      if(!best || age<best.ageBars || (age===best.ageBars && candidate.strength>best.strength)) best=candidate;
    }
    if(best && best.ageBars===age) return best;
  }
  return best;
}

function likelyMicroMap(c:Candle[],m5Trend:ReturnType<typeof classifyEmaTrend>){
  if(c.length<330 || m5Trend.trend==='NEUTRAL') return false;
  const current=c.at(-1)!;
  if(!strongEntry(current)) return false;
  const a=Math.max(atr(c,14),0.05), prior=c.slice(-7,-1);
  if(!prior.length) return false;
  const avg=prior.reduce((s,x)=>s+range(x),0)/prior.length;
  const recentHigh=Math.max(...prior.map(x=>x.high)),recentLow=Math.min(...prior.map(x=>x.low));
  const breakoutDistance=m5Trend.trend==='LONG'?current.close-recentHigh:recentLow-current.close;
  const breakout=breakoutDistance>=a*C.analysis.microMap.minFastBreakoutATR;
  return avg<=a*1.10 && breakout;
}

export function fastGate(c:Candle[]):FastGate{
  if(c.length<330) return {deepAnalysis:true,possibleSP2L:true,possibleBTB:true,possibleMicroMap:true};
  const current=c.at(-1)!;
  const a=Math.max(atr(c,14),0.05);
  const m5Candles=resample(c,5);
  const m5=classifyEmaTrend(m5Candles,'M5');
  const m1=classifyEmaTrend(c,'M1');
  const m1Spike=recentSpikeHint(c,'M1');
  const m5Spike=recentSpikeHint(m5Candles,'M5');
  const recentFvgs=findFVGs(c,'M1',24);
  const recentFvg=recentFvgs.at(-1)??null;
  const currentDir=candleDirection(current);
  const aligned=currentDir!==null && m5.trend!== 'NEUTRAL' && (currentDir===m5.trend || m1.trend===m5.trend || m1.trend==='NEUTRAL');
  const nearSpikeFvg=!!recentFvg && recentFvg.direction===(currentDir??'LONG') && nearLevel(current.close,(recentFvg.low+recentFvg.high)/2,a,0.75);
  const prior=c.slice(-4,-1);
  const pullbackSeen=!!m1Spike && prior.some(x=>candleDirection(x)=== (m1Spike.direction==='LONG'?'SHORT':'LONG'));
  const m1EntryTrigger=!!m1Spike && currentDir===m1Spike.direction && strongEntry(current) &&
    (m1Spike.ageBars<=C.analysis.pullback.maxBarsAfterImpulse) &&
    (nearLevel(current.close,(m1Spike.fvgLow+m1Spike.fvgHigh)/2,a,0.75) || nearLevel(current.close,m1Spike.breakoutLevel,a,0.60) || pullbackSeen);
  const m5EntryTrigger=!!m5Spike && currentDir===m5Spike.direction && strongEntry(current) &&
    (m5Spike.ageBars<=Math.max(2,Math.ceil(C.analysis.btb.returnWindowBars/12))) &&
    (nearLevel(current.close,m5Spike.breakoutLevel,a,0.85) || nearLevel(current.close,m5Spike.extreme,a,0.85));
  const possibleSP2L=!!m1EntryTrigger && (aligned || m1Spike!.direction===currentDir);
  const possibleBTB=!!m5EntryTrigger;
  const possibleMicroMap=likelyMicroMap(c,m5);
  return {deepAnalysis:possibleSP2L||possibleBTB||possibleMicroMap,possibleSP2L,possibleBTB,possibleMicroMap};
}
