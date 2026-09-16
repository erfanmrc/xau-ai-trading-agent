import {
  Candle,
  Direction,
  MarketState,
  Structure,
} from './types';

import { CONFIG } from './config';

interface SwingPoint {
  index: number;
  price: number;
}

function isSwingHigh(
  candles: Candle[],
  index: number,
  strength: number
): boolean {
  const current = candles[index];

  if (!current) return false;

  for (let i = 1; i <= strength; i++) {
    const left = candles[index - i];
    const right = candles[index + i];

    if (!left || !right) return false;

    if (
      current.high <= left.high ||
      current.high < right.high
    ) {
      return false;
    }
  }

  return true;
}

function isSwingLow(
  candles: Candle[],
  index: number,
  strength: number
): boolean {
  const current = candles[index];

  if (!current) return false;

  for (let i = 1; i <= strength; i++) {
    const left = candles[index - i];
    const right = candles[index + i];

    if (!left || !right) return false;

    if (
      current.low >= left.low ||
      current.low > right.low
    ) {
      return false;
    }
  }

  return true;
}

function detectSwingPoints(
  candles: Candle[]
): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const strength = Math.max(
    1,
    CONFIG.swingStrength
  );

  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  const start = strength;
  const end = candles.length - strength - 1;

  for (let i = start; i <= end; i++) {
    if (
      isSwingHigh(
        candles,
        i,
        strength
      )
    ) {
      highs.push({
        index: i,
        price: candles[i].high,
      });
    }

    if (
      isSwingLow(
        candles,
        i,
        strength
      )
    ) {
      lows.push({
        index: i,
        price: candles[i].low,
      });
    }
  }

  return {
    highs,
    lows,
  };
}

function uniqueRecentPrices(
  points: SwingPoint[],
  limit = 5
): number[] {
  return points
    .slice(-limit)
    .map(point => point.price);
}

function getLastTwo(
  points: SwingPoint[]
): [SwingPoint | null, SwingPoint | null] {
  if (points.length < 2) {
    return [null, null];
  }

  return [
    points[points.length - 2],
    points[points.length - 1],
  ];
}

function classifyTrend(
  highs: SwingPoint[],
  lows: SwingPoint[]
): {
  direction: Direction | null;
  state: MarketState;
  quality: number;
} {
  const [previousHigh, lastHigh] =
    getLastTwo(highs);

  const [previousLow, lastLow] =
    getLastTwo(lows);

  if (
    !previousHigh ||
    !lastHigh ||
    !previousLow ||
    !lastLow
  ) {
    return {
      direction: null,
      state: 'UNCLEAR',
      quality: 0,
    };
  }

  const higherHigh =
    lastHigh.price >
    previousHigh.price;

  const higherLow =
    lastLow.price >
    previousLow.price;

  const lowerHigh =
    lastHigh.price <
    previousHigh.price;

  const lowerLow =
    lastLow.price <
    previousLow.price;

  if (higherHigh && higherLow) {
    return {
      direction: 'LONG',
      state: 'UPTREND',
      quality: 85,
    };
  }

  if (lowerHigh && lowerLow) {
    return {
      direction: 'SHORT',
      state: 'DOWNTREND',
      quality: 85,
    };
  }

  /*
   * Mixed structure:
   *
   * HH + LL
   * LH + HL
   *
   * means the market is not currently
   * providing a clean directional structure.
   */
  if (
    (higherHigh && lowerLow) ||
    (lowerHigh && higherLow)
  ) {
    return {
      direction: null,
      state: 'RANGE',
      quality: 55,
    };
  }

  return {
    direction: null,
    state: 'UNCLEAR',
    quality: 25,
  };
}

function detectBreakout(
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[]
): {
  breakout: 'BULLISH' | 'BEARISH' | 'NONE';
  direction: Direction | null;
  bos: boolean;
} {
  if (candles.length === 0) {
    return {
      breakout: 'NONE',
      direction: null,
      bos: false,
    };
  }

  /*
   * Important:
   * The last detected swing is confirmed because
   * swing detection requires candles on both sides.
   *
   * We compare the latest completed candle against
   * the latest confirmed swing.
   */

  const lastCandle =
    candles[candles.length - 1];

  const lastHigh =
    highs[highs.length - 1];

  const lastLow =
    lows[lows.length - 1];

  if (
    lastHigh &&
    lastCandle.close >
      lastHigh.price
  ) {
    return {
      breakout: 'BULLISH',
      direction: 'LONG',
      bos: true,
    };
  }

  if (
    lastLow &&
    lastCandle.close <
      lastLow.price
  ) {
    return {
      breakout: 'BEARISH',
      direction: 'SHORT',
      bos: true,
    };
  }

  return {
    breakout: 'NONE',
    direction: null,
    bos: false,
  };
}

