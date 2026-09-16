import {
  CONFIG,
} from './config';

import {
  atr,
  bodyRatio,
  closeLocation,
  dir,
  medianRange,
} from './math';

import {
  Candle,
  Direction,
  Spike,
} from './types';

function fvg(
  candles: Candle[],
  index: number,
  direction: Direction
): boolean {
  if (
    index < 2
  ) {
    return false;
  }

  const gap =
    direction ===
    'LONG'
      ? candles[index]
          .low -
        candles[index - 2]
          .high
      : candles[index - 2]
          .low -
        candles[index]
          .high;

  if (
    gap <= 0
  ) {
    return false;
  }

  const atrValue =
    atr(
      candles.slice(
        0,
        index + 1
      ),
      CONFIG.imbalance
        .atrLength
    );

  return (
    gap >=
    atrValue *
      CONFIG.imbalance
        .minGapATR
  );
}

export function detectSpike(
  candles: Candle[]
): Spike | null {
  const end =
    candles.length - 1;

  if (
    end <
    CONFIG.spike
      .minStrongCandles -
      1
  ) {
    return null;
  }

  const startLimit =
    Math.max(
      0,
      end -
        CONFIG.spike
          .maxBars +
        1
    );

  const historical =
    candles.slice(
      0,
      end
    );

  const median =
    medianRange(
      historical,
      20
    ) || 1;

  for (
    let i = end;
    i >= startLimit;
    i -= 1
  ) {
    for (
      const direction of [
        'LONG',
        'SHORT',
      ] as Direction[]
    ) {
      let count = 0;

      let first = i;

      for (
        let j = i;
        j >=
          Math.max(
            0,
            i -
              CONFIG.spike
                .maxBars +
              1
          );
        j -= 1
      ) {
        const sameDirection =
          dir(
            candles[j]
          ) === direction;

        const bodyOk =
          bodyRatio(
            candles[j]
          ) >=
          CONFIG.spike
            .bodyToRangeMin;

        const closeOk =
          direction ===
          'LONG'
            ? closeLocation(
                candles[j]
              ) >=
              CONFIG.spike
                .closeLocationMin
            : closeLocation(
                candles[j]
              ) <=
              1 -
                CONFIG.spike
                  .closeLocationMin;

        if (
          !sameDirection ||
          !bodyOk ||
          !closeOk
        ) {
          break;
        }

        count += 1;

        first = j;
      }

      if (
        count >=
        CONFIG.spike
          .minStrongCandles
      ) {
        const expansion =
          candles
            .slice(
              first,
              i + 1
            )
            .reduce(
              (
                sum,
                candle
              ) =>
                sum +
                (
                  candle.high -
                  candle.low
                ),
              0
            ) /
          count /
          median;

        const imbalance =
          fvg(
            candles,
            i,
            direction
          );

        const score =
          Math.min(
            100,

            40 +
              count * 10 +

              (
                expansion >=
                CONFIG.spike
                  .expansionVsMedian
                  ? 20
                  : 0
              ) +

              (
                imbalance
                  ? 20
                  : 0
              )
          );

        return {
          direction,

          startIndex:
            first,

          endIndex:
            i,

          strongCandles:
            count,

          expansion,

          imbalance,

          score,
        };
      }
    }
  }

  return null;
}
