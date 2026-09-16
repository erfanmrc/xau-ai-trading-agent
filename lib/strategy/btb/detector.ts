import {
  Candle,
  MarketContext,
  StrategySignal,
} from '../types';

import {
  StrategyDetector,
} from '../strategy-contract';

import {
  buildRiskPlan,
} from '../risk';

import {
  CONFIG,
} from '../config';

function bodyRatio(
  candle: Candle
): number {
  const range =
    candle.high - candle.low;

  if (range <= 0) {
    return 0;
  }

  return (
    Math.abs(
      candle.close - candle.open
    ) / range
  );
}

function isBullish(
  candle: Candle
): boolean {
  return candle.close > candle.open;
}

function isBearish(
  candle: Candle
): boolean {
  return candle.close < candle.open;
}

export class BTBDetector
  implements StrategyDetector {

  readonly name = 'PRO_BTB' as const;

  analyze(
    candles: Candle[],
    context: MarketContext
  ): StrategySignal {

    if (candles.length < 20) {
      return {
        strategy: 'PRO_BTB',
        status: 'INVALID',
        direction: null,
        score: 0,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          'Insufficient candles for BTB',
        ],
        warnings: [],
      };
    }

    const recent =
      candles.slice(-20);

    const current =
      recent[recent.length - 1];

    const previous =
      recent[recent.length - 2];

    const rangeHigh =
      Math.max(
        ...recent
          .slice(0, -3)
          .map(c => c.high)
      );

    const rangeLow =
      Math.min(
        ...recent
          .slice(0, -3)
          .map(c => c.low)
      );

    /*
     * Bullish BTB:
     *
     * 1. Break above structure
     * 2. Return/retest
     * 3. Break back upward
     */

    const bullishBreak =
      previous.close > rangeHigh;

    const bullishRetest =
      current.low <= rangeHigh &&
      current.close > rangeHigh;

    if (
      bullishBreak &&
      bullishRetest &&
      isBullish(current) &&
      bodyRatio(current) >=
        CONFIG.confirmation.minBodyToRange
    ) {
      const entry =
        current.close;

      const stop =
        Math.min(
          current.low,
          rangeHigh
        );

      const risk =
        buildRiskPlan(
          'LONG',
          entry,
          stop,
          0,
          CONFIG
        );

      if (risk.tradable) {
        return {
          strategy: 'PRO_BTB',
          status: 'VALID',
          direction: 'LONG',
          score: context.structureAlignment
            ? 88
            : 78,
          entry,
          stopLoss: stop,
          takeProfit: risk.takeProfit,
          risk,
          reasons: [
            'Bullish break detected',
            'Breakout retest detected',
            'Bullish confirmation candle',
          ],
          warnings: [],
        };
      }
    }

    /*
     * Bearish BTB
     */

    const bearishBreak =
      previous.close < rangeLow;

    const bearishRetest =
      current.high >= rangeLow &&
      current.close < rangeLow;

    if (
      bearishBreak &&
      bearishRetest &&
      isBearish(current) &&
      bodyRatio(current) >=
        CONFIG.confirmation.minBodyToRange
    ) {
      const entry =
        current.close;

      const stop =
        Math.max(
          current.high,
          rangeLow
        );

      const risk =
        buildRiskPlan(
          'SHORT',
          entry,
          stop,
          0,
          CONFIG
        );

      if (risk.tradable) {
        return {
          strategy: 'PRO_BTB',
          status: 'VALID',
          direction: 'SHORT',
          score: context.structureAlignment
            ? 88
            : 78,
          entry,
          stopLoss: stop,
          takeProfit: risk.takeProfit,
          risk,
          reasons: [
            'Bearish break detected',
            'Breakout retest detected',
            'Bearish confirmation candle',
          ],
          warnings: [],
        };
      }
    }

    /*
     * Watch state:
     * Price is interacting with a liquidity/
     * imbalance area but confirmation
     * is incomplete.
     */

    const nearLiquidity =
      context.liquidity.buySide.some(
        level =>
          Math.abs(
            current.close - level
          ) <= current.close * 0.0005
      ) ||
      context.liquidity.sellSide.some(
        level =>
          Math.abs(
            current.close - level
          ) <= current.close * 0.0005
      );

    if (nearLiquidity) {
      return {
        strategy: 'PRO_BTB',
        status: 'WATCH',
        direction:
          context.trend,
        score: 55,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          'Price is near a liquidity level',
          'BTB confirmation not completed',
        ],
        warnings: [],
      };
    }

    return {
      strategy: 'PRO_BTB',
      status: 'INVALID',
      direction: null,
      score: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      risk: null,
      reasons: [
        'No valid BTB setup',
      ],
      warnings: [],
    };
  }
}
