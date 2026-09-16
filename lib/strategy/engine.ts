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
  timeframe: 'M1' | 'M5' = 'M1',
  spread: number = 0,
  config: StrategyConfig = DEFAULT_CONFIG
): StrategyResult {
  /*
   * Current detector modules use the shared CONFIG internally.
   * The config argument is kept here so the Strategy Engine API
   * is ready for configurable optimization later.
   */

  const structure =
    detectStructure(candles);

  const spike =
    detectSpike(candles);

  const leg2 =
    spike
      ? detectLeg2(candles, spike)
      : null;

  let score = 0;

  const reasons: string[] = [];
  const warnings: string[] = [];

  /*
   * MARKET STRUCTURE
   */
  if (
    structure.state !== 'UNCLEAR'
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

    if (spike.imbalance) {
      score += 10;

      reasons.push(
        'Imbalance/FVG detected'
      );
    }
  }

  /*
   * LEG 2 PULLBACK
   */
  if (leg2?.pullbackIndex != null) {
    score += 15;

    reasons.push(
      'Leg 2 pullback detected'
    );
  }

  /*
   * LEG 2 CONFIRMATION
   */
  if (leg2?.confirmed) {
    score += 20;

    reasons.push(
      'Pullback confirmation detected'
    );
  }

  /*
   * STRUCTURE ALIGNMENT
   */
  const direction:
    Direction | null =
      spike?.direction ?? null;

  const aligned =
    !!direction &&
    (
      (
        direction === 'LONG' &&
        (
          structure.state === 'UPTREND' ||
          structure.breakout === 'BULLISH'
        )
      )
      ||
      (
        direction === 'SHORT' &&
        (
          structure.state === 'DOWNTREND' ||
          structure.breakout === 'BEARISH'
        )
      )
    );

  if (aligned) {
    score += 10;

    reasons.push(
      'Spike direction aligned with structure'
    );

  } else if (direction) {
    warnings.push(
      'Spike direction is not aligned with current structure'
    );
  }

  /*
   * SIGNAL
   */
  const signal =
    score >= config.scoring.minimumSignal &&
    !!leg2?.confirmed &&
    aligned
      ? (
          direction === 'LONG'
            ? 'LONG'
            : 'SHORT'
        )
      : 'WAIT';

  /*
   * RISK PLAN
   *
   * No account balance is used here.
   * Risk is percentage-based only.
   */
  let risk = null;

  if (
  signal !== 'WAIT' &&
  leg2?.entry != null &&
  leg2.stop != null
) {
    risk =
      buildRiskPlan(
        signal,
        leg2.entry,
        leg2.stopLoss,
        spread,
        config
      );

    if (!risk.tradable) {
      warnings.push(
        risk.noTradeReason ||
        'Risk rules rejected the trade'
      );
    }
  }

  /*
   * FINAL RESULT
   */
  return {
    symbol: 'XAUUSD',

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
        leg2?.stopLoss ??
        null,

      take_profit:
        risk?.takeProfit ??
        null,
    },

    risk,

    reasons,

    warnings,

    invalidation:
      leg2?.stopLoss ??
      null,
  };
}
