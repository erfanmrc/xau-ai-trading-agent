import {
  Candle,
  MarketContext,
  StrategyName,
  StrategySignal,
} from './types';

export interface StrategyDetector {
  readonly name: StrategyName;

  analyze(
    candles: Candle[],
    context: MarketContext
  ): StrategySignal;
}
