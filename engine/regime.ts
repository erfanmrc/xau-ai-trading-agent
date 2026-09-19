import { Candle, Direction, FVGZone, LocalTrend, MarketBias, MarketPhase, MarketRegime, SpikeEvent } from '@/types/market';
import { atr, bodyRatio, candleDirection, ema, median, range, resample } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));

function signedBody(c:Candle,d:Direction){
  return d==='LONG' ? Math.max(0,c.close-c.open) : Math.max(0,c.open-c.close);
}

function directionalBodyRatio(c:Candle[],d:Direction){
  if(!c.length) return 0;
  return c.reduce((s,x)=>s+(candleDirection(x)===d?bodyRatio(x):0),0)/c.length;
}

function closeProgress(c:Candle[],d:Direction){
  if(c.length<2) return 0;
  let good=0,total=0;
  for(let i=1;i<c.length;i++){
    const delta=c[i].close-c[i-1].close;
    if(Math.abs(delta)<=0) continue;
    total++;
    if((delta>0?'LONG':'SHORT')===d) good++;
  }
  return total?good/total:0;
}

export function findFVGs(c:Candle[],timeframe:'M1'|'M5'|'M15',lookback=96):FVGZone[]{
  const src=c.length>lookback?c.slice(-lookback):c;
  const offset=c.length-src.length;
  const out:FVGZone[]=[];
  for(let i=2;i<src.length;i++){
    const left=src[i-2],mid=src[i-1],right=src[i];
    const ref=src.slice(0,i);
    const a=Math.max(atr(ref,C.analysis.imbalance.atrLength),atr(src.slice(0,i+1),C.analysis.imbalance.atrLength),0.05);
    const midBody=bodyRatio(mid);
    if(left.high<right.low){
      const gap=right.low-left.high;
      if(gap>=a*C.analysis.imbalance.minGapATR && candleDirection(mid)==='LONG'){
        out.push({direction:'LONG',low:left.high,high:right.low,timeframe,startIndex:offset+i-2,endIndex:offset+i,size:gap,sizeATR:gap/a,strength:clamp(55+Math.min(30,gap/a*20)+midBody*15)});
      }
    } else if(left.low>right.high){
      const gap=left.low-right.high;
      if(gap>=a*C.analysis.imbalance.minGapATR && candleDirection(mid)==='SHORT'){
        out.push({direction:'SHORT',low:right.high,high:left.low,timeframe,startIndex:offset+i-2,endIndex:offset+i,size:gap,sizeATR:gap/a,strength:clamp(55+Math.min(30,gap/a*20)+midBody*15)});
      }
    }
  }
  return out;
}

function latestFVGInRange(fvgs:FVGZone[],start:number,end:number){
  return fvgs.filter(x=>x.endIndex>=start&&x.endIndex<=end).sort((a,b)=>b.endIndex-a.endIndex||b.strength-a.strength)[0]??null;
}

export function classifyEmaTrend(c:Candle[],timeframe:'M1'|'M5'|'M15',lookback=C.analysis.regime.emaLookback):LocalTrend{
  if(c.length<65) return {timeframe,trend:'NEUTRAL',ema50:null,ema60:null,separationATR:0,slope50ATR:0,slope60ATR:0,closeSide:'NEUTRAL',sideRatio:0,score:0};
  const a=Math.max(atr(c,14),0.05);
  const e50=ema(c,50),e60=ema(c,60);
  const prev50=ema(c.slice(0,-Math.min(lookback,c.length-1)),50);
  const prev60=ema(c.slice(0,-Math.min(lookback,c.length-1)),60);
  const slope50=(e50-prev50)/a;
  const slope60=(e60-prev60)/a;
  const sep=(e50-e60)/a;
  const recent=c.slice(-Math.min(lookback,c.length));
  const longSide=recent.filter(x=>x.close>e50).length/recent.length;
  const shortSide=recent.filter(x=>x.close<e50).length/recent.length;
  const closeSide=recent.at(-1)!.close>e50?'LONG':recent.at(-1)!.close<e50?'SHORT':'NEUTRAL' as 'LONG'|'SHORT'|'NEUTRAL';
  const longScore=clamp(sep*18)+clamp(slope50*12)+clamp(slope60*8)+longSide*30+(closeSide==='LONG'?18:0);
  const shortScore=clamp(-sep*18)+clamp(-slope50*12)+clamp(-slope60*8)+shortSide*30+(closeSide==='SHORT'?18:0);
  let trend:MarketBias='NEUTRAL';
  if(e50-e60>=a*C.analysis.regime.minEmaSeparationATR && slope50>=C.analysis.regime.minEmaSlopeATR && slope60>-C.analysis.regime.minEmaSlopeATR && longSide>=C.analysis.regime.minCloseSideRatio) trend='LONG';
  else if(e60-e50>=a*C.analysis.regime.minEmaSeparationATR && slope50<=-C.analysis.regime.minEmaSlopeATR && slope60<C.analysis.regime.minEmaSlopeATR && shortSide>=C.analysis.regime.minCloseSideRatio) trend='SHORT';
  const score=trend==='LONG'?clamp(longScore):trend==='SHORT'?clamp(shortScore):clamp(Math.max(longScore,shortScore)*0.55);
  return {timeframe,trend,ema50:e50,ema60:e60,separationATR:Math.abs(sep),slope50ATR:slope50,slope60ATR:slope60,closeSide,sideRatio:trend==='LONG'?longSide:trend==='SHORT'?shortSide:Math.max(longSide,shortSide),score};
}

