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


interface Impulse {
  high: number;
  low: number;
  range: number;
}


interface PullbackResult {
  index: number;
  retrace: number;
}


interface ConfirmationResult {
  index: number;
  entry: number;
}


function getImpulse(
  candles: Candle[],
  spike: Spike
): Impulse | null {

  if (
    spike.startIndex < 0 ||
    spike.endIndex >= candles.length ||
    spike.startIndex > spike.endIndex
  ) {
    return null;
  }

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

  const range =
    high - low;

  if (
    !Number.isFinite(range) ||
    range <= 0
  ) {
    return null;
  }

  return {
    high,
    low,
    range,
  };
}


/*
 * LONG:
 *
 * 0%   = impulse high
 * 100% = impulse low
 *
 * SHORT:
 *
 * 0%   = impulse low
 * 100% = impulse high
 */
function retracementFromPrice(
  direction: Direction,
  impulse: Impulse,
  price: number
): number {

  if (
    impulse.range <= 0
  ) {
    return 0;
  }

  if (
    direction === 'LONG'
  ) {
    return (
      impulse.high - price
    ) / impulse.range;
  }

  return (
    price - impulse.low
  ) / impulse.range;
}


/*
 * Returns the deepest retracement
 * reached by a candle.
 *
 * LONG  -> candle LOW matters
 * SHORT -> candle HIGH matters
 */
function candleRetracement(
  direction: Direction,
  impulse: Impulse,
  candle: Candle
): number {

  if (
    direction === 'LONG'
  ) {
    return retracementFromPrice(
      direction,
      impulse,
      candle.low
    );
  }

  return retracementFromPrice(
    direction,
    impulse,
    candle.high
  );
}


function isPullbackCandle(
  candle: Candle,
  direction: Direction
): boolean {

  const candleDirection =
    dir(candle);

  if (
    direction === 'LONG'
  ) {
    return (
      candleDirection === 'SHORT' ||
      candle.close < candle.open
    );
  }

  return (
    candleDirection === 'LONG' ||
    candle.close > candle.open
  );
}


function isValidRetracement(
  retrace: number
): boolean {

  return (
    Number.isFinite(retrace) &&
    retrace >=
      CONFIG.pullback.minRetrace &&
    retrace <=
      CONFIG.pullback.maxRetrace
  );
}


/*
 * Confirmation must be a strong candle
 * in the original spike direction.
 */
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
    CONFIG.confirmation.minBodyToRange
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
      CONFIG.confirmation.closeInDirection
    );
  }

  return (
    location <=
      1 -
      CONFIG.confirmation.closeInDirection
  );
}


/*
 * Find the first valid pullback after
 * the spike.
 *
 * The wick is used to determine whether
 * price actually reached the retracement
 * zone. The candle itself must also show
 * a counter-directional pullback.
 */
function findPullback(
  candles: Candle[],
  spike: Spike,
  impulse: Impulse
): PullbackResult | null {

  const startIndex =
    spike.endIndex + 1;

  const maxBars =
    CONFIG.pullback.maxBarsAfterSpike;

  const endIndex =
    Math.min(
      candles.length - 1,
      startIndex + maxBars - 1
    );

  if (
    startIndex > endIndex
  ) {
    return null;
  }

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

    /*
     * If price completely invalidates
     * the impulse before a pullback is
     * established, reject the setup.
     */
    if (
      spike.direction === 'LONG' &&
      candle.low <= impulse.low
    ) {
      return null;
    }

    if (
      spike.direction === 'SHORT' &&
      candle.high >= impulse.high
    ) {
      return null;
    }

    if (
      !isPullbackCandle(
        candle,
        spike.direction
      )
    ) {
      continue;
    }

    const retrace =
      candleRetracement(
        spike.direction,
        impulse,
        candle
      );

    if (
      !isValidRetracement(
        retrace
      )
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


/*
 * Confirmation is searched only for a
 * short period after the pullback.
 *
 * This prevents an old pullback from
 * generating a late entry several candles
 * later.
 */
function findConfirmation(
  candles: Candle[],
  pullbackIndex: number,
  direction: Direction
): ConfirmationResult | null {

  const maxConfirmationBars =
    3;

  const endIndex =
    Math.min(
      candles.length - 1,
      pullbackIndex +
        maxConfirmationBars
    );

  for (
    let i = pullbackIndex + 1;
    i <= endIndex;
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
  }

  return null;
}


/*
 * Stop is placed beyond the actual
 * pullback extreme.
 *
 * We intentionally do not add a hardcoded
 * pip amount here because XAUUSD pricing
 * and broker specifications belong to the
 * execution/risk layer.
 */
function calculateStop(
  direction: Direction,
  candles: Candle[],
  pullbackIndex: number
): number | null {

  const pullback =
    candles[pullbackIndex];

  if (!pullback) {
    return null;
  }

  if (
    direction === 'LONG'
  ) {
    return pullback.low;
  }

  return pullback.high;
}


/*
 * Make sure confirmation did not occur
 * after the setup had already invalidated.
 */
function confirmationIsValid(
  direction: Direction,
  candles: Candle[],
  pullbackIndex: number,
  confirmationIndex: number,
  stop: number
): boolean {

  for (
    let i =
      pullbackIndex + 1;
    i <= confirmationIndex;
    i++
  ) {

    const candle =
      candles[i];

    if (!candle) {
      continue;
    }

    if (
      direction === 'LONG' &&
      candle.low <= stop
    ) {
      return false;
    }

    if (
      direction === 'SHORT' &&
      candle.high >= stop
    ) {
      return false;
    }
  }

  return true;
}


export function detectLeg2(
  candles: Candle[],
  spike: Spike
): Leg2 {

  const direction =
    spike.direction;

  const impulse =
    getImpulse(
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

  /*
   * Step 1:
   * Find a valid retracement.
   */
  const pullback =
    findPullback(
      candles,
      spike,
      impulse
    );

  if (!pullback) {
    return {
      direction,
      confirmed: false,
      pullback: false,
    };
  }

  /*
   * Step 2:
   * Wait for directional confirmation.
   */
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

  /*
   * Step 3:
   * Determine the actual pullback
   * invalidation level.
   */
  const stop =
    calculateStop(
      direction,
      candles,
      pullback.index
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
   * Step 4:
   * Validate the entire move from
   * pullback to confirmation.
   */
  const validConfirmation =
    confirmationIsValid(
      direction,
      candles,
      pullback.index,
      confirmation.index,
      stop
    );

  if (
    !validConfirmation
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
   * Step 5:
   * Final directional sanity check.
   */
  if (
    direction === 'LONG' &&
    confirmation.entry <= stop
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
    confirmation.entry >= stop
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
