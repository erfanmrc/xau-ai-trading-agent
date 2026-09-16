import { Candle,StrategyResult } from './types'; import { detectStructure } from './structure'; import { detectSpike } from './spike'; import { detectLeg2 } from './leg2'; import { buildRisk } from './risk'; import { CONFIG } from './config';
export function analyze(candles:Candle[],timeframe='M1',balance=CONFIG.risk.balance,spread=0):StrategyResult{
 const structure=detectStructure(candles), spike=detectSpike(candles); const reasons:string[]=[];const warnings:string[]=[];let score=0;
 if(spike){score+=25;reasons.push(`${spike.direction} spike: ${spike.strongCandles} strong candles`);if(spike.imbalance){score+=15;reasons.push('3-candle imbalance/FVG detected')}}
 if(spike&&((spike.direction==='LONG'&&structure.state==='UPTREND')||(spike.direction==='SHORT'&&structure.state==='DOWNTREND'))){score+=20;reasons.push('Spike aligned with market structure')}
 const leg2=spike?detectLeg2(candles,spike):null;if(leg2?.confirmed){score+=30;reasons.push('Leg 2 pullback + confirmation candle confirmed')}else if(spike)warnings.push('Spike exists but Leg 2 is not confirmed');
 if(structure.breakout&&spike?.direction===structure.breakout){score+=10;reasons.push('Breakout direction agrees with spike')}
 const signal=score>=CONFIG.scoring.minimumSignal&&!!spike&&!!leg2?.confirmed?spike.direction:'WAIT';let risk=null;if(signal!=='WAIT'&&leg2?.entry&&leg2.stop){risk=buildRisk(signal,leg2.entry,leg2.stop,balance,CONFIG.risk.defaultRiskPercent,spread);if(!risk.tradable){warnings.push(...risk.warnings)}}
 return {signal,score,symbol:'XAUUSD',timeframe,marketState:structure.state,structure,spike,leg2,risk,reasons,warnings};
}