function spikeStartIsDistinct(c:Candle[],start:number,d:Direction){
  if(start<=0) return true;
  const lookback=Math.max(1,C.analysis.spike.resetLookbackBars??3);
  const from=Math.max(0,start-lookback);
  const prior=c.slice(from,start);
  const resetBodyThreshold=C.analysis.spike.minBodyQuality*0.80;
  const hasReset=prior.some(x=>candleDirection(x)!==d || bodyRatio(x)<resetBodyThreshold);
  if(hasReset) return true;
  const baseline=prior.map(range);
  const med=baseline.length?Math.max(median(baseline),1e-9):0;
  const startRange=range(c[start]);
  const expansion=startRange>=med*Math.max(1,C.analysis.spike.minStartExpansionRatio??1.15);
  return expansion;
}

function detectSpikeEndingAt(c:Candle[],timeframe:'M1'|'M5'|'M15',end:number,fvgs?:FVGZone[]):SpikeEvent|null{
  if(end<2 || end>=c.length) return null;
  const knownFvgs=fvgs??findFVGs(c,timeframe,Math.max(120,c.length));
  let best:SpikeEvent|null=null;
  for(const d of ['LONG','SHORT'] as const){
    let start=end;
    const resetBodyThreshold=C.analysis.spike.minBodyQuality*0.80;
    while(start>0 && end-start<C.analysis.spike.maxCandles-1 && candleDirection(c[start])===d && bodyRatio(c[start])>=resetBodyThreshold) start--;
    start++;
    const count=end-start+1;
    if(count<C.analysis.spike.minCandles) continue;
    if(!spikeStartIsDistinct(c,start,d)) continue;
    const run=c.slice(start,end+1);
    const refAtr=Math.max(atr(c.slice(0,start),14),atr(c.slice(0,end+1),14),0.05);
    const directionalRatio=directionalBodyRatio(run,d);
    const progress=closeProgress(run,d);
    const displacement=(d==='LONG'?run.at(-1)!.close-run[0].open:run[0].open-run.at(-1)!.close);
    const displacementATR=displacement/refAtr;
    const totalRange=run.reduce((s,x)=>s+range(x),0);
    const efficiency=displacement/Math.max(totalRange,1e-9);
    const pressure=run.reduce((s,x)=>s+signedBody(x,d),0)/Math.max(totalRange,1e-9);
    const fvg=latestFVGInRange(knownFvgs,start,end);
    if(!fvg || fvg.direction!==d) continue;
    if(displacementATR<C.analysis.spike.minDisplacementATR) continue;
    if(efficiency<C.analysis.spike.minEfficiency) continue;
    if(pressure<C.analysis.spike.minPressure) continue;
    if(directionalRatio<C.analysis.spike.minBodyQuality) continue;
    if(progress<C.analysis.spike.minCloseProgress) continue;
    const extreme=d==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low));
    const breakoutLevel=d==='LONG'?c[Math.max(0,start-1)].high:c[Math.max(0,start-1)].low;
    const legSize=Math.abs(extreme-breakoutLevel);
    const imbalanceScore=clamp(pressure*60 + displacementATR*8 + fvg.sizeATR*8);
    const strength=clamp(count*10 + displacementATR*12 + efficiency*20 + pressure*25 + Math.min(15,fvg.sizeATR)*1.4);
    const event:SpikeEvent={
      timeframe,direction:d,startIndex:start,endIndex:end,startTime:run[0].time,endTime:run.at(-1)!.time,candleCount:count,
      displacementATR,efficiency,pressure,bodyQuality:directionalRatio,closeProgress:progress,
      breakoutLevel,extreme,legSize,fvg,imbalanceScore,strength
    };
    if(!best||event.strength>best.strength) best=event;
  }
  return best;
}

