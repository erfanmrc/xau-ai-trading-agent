import { Candle, Direction, MarketBias, MarketPhase, MotherMove, StructureSummary } from '@/types/market';
import { atr, bodyRatio, candleDirection, closeLocation, median } from '@/engine/indicators';

function swingHigh(c:Candle[], i:number, strength=2){
  if(i-strength<0||i+strength>=c.length) return false;
  for(let k=1;k<=strength;k++) if(c[i].high<=c[i-k].high||c[i].high<=c[i+k].high) return false;
  return true;
}
function swingLow(c:Candle[], i:number, strength=2){
  if(i-strength<0||i+strength>=c.length) return false;
  for(let k=1;k<=strength;k++) if(c[i].low>=c[i-k].low||c[i].low>=c[i+k].low) return false;
  return true;
}

export function summarizeStructure(c:Candle[],lookback?:number):StructureSummary{
  if(!c.length) return {
    state:'UNCLEAR',bias:'NEUTRAL',trendConfirmed:false,correction:false,lastClose:null,lastSwingHigh:null,lastSwingLow:null,
    previousSwingHigh:null,previousSwingLow:null,highLabel:null,lowLabel:null,
    protectedHigh:null,protectedLow:null,reversalToLong:false,reversalToShort:false,breakout:null
  };
  const src=lookback&&c.length>lookback?c.slice(-lookback):c;
  const highs:{price:number;index:number}[]=[], lows:{price:number;index:number}[]=[];
  for(let i=2;i<src.length-2;i++){
    if(swingHigh(src,i)) highs.push({price:src[i].high,index:i});
    if(swingLow(src,i)) lows.push({price:src[i].low,index:i});
  }
  const lastHigh=highs.at(-1)?.price??null, prevHigh=highs.at(-2)?.price??null;
  const lastLow=lows.at(-1)?.price??null, prevLow=lows.at(-2)?.price??null;
  const highLabel=lastHigh!==null&&prevHigh!==null?(lastHigh>prevHigh?'HH':lastHigh<prevHigh?'LH':null):null;
  const lowLabel=lastLow!==null&&prevLow!==null?(lastLow>prevLow?'HL':lastLow<prevLow?'LL':null):null;
  const close=src.at(-1)!.close;
  let breakout:Direction|null=null;
  if(lastHigh!==null&&close>lastHigh) breakout='LONG';
  if(lastLow!==null&&close<lastLow) breakout='SHORT';

  // The latest HH/HL or LH/LL pair is the strict current structure.
  const strictUp=highLabel==='HH'&&lowLabel==='HL';
  const strictDown=highLabel==='LH'&&lowLabel==='LL';

  // Do not collapse every mixed pair (e.g. LH + HL) into RANGE. First establish
  // the dominant structural regime from several recent confirmed swings. A mixed
  // latest pair then becomes a CORRECTION of that regime, not a brand-new range.
  const recentHighLabels:string[]=[];
  for(let i=Math.max(1,highs.length-5);i<highs.length;i++){
    const a=highs[i-1]?.price,b=highs[i]?.price;
    if(a!=null&&b!=null) recentHighLabels.push(b>a?'HH':'LH');
  }
  const recentLowLabels:string[]=[];
  for(let i=Math.max(1,lows.length-5);i<lows.length;i++){
    const a=lows[i-1]?.price,b=lows[i]?.price;
    if(a!=null&&b!=null) recentLowLabels.push(b>a?'HL':'LL');
  }
  const upScore=recentHighLabels.filter(x=>x==='HH').length+recentLowLabels.filter(x=>x==='HL').length;
  const downScore=recentHighLabels.filter(x=>x==='LH').length+recentLowLabels.filter(x=>x==='LL').length;
  const enoughHistory=recentHighLabels.length>=2&&recentLowLabels.length>=2;

  let regime:StructureSummary['state']='UNCLEAR';
  if(strictUp) regime='UPTREND';
  else if(strictDown) regime='DOWNTREND';
  else if(enoughHistory && upScore>=3 && upScore>downScore) regime='UPTREND';
  else if(enoughHistory && downScore>=3 && downScore>upScore) regime='DOWNTREND';
  else if(enoughHistory && Math.max(upScore,downScore)>=2) regime=upScore===downScore?'RANGE':'RANGE';

  const correction = regime==='UPTREND' ? !strictUp : regime==='DOWNTREND' ? !strictDown : false;
  // Only a strict, non-corrective structure is a tradable daily trend.
  const trendConfirmed = (regime==='UPTREND' || regime==='DOWNTREND') && !correction;
  const state=regime;
  const bias:MarketBias=trendConfirmed?(state==='UPTREND'?'LONG':'SHORT'):'NEUTRAL';

  const reversalToLong=(lowLabel==='HL' && highLabel!=='HH');
  const reversalToShort=(highLabel==='LH' && lowLabel!=='LL');
  const protectedLow=state==='UPTREND'?lastLow:null;
  const protectedHigh=state==='DOWNTREND'?lastHigh:null;
  return {
    state,bias,trendConfirmed,correction,lastClose:close,lastSwingHigh:lastHigh,lastSwingLow:lastLow,
    previousSwingHigh:prevHigh,previousSwingLow:prevLow,highLabel,lowLabel,
    protectedHigh,protectedLow,reversalToLong,reversalToShort,breakout
  };
}

