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
