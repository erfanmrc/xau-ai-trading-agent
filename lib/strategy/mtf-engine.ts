import { Candle, Structure } from './types';
import { detectStructure } from './structure';
import { buildMTFContext } from './context/mtf';
import { buildStrategyZones } from './context/zones';
import { createStrategyRegistry } from './strategy-registry';
import { analyzeAllStrategies } from './multi-engine';

export interface MTFAnalysisInput {
  h1Candles:Candle[];
  m15Candles:Candle[];
  m5Candles:Candle[];
  m1Candles:Candle[];
  spread?:number;
}

export function analyzeMTF(input: MTFAnalysisInput) {
  const h1:Structure=detectStructure(input.h1Candles);
  const m15:Structure=detectStructure(input.m15Candles);
  const m5:Structure=detectStructure(input.m5Candles);
  const m1:Structure=detectStructure(input.m1Candles);

  const context=buildMTFContext(
    {name:'H1',candles:input.h1Candles,structure:h1},
    {name:'M15',candles:input.m15Candles,structure:m15},
    {name:'M5',candles:input.m5Candles,structure:m5},
    {name:'M1',candles:input.m1Candles,structure:m1}
  );

  const zones=buildStrategyZones(input.m5Candles.length?input.m5Candles:input.m1Candles);

  const strategyContext={
    trend:context.directionalBias,
    state:m1.state,
    higherTimeframe:h1.state,
    intermediateTimeframe:m5.state,
    executionTimeframe:m1.state,
    structureAlignment:context.aligned,
    liquidity:{buySide:[],sellSide:[],previousDayHigh:null,previousDayLow:null,sessionHigh:null,sessionLow:null,equalHighs:[],equalLows:[],imbalanceZones:[],spikeZones:[]},
    volatility:null,
    newsRisk:'LOW' as const,
    macroBias:context.directionalBias==='LONG'?'BULLISH' as const:context.directionalBias==='SHORT'?'BEARISH' as const:'NEUTRAL' as const,
    reasons:context.reasons,
    warnings:context.warnings
  };

  const strategies=analyzeAllStrategies(input.m1Candles,strategyContext,createStrategyRegistry());
  const valid=strategies.activeSignals.filter(x=>context.directionalBias===null||x.direction===context.directionalBias);
  const strategyScore=valid.length?Math.max(...valid.map(x=>x.score)):0;
  const qualityScore=Math.round(context.alignmentScore*.35+strategyScore*.65);
  const signal=context.directionalBias && valid.some(x=>x.status==='VALID'&&x.direction===context.directionalBias)?context.directionalBias:'WAIT';

  return {
    symbol:'XAUUSD' as const,
    timeframes:{h1:input.h1Candles.length,m15:input.m15Candles.length,m5:input.m5Candles.length,m1:input.m1Candles.length},
    context,zones,strategies,signal,qualityScore,
    reasons:[...context.reasons,...strategies.reasons],
    warnings:[...context.warnings,...strategies.warnings]
  };
}