function strongCandle(c:Candle,d:Direction,minBody=0.60,minClose=0.72,maxOppWick=0.25):boolean{
  const r=Math.max(c.high-c.low,1e-9);
  const body=Math.abs(c.close-c.open)/r;
  const cl=closeLocation(c);
  const upper=(c.high-Math.max(c.open,c.close))/r;
  const lower=(Math.min(c.open,c.close)-c.low)/r;
  return candleDirection(c)===d && body>=minBody && (d==='LONG'?cl>=minClose:cl<=1-minClose) && (d==='LONG'?lower<=maxOppWick:upper<=maxOppWick);
}

export function detectMotherMoveOnTimeframe(c:Candle[],tf:'M1'|'M5'|'M15',maxAgeBars=18):MotherMove|null{
  if(c.length<8) return null;
  const a=Math.max(atr(c,14),0.1);
  let best:MotherMove|null=null;
  const latestEnd=c.length-2;
  const earliest=Math.max(4,c.length-maxAgeBars-6);
  for(let e=latestEnd;e>=earliest;e--){
    for(const d of ['LONG','SHORT'] as const){
      let start=e;
      let count=0;
      while(start>=1 && e-start<4 && strongCandle(c[start],d)) { count++; start--; }
      if(count<3) continue;
      const first=c[start+1],pre=c[start],run=c.slice(start+1,e+1);
      if(!(d==='LONG'?first.high>pre.high:first.low<pre.low)) continue;
      const baseRanges=c.slice(Math.max(1,start-20),start).map(x=>x.high-x.low);
      const base=baseRanges.length?median(baseRanges):a;
      const spikeMedian=median(run.map(x=>x.high-x.low));
      const expansion=spikeMedian/Math.max(base,1e-9);
      const displacement=d==='LONG'?run.at(-1)!.close-first.open:first.open-run.at(-1)!.close;
      const efficiency=displacement/Math.max(run.reduce((sum,x)=>sum+(x.high-x.low),0),1e-9);
      const laterCloses=run.slice(1).map(x=>x.close);
      const pressureRaw=d==='LONG' ? Math.min(...laterCloses)-first.close : first.close-Math.max(...laterCloses);
      const pressure=pressureRaw/Math.max(a,1e-9);
      const nonOverlapGap=d==='LONG'
        ? Math.min(...run.slice(1).map(x=>x.close))-first.close
        : first.close-Math.max(...run.slice(1).map(x=>x.close));
      // Keep the mother-move definition faithful to the chart concept:
      // strong directional candles + breakout are primary; pressure/gap and
      // efficiency are quality measures, not five separate hard filters.
      if(displacement<a*0.45 || efficiency<0.38 || expansion<0.95) continue;
      const extreme=d==='LONG'?Math.max(...run.map(x=>x.high)):Math.min(...run.map(x=>x.low));
      const legSize=Math.abs(extreme-(d==='LONG'?pre.high:pre.low));
      const strength=Math.round(Math.min(100,54+count*8+(expansion-1)*20+efficiency*20+Math.min(pressure,1)*6));
      const candidate:MotherMove={
        timeframe:tf,direction:d,startIndex:start+1,endIndex:e,startTime:first.time,endTime:run.at(-1)!.time,
        breakoutLevel:d==='LONG'?pre.high:pre.low,extreme,legSize,candleCount:count,
        pressureGap:pressureRaw,expansionRatio:expansion,efficiency,strength
      };
      if(!best || candidate.strength>best.strength || (candidate.strength===best.strength && candidate.endIndex>best.endIndex)) best=candidate;
    }
  }
  return best;
}