export function detectSpikeCandidates(c:Candle[],timeframe:'M1'|'M5'|'M15',lookback=72):SpikeEvent[]{
  const src=c.length>lookback?c.slice(-lookback):c;
  const offset=c.length-src.length;
  const fvgs=findFVGs(src,timeframe,Math.max(120,src.length));
  const found:SpikeEvent[]=[];
  for(let end=2;end<src.length;end++){
    const event=detectSpikeEndingAt(src,timeframe,end,fvgs);
    if(event){
      const fvg=event.fvg?{...event.fvg,startIndex:event.fvg.startIndex+offset,endIndex:event.fvg.endIndex+offset}:null;
      found.push({...event,startIndex:event.startIndex+offset,endIndex:event.endIndex+offset,fvg});
    }
  }
  // One sustained impulse is one Spike event. Keep the strongest event for each
  // distinct start boundary instead of emitting a rolling event on every candle.
  const dedup=new Map<string,SpikeEvent>();
  for(const e of found){
    const key=`${e.timeframe}|${e.direction}|${e.startIndex}`;
    const prev=dedup.get(key);
    if(!prev || e.strength>prev.strength || e.endIndex>prev.endIndex) dedup.set(key,e);
  }
  return [...dedup.values()].sort((a,b)=>b.endIndex-a.endIndex||b.strength-a.strength);
}

export function detectLatestSpike(c:Candle[],timeframe:'M1'|'M5'|'M15'):SpikeEvent|null{
  if(c.length<8) return null;
  const fvgs=findFVGs(c,timeframe,Math.max(120,c.length));
  for(let end=c.length-1;end>=Math.max(2,c.length-C.analysis.spike.maxAgeBars);end--){
    const e=detectSpikeEndingAt(c,timeframe,end,fvgs);
    if(e) return e;
  }
  return null;
}

function isCompressedChannel(c:Candle[],a:number){
  if(c.length<8) return false;
  const ranges=c.map(range);
  const med=Math.max(median(ranges),1e-9);
  const width=(Math.max(...c.map(x=>x.high))-Math.min(...c.map(x=>x.low)))/a;
  const avg=ranges.reduce((s,x)=>s+x,0)/ranges.length;
  let overlap=0;
  for(let i=1;i<c.length;i++) if(c[i].high>=c[i-1].low&&c[i].low<=c[i-1].high) overlap++;
  return width<=C.analysis.context.channelMaxWidthATR && avg<=a*C.analysis.context.channelAvgRangeATR && overlap/Math.max(c.length-1,1)>=C.analysis.context.channelOverlapRatio && med<=a*C.analysis.context.channelMedianRangeATR;
}

function isRange(c:Candle[],m5:LocalTrend,m1:LocalTrend,a:number){
  if(c.length<18) return false;
  const tail=c.slice(-C.analysis.regime.rangeLookback);
  const width=(Math.max(...tail.map(x=>x.high))-Math.min(...tail.map(x=>x.low)))/a;
  let overlap=0,cross=0;
  for(let i=1;i<tail.length;i++){
    if(tail[i].high>=tail[i-1].low&&tail[i].low<=tail[i-1].high) overlap++;
    const p1=tail[i-1].close-(m1.ema50??tail[i-1].close),p2=tail[i].close-(m1.ema50??tail[i].close);
    if(p1*p2<0) cross++;
  }
  const denom=Math.max(tail.length-1,1);
  return width<=C.analysis.context.rangeMaxWidthATR && overlap/denom>=C.analysis.context.rangeOverlapRatio && cross>=C.analysis.regime.minRangeEmaCrosses && m5.trend==='NEUTRAL' && m1.trend==='NEUTRAL';
}

