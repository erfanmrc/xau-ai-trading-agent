import {
  CONFIG,
} from './config';

import {
  Candle,
  Structure,
} from './types';

function findRecentHigh(
  candles: Candle[],
  strength: number
): number | null {
  for (
    let i =
      candles.length -
      strength -
      1;

    i >= strength;

    i -= 1
  ) {
    const high =
      candles[i].high;

    let valid = true;

    for (
      let k = 1;
      k <= strength;
      k += 1
    ) {
      if (
        high <=
          candles[
            i - k
          ].high ||
        high <=
          candles[
            i + k
          ].high
      ) {
        valid = false;

        break;
      }
    }

    if (valid) {
      return high;
    }
  }

  return null;
}

function findRecentLow(
  candles: Candle[],
  strength: number
): number | null {
  for (
    let i =
      candles.length -
      strength -
      1;

    i >= strength;

    i -= 1
  ) {
    const low =
      candles[i].low;

    let valid = true;

    for (
      let k = 1;
      k <= strength;
      k += 1
    ) {
      if (
        low >=
          candles[
            i - k
          ].low ||
        low >=
          candles[
            i + k
          ].low
      ) {
        valid = false;

        break;
      }
    }

    if (valid) {
      return low;
    }
  }

  return null;
}

export function detectStructure(
  candles: Candle[]
): Structure {
  const empty: Structure = {
    state: 'UNCLEAR',

    breakout: 'NONE',

    hh: null,

    hl: null,

    lh: null,

    ll: null,
  };

  if (
    candles.length <
    Math.max(
      10,
      CONFIG.swingStrength *
        2 +
        5
    )
  ) {
    return empty;
  }

  const sample =
    candles.slice(
      -CONFIG.structureLookback
    );

  const last =
    sample[
      sample.length - 1
    ];

  const previous =
    sample[
      sample.length - 2
    ];

  const highs =
    sample.map(
      (c) => c.high
    );

  const lows =
    sample.map(
      (c) => c.low
    );

  const history =
    Math.max(
      1,
      sample.length - 5
    );

  const previousHigh =
    Math.max(
      ...highs.slice(
        0,
        history
      )
    );

  const previousLow =
    Math.min(
      ...lows.slice(
        0,
        history
      )
    );

  let breakout:
    Structure['breakout'] =
      'NONE';

  if (
    last.close >
    previousHigh
  ) {
    breakout =
      'BULLISH';
  } else if (
    last.close <
    previousLow
  ) {
    breakout =
      'BEARISH';
  }

  const overallHigh =
    Math.max(
      ...highs
    );

  const overallLow =
    Math.min(
      ...lows
    );

  let state:
    Structure['state'] =
    'RANGE';

  if (
    breakout ===
    'BULLISH'
  ) {
    state =
      'UPTREND';
  } else if (
    breakout ===
    'BEARISH'
  ) {
    state =
      'DOWNTREND';
  } else if (
    last.close >
      overallHigh
  ) {
    state =
      'UPTREND';
  } else if (
    last.close <
      overallLow
  ) {
    state =
      'DOWNTREND';
  } else if (
    previous.close >
      previous.open &&
    last.close >=
      previous.close
  ) {
    state =
      'UPTREND';
  } else if (
    previous.close <
      previous.open &&
    last.close <=
      previous.close
  ) {
    state =
      'DOWNTREND';
  }

  const recentHigh =
    findRecentHigh(
      sample,
      CONFIG.swingStrength
    );

  const recentLow =
    findRecentLow(
      sample,
      CONFIG.swingStrength
    );

  return {
    state,

    breakout,

    hh: recentHigh,

    hl: recentLow,

    lh: recentHigh,

    ll: recentLow,
  };
}
