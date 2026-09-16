import { CONFIG } from './config';
import {
  Candle,
  Direction,
  Leg2,
  Spike,
} from './types';

import {
  bodyRatio,
  closeLocation,
  dir,
} from './math';


function getImpulseRange(
  candles: Candle[],
  spike: Spike
) {
  const impulseCandles =
    candles.slice(
      spike.startIndex,
      spike.endIndex + 1
    );

  if (
    impulseCandles.length === 0
  ) {
    return null;
  }

  let high =
    impulseCandles[0].high;

  let low =
    impulseCandles[0].low;

  for (
    const candle of impulseCandles
  ) {
    high =
      Math.max(
        high,
        candle.high
      );

    low =
      Math.min(
        low,
        candle.low
      );
  }

  return {
    high,
    low,
    range: high - low,
  };
}


function getRetracement(
  direction: Direction,
  impulseHigh: number,
  impulseLow: number,
  price: number
): number {

  const range =
    impulseHigh -
    impulseLow;

  if (
    range <= 0
  ) {
    return 0;
  }

  if (
    direction === 'LONG'
  ) {
    return (
      impulseHigh -
      price
    ) / range;
  }

  return (
    price -
    impulseLow
  ) / range;
}


function isPullbackCandle(
  candle: Candle,
  direction: Direction
): boolean {

  const candleDirection =
    dir(candle);

  /*
   * A pullback is allowed to move
   * against the impulse direction.
   */

  if (
    direction === 'LONG'
  ) {
    return (
      candleDirection ===
        'SHORT' ||
      candle.close <
        candle.open
    );
  }

  return (
    candleDirection ===
      'LONG' ||
    candle.close >
      candle.open
  );
}


function isConfirmationCandle(
  candle: Candle,
  direction: Direction
): boolean {

  if (
    dir(candle) !==
    direction
  ) {
    return false;
  }

  const body =
    bodyRatio(candle);

  if (
    body <
    CONFIG.confirmation
      .minBodyToRange
  ) {
    return false;
  }

  const location =
    closeLocation(candle);

  if (
    direction === 'LONG'
  ) {
    return (
      location >=
      CONFIG.confirmation
        .closeInDirection
    );
  }

  return (
    location <=
    1 -
      CONFIG.confirmation
        .closeInDirection
  );
}


function findPullback(
  candles: Candle[],
  spike: Spike,
  impulseHigh: number,
  impulseLow: number
) {

  const direction =
    spike.direction;

  const startIndex =
    spike.endIndex + 1;

  const endIndex =
    Math.min(
      candles.length - 1,
      startIndex +
        CONFIG.pullback
          .maxBarsAfterSpike -
        1
    );

  for (
    let i = startIndex;
    i <= endIndex;
    i++
  ) {

    const candle =
      candles[i];

    if (!candle) {
      continue;
    }

    if (
      !isPullbackCandle(
        candle,
        direction
      )
    ) {
      continue;
    }

    /*
     * Use the candle close as the
     * first retracement reference.
     */

    const retrace =
      getRetracement(
        direction,
        impulseHigh,
        impulseLow,
        candle.close
      );

    if (
      retrace <
      CONFIG.pullback.minRetrace
    ) {
      continue;
    }

    if (
      retrace >
      CONFIG.pullback.maxRetrace
    ) {
      continue;
    }

    return {
      index: i,
      retrace,
    };
  }

  return null;
}


function findConfirmation(
  candles: Candle[],
  pullbackIndex: number,
  direction: Direction
) {

  /*
   * Confirmation must happen after
   * the pullback.
   */

  for (
    let i =
      pullbackIndex + 1;
    i < candles.length;
    i++
  ) {

    const candle =
      candles[i];

    if (!candle) {
      continue;
    }

    if (
      isConfirmationCandle(
        candle,
        direction
      )
    ) {
      return {
        index: i,
        entry: candle.close,
      };
    }

    /*
     * Once a new candle has moved too
     * far against the original setup,
     * do not keep looking indefinitely.
     */

    const barsSincePullback =
      i -
      pullbackIndex;

    if (
      barsSincePullback >
      3
    ) {
      break;
    }
  }

  return null;
}


function calculateStop(
  direction: Direction,
  candles: Candle[],
  pullbackIndex: number,
  impulseLow: number,
  impulseHigh: number
): number | null {

  const pullback =
    candles[pullbackIndex];

  if (!pullback) {
    return null;
  }

  if (
    direction === 'LONG'
  ) {

    /*
     * Stop below the pullback low.
     */

    return Math.min(
      pullback.low,
      impulseLow
    );
  }

  /*
   * Stop above the pullback high.
   */

  return Math.max(
    pullback.high,
    impulseHigh
  );
}


export function detectLeg2(
  candles: Candle[],
  spike: Spike
): Leg2 {

  const direction =
    spike.direction;

  const impulse =
    getImpulseRange(
      candles,
      spike
    );

  if (!impulse) {
    return {
      direction,
      confirmed: false,
      pullback: false,
    };
  }

  const pullback =
    findPullback(
      candles,
      spike,
      impulse.high,
      impulse.low
    );

  if (!pullback) {
    return {
      direction,
      confirmed: false,
      pullback: false,
    };
  }

  const confirmation =
    findConfirmation(
      candles,
      pullback.index,
      direction
    );

  if (!confirmation) {

    return {
      direction,
      confirmed: false,
      pullback: true,
      pullbackIndex:
        pullback.index,
      retrace:
        pullback.retrace,
    };
  }

  const stop =
    calculateStop(
      direction,
      candles,
      pullback.index,
      impulse.low,
      impulse.high
    );

  if (
    stop === null
  ) {
    return {
      direction,
      confirmed: false,
      pullback: true,
      pullbackIndex:
        pullback.index,
      retrace:
        pullback.retrace,
    };
  }

  /*
   * Basic invalidation check.
   *
   * LONG:
   * confirmation must be above stop.
   *
   * SHORT:
   * confirmation must be below stop.
   */

  if (
    direction === 'LONG' &&
    confirmation.entry <=
      stop
  ) {
    return {
      direction,
      confirmed: false,
      pullback: true,
      pullbackIndex:
        pullback.index,
      retrace:
        pullback.retrace,
    };
  }

  if (
    direction === 'SHORT' &&
    confirmation.entry >=
      stop
  ) {
    return {
      direction,
      confirmed: false,
      pullback: true,
      pullbackIndex:
        pullback.index,
      retrace:
        pullback.retrace,
    };
  }

  return {
    direction,
    confirmed: true,

    pullback: true,

    pullbackIndex:
      pullback.index,

    confirmationIndex:
      confirmation.index,

    entry:
      confirmation.entry,

    stop,

    retrace:
      pullback.retrace,
  };
}
