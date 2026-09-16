import { CONFIG, StrategyConfig } from './config';

import {
  Candle,
  Direction,
  MarketState,
  StrategyResult,
} from './types';

import { detectStructure } from './structure';
import { detectSpike } from './spike';
import { detectLeg2 } from './leg2';
import { buildRiskPlan } from './risk';


interface MultiTimeframeResult {
  m5: StrategyResult;
  m1: StrategyResult;
  final: StrategyResult;
}


function oppositeDirection(
  direction: Direction
): Direction {
  return direction === 'LONG'
    ? 'SHORT'
    : 'LONG';
}


function scoreM5Context(
  state: MarketState
): number {

  if (
    state === 'UPTREND' ||
    state === 'DOWNTREND'
  ) {
    return 20;
  }

  if (
    state === 'RANGE'
  ) {
    return 5;
  }

  return 0;
}


function scoreM1Setup(
  m1: StrategyResult
): number {

  let score = 0;

  if (
    m1.market_state === 'UPTREND' ||
    m1.market_state === 'DOWNTREND'
  ) {
    score += 20;
  }

  if (
    m1.setup.spike
  ) {
    score += 25;
  }

  if (
    m1.setup.spike?.imbalance
  ) {
    score += 10;
  }

  if (
    m1.setup.leg2?.pullback
  ) {
    score += 15;
  }

  if (
    m1.setup.leg2?.confirmed
  ) {
    score += 20;
  }

  if (
    m1.setup.spike &&
    (
      m1.market_state === 'UPTREND' &&
      m1.setup.spike.direction === 'LONG'
    ) ||
    (
      m1.market_state === 'DOWNTREND' &&
      m1.setup.spike?.direction === 'SHORT'
    )
  ) {
    score += 10;
  }

  return Math.min(
    100,
    score
  );
}


function emptyResult(
  timeframe: 'M1' | 'M5',
  candles: Candle[]
): StrategyResult {

  const structure =
    detectStructure(candles);

  return {
    symbol: 'XAUUSD',
    timeframe,
    signal: 'WAIT',
    quality_score: 0,
    market_state:
      structure.state,
    structure,
    setup: {
      type: 'NONE',
      spike: null,
      leg2: null,
      entry: null,
      stop_loss: null,
      take_profit: null,
    },
    risk: null,
    reasons: [],
    warnings: [],
    invalidation: null,
  };
}


export function analyze(
  candles: Candle[],
  timeframe: 'M1' | 'M5' = 'M1',
  spread = 0,
  config: StrategyConfig = CONFIG
): StrategyResult {

  if (
    candles.length < 30
  ) {
    return emptyResult(
      timeframe,
      candles
    );
  }

  const structure =
    detectStructure(candles);

  const spike =
    detectSpike(candles);

  const leg2 =
    spike
      ? detectLeg2(
          candles,
          spike
        )
      : null;

  const result: StrategyResult = {
    symbol: 'XAUUSD',

    timeframe,

    signal: 'WAIT',

    quality_score: 0,

    market_state:
      structure.state,

    structure,

    setup: {
      type:
        spike
          ? 'SP2L'
          : 'NONE',

      spike,

      leg2,

      entry:
        leg2?.confirmed
          ? leg2.entry ?? null
          : null,

      stop_loss:
        leg2?.confirmed
          ? leg2.stop ?? null
          : null,

      take_profit:
        null,
    },

    risk: null,

    reasons: [
      `Market structure: ${structure.state}`,
    ],

    warnings: [],

    invalidation: null,
  };

  const qualityScore =
    scoreM1Setup(result);

  result.quality_score =
    qualityScore;

  if (spike) {
    result.reasons.push(
      `Qualified ${spike.direction} spike detected`
    );
  }

  if (
    leg2?.pullback
  ) {
    result.reasons.push(
      'Leg 2 pullback detected'
    );
  }

  if (
    leg2?.confirmed
  ) {
    result.reasons.push(
      'Leg 2 confirmation detected'
    );
  }

  if (
    spike &&
    (
      (
        structure.state === 'UPTREND' &&
        spike.direction === 'LONG'
      ) ||
      (
        structure.state === 'DOWNTREND' &&
        spike.direction === 'SHORT'
      )
    )
  ) {
    result.reasons.push(
      'Spike direction aligned with structure'
    );
  }

  if (
    spike &&
    structure.state !== 'RANGE' &&
    (
      (
        structure.state === 'UPTREND' &&
        spike.direction !== 'LONG'
      ) ||
      (
        structure.state === 'DOWNTREND' &&
        spike.direction !== 'SHORT'
      )
    )
  ) {
    result.warnings.push(
      'Spike direction is not aligned with current structure'
    );
  }

  /*
   * Entry can only be created after
   * complete M1 confirmation.
   */

  if (
    spike &&
    leg2?.confirmed &&
    leg2.entry != null &&
    leg2.stop != null
  ) {

    const aligned =
      (
        structure.state === 'UPTREND' &&
        spike.direction === 'LONG'
      ) ||
      (
        structure.state === 'DOWNTREND' &&
        spike.direction === 'SHORT'
      );

    if (aligned) {

      const risk =
        buildRiskPlan(
          spike.direction,
          leg2.entry,
          leg2.stop,
          spread,
          config
        );

      result.risk =
        risk;

      result.setup.take_profit =
        risk.takeProfit;

      if (
        risk.tradable
      ) {
        result.signal =
          spike.direction;
      } else {
        result.warnings.push(
          risk.noTradeReason ||
            'Risk rules rejected the setup'
        );
      }
    }
  }

  return result;
}