export function detectMotherMove(c:Candle[],tf:'M1'|'M5'|'M15'='M1',maxAgeBars=18){
  return detectMotherMoveOnTimeframe(c,tf,maxAgeBars);
}

export function classifyMarketPhase(c:Candle[]):MarketPhase{
  if(c.length<25) return 'UNCLEAR';
  const tail=c.slice(-25);
  const a=Math.max(atr(c,14),0.1);
  const lastDir=candleDirection(tail.at(-1)!);
  if(lastDir){
    let run=0;
    for(let i=tail.length-1;i>=0;i--){
      if(strongCandle(tail[i],lastDir)) run++; else break;
      if(run>=4) break;
    }
    if(run>=3) return 'SPIKE';
  }
  const hi=Math.max(...tail.map(x=>x.high)),lo=Math.min(...tail.map(x=>x.low));
  const width=(hi-lo)/a;
  const overlaps=tail.slice(1).filter((x,i)=>{const p=tail[i];return x.high>=p.low&&x.low<=p.high;}).length;
  const structure=summarizeStructure(tail).bias;
  if(width<=2.8&&overlaps>=16&&structure==='NEUTRAL') return 'RANGE';
  if(overlaps>=15 && structure!=='NEUTRAL') return 'CHANNEL';
  return 'TRANSITION';
}