export function detectMarketRegime(m1:Candle[],globalBias:MarketBias='NEUTRAL'):MarketRegime{
  const sorted=m1.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const m5=resample(sorted,5);
  const m15=resample(sorted,15);
  const m1Trend=classifyEmaTrend(sorted,'M1');
  const m5Trend=classifyEmaTrend(m5,'M5');
  const activeM1Fvgs=findFVGs(sorted,'M1',96).slice(-12);
  const activeM5Fvgs=findFVGs(m5,'M5',48).slice(-8);
  const activeM15Fvgs=findFVGs(m15,'M15',32).slice(-6);
  const m1Spike=detectLatestSpike(sorted,'M1');
  const m5Spike=detectLatestSpike(m5,'M5');
  const m15Spike=detectLatestSpike(m15,'M15');
  const lastM1Index=sorted.length-1;
  const m1Age=m1Spike?lastM1Index-m1Spike.endIndex:999;
  const m5Age=m5Spike?m5.length-1-m5Spike.endIndex:999;
  const m15Age=m15Spike?m15.length-1-m15Spike.endIndex:999;

  // M1 is the execution timeframe, so a fresh M1 impulse takes priority. If it
  // is not fresh, use the freshest higher-timeframe impulse as the cycle anchor.
  const latestSpike=(m1Spike&&m1Age<=C.analysis.spike.maxAgeBars?m1Spike:
    m5Spike&&m5Age<=Math.ceil(C.analysis.spike.maxAgeBars/3)?m5Spike:
    m15Spike&&m15Age<=Math.ceil(C.analysis.spike.maxAgeBars/9)?m15Spike:null);

  const a=Math.max(atr(sorted,14),0.05);
  const recentM1=sorted.slice(-C.analysis.regime.channelLookback);
  const compressed=isCompressedChannel(recentM1,a);
  const rangeState=isRange(sorted,m5Trend,m1Trend,a);
  const spikeAge=latestSpike ? latestSpike.timeframe==='M1' ? m1Age : latestSpike.timeframe==='M5' ? m5Age : m15Age : 999;
  const activeSpikeBars=latestSpike ? latestSpike.timeframe==='M1' ? C.analysis.regime.activeM1SpikeBars : latestSpike.timeframe==='M5' ? C.analysis.regime.activeM5SpikeBars : C.analysis.regime.activeM15SpikeBars : -1;

  let phase:MarketPhase='TRANSITION';
  if(latestSpike && spikeAge<=activeSpikeBars) phase='SPIKE';
  else if(rangeState) phase='RANGE';
  else if(compressed && (m5Trend.trend!=='NEUTRAL'||m1Trend.trend!=='NEUTRAL')) phase='CHANNEL';
  else if(latestSpike && spikeAge<=C.analysis.spike.maxAgeBars) phase='CHANNEL';
  else if(m5Trend.trend!=='NEUTRAL' && m5Trend.score>=50) phase='CHANNEL';

  const m5Aligned=globalBias!=='NEUTRAL'&&m5Trend.trend===globalBias;
  const opposite=globalBias==='LONG'?'SHORT':globalBias==='SHORT'?'LONG':'NEUTRAL';
  const m1Counter=m1Trend.trend===opposite;
  const executionAligned=globalBias!=='NEUTRAL' && m5Aligned && !m1Counter;
  const alignmentScore=globalBias==='NEUTRAL'?0:clamp((m5Aligned?55:0)+(m1Trend.trend===globalBias?30:0)+(m1Trend.trend==='NEUTRAL'?15:0)+Math.min(10,m5Trend.score*0.1));
  const rangeCompressionScore=clamp((compressed?60:0)+(rangeState?40:0)+(m5Trend.trend==='NEUTRAL'?20:0));
  const spikeStrength=latestSpike?.strength??0;
  const score=clamp((phase==='SPIKE'?spikeStrength:phase==='CHANNEL'?Math.max(45,alignmentScore):phase==='RANGE'?rangeCompressionScore:35));
  void m15Spike;
  return {
    phase,m1Trend,m5Trend,globalBias,executionAligned,alignmentScore,score,
    spike:latestSpike,m1Spike,m5Spike,m1Fvgs:activeM1Fvgs,m5Fvgs:activeM5Fvgs,m15Fvgs:activeM15Fvgs,
    channel:{compressed,rangeCompressionScore,sourceSpikeEndTime:latestSpike?.endTime??null}
  };
}

export function nearestFVG(c:Candle[],entry:number,d:Direction,timeframe:'M1'|'M5'|'M15',maxATRDistance=0.75){
  const a=Math.max(atr(c,14),0.05);
  return findFVGs(c,timeframe,Math.min(c.length,160))
    .filter(x=>x.direction===d && entry>=x.low-a*maxATRDistance && entry<=x.high+a*maxATRDistance)
    .sort((x,y)=>Math.abs(((x.low+x.high)/2)-entry)-Math.abs(((y.low+y.high)/2)-entry))[0]??null;
}
