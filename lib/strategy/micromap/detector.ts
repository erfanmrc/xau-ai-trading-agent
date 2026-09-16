import {
  Candle,
  MarketContext,
  StrategySignal,
} from '../types';

import {
  StrategyDetector,
} from '../strategy-contract';

export class MicroMAPDetector
  implements StrategyDetector {

  readonly name = 'MICRO_MAP' as const;

  analyze(
    candles: Candle[],
    context: MarketContext
  ): StrategySignal {

    if (candles.length < 30) {
      return {
        strategy: 'MICRO_MAP',
        status: 'INVALID',
        direction: null,
        score: 0,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          'Insufficient candles',
        ],
        warnings: [],
      };
    }

    /*
     * IMPORTANT:
     *
     * Micro-MAP rules will be implemented
     * from the defined strategy specification.
     *
     * We intentionally do NOT fabricate
     * strategy rules here.
     */

    return {
      strategy: 'MICRO_MAP',

      status: 'WATCH',

      direction:
        context.trend,

      score: 0,

      entry: null,

      stopLoss: null,

      takeProfit: null,

      risk: null,

      reasons: [
        'Micro-MAP engine is registered',
        'No validated Micro-MAP trigger yet',
      ],

      warnings: [
        'Micro-MAP rules require validated specification',
      ],
    };
  }
}
