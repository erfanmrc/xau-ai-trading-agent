import {
  Candle,
  MarketContext,
  StrategySignal,
} from '../types';

import {
  detectSpike,
} from '../spike';

import {
  detectLeg2,
} from '../leg2';

import {
  buildRiskPlan,
} from '../risk';

import {
  StrategyDetector,
} from '../strategy-contract';

import {
  CONFIG,
} from '../config';

export class SP2LDetector
  implements StrategyDetector {

  readonly name = 'SP2L' as const;

  analyze(
    candles: Candle[],
    context: MarketContext
  ): StrategySignal {

    const spike =
      detectSpike(candles);

    if (!spike) {
      return {
        strategy: 'SP2L',
        status: 'INVALID',
        direction: null,
        score: 0,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          'No valid SP2L spike detected',
        ],
        warnings: [],
      };
    }

    const leg2 =
      detectLeg2(
        candles,
        spike
      );

    if (
      !leg2 ||
      !leg2.confirmed ||
      leg2.entry == null ||
      leg2.stop == null
    ) {
      return {
        strategy: 'SP2L',
        status: 'WATCH',
        direction: spike.direction,
        score: spike.score,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          'SP2L spike detected',
          'Leg2 confirmation is not complete',
        ],
        warnings: [],
      };
    }

    const risk =
      buildRiskPlan(
        leg2.direction,
        leg2.entry,
        leg2.stop,
        0,
        CONFIG
      );

    if (!risk.tradable) {
      return {
        strategy: 'SP2L',
        status: 'INVALID',
        direction: leg2.direction,
        score: spike.score,
        entry: leg2.entry,
        stopLoss: leg2.stop,
        takeProfit: risk.takeProfit,
        risk,
        reasons: [
          'SP2L setup detected',
          'Risk plan rejected the setup',
        ],
        warnings: [
          risk.noTradeReason ??
            'Risk constraints failed',
        ],
      };
    }

    let score = spike.score;

    if (
      context.structureAlignment
    ) {
      score += 10;
    }

    score = Math.min(
      100,
      score
    );

    return {
      strategy: 'SP2L',
      status: 'VALID',
      direction: leg2.direction,
      score,
      entry: leg2.entry,
      stopLoss: leg2.stop,
      takeProfit: risk.takeProfit,
      risk,
      reasons: [
        'SP2L spike confirmed',
        'Leg2 confirmation completed',
        ...(context.structureAlignment
          ? [
              'Multi-timeframe structure aligned',
            ]
          : []),
      ],
      warnings: [],
    };
  }
}