function calculateRangeQuality(
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[]
): number {
  if (
    highs.length < 2 ||
    lows.length < 2
  ) {
    return 0;
  }

  const recentHighs =
    highs.slice(-3);

  const recentLows =
    lows.slice(-3);

  const highPrices =
    recentHighs.map(x => x.price);

  const lowPrices =
    recentLows.map(x => x.price);

  const highest =
    Math.max(...highPrices);

  const lowest =
    Math.min(...lowPrices);

  const width =
    highest - lowest;

  if (width <= 0) {
    return 0;
  }

  const recentCandles =
    candles.slice(-20);

  if (recentCandles.length === 0) {
    return 0;
  }

  let inside = 0;

  for (const candle of recentCandles) {
    if (
      candle.close >= lowest &&
      candle.close <= highest
    ) {
      inside++;
    }
  }

  const insideRatio =
    inside / recentCandles.length;

  return Math.min(
    100,
    Math.round(
      insideRatio * 100
    )
  );
}

export function detectStructure(
  candles: Candle[]
): Structure {
  if (
    !candles ||
    candles.length <
      CONFIG.swingStrength * 2 + 5
  ) {
    return {
      state: 'UNCLEAR',
      breakout: 'NONE',

      hh: null,
      hl: null,
      lh: null,
      ll: null,

      structureQuality: 0,

      swingHighs: [],
      swingLows: [],

      trendDirection: null,

      bos: false,
      bosDirection: null,
    };
  }

  const lookback =
    Math.min(
      CONFIG.structureLookback,
      candles.length
    );

  const data =
    candles.slice(-lookback);

  const {
    highs,
    lows,
  } = detectSwingPoints(data);

  const recentHighPrices =
    uniqueRecentPrices(
      highs,
      5
    );

  const recentLowPrices =
    uniqueRecentPrices(
      lows,
      5
    );

  const trend =
    classifyTrend(
      highs,
      lows
    );

  const breakout =
    detectBreakout(
      data,
      highs,
      lows
    );

  let state =
    trend.state;

  let quality =
    trend.quality;

  /*
   * A confirmed BOS gives additional structural
   * information, but it does not automatically
   * convert every market into a trend.
   */
  if (breakout.bos) {
    quality = Math.min(
      100,
      quality + 10
    );

    if (
      breakout.direction === 'LONG' &&
      state !== 'DOWNTREND'
    ) {
      state = 'UPTREND';
    }

    if (
      breakout.direction === 'SHORT' &&
      state !== 'UPTREND'
    ) {
      state = 'DOWNTREND';
    }
  }

  /*
   * If structure is mixed and the market spends
   * most of its recent closes inside the structural
   * high/low area, classify it as RANGE.
   */
  if (
    state === 'UNCLEAR' ||
    state === 'RANGE'
  ) {
    const rangeQuality =
      calculateRangeQuality(
        data,
        highs,
        lows
      );

    if (rangeQuality >= 65) {
      state = 'RANGE';

      quality = Math.max(
        quality,
        rangeQuality
      );
    }
  }

  const [previousHigh, lastHigh] =
    getLastTwo(highs);

  const [previousLow, lastLow] =
    getLastTwo(lows);

  let hh: number | null = null;
  let lh: number | null = null;
  let hl: number | null = null;
  let ll: number | null = null;

  if (
    previousHigh &&
    lastHigh
  ) {
    if (
      lastHigh.price >
      previousHigh.price
    ) {
      hh = lastHigh.price;
    } else {
      lh = lastHigh.price;
    }
  }

  if (
    previousLow &&
    lastLow
  ) {
    if (
      lastLow.price >
      previousLow.price
    ) {
      hl = lastLow.price;
    } else {
      ll = lastLow.price;
    }
  }

  /*
   * If the latest swing is not enough to classify
   * a HH/HL/LH/LL sequence, expose the latest
   * structural levels instead of leaving everything
   * empty.
   */
  if (
    hh === null &&
    lh === null &&
    lastHigh
  ) {
    hh = lastHigh.price;
  }

  if (
    hl === null &&
    ll === null &&
    lastLow
  ) {
    hl = lastLow.price;
  }

  return {
    state,

    breakout:
      breakout.breakout,

    hh,
    hl,
    lh,
    ll,

    structureQuality:
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            quality
          )
        )
      ),

    swingHighs:
      recentHighPrices,

    swingLows:
      recentLowPrices,

    trendDirection:
      trend.direction ??
      breakout.direction,

    bos:
      breakout.bos,

    bosDirection:
      breakout.direction,
  };
}
