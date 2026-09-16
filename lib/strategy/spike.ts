import { CONFIG } from './config';
import {
  Candle,
  Direction,
  Spike,
} from './types';

import {
  bodyRatio,
  closeLocation,
  dir,
  medianRange,
  atr,
} from './math';


function hasImbalance(
  candles: Candle[],
  startIndex: number,
  endIndex: number,
  direction: Direction
): boolean {

  const atrValue =
    atr(
      candles,
      CONFIG.imbalance.atrLength
    );

  if (
    !Number.isFinite(atrValue) ||
    atrValue <= 0
  ) {
    return false;
  }

  const minGap =
    atrValue *
    CONFIG.imbalance.minGapATR;

  for (
    let i = startIndex;
    i < endIndex;
    i++
  ) {

    const current =
      candles[i];

    const next =
      candles[i + 1];

    if (
      !current ||
      !next
    ) {
      continue;
    }

    // Bullish FVG:
    // current high < next low
    if (
      direction === 'LONG' &&
      next.low -
        current.high >=
        minGap
    ) {
      return true;
    }

    // Bearish FVG:
    // current low > next high
    if (
      direction === 'SHORT' &&
      current.low -
        next.high >=
        minGap
    ) {
      return true;
    }
  }

  return false;
}


function isStrongCandle(
  candle: Candle,
  direction: Direction
): boolean {

  const candleDirection =
    dir(candle);

  if (
    candleDirection !==
    direction
  ) {
    return false;
  }

  const ratio =
    bodyRatio(candle);

  if (
    ratio <
    CONFIG.spike.bodyToRangeMin
  ) {
    return false;
  }

  const location =
    closeLocation(candle);

  if (
    direction === 'LONG' &&
    location <
      CONFIG.spike.closeLocationMin
  ) {
    return false;
  }

  if (
    direction === 'SHORT' &&
    location >
      1 -
        CONFIG.spike.closeLocationMin
  ) {
    return false;
  }

  return true;
}


function getSpikeDirection(
  candles: Candle[],
  startIndex: number,
  endIndex: number
): Direction | null {

  let longCount = 0;
  let shortCount = 0;

  for (
    let i = startIndex;
    i <= endIndex;
    i++
  ) {

    const direction =
      dir(candles[i]);

    if (
      direction === 'LONG'
    ) {
      longCount++;
    }

    if (
      direction === 'SHORT'
    ) {
      shortCount++;
    }
  }

  if (
    longCount >=
    CONFIG.spike.minStrongCandles
  ) {
    return 'LONG';
  }

  if (
    shortCount >=
    CONFIG.spike.minStrongCandles
  ) {
    return 'SHORT';
  }

  return null;
}


export function detectSpike(
  candles: Candle[]
): Spike | null {

  const minimumCandles =
    CONFIG.spike.minStrongCandles;

  if (
    candles.length <
    minimumCandles
  ) {
    return null;
  }

  const maxBars =
    CONFIG.spike.maxBars;

  const startSearch =
    Math.max(
      0,
      candles.length -
        maxBars
    );

  /*
   * We search backward from the
   * latest completed candle.
   *
   * The goal is to find a sequence
   * of at least 3 strong candles
   * moving in the same direction.
   */

  for (
    let endIndex =
      candles.length - 1;
    endIndex >=
      startSearch;
    endIndex--
  ) {

    for (
      let count =
        minimumCandles;
      count <=
        Math.min(
          maxBars,
          endIndex + 1
        );
      count++
    ) {

      const startIndex =
        endIndex -
        count +
        1;

      if (
        startIndex < 0
      ) {
        continue;
      }

      const direction =
        getSpikeDirection(
          candles,
          startIndex,
          endIndex
        );

      if (!direction) {
        continue;
      }

      /*
       * Every candle in the impulse
       * must satisfy the strong-candle
       * requirements.
       */

      let allStrong = true;

      for (
        let i = startIndex;
        i <= endIndex;
        i++
      ) {

        if (
          !isStrongCandle(
            candles[i],
            direction
          )
        ) {
          allStrong = false;
          break;
        }
      }

      if (!allStrong) {
        continue;
      }

      /*
       * Expansion:
       *
       * Compare the average range of
       * the detected impulse with the
       * recent median candle range.
       */

      const impulseRanges =
        candles
          .slice(
            startIndex,
            endIndex + 1
          )
          .map(
            candle =>
              candle.high -
              candle.low
          );

      const impulseRange =
        impulseRanges.reduce(
          (
            sum,
            value
          ) =>
            sum + value,
          0
        ) /
        impulseRanges.length;

      const referenceRange =
        medianRange(
          candles,
          20
        );

      if (
        !Number.isFinite(
          referenceRange
        ) ||
        referenceRange <= 0
      ) {
        continue;
      }

      const expansion =
        impulseRange /
        referenceRange;

      /*
       * IMPORTANT:
       *
       * Expansion is a mandatory
       * qualification condition.
       *
       * Previously the engine could
       * score a spike even when this
       * requirement failed.
       */

      if (
        expansion <
        CONFIG.spike.expansionVsMedian
      ) {
        continue;
      }

      /*
       * Imbalance / FVG validation.
       */

      const imbalance =
        hasImbalance(
          candles,
          startIndex,
          endIndex,
          direction
        );

      /*
       * For now imbalance is not made
       * absolutely mandatory at this
       * layer. It contributes to the
       * quality score.
       *
       * This keeps the detector flexible
       * until the exact SP2L source rules
       * are validated through backtesting.
       */

      let score = 0;

      score += 30;

      if (
        expansion >=
        CONFIG.spike.expansionVsMedian
      ) {
        score += 25;
      }

      if (
        expansion >=
        CONFIG.spike.expansionVsMedian *
          1.25
      ) {
        score += 10;
      }

      if (
        imbalance
      ) {
        score += 20;
      }

      if (
        count >=
        minimumCandles + 1
      ) {
        score += 10;
      }

      score =
        Math.min(
          100,
          score
        );

      return {
        direction,

        startIndex,

        endIndex,

        strongCandles:
          count,

        expansion,

        imbalance,

        score,
      };
    }
  }

  return null;
}
