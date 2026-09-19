import { Candle, Direction, ImportantLevels, LiquidityContext, LiquidityPool, LiquiditySweep, OrderBlockZone, VolumeProfile } from '@/types/market';
import { atr, bodyRatio, candleDirection, closeLocation, median, resample } from '@/engine/indicators';

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const priceTol=(a:number)=>Math.max(a*0.12,0.08);

function isSwingHigh(c:Candle[],i:number,strength=2){
  if(i-strength<0||i+strength>=c.length)return false;
  for(let k=1;k<=strength;k++) if(c[i].high<=c[i-k].high||c[i].high<=c[i+k].high)return false;
  return true;
}
function isSwingLow(c:Candle[],i:number,strength=2){
  if(i-strength<0||i+strength>=c.length)return false;
  for(let k=1;k<=strength;k++) if(c[i].low>=c[i-k].low||c[i].low>=c[i+k].low)return false;
  return true;
}
function strong(c:Candle[],i:number,d:Direction,a:number){
  const x=c[i], r=Math.max(x.high-x.low,1e-9), body=bodyRatio(x), cl=closeLocation(x);
  const move=Math.abs(x.close-x.open);
  return candleDirection(x)===d && body>=0.58 && (d==='LONG'?cl>=0.70:cl<=0.30) && move>=a*0.45;
}

function poolPush(out:LiquidityPool[],candidate:LiquidityPool,tol:number){
  const existing=out.find(x=>x.side===candidate.side&&Math.abs(x.price-candidate.price)<=tol&&x.timeframe===candidate.timeframe);
  if(existing){
    existing.price=(existing.price*existing.touches+candidate.price)/(existing.touches+1);
    existing.touches+=candidate.touches;
    existing.strength=clamp(Math.max(existing.strength,candidate.strength)+2,0,100);
  }else out.push(candidate);
}

function detectPools(c:Candle[],levels:ImportantLevels):LiquidityPool[]{
  const src=(c.length>1?c.slice(0,-1):c).slice(-360);
  const out:LiquidityPool[]=[];
  const a=Math.max(atr(src,14),0.1),tol=priceTol(a);
  const m5=resample(src,5),m15=resample(src,15),h1=resample(src,60);
  const addSwings=(x:Candle[],tf:'M1'|'M5'|'M15'|'H1')=>{
    const start=Math.max(2,x.length-100);
    for(let i=start;i<x.length-2;i++){
      if(isSwingHigh(x,i)) poolPush(out,{kind:'SWING_HIGH',price:x[i].high,strength:58,touches:1,timeframe:tf,side:'HIGH'},tol);
      if(isSwingLow(x,i)) poolPush(out,{kind:'SWING_LOW',price:x[i].low,strength:58,touches:1,timeframe:tf,side:'LOW'},tol);
    }
  };
  addSwings(src,'M1'); addSwings(m5,'M5'); addSwings(m15,'M15'); addSwings(h1,'H1');
  const addLevel=(kind:LiquidityPool['kind'],price:number|null,tf:'M1'|'M5'|'M15'|'H1'|'DAY',side:'HIGH'|'LOW',strength:number)=>{
    if(price!=null&&Number.isFinite(price))poolPush(out,{kind,price,strength,touches:1,timeframe:tf,side},tol);
  };
  addLevel('PREVIOUS_DAY_HIGH',levels.previousDayHigh,'DAY','HIGH',82);
  addLevel('PREVIOUS_DAY_LOW',levels.previousDayLow,'DAY','LOW',82);
  addLevel('SESSION_HIGH',levels.sessionHigh,'M1','HIGH',76);
  addLevel('SESSION_LOW',levels.sessionLow,'M1','LOW',76);
  addLevel('RANGE_HIGH',levels.rangeHigh,'M1','HIGH',70);
  addLevel('RANGE_LOW',levels.rangeLow,'M1','LOW',70);
  addLevel('ROUND',levels.round5,'M1', 'HIGH',56);
  addLevel('ROUND',levels.round5,'M1', 'LOW',56);
  addLevel('ROUND',levels.round10,'M1', 'HIGH',60);
  addLevel('ROUND',levels.round10,'M1', 'LOW',60);
  for(const pool of out){
    if(pool.touches>=2 && pool.kind==='SWING_HIGH') pool.kind='EQUAL_HIGH';
    if(pool.touches>=2 && pool.kind==='SWING_LOW') pool.kind='EQUAL_LOW';
  }
  return out.sort((a,b)=>b.strength-a.strength).slice(0,80);
}

