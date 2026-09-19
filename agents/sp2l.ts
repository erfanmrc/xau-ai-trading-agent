import { Candle, Direction, StrategySignal } from '@/types/market';
import type { MarketContext } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation } from '@/engine/indicators';
import { nearestFVG } from '@/engine/regime';
import { assessEntryConfluence } from '@/engine/levels';
import { assessLiquidityConfluence } from '@/engine/liquidity';
import { buildRisk } from '@/engine/risk';
import { buildContext } from '@/engine/context';

const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const invalid=(reason:string,warnings:string[]=[]):StrategySignal=>({strategy:'SP2L',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null});

function confirmation(c:Candle,d:Direction){
  const br=bodyRatio(c),cl=closeLocation(c);
  return candleDirection(c)===d && br>=C.analysis.confirmation.minBodyToRange && (d==='LONG'?cl>=C.analysis.confirmation.closeInDirection:cl<=1-C.analysis.confirmation.closeInDirection);
}

export function detectSP2L(c:Candle[],balance=C.balance,spread=0,precomputedContext?:MarketContext):StrategySignal{
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for SP2L');
  const end=c.length-1;
  const context=precomputedContext??buildContext(c);
  const regime=context.regime;
  const spike=regime.m1Spike && end-regime.m1Spike.endIndex>=0 && end-regime.m1Spike.endIndex<=C.analysis.spike.maxAgeBars ? regime.m1Spike : null;
  if(!spike) return invalid('No qualifying recent Spike with 3+ candles, displacement, FVG and pressure');
  const d=spike.direction;
  const age=end-spike.endIndex;
  const a=Math.max(atr(c,14),0.05);
  const pullback=c.slice(spike.endIndex+1,end+1);
  if(age===0){
    return {strategy:'SP2L',status:'WATCH',score:clamp(62+spike.strength*0.25),reason:'Spike confirmed; waiting for controlled pullback',reasons:[`${d} Spike: ${spike.candleCount} candles`,`Displacement ${spike.displacementATR.toFixed(2)} ATR`,`FVG ${spike.fvg?`${spike.fvg.sizeATR.toFixed(2)} ATR`:'present'}`,`Pressure ${spike.pressure.toFixed(2)}`,'Leg-2 requires a controlled return into/near the impulse structure'],warnings:['Entry is not taken on the impulse itself'],direction:d,trigger:spike.breakoutLevel,fvg:spike.fvg,regime};
  }
  if(age>C.analysis.pullback.maxBarsAfterImpulse) return invalid('Recent Spike is stale for SP2L',['Later returns are handled by PRO_BTB']);
  const extreme=spike.extreme;
  const returnExtreme=d==='LONG'?Math.min(...pullback.map(x=>x.low)):Math.max(...pullback.map(x=>x.high));
  const returnDistance=d==='LONG'?Math.max(0,extreme-returnExtreme):Math.max(0,returnExtreme-extreme);
  const returnDepth=returnDistance/Math.max(spike.legSize,1e-9);
  const holdsBreakout=d==='LONG'?pullback.at(-1)!.close>=spike.breakoutLevel-a*0.30:pullback.at(-1)!.close<=spike.breakoutLevel+a*0.30;
  const fvg=spike.fvg??nearestFVG(c,pullback.at(-1)!.close,d,'M1',0.85);
  const entryCandidate=pullback.at(-1)!;
  const liquidity=context.liquidity;
  const liq=assessLiquidityConfluence(liquidity,entryCandidate.close,d,Math.max(liquidity.atrReference,a));
  const touchedFVG=!!fvg && pullback.some(x=>x.low<=fvg.high&&x.high>=fvg.low);
  const finalConfirm=confirmation(entryCandidate,d);
  const cleanReturn=returnDepth>=C.analysis.pullback.minRetrace && returnDepth<=C.analysis.pullback.maxRetrace && holdsBreakout;
  if(!cleanReturn || !finalConfirm){
    return {strategy:'SP2L',status:'WATCH',score:clamp(52+spike.strength*0.2+(touchedFVG?10:0)+(holdsBreakout?8:0)),reason:'Spike found; waiting for controlled FVG/OB pullback confirmation',reasons:[`${d} Spike: ${spike.candleCount} directional candles`,`Return depth ${returnDepth.toFixed(2)} of Leg-1`,`Breakout preserved: ${holdsBreakout?'yes':'no'}`,`FVG interaction: ${touchedFVG?'yes':'no'}`,`Confirmation candle: ${finalConfirm?'yes':'no'}`,`Liquidity/OB context: ${liq.labels.join(', ')||'none'}`],warnings:['Wait for the pullback to stabilize before Leg-2 entry'],direction:d,entry:entryCandidate.close,trigger:spike.breakoutLevel,stop:d==='LONG'?returnExtreme-a*0.08:returnExtreme+a*0.08,fvg,regime};
  }

  const entry=entryCandidate.close;
  const buffer=Math.max(spread*2,0.03);
  const stop=d==='LONG'?Math.min(returnExtreme,spike.fvg?.low??returnExtreme)-buffer:Math.max(returnExtreme,spike.fvg?.high??returnExtreme)+buffer;
  const stopDistance=d==='LONG'?entry-stop:stop-entry;
  const targetDistance=Math.max(spike.legSize-Math.max(spread,0),0);
  const targetRR=targetDistance/Math.max(stopDistance+spread,1e-9);
  if(stopDistance<=0 || stopDistance/a>C.analysis.spike.maxStopATR || targetDistance<=0){
    return {strategy:'SP2L',status:'WATCH',score:55,reason:'SP2L geometry is not executable yet',reasons:[`Stop ${(stopDistance/a).toFixed(2)} ATR`,`Leg-1 target ${targetDistance.toFixed(4)}`],warnings:['Wait for tighter pullback geometry'],direction:d,entry,trigger:spike.breakoutLevel,stop,fvg,regime};
  }
  if(targetRR<C.singleStageMinRR || targetRR>C.twoStageMaxRR){
    return {strategy:'SP2L',status:'WATCH',score:58,reason:'SP2L target geometry is outside the allowed 1-5R range',reasons:[`Projected RR ${targetRR.toFixed(2)}R`,`Required ${C.singleStageMinRR.toFixed(2)}-${C.twoStageMaxRR.toFixed(2)}R`],warnings:['TP remains exactly the Leg-1 projection minus spread'],direction:d,entry,trigger:spike.breakoutLevel,stop,targetLegSize:spike.legSize,targetDistance,targetRR,targetMode:targetRR>C.singleStageMaxRR?'X2_LEG1_MINUS_SPREAD':'SINGLE_LEG1_MINUS_SPREAD',fvg,regime};
  }
  const twoStage=targetRR>C.singleStageMaxRR;
  const confluence=assessEntryConfluence(c,entry);
  const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,targetRR,C.x2Enabled&&twoStage);
  if(!risk.tradable) return {strategy:'SP2L',status:'INVALID',score:0,reason:'SP2L setup rejected by risk engine',reasons:risk.warnings,warnings:risk.warnings,direction:d,entry,trigger:spike.breakoutLevel,stop,risk,confluence,targetLegSize:spike.legSize,targetDistance,targetRR,targetMode:twoStage?'X2_LEG1_MINUS_SPREAD':'SINGLE_LEG1_MINUS_SPREAD',fvg,regime};

  const score=clamp(58+spike.strength*0.20+confluence.score+(touchedFVG?8:0)+Math.min(12,liq.score)+ (regime.m1Trend.trend===d?6:0)+(regime.m5Trend.trend===d?8:0));
  const reasons=[
    `${d} Spike confirmed: ${spike.candleCount} directional candles`,
    `Displacement=${spike.displacementATR.toFixed(2)} ATR`,
    `Pressure/imbalance=${spike.pressure.toFixed(2)}`,
    `FVG=${spike.fvg?`yes (${spike.fvg.sizeATR.toFixed(2)} ATR)`:'yes'}`,
    `Controlled pullback depth=${returnDepth.toFixed(2)}`,
    `FVG interaction=${touchedFVG?'yes':'no'}`,
    `EMA M5=${regime.m5Trend.trend} | EMA M1=${regime.m1Trend.trend}`,
    `Liquidity/OB=${liq.labels.join(', ')||'none'}`,
    `Leg-1 target=${targetDistance.toFixed(4)} (${targetRR.toFixed(2)}R)`,
    twoStage?'X2/two-stage geometry':'Single-stage geometry'
  ];
  return {strategy:'SP2L',status:'VALID',score,reason:'SP2L confirmed: Spike → FVG/OB pullback → Leg-2 continuation',reasons,warnings:[],direction:d,entry,entry2:twoStage?(risk.x2Entry??null):null,trigger:spike.breakoutLevel,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence,targetLegSize:spike.legSize,targetDistance,targetRR,targetMode:twoStage?'X2_LEG1_MINUS_SPREAD':'SINGLE_LEG1_MINUS_SPREAD',fvg,liquidityScore:liq.score,liquidityLabels:liq.labels,liquiditySweep:liq.sweep,orderBlock:liq.orderBlock?{...liq.orderBlock,source:'LIQUIDITY_CONTEXT'}:null,volumeProfileStatus:liquidity.volumeProfile.status,regime};
}
