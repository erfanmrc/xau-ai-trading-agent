import {
  Candle,
  MarketContext,
  MultiStrategyResult,
  StrategySignal,
} from './types';

import {
  StrategyDetector,
} from './strategy-contract';

function invalidSignal(
  strategy: StrategySignal['strategy']
): StrategySignal {
  return {
    strategy,
    status: 'INVALID',
    direction: null,
    score: 0,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    risk: null,
    reasons: [],
    warnings: [],
  };
}

export function analyzeAllStrategies(
  candles: Candle[],
  context: MarketContext,
  detectors: StrategyDetector[]
): MultiStrategyResult {

  const results =
    detectors.map(
      detector =>
        detector.analyze(
          candles,
          context
        )
    );

  const sp2l =
    results.find(
      x => x.strategy === 'SP2L'
    ) ??
    invalidSignal('SP2L');

  const btb =
    results.find(
      x => x.strategy === 'PRO_BTB'
    ) ??
    invalidSignal('PRO_BTB');

  const microMap =
    results.find(
      x => x.strategy === 'MICRO_MAP'
    ) ??
    invalidSignal('MICRO_MAP');

  const activeSignals =
    results.filter(
      x =>
        x.status === 'VALID' &&
        x.direction !== null
    );

  const longSignals =
    activeSignals.filter(
      x => x.direction === 'LONG'
    );

  const shortSignals =
    activeSignals.filter(
      x => x.direction === 'SHORT'
    );

  let primaryDirection:
    | 'LONG'
    | 'SHORT'
    | null = null;

  if (
    longSignals.length >
    shortSignals.length
  ) {
    primaryDirection = 'LONG';
  } else if (
    shortSignals.length >
    longSignals.length
  ) {
    primaryDirection = 'SHORT';
  }

  /*
   * Technical context can suppress
   * contradictory signals.
   */

  const alignedSignals =
    activeSignals.filter(
      signal =>
        context.trend === null ||
        signal.direction === context.trend
    );

  let overallScore = 0;

  if (alignedSignals.length > 0) {
    overallScore =
      Math.max(
        ...alignedSignals.map(
          signal => signal.score
        )
      );
  }

  /*
   * A strategy must itself be valid.
   * Multiple strategies agreeing does NOT
   * automatically create a trade.
   */

  let signal:
    | 'LONG'
    | 'SHORT'
    | 'WAIT' = 'WAIT';

  if (
    primaryDirection !== null &&
    alignedSignals.some(
      x =>
        x.direction ===
          primaryDirection &&
        x.status === 'VALID'
    )
  ) {
    signal = primaryDirection;
  }

  const reasons = [
    ...context.reasons,

    ...results.flatMap(
      x => x.reasons
    ),
  ];

  const warnings = [
    ...context.warnings,

    ...results.flatMap(
      x => x.warnings
    ),
  ];

  return {
    symbol: 'XAUUSD',

    marketContext: context,

    strategies: {
      SP2L: sp2l,
      PRO_BTB: btb,
      MICRO_MAP: microMap,
    },

    activeSignals,

    primaryDirection,

    overallScore,

    signal,

    reasons,

    warnings,
  };
}
