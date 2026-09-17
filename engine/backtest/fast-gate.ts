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

function directionalExpansion(c:Candle[], d:Direction){
  if(c.length<3) return false;
  const tail=c.slice(-5);
  let strong=0;
  for(const x of tail) if(strongForEntry(x,d)) strong++;
  if(strong>=2) return true;
  const last=tail.at(-1)!;
  return strongForEntry(last,d) && range(last)>=C.analysis.spike.minDisplacementATR*0.45;
}

export function fastGate(c:Candle[]):FastGate{
  if(c.length<8) return {deepAnalysis:true,possibleSP2L:true,possibleBTB:true,possibleMicroMap:true};
  const last=c.at(-1)!, prev=c.at(-2)!;
  const entryStrongLong=strongForEntry(last,'LONG');
  const entryStrongShort=strongForEntry(last,'SHORT');
  const prevOppLong=candleDirection(prev)==='SHORT';
  const prevOppShort=candleDirection(prev)==='LONG';
  const possibleSP2L=(entryStrongLong&&prevOppLong)||(entryStrongShort&&prevOppShort)||directionalExpansion(c,'LONG')||directionalExpansion(c,'SHORT');
  const possibleBTB=(entryStrongLong&&prevOppLong)||(entryStrongShort&&prevOppShort);
  const possibleMicroMap=(entryStrongLong||entryStrongShort)||bodyRatio(prev)>=0.5;
  return {deepAnalysis:possibleSP2L||possibleBTB||possibleMicroMap,possibleSP2L,possibleBTB,possibleMicroMap};
}