export function assessDailyPriceAction(c:Candle[]): import('@/types/market').DailyPriceAction {
  const empty = (state:'UNCLEAR'|'RANGE'='UNCLEAR'): import('@/types/market').DailyPriceAction => ({
    state,bias:'NEUTRAL',confirmed:false,correction:false,score:0,pressure:0,recentImpulse:0,candleQuality:0,
    reason:state==='RANGE'?'Daily price action is balanced/ranging':'Insufficient completed daily price-action history'
  });

  const src=(c??[]).slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const clean=src.filter(x=>Number.isFinite(x.open)&&Number.isFinite(x.high)&&Number.isFinite(x.low)&&Number.isFinite(x.close)&&x.high>x.low);
  if(clean.length<10) return empty();

  // Price-action regime model. Daily direction is inferred from price behaviour:
  // body pressure, close-to-close progression, directional persistence, displacement,
  // and range expansion. H/L swing labels are intentionally NOT used here.
  const w=clean.slice(-20);
  const ranges=w.map(x=>Math.max(x.high-x.low,1e-9));
  const med=Math.max(median(ranges),1e-9);
  const recent=w.slice(-6);
  const prior=w.slice(-14,-6);

  const signedBody=(x:Candle)=>x.close>x.open?Math.abs(x.close-x.open):x.close<x.open?-Math.abs(x.close-x.open):0;
  const bodyRatioArr=w.map(x=>Math.abs(x.close-x.open)/Math.max(x.high-x.low,1e-9));
  const candleQuality=bodyRatioArr.reduce((a,b)=>a+b,0)/bodyRatioArr.length;

  const weightedPressure=(arr:Candle[])=>{
    const body=arr.map(signedBody);
    const range=arr.map(x=>Math.max(x.high-x.low,1e-9));
    let weightedBody=0, weightedRange=0;
    for(let i=0;i<arr.length;i++){
      const wt=i+1;
      weightedBody+=body[i]*wt;
      weightedRange+=range[i]*wt;
    }
    return weightedBody/Math.max(weightedRange,1e-9);
  };
  const pressure=weightedPressure(w);
  const recentPressure=weightedPressure(recent);
  const priorPressure=prior.length?weightedPressure(prior):0;

  const closeSlope=(arr:Candle[])=>{
    if(arr.length<2) return 0;
    const meanX=(arr.length-1)/2;
    const meanY=arr.reduce((sum,x)=>sum+x.close,0)/arr.length;
    let num=0,den=0;
    for(let i=0;i<arr.length;i++){
      const dx=i-meanX; const dy=arr[i].close-meanY;
      num+=dx*dy; den+=dx*dx;
    }
    return den?num/den:0;
  };
  const slope20=closeSlope(w)/med;
  const slope6=closeSlope(recent)/med;
  const recentNet=(recent.at(-1)!.close-recent[0].open)/med;
  const displacement=(w.at(-1)!.close-w[0].open)/med;
  const expansion=(recent.reduce((a,x)=>a+x.high-x.low,0)/recent.length)/Math.max(prior.length?prior.reduce((a,x)=>a+x.high-x.low,0)/prior.length:med,1e-9);

  const directionalConsistency=(arr:Candle[],dir:1|-1)=>{
    const nonFlat=arr.filter(x=>x.close!==x.open);
    if(!nonFlat.length) return 0;
    return nonFlat.filter(x=>(x.close>x.open?1:-1)===dir).length/nonFlat.length;
  };
  const longConsistency=directionalConsistency(recent,1);
  const shortConsistency=directionalConsistency(recent,-1);

  const closeProgress=(arr:Candle[],dir:1|-1)=>{
    if(arr.length<3) return 0;
    let good=0,total=0;
    for(let i=1;i<arr.length;i++){
      const d=arr[i].close-arr[i-1].close;
      if(Math.abs(d)<med*0.02) continue;
      total++;
      if((d>0?1:-1)===dir) good++;
    }
    return total?good/total:0;
  };
  const longProgress=closeProgress(recent,1);
  const shortProgress=closeProgress(recent,-1);

  const directionalCandleQuality=(arr:Candle[],dir:1|-1)=>{
    const xs=arr.filter(x=>(x.close>x.open?1:x.close<x.open?-1:0)===dir);
    if(!xs.length) return 0;
    return xs.reduce((sum,x)=>sum+Math.abs(x.close-x.open)/Math.max(x.high-x.low,1e-9),0)/xs.length;
  };
  const longQuality=directionalCandleQuality(recent,1);
  const shortQuality=directionalCandleQuality(recent,-1);

  const longPressureScore=Math.max(0,recentPressure)*100;
  const shortPressureScore=Math.max(0,-recentPressure)*100;
  const longSlopeScore=Math.max(0,slope6)*14;
  const shortSlopeScore=Math.max(0,-slope6)*14;
  const longNetScore=Math.max(0,recentNet)*5;
  const shortNetScore=Math.max(0,-recentNet)*5;
  const longPersistence=longConsistency*24 + longProgress*18 + longQuality*12;
  const shortPersistence=shortConsistency*24 + shortProgress*18 + shortQuality*12;
  const expansionBonus=Math.min(Math.max(expansion-1,0),0.8)*8;

  const longScore=longPressureScore+longSlopeScore+longNetScore+longPersistence+expansionBonus;
  const shortScore=shortPressureScore+shortSlopeScore+shortNetScore+shortPersistence+expansionBonus;
  const dominant=longScore>=shortScore?'LONG':'SHORT' as 'LONG'|'SHORT';
  const dominantScore=dominant==='LONG'?longScore:shortScore;
  const opposingScore=dominant==='LONG'?shortScore:longScore;
  const scoreGap=dominantScore-opposingScore;

  // Minimum evidence for an entry-ready daily regime.
  const dominantPressure=Math.abs(recentPressure);
  const dominantSlope=Math.abs(slope6);
  const dominantNet=Math.abs(recentNet);
  const dominantConsistency=dominant==='LONG'?longConsistency:shortConsistency;
  const dominantProgress=dominant==='LONG'?longProgress:shortProgress;
  const dominantQuality=dominant==='LONG'?longQuality:shortQuality;

  const directionalEvidence=(dominantPressure>=0.055?1:0)+(dominantSlope>=0.35?1:0)+(dominantNet>=0.55?1:0)+(dominantConsistency>=0.58?1:0)+(dominantProgress>=0.58?1:0)+(dominantQuality>=0.50?1:0);
  const confirmedBase=dominantScore>=56 && scoreGap>=6 && directionalEvidence>=3;

  if(!confirmedBase){
    const balanced=Math.abs(recentPressure)<0.045 && Math.abs(slope6)<0.20 && Math.abs(recentNet)<0.45 && Math.abs(scoreGap)<7;
    const state=balanced?'RANGE':'UNCLEAR';
    return {
      state,bias:'NEUTRAL',confirmed:false,correction:false,
      score:Number(dominantScore.toFixed(1)),
      pressure:Number(recentPressure.toFixed(4)),
      recentImpulse:Number((recentPressure*med).toFixed(3)),
      candleQuality:Number(candleQuality.toFixed(3)),
      reason:balanced?'Daily price action is balanced/ranging':'Daily price action lacks a sufficiently consistent directional regime'
    };
  }

  // A correction is a meaningful, persistent counter-pressure while the broader
  // recent regime still points in the dominant direction. One/few small opposite
  // candles do not cancel a trend.
  const dominantDir=dominant==='LONG'?1:-1;
  const counterConsistency=dominant==='LONG'?shortConsistency:longConsistency;
  const counterPressure=dominant==='LONG'?Math.max(0,-recentPressure):Math.max(0,recentPressure);
  const counterBodyShare = recent.reduce((sum,x)=>sum+(Math.sign(signedBody(x))===-dominantDir?Math.abs(signedBody(x)):0),0)
    /Math.max(recent.reduce((sum,x)=>sum+Math.abs(signedBody(x)),0),1e-9);
  const meaningfulRetrace=Math.abs(recentNet)>=0.55 && counterConsistency>=0.42;
  const persistentCorrection=(counterConsistency>=0.50 && counterBodyShare>=0.30 && counterPressure>=0.055 && meaningfulRetrace);

  // A true daily reversal requires sustained opposite price pressure and
  // displacement, not simply one opposite close.
  const oppositePressure=dominant==='LONG'?recentPressure<=-0.085:recentPressure>=0.085;
  const oppositeSlope=dominant==='LONG'?slope6<=-0.55:slope6>=0.55;
  const oppositeProgress=dominant==='LONG'?shortProgress>=0.67:longProgress>=0.67;
  const oppositeConsistency=counterConsistency>=0.67;
  if(oppositePressure && oppositeSlope && oppositeProgress && oppositeConsistency && Math.abs(priorPressure)>=0.035){
    const newBias=dominant==='LONG'?'SHORT':'LONG' as 'LONG'|'SHORT';
    return {
      state:newBias==='LONG'?'UPTREND':'DOWNTREND',bias:newBias,confirmed:true,correction:false,
      score:Number(Math.max(opposingScore,dominantScore).toFixed(1)),
      pressure:Number(recentPressure.toFixed(4)),
      recentImpulse:Number((recentPressure*med).toFixed(3)),
      candleQuality:Number(candleQuality.toFixed(3)),
      reason:`Daily ${newBias} price action replaced the prior regime with sustained opposite pressure, displacement and follow-through`
    };
  }

  if(persistentCorrection){
    return {
      state:'CORRECTION',bias:dominant,confirmed:true,correction:true,
      score:Number(dominantScore.toFixed(1)),
      pressure:Number(recentPressure.toFixed(4)),
      recentImpulse:Number((recentPressure*med).toFixed(3)),
      candleQuality:Number(candleQuality.toFixed(3)),
      reason:`Daily ${dominant} pressure remains dominant, but the latest move is a meaningful corrective phase`
    };
  }

  return {
    state:dominant==='LONG'?'UPTREND':'DOWNTREND',bias:dominant,confirmed:true,correction:false,
    score:Number(dominantScore.toFixed(1)),
    pressure:Number(recentPressure.toFixed(4)),
    recentImpulse:Number((recentPressure*med).toFixed(3)),
    candleQuality:Number(candleQuality.toFixed(3)),
    reason:`Daily ${dominant} trend confirmed by directional pressure, close progression, displacement and candle behaviour`
  };
}
