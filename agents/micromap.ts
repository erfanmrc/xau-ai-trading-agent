import { Candle, Direction, StrategySignal } from '@/types/market';
import type { MarketContext } from '@/types/market';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { atr, bodyRatio, candleDirection, closeLocation, median } from '@/engine/indicators';
import { nearestFVG } from '@/engine/regime';
import { assessEntryConfluence } from '@/engine/levels';
import { assessLiquidityConfluence } from '@/engine/liquidity';
import { buildRisk } from '@/engine/risk';
import { buildContext } from '@/engine/context';

function invalid(reason:string,warnings:string[]=[]):StrategySignal{return {strategy:'MICROMAP',status:'INVALID',score:0,reason,reasons:[reason],warnings,direction:null};}

function controlledChannel(ch:Candle[],d:Direction,a:number){
  if(ch.length<C.analysis.microMap.minChannelBars) return false;
  const ranges=ch.map(x=>x.high-x.low);
  const med=Math.max(median(ranges),1e-9);
  const width=(Math.max(...ch.map(x=>x.high))-Math.min(...ch.map(x=>x.low)))/a;
  const narrow=ranges.filter(x=>x<=Math.max(a*1.05,med*1.30)).length>=Math.max(3,ch.length-1);
  const directionals=ch.filter(x=>candleDirection(x)===d).length;
  const closes=d==='LONG'?ch.filter((x,i)=>i===0||x.close>=ch[i-1].close).length:ch.filter((x,i)=>i===0||x.close<=ch[i-1].close).length;
  return width<=C.analysis.context.channelMaxWidthATR && narrow && directionals>=Math.ceil(ch.length*0.50) && closes>=Math.ceil(ch.length*0.60);
}

