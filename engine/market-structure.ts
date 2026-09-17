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
  if(src.length<6) return empty();
  const w=src.slice(-10);
  const ranges=w.map(x=>Math.max(x.high-x.low,1e-9));
  const med=median(ranges);
  const bodyQuality=w.map(x=>Math.abs(x.close-x.open)/Math.max(x.high-x.low,1e-9));
  const signedBodies=w.map(x=>x.close>x.open?Math.abs(x.close-x.open):x.close<x.open?-Math.abs(x.close-x.open):0);
  const totalBody=signedBodies.reduce((a,b)=>a+b,0);
  const totalRange=ranges.reduce((a,b)=>a+b,0);
  const pressure=totalBody/Math.max(totalRange,1e-9);
  const last5=w.slice(-5), last3=w.slice(-3);
  const long5=last5.filter(x=>x.close>x.open).length;
  const short5=last5.filter(x=>x.close<x.open).length;
  const last3Pressure=last3.reduce((sum,x)=>sum+(x.close>x.open?1:x.close<x.open?-1:0),0)/3;
  const firstClose=w[0].close, lastClose=w.at(-1)!.close;
  const netDisplacement=(lastClose-firstClose)/Math.max(med,1e-9);
  const recentImpulse=(last3.reduce((sum,x)=>sum+(x.close-x.open),0))/Math.max(med,1e-9);
  const candleQuality=bodyQuality.reduce((a,b)=>a+b,0)/bodyQuality.length;
  const closeProgress=Math.abs(netDisplacement);
  const expansion=w.slice(-3).map(x=>x.high-x.low).reduce((a,b)=>a+b,0)/(3*Math.max(med,1e-9));
  const last=w.at(-1)!;
  const prev=w.at(-2)!;
  const prevMid=(prev.high+prev.low)/2;
  const lastBodyRatio=Math.abs(last.close-last.open)/Math.max(last.high-last.low,1e-9);

  // Price-action trend model: directional pressure + close progression + recent impulse.
  // Indicators/MA labels are deliberately excluded. H/L swing labels are also not used
  // for the Daily direction gate; they remain available for lower-timeframe execution levels.
  const longScore = (pressure>0?pressure*120:0) + Math.max(netDisplacement,0)*5 + Math.max(recentImpulse,0)*4 + long5*3 + Math.max(last3Pressure,0)*8 + Math.max(expansion-1,0)*4;
  const shortScore = (pressure<0?-pressure*120:0) + Math.max(-netDisplacement,0)*5 + Math.max(-recentImpulse,0)*4 + short5*3 + Math.max(-last3Pressure,0)*8 + Math.max(expansion-1,0)*4;
  const directionalScore=Math.max(longScore,shortScore);
  const oppositeCount=longScore>shortScore?short5:long5;
  const dominant=longScore>=shortScore?'LONG':'SHORT';
  const balanced=Math.abs(longScore-shortScore)<12 && Math.abs(pressure)<0.10 && closeProgress<1.2;
  const enoughPressure=Math.abs(pressure)>=0.16;
  const enoughProgress=closeProgress>=0.85;
  const enoughRecentImpulse=Math.abs(recentImpulse)>=0.55;
  const enoughCandleQuality=candleQuality>=0.50;

  if(balanced && !enoughPressure) return {...empty('RANGE'),score:Number(Math.max(longScore,shortScore).toFixed(1)),pressure:Number(pressure.toFixed(4)),recentImpulse:Number(recentImpulse.toFixed(3)),candleQuality:Number(candleQuality.toFixed(3))};

  const confirmedDirectional = enoughPressure && enoughProgress && enoughRecentImpulse && enoughCandleQuality && directionalScore>=28 && Math.max(long5,short5)>=3;
  if(confirmedDirectional){
    const counterLast = dominant==='LONG' ? last.close<last.open : last.close>last.open;
    const counterIsSmall = lastBodyRatio<0.50 && (dominant==='LONG' ? last.close>=prevMid : last.close<=prevMid);
    if(counterLast && counterIsSmall){
      return {
        state:'CORRECTION',bias:dominant,confirmed:true,correction:true,score:Number(directionalScore.toFixed(1)),
        pressure:Number(pressure.toFixed(4)),recentImpulse:Number(recentImpulse.toFixed(3)),candleQuality:Number(candleQuality.toFixed(3)),
        reason:`Daily ${dominant} price-action trend remains intact, but the latest candles show a controlled correction`
      };
    }
    return {
      state:dominant==='LONG'?'UPTREND':'DOWNTREND',bias:dominant,confirmed:true,correction:false,score:Number(directionalScore.toFixed(1)),
      pressure:Number(pressure.toFixed(4)),recentImpulse:Number(recentImpulse.toFixed(3)),candleQuality:Number(candleQuality.toFixed(3)),
      reason:`Daily ${dominant} trend confirmed by directional pressure, close progression and recent impulse`
    };
  }

  // Strong opposite candle against an otherwise directional backdrop is a warning,
  // but not enough by itself to flip the daily trend. Treat it as correction.
  if((longScore>=28||shortScore>=28) && oppositeCount>=2){
    return {
      state:'CORRECTION',bias:dominant,confirmed:true,correction:true,score:Number(directionalScore.toFixed(1)),
      pressure:Number(pressure.toFixed(4)),recentImpulse:Number(recentImpulse.toFixed(3)),candleQuality:Number(candleQuality.toFixed(3)),
      reason:`Daily ${dominant} pressure exists, but price action is currently corrective rather than entry-ready`
    };
  }

  return {
    state:'UNCLEAR',bias:'NEUTRAL',confirmed:false,correction:false,score:Number(directionalScore.toFixed(1)),
    pressure:Number(pressure.toFixed(4)),recentImpulse:Number(recentImpulse.toFixed(3)),candleQuality:Number(candleQuality.toFixed(3)),
    reason:'Daily price action lacks sufficient directional pressure and follow-through'
  };
}