export function analyzeMultiTimeframe(
  m5Candles: Candle[],
  m1Candles: Candle[],
  spread = 0,
  config: StrategyConfig = CONFIG
): MultiTimeframeResult {

  const m5 =
    analyze(
      m5Candles,
      'M5',
      spread,
      config
    );

  const m1 =
    analyze(
      m1Candles,
      'M1',
      spread,
      config
    );

  const final: StrategyResult = {
    ...m1,

    signal: 'WAIT',

    quality_score: 0,

    risk: null,

    reasons: [
      `M5 market context: ${m5.market_state}`,
      `M1 market state: ${m1.market_state}`,
    ],

    warnings: [
      ...m1.warnings,
    ],

    setup: {
      ...m1.setup,
    },

    invalidation:
      m1.invalidation,
  };

  /*
   * M5 directional context.
   */

  const m5Direction:
    | Direction
    | null =
      m5.market_state ===
        'UPTREND'
        ? 'LONG'
        : m5.market_state ===
          'DOWNTREND'
          ? 'SHORT'
          : null;

  if (!m5Direction) {

    final.quality_score =
      Math.round(
        m1.quality_score *
        0.5
      );

    final.reasons.push(
      'M5 does not provide a clear directional context'
    );

    final.warnings.push(
      'No M5 directional bias'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  final.reasons.push(
    `M5 directional bias: ${m5Direction}`
  );

  /*
   * M1 must contain a valid SP2L
   * in the same direction as M5.
   */

  const m1Spike =
    m1.setup.spike;

  if (!m1Spike) {

    final.quality_score =
      Math.round(
        m1.quality_score *
        0.7
      );

    final.reasons.push(
      'No qualified M1 SP2L spike'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  if (
    m1Spike.direction !==
    m5Direction
  ) {

    final.quality_score =
      Math.round(
        m1.quality_score *
        0.6
      );

    final.reasons.push(
      `M1 ${m1Spike.direction} setup conflicts with M5 ${m5Direction} context`
    );

    final.warnings.push(
      'M1/M5 direction mismatch'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  /*
   * M5 and M1 are aligned.
   */

  final.reasons.push(
    'M5/M1 direction aligned'
  );

  /*
   * Add context quality to M1 setup.
   */

  const contextScore =
    scoreM5Context(
      m5.market_state
    );

  final.quality_score =
    Math.min(
      100,
      Math.round(
        (
          m1.quality_score * 0.8
        ) +
        (
          contextScore
        )
      )
    );

  /*
   * Confirmation is mandatory.
   */

  if (
    !m1.setup.leg2?.confirmed ||
    m1.setup.entry == null ||
    m1.setup.stop_loss == null
  ) {

    final.reasons.push(
      'M1 SP2L has no confirmed Leg 2 entry'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  /*
   * Rebuild Risk Plan only after the
   * M5/M1 direction filter passes.
   */

  const risk =
    buildRiskPlan(
      m1Spike.direction,
      m1.setup.entry,
      m1.setup.stop_loss,
      spread,
      config
    );

  final.risk =
    risk;

  final.setup.take_profit =
    risk.takeProfit;

  if (
    !risk.tradable
  ) {

    final.warnings.push(
      risk.noTradeReason ||
        'Risk rules rejected the setup'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  /*
   * Final signal.
   */

  final.signal =
    m1Spike.direction;

  final.reasons.push(
    `FINAL SIGNAL: ${m1Spike.direction}`
  );

  return {
    m5,
    m1,
    final,
  };
}