function detectOrderBlocks(c:Candle[],tf:'M1'|'M5'|'M15'|'H1'):OrderBlockZone[]{
  const src=c.slice(-180);
  const out:OrderBlockZone[]=[];
  if(src.length<8)return out;
  const a=Math.max(atr(src,14),0.1);
  for(let i=2;i<src.length-1;i++){
    const x=src[i];
    for(const d of ['LONG','SHORT'] as const){
      if(!strong(src,i+1,d,a))continue;
      const opposite=d==='LONG'?candleDirection(x)==='SHORT':candleDirection(x)==='LONG';
      if(!opposite)continue;
      const prevHigh=Math.max(...src.slice(Math.max(0,i-5),i).map(z=>z.high));
      const prevLow=Math.min(...src.slice(Math.max(0,i-5),i).map(z=>z.low));
      const displacement=d==='LONG'?src[i+1].close-prevHigh:prevLow-src[i+1].close;
      if(displacement<a*0.15)continue;
      const width=x.high-x.low;
      if(width>a*0.85)continue;
      out.push({direction:d,low:x.low,high:x.high,timeframe:tf,startIndex:i,endIndex:i,strength:Math.round(clamp(58+displacement/a*18+(bodyRatio(src[i+1])*15),0,100)),source:'DISPLACEMENT_OB',mitigated:false});
    }
  }
  // Prefer the newest strongest blocks and remove near-duplicates.
  out.sort((a,b)=>b.strength-a.strength||b.endIndex-a.endIndex);
  return out.filter((z,i,arr)=>arr.findIndex(x=>x.direction===z.direction&&Math.abs(x.low-z.low)<=Math.max(a*0.06,0.05)&&Math.abs(x.high-z.high)<=Math.max(a*0.06,0.05))===i).slice(0,24);
}

function detectSweeps(c:Candle[],pools:LiquidityPool[]):LiquiditySweep[]{
  const current=c.at(-1),prev=c.slice(-40,-1);
  if(!current||!prev.length)return [];
  const a=Math.max(atr(c,14),0.1);
  const out:LiquiditySweep[]=[];
  const highPools=pools.filter(x=>x.side==='HIGH'),lowPools=pools.filter(x=>x.side==='LOW');
  for(const p of highPools){
    const breached=current.high>p.price+Math.max(a*0.04,0.03);
    const reclaimed=current.close<p.price;
    if(breached&&reclaimed)out.push({direction:'SHORT',side:'HIGH',level:p.price,time:current.time,strength:clamp(Math.round(60+(current.high-p.price)/a*25),0,100),reclaimed:true});
  }
  for(const p of lowPools){
    const breached=current.low<p.price-Math.max(a*0.04,0.03);
    const reclaimed=current.close>p.price;
    if(breached&&reclaimed)out.push({direction:'LONG',side:'LOW',level:p.price,time:current.time,strength:clamp(Math.round(60+(p.price-current.low)/a*25),0,100),reclaimed:true});
  }
  return out.sort((a,b)=>b.strength-a.strength).slice(0,4);
}

function buildVolumeProfile(c:Candle[]):VolumeProfile{
  const src=c.slice(-720).filter(x=>Number.isFinite(x.volume)&&x.volume>0&&Number.isFinite(x.close));
  const total=src.reduce((s,x)=>s+x.volume,0);
  if(src.length<10||total<=0){
    return {status:'UNAVAILABLE',source:'NONE',poc:null,highVolumeNodes:[],lowVolumeNodes:[],totalVolume:0,binSize:null,reason:'No usable positive bar-volume supplied by the current feed; volume profile is kept out of hard trading decisions.'};
  }
  const hi=Math.max(...src.map(x=>x.high)),lo=Math.min(...src.map(x=>x.low));
  const binSize=Math.max((hi-lo)/24,0.01);
  const bins=new Map<number,number>();
  for(const x of src){
    const price=(x.high+x.low+x.close)/3;
    const idx=Math.max(0,Math.min(23,Math.floor((price-lo)/binSize)));
    bins.set(idx,(bins.get(idx)||0)+x.volume);
  }
  const rows=[...bins.entries()].sort((a,b)=>b[1]-a[1]);
  const pocIdx=rows[0]?.[0]??null;
  const poc=pocIdx===null?null:lo+(pocIdx+0.5)*binSize;
  const maxVol=rows[0]?.[1]??0;
  const highVolumeNodes=rows.filter(([,v])=>v>=maxVol*0.70).slice(0,6).map(([i])=>lo+(i+0.5)*binSize);
  const lowVolumeNodes=rows.filter(([,v])=>v<=maxVol*0.20).slice(0,6).map(([i])=>lo+(i+0.5)*binSize);
  return {status:'AVAILABLE',source:'BAR_VOLUME',poc,highVolumeNodes,lowVolumeNodes,totalVolume:total,binSize,reason:'Approximate bar-volume profile; not an exchange order-book profile.'};
}