export function detectMicroMap(c:Candle[],balance=C.balance,spread=0,precomputedContext?:MarketContext):StrategySignal{
  if(c.length<C.analysis.minCandles) return invalid('Insufficient candles for Micro-MAP');
  const context=precomputedContext??buildContext(c);
  const regime=context.regime;
  if(regime.phase==='RANGE') return invalid('Market is RANGE; Micro-MAP waits for a directional channel',['EMA50/EMA60 are not showing a stable directional regime']);
  if(regime.phase!=='CHANNEL' || !regime.m5Trend.trend || regime.m5Trend.trend==='NEUTRAL') return {strategy:'MICROMAP',status:'WATCH',score:55,reason:'Waiting for a directional channel under EMA50/EMA60',reasons:[`Phase=${regime.phase}`,`M5 EMA trend=${regime.m5Trend.trend}`],warnings:[],direction:regime.m5Trend.trend==='NEUTRAL'?null:regime.m5Trend.trend,regime};

  const d=regime.m5Trend.trend as Direction;
  if(regime.m1Trend.trend!==d && regime.m1Trend.trend!== 'NEUTRAL') return {strategy:'MICROMAP',status:'WATCH',score:52,reason:'M1 EMA trend is counter to the M5 channel direction',reasons:[`M5=${d}`,`M1=${regime.m1Trend.trend}`],warnings:['Wait for M1 to align or return to neutral'],direction:d,regime};
  const end=c.length-1,a=Math.max(atr(c,14),0.05);
  for(let bars=C.analysis.microMap.maxChannelBars;bars>=C.analysis.microMap.minChannelBars;bars--){
    const channelEnd=end-2,start=channelEnd-bars+1;
    if(start<3) continue;
    const ch=c.slice(start,channelEnd+1);
    if(!controlledChannel(ch,d,a)) continue;
    const pull=c.slice(channelEnd+1,end);
    const current=c[end];
    const pullExtreme=d==='LONG'?Math.min(...pull.map(x=>x.low),Math.min(...ch.map(x=>x.low))):Math.max(...pull.map(x=>x.high),Math.max(...ch.map(x=>x.high)));
    const trigger=d==='LONG'?Math.max(...ch.map(x=>x.high)):Math.min(...ch.map(x=>x.low));
    const triggered=d==='LONG'?current.close>trigger:current.close<trigger;
    const confirmation=d==='LONG'?candleDirection(current)==='LONG'&&bodyRatio(current)>=C.analysis.confirmation.minBodyToRange&&closeLocation(current)>=C.analysis.confirmation.closeInDirection:candleDirection(current)==='SHORT'&&bodyRatio(current)>=C.analysis.confirmation.minBodyToRange&&closeLocation(current)<=1-C.analysis.confirmation.closeInDirection;
    const fvg=nearestFVG(c,current.close,d,'M1',0.95);
    if(!triggered || !confirmation){
      return {strategy:'MICROMAP',status:'WATCH',score:62+(regime.m1Trend.trend===d?8:0)+(fvg?6:0),reason:'Directional Micro-MAP channel found; waiting for breakout confirmation',reasons:[`${bars}-bar compressed directional channel`,`M5 EMA trend=${d}`,`M1 EMA trend=${regime.m1Trend.trend}`,`Trigger=${triggered?'hit':'pending'}`,`Confirmation=${confirmation?'yes':'pending'}`,`Nearby FVG=${fvg?'yes':'no'}`],warnings:[],direction:d,trigger,zone:null,fvg,regime};
    }
    const entry=current.close;
    const stop=d==='LONG'?Math.min(pullExtreme,trigger)-Math.max(spread*2,0.03):Math.max(pullExtreme,trigger)+Math.max(spread*2,0.03);
    const stopDistance=d==='LONG'?entry-stop:stop-entry;
    if(stopDistance<=0 || stopDistance>a*C.analysis.microMap.maxStopATR) return {strategy:'MICROMAP',status:'WATCH',score:58,reason:'Micro-MAP stop geometry is too wide',reasons:[`Stop ${(stopDistance/a).toFixed(2)} ATR exceeds ${C.analysis.microMap.maxStopATR.toFixed(2)} ATR`],warnings:[],direction:d,entry,trigger,stop,fvg,regime};
    const channelHigh=Math.max(...ch.map(x=>x.high)),channelLow=Math.min(...ch.map(x=>x.low));
    const leg1=Math.max(Math.abs(channelHigh-channelLow),Math.abs(trigger-pullExtreme));
    const targetDistance=Math.max(leg1-Math.max(spread,0),0);
    const targetRR=targetDistance/Math.max(stopDistance+spread,1e-9);
    if(targetDistance<=0 || targetRR<C.analysis.microMap.minRR || targetRR>C.analysis.microMap.maxRR){
      return {strategy:'MICROMAP',status:'WATCH',score:58,reason:'Micro-MAP setup exists but target geometry is outside the configured RR band',reasons:[`Leg-1=${leg1.toFixed(4)}`,`Projected RR=${targetRR.toFixed(2)}R`,`Allowed=${C.analysis.microMap.minRR.toFixed(2)}-${C.analysis.microMap.maxRR.toFixed(2)}R`],warnings:[],direction:d,entry,trigger,stop,targetLegSize:leg1,targetDistance,targetRR,targetMode:'MICRO_LEG1_MINUS_SPREAD',fvg,regime};
    }
    const confluence=assessEntryConfluence(c,entry);
    const liquidity=context.liquidity;
    const liq=assessLiquidityConfluence(liquidity,entry,d,a);
    const risk=buildRisk(d,entry,stop,balance,Math.min(C.riskPercent,C.maxRiskPercent),spread,targetRR,false);
    if(!risk.tradable) return invalid('Micro-MAP setup rejected by risk engine',risk.warnings);
    const score=Math.min(100,66+(regime.m1Trend.trend===d?8:0)+Math.min(10,confluence.score)+(fvg?6:0)+Math.min(8,liq.score));
    return {strategy:'MICROMAP',status:'VALID',score,reason:'Micro-MAP confirmed: EMA-aligned channel breakout',reasons:[`${bars}-bar directional compression`,`M5 EMA50/60=${d}`,`M1 EMA50/60=${regime.m1Trend.trend}`,`Breakout above/below channel=${trigger}`,`FVG=${fvg?'present':'none'}`,`Liquidity/OB=${liq.labels.join(', ')||'none'}`,`Leg-1 target=${targetDistance.toFixed(4)} (${targetRR.toFixed(2)}R)`],warnings:[],direction:d,entry,entry2:null,trigger,stop,tp1:risk.takeProfit??null,tp2:risk.takeProfit??null,risk,confluence,targetLegSize:leg1,targetDistance,targetRR,targetMode:'MICRO_LEG1_MINUS_SPREAD',fvg,liquidityScore:liq.score,liquidityLabels:liq.labels,liquiditySweep:liq.sweep,orderBlock:liq.orderBlock?{...liq.orderBlock,source:'LIQUIDITY_CONTEXT'}:null,volumeProfileStatus:liquidity.volumeProfile.status,regime};
  }
  return invalid('No qualifying directional Micro-MAP channel',['Requires EMA-aligned M5 direction, compressed structure and confirmed breakout']);
}
