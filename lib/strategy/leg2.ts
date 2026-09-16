import {
  CONFIG,
} from './config';

import {
  bodyRatio,
  closeLocation,
  dir,
} from './math';

import {
  Candle,
  Leg2,
  Spike,
} from './types';

export function detectLeg2(
  candles: Candle[],
  spike: Spike
): Leg2 {
  const impulseCandles =
    candles.slice(
      spike.startIndex,
      spike.endIndex + 1
    );

  const impulseHigh =
    Math.max(
      ...impulseCandles.map(
        (c) => c.high
      )
    );

  const impulseLow =
    Math.min(
      ...impulseCandles.map(
        (c) => c.low
      )
    );

  const impulse =
    impulseHigh -
    impulseLow;

  if (
    !Number.isFinite(
      impulse
    ) ||
    impulse <= 0
  ) {
    return {
      confirmed: false,

      direction:
        spike.direction,
    };
  }

  const base =
    spike.direction ===
    'LONG'
      ? impulseHigh
      : impulseLow;

  const firstSearch =
    spike.endIndex + 1;

  const lastSearch =
    Math.min(
      candles.length,
      firstSearch +
        CONFIG.pullback
          .maxBarsAfterSpike
    );

  for (
    let i = firstSearch;
    i < lastSearch;
    i += 1
  ) {
    const price =
      spike.direction ===
      'LONG'
        ? candles[i].low
        : candles[i].high;

    const retrace =
      spike.direction ===
      'LONG'
        ? (
            base -
            price
          ) / impulse
        : (
            price -
            base
          ) / impulse;

    if (
      retrace <
        CONFIG.pullback
          .minRetrace ||
      retrace >
        CONFIG.pullback
          .maxRetrace
    ) {
      continue;
    }

    const confirmationIndex =
      i + 1;

    if (
      confirmationIndex >=
      candles.length
    ) {
      return {
        confirmed:
          false,

        direction:
          spike.direction,

        pullback:
          true,

        pullbackIndex:
          i,

        retrace,
      };
    }

    const confirmationCandle =
      candles[
        confirmationIndex
      ];

    const confirmation =
      dir(
        confirmationCandle
      ) ===
        spike.direction &&

      bodyRatio(
        confirmationCandle
      ) >=
        CONFIG.confirmation
          .minBodyToRange &&

      (
        spike.direction ===
        'LONG'
          ? closeLocation(
              confirmationCandle
            ) >=
            CONFIG.confirmation
              .closeInDirection
          : closeLocation(
              confirmationCandle
            ) <=
            1 -
              CONFIG.confirmation
                .closeInDirection
      );

    if (
      confirmation
    ) {
      const entry =
        confirmationCandle
          .close;

      const stop =
        spike.direction ===
        'LONG'
          ? Math.min(
              candles[i].low,
              impulseLow
            )
          : Math.max(
              candles[i].high,
              impulseHigh
            );

      return {
        confirmed: true,

        direction:
          spike.direction,

        pullback:
          true,

        pullbackIndex:
          i,

        confirmationIndex,

        entry,

        stop,

        retrace,
      };
    }
  }

  return {
    confirmed: false,

    direction:
      spike.direction,
  };
}
