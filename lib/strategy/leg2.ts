import { Candle, Leg2, Spike } from './types';
import { CONFIG } from './config';
import { bodyRatio,closeLocation,dir } from './math';
export function detectLeg2(c:Candle[],spike:Spike):Leg2{
 const impulseHigh=Math.max(...c.slice(spike.startIndex,spike.endIndex+1).map(x=>x.high));
 const impulseLow=Math.min(...c.slice(spike.startIndex,spike.endIndex+1).map(x=>x.low));
 const impulse=impulseHigh-impulseLow;if(impulse<=0)return {confirmed:false,direction:spike.direction};
 const base=spike.direction==='LONG'?impulseHigh:impulseLow;
 for(let i=spike.endIndex+1;i<Math.min(c.length,spike.endIndex+1+CONFIG.pullback.maxBarsAfterSpike);i++){
  const price=spike.direction==='LONG'?c[i].low:c[i].high;
  const retrace=spike.direction==='LONG'?(impulseHigh-price)/impulse:(price-impulseLow)/impulse;
  if(retrace<CONFIG.pullback.minRetrace||retrace>CONFIG.pullback.maxRetrace)continue;
  const j=i+1;if(j>=c.length)continue;
  const confirm=dir(c[j])===spike.direction&&bodyRatio(c[j])>=CONFIG.confirmation.minBodyToRange&&(spike.direction==='LONG'?closeLocation(c[j])>=CONFIG.confirmation.closeInDirection:closeLocation(c[j])<=1-CONFIG.confirmation.closeInDirection);
  if(confirm){const entry=c[j].close;const stop=spike.direction==='LONG'?Math.min(c[i].low,impulseLow):Math.max(c[i].high,impulseHigh);return {confirmed:true,direction:spike.direction,pullbackIndex:i,confirmationIndex:j,entry,stop,retrace};}
 }
 return {confirmed:false,direction:spike.direction};
}
