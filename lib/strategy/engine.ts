import {
  Candle,
  Direction,
  StrategyResult,
} from './types';

import {
  DEFAULT_CONFIG,
  StrategyConfig,
} from './config';

import {
  detectStructure,
} from './structure';

import {
  detectSpike,
} from './spike';

import {
  detectLeg2,
} from './leg2';

import {
  buildRiskPlan,
} from './risk';

export function analyze(
  candles: Candle[],
  timeframe:
    | 'M1'
    | 'M5' = 'M1',
  spread = 0,
  config: StrategyConfig =
    DEFAULT_CONFIG
): StrategyResult {
  const structure =
    detectStructure(
      candles
    );

  const spike =
    detectSpike(
      candles
    );

  const leg2 =
    spike
      ? detectLeg2(
          candles,
          spike
        )
      : null;

  let score = 0;

  const reasons: string[] =
    [];

  const warnings: string[] =
    [];

  /*
   * MARKET STRUCTURE
   */
  if (
    structure.state !==
    'UNCLEAR'
  ) {
    score += 20;

    reasons.push(
      `Market structure: ${structure.state}`
    );
  }

  /*
   * SPIKE
   */
  if (spike) {
    score += 25;

    reasons.push(
      `Qualified ${spike.direction} spike detected`
    );

    if (
      spike.imbalance
    ) {
      score += 10;

      reasons.push(
        'Imbalance/FVG detected'
      );
    }
  }

  /*
   * PULLBACK / LEG 2
   */
  if (
    leg2?.pullback ===
    true
  ) {
    score += 15;

    reasons.push(
      'Leg 2 pullback detected'
    );
  }

  /*
   * CONFIRMATION
   */
  if (
    leg2?.confirmed ===
    true
  ) {
    score += 20;

    reasons.push(
      'Pullback confirmation detected'
    );
  }

  /*
   * DIRECTION ALIGNMENT
   */
  const direction:
    Direction | null =
      spike?.direction ??
      null;

  const aligned =
    !!direction &&
    (
      (
        direction ===
          'LONG' &&

        (
          structure.state ===
            'UPTREND' ||

          structure.breakout ===
            'BULLISH'
        )
      ) ||

      (
        direction ===
          'SHORT' &&

        (
          structure.state ===
            'DOWNTREND' ||

          structure.breakout ===
            'BEARISH'
        )
      )
    );

  if (aligned) {
    score += 10;

    reasons.push(
      'Spike direction aligned with structure'
    );
  } else if (
    direction
  ) {
    warnings.push(
      'Spike direction is not aligned with current structure'
    );
  }

  /*
   * SIGNAL
   */
  const signal =
    score >=
      config.scoring
        .minimumSignal &&

    leg2?.confirmed ===
      true &&

    aligned

      ? direction ===
        'LONG'
        ? 'LONG'
        : 'SHORT'

      : 'WAIT';

  /*
   * RISK
   */
  let risk = null;

  if (
    signal !==
      'WAIT' &&

    leg2?.entry !=
      null &&

    leg2?.stop !=
      null
  ) {
    risk =
      buildRiskPlan(
        signal,
        leg2.entry,
        leg2.stop,
        spread,
        config
      );

    if (
      !risk.tradable
    ) {
      warnings.push(
        risk.noTradeReason ||
          'Risk rules rejected the trade'
      );
    }
  }

  /*
   * RESULT
   */
  return {
    symbol:
      'XAUUSD',

    timeframe,

    signal:
      risk?.tradable
        ? signal
        : 'WAIT',

    quality_score:
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            score
          )
        )
      ),

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
        leg2?.entry ??
        null,

      stop_loss:
        leg2?.stop ??
        null,

      take_profit:
        risk?.takeProfit ??
        null,
    },

    risk,

    reasons,

    warnings,

    invalidation:
      leg2?.stop ??
      null,
  };
}
