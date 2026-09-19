import { assessDirectionalLocation } from '../engine/levels';
import { buildRisk } from '../engine/risk';
import { Candle } from '../types/market';

const base=Date.parse('2026-09-01T00:00:00Z');
const candles:Candle[]=Array.from({length:160},(_,i)=>{
  const center=2200 + i*0.25 + Math.sin(i/7)*1.2;
  return {time:new Date(base+i*60000).toISOString(),open:center,high:center+0.9,low:center-0.9,close:center+(i%2?0.55:-0.35),volume:100};
});
const shortLoc=assessDirectionalLocation(candles,candles.at(-1)!.close,'SHORT');
const longLoc=assessDirectionalLocation(candles,candles.at(-1)!.close,'LONG');
console.log('shortLoc',shortLoc);
console.log('longLoc',longLoc);
const r1=buildRisk('SHORT',2200,2202,2000,0.5,0.05,1.5,false);
console.log('x2Disabled',r1.x2Entry===null && r1.x2LotSize===null);
if(r1.x2Entry!==null || r1.x2LotSize!==null) throw new Error('X2 should be disabled in this explicit config');
