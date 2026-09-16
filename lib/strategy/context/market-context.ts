import {
  Candle,
  MarketContext,
  MarketState,
  Structure,
} from '../types';

import { buildLiquidityMap } from './liquidity';

function stateDirection(
  state: MarketState
): 'LONG' | 'SHORT' | null {
  if (state === 'UPTREND') {
    return 'LONG';
  }

  if (state === 'DOWNTREND') {
    return 'SHORT';
  }

  return null;
}

function calculateVolatility(
  candles: Candle[]
): number | null {
  if (candles.length < 14) {
    return null;
  }

  const recent = candles.slice(-14);

  const ranges = recent.map(
    candle =>
      candle.high - candle.low
  );

  const average =
    ranges.reduce(
      (sum, value) => sum + value,
      0
    ) / ranges.length;

  return average;
}

export function buildMarketContext(
  htfStructure: Structure,
  intermediateStructure: Structure,
  executionStructure: Structure,
  candles: Candle[]
): MarketContext {
  const htfDirection =
    stateDirection(
      htfStructure.state
    );

  const intermediateDirection =
    stateDirection(
      intermediateStructure.state
    );

  const executionDirection =
    stateDirection(
      executionStructure.state
    );

  const directions = [
    htfDirection,
    intermediateDirection,
    executionDirection,
  ].filter(
    (value): value is 'LONG' | 'SHORT' =>
      value !== null
  );

  let trend: 'LONG' | 'SHORT' | null = null;

  if (directions.length > 0) {
    const longCount =
      directions.filter(
        x => x === 'LONG'
      ).length;

    const shortCount =
      directions.filter(
        x => x === 'SHORT'
      ).length;

    if (longCount > shortCount) {
      trend = 'LONG';
    }

    if (shortCount > longCount) {
      trend = 'SHORT';
    }
  }

  const structureAlignment =
    htfDirection !== null &&
    intermediateDirection !== null &&
    executionDirection !== null &&
    htfDirection === intermediateDirection &&
    intermediateDirection === executionDirection;

  let macroBias:
    | 'BULLISH'
    | 'BEARISH'
    | 'NEUTRAL'
    | 'MIXED' = 'NEUTRAL';

  if (trend === 'LONG') {
    macroBias = 'BULLISH';
  } else if (trend === 'SHORT') {
    macroBias = 'BEARISH';
  }

  return {
    trend,

    state: executionStructure.state,

    higherTimeframe:
      htfStructure.state,

    intermediateTimeframe:
      intermediateStructure.state,

    executionTimeframe:
      executionStructure.state,

    structureAlignment,

    liquidity:
      buildLiquidityMap(candles),

    volatility:
      calculateVolatility(candles),

    // Fundamental engine will replace these
    // defaults in the next batch.
    newsRisk: 'LOW',

    macroBias,

    reasons: [],

    warnings: [],
  };
}