export function buildLiquidityContext(c:Candle[],levels:ImportantLevels):LiquidityContext{
  const src=c.slice(-720);
  const m5=resample(src,5),m15=resample(src,15),h1=resample(src,60);
  const pools=detectPools(src,levels);
  const blocks=[...detectOrderBlocks(src,'M1'),...detectOrderBlocks(m5,'M5'),...detectOrderBlocks(m15,'M15'),...detectOrderBlocks(h1,'H1')]
    .sort((a,b)=>b.strength-a.strength)
    .slice(0,36);
  const sweeps=detectSweeps(src,pools);
  const profile=buildVolumeProfile(src);
  const current=src.at(-1)?.close??0;
  const a=Math.max(atr(src,14),0.1);
  const nearestLow=pools.filter(x=>x.side==='LOW').sort((x,y)=>Math.abs(x.price-current)-Math.abs(y.price-current))[0]?.price??null;
  const nearestHigh=pools.filter(x=>x.side==='HIGH').sort((x,y)=>Math.abs(x.price-current)-Math.abs(y.price-current))[0]?.price??null;
  const nearestOB=blocks
    .filter(x=>x.low<=current+a*0.55&&x.high>=current-a*0.55)
    .sort((x,y)=>y.strength-x.strength)[0];
  const activeSweep=sweeps[0]??null;
  const labels:string[]=[]; let score=0;
  if(activeSweep){score+=6;labels.push(`${activeSweep.direction}_LIQUIDITY_SWEEP`);}
  if(nearestOB){score+=5;labels.push(`${nearestOB.direction}_ORDER_BLOCK_${nearestOB.timeframe}`);}
  const nearbyLow=nearestLow!==null&&Math.abs(nearestLow-current)<=a*0.20;
  const nearbyHigh=nearestHigh!==null&&Math.abs(nearestHigh-current)<=a*0.20;
  if(nearbyLow||nearbyHigh){score+=3;labels.push('LIQUIDITY_POOL_NEAR_PRICE');}
  if(profile.poc!==null&&Math.abs(profile.poc-current)<=a*0.20){score+=2;labels.push('VOLUME_PROFILE_POC_NEAR');}
  return {
    pools,orderBlocks:blocks,sweeps,volumeProfile:profile,executionScore:Math.min(score,16),executionLabels:labels,
    nearestLowPool:nearestLow,nearestHighPool:nearestHigh,
    nearestOrderBlock:nearestOB?{direction:nearestOB.direction,low:nearestOB.low,high:nearestOB.high,timeframe:nearestOB.timeframe,strength:nearestOB.strength}:null,
    activeSweep,methodology:'PRICE_ACTION_PROXY',atrReference:a
  };
}

export function assessLiquidityConfluence(c:LiquidityContext,entry:number,d:Direction,a:number){
  let score=0; const labels:string[]=[]; let ob:LiquidityContext['nearestOrderBlock']=null;
  if(c.activeSweep&&c.activeSweep.direction===d){score+=7;labels.push(`${d}_LIQUIDITY_SWEEP`);}
  const candidates=c.orderBlocks.filter(x=>x.direction===d&&x.low<=entry+a*0.45&&x.high>=entry-a*0.45);
  if(candidates.length){const picked=candidates.sort((x,y)=>Math.abs(((x.low+x.high)/2)-entry)-Math.abs(((y.low+y.high)/2)-entry))[0]; if(picked){ob={direction:picked.direction,low:picked.low,high:picked.high,timeframe:picked.timeframe,strength:picked.strength}; score+=5; labels.push(`${d}_ORDER_BLOCK_${picked.timeframe}`);}}
  const pool=(d==='LONG'?c.nearestLowPool:c.nearestHighPool);
  if(pool!==null&&Math.abs(pool-entry)<=a*0.20){score+=4;labels.push(`${d}_LIQUIDITY_POOL`);}
  if(c.volumeProfile.poc!==null&&Math.abs(c.volumeProfile.poc-entry)<=a*0.20){score+=2;labels.push('VP_POC');}
  return {score:Math.min(score,16),labels,orderBlock:ob,sweep:c.activeSweep&&c.activeSweep.direction===d?c.activeSweep:null};
}
