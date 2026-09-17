import { Candle, Direction } from '@/types/market';
import { bodyRatio, candleDirection, closeLocation, range } from '@/engine/indicators';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

export type FastGate = {
  deepAnalysis: boolean;
  possibleSP2L: boolean;
  possibleBTB: boolean;
  possibleMicroMap: boolean;
};

function strongForEntry(c: Candle, d: Direction){
  const br=bodyRatio(c);
  if(candleDirection(c)!==d || br<C.analysis.confirmation.minBodyToRange) return false;
  return d==='LONG'
    ? closeLocation(c)>=C.analysis.confirmation.closeInDirection
    : closeLocation(c)<=1-C.analysis.confirmation.closeInDirection;
}

function strongSpikeLike(c: Candle, d: Direction){
  const r=Math.max(range(c),1e-9);
  const br=bodyRatio(c);
  const cl=closeLocation(c);
  const upper=(c.high-Math.max(c.open,c.close))/r;
  const lower=(Math.min(c.open,c.close)-c.low)/r;
  if(candleDirection(c)!==d || br<C.analysis.spike.bodyToRangeMin) return false;
  if(d==='LONG') return cl>=C.analysis.spike.closeLocationMin && lower<=C.analysis.spike.oppositeWickMax;
  return cl<=1-C.analysis.spike.closeLocationMin && upper<=C.analysis.spike.oppositeWickMax;
}

function likelySpike(c:Candle[],d:Direction){
  if(c.length<6) return false;
  const tail=c.slice(-7);
  let run=0,best=0;
  for(const x of tail){
    if(strongSpikeLike(x,d)){run++;best=Math.max(best,run);} else run=0;
  }
  // Deep SP2L analysis is needed when a genuine 3-candle impulse is visible,
  // or when a spike run has just ended and the next candle may be the simple
  // return/Leg-2 trigger. A single strong candle against the previous candle
  // is not enough.
  if(best>=3) return true;
  const n=tail.length;
  const prev3=tail.slice(-4,-1);
  const endedRun=prev3.length===3 && prev3.every(x=>strongSpikeLike(x,d));
  const current=tail.at(-1)!;
  const opposite=candleDirection(current)!==d;
  if(endedRun && opposite) return true;
  return best>=2 && strongSpikeLike(current,d);
}

function likelyBTB(c:Candle[]){
  if(c.length<6) return false;
  const last=c.at(-1)!, prev=c.at(-2)!;
  const prevRanges=c.slice(-7,-2).map(range).sort((a,b)=>a-b);
  const med=prevRanges.length?prevRanges[Math.floor(prevRanges.length/2)]:range(last);
  const expansion=range(last)>=med*1.05;
  // BTB still needs a directional rejection impulse, but we avoid firing the
  // deep engine for every ordinary alternating candle. Zone validation remains
  // inside the real PRO_BTB detector.
  const long=strongForEntry(last,'LONG') && expansion;
  const short=strongForEntry(last,'SHORT') && expansion;
  return long||short;
}

function likelyMicroMap(c:Candle[]){
  if(c.length<9) return false;
  const tail=c.slice(-8);
  const current=tail.at(-1)!;
  if(bodyRatio(current)<0.50) return false;
  // Micro-MAP belongs to a compressed channel. Only enter deep analysis when
  // the preceding bars show narrow ranges plus directional compression.
  const prior=tail.slice(0,-1);
  const ranges=prior.map(range).sort((a,b)=>a-b);
  const mid=ranges[Math.floor(ranges.length/2)]||1e-9;
  const narrow=prior.slice(-5).filter(x=>range(x)<=mid*1.25).length>=4;
  if(!narrow) return false;
  const dir=candleDirection(current);
  if(!dir) return false;
  const directional=prior.slice(-4).filter(x=>candleDirection(x)===dir).length;
  const monotonic=dir==='LONG'
    ? prior.slice(-4).every((x,i,a)=>i===0||x.close>=a[i-1].close)
    : prior.slice(-4).every((x,i,a)=>i===0||x.close<=a[i-1].close);
  return directional>=3 && monotonic;
}

export function fastGate(c:Candle[]):FastGate{
  if(c.length<10) return {deepAnalysis:true,possibleSP2L:true,possibleBTB:true,possibleMicroMap:true};
  const possibleSP2L=likelySpike(c,'LONG')||likelySpike(c,'SHORT');
  const possibleBTB=likelyBTB(c);
  const possibleMicroMap=likelyMicroMap(c);
  return {deepAnalysis:possibleSP2L||possibleBTB||possibleMicroMap,possibleSP2L,possibleBTB,possibleMicroMap};
}
