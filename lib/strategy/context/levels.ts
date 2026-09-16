import { Candle } from '../types';

export interface MarketLevels {
  previousDayHigh: number | null;
  previousDayLow: number | null;

  sessionHigh: number | null;
  sessionLow: number | null;

  recentHigh: number | null;
  recentLow: number | null;

  equalHighs: number[];
  equalLows: number[];

  resistance: number[];
  support: number[];
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(
    values
      .filter(Number.isFinite)
      .map(value => Number(value.toFixed(5)))
  )].sort((a, b) => a - b);
}

function detectSwingHighs(
  candles: Candle[],
  strength = 2
): number[] {
  const levels: number[] = [];

  for (
    let i = strength;
    i < candles.length - strength;
    i++
  ) {
    const high = candles[i].high;

    let valid = true;

    for (let j = 1; j <= strength; j++) {
      if (
        high <= candles[i - j].high ||
        high <= candles[i + j].high
      ) {
        valid = false;
        break;
      }
    }

    if (valid) {
      levels.push(high);
    }
  }

  return levels;
}

function detectSwingLows(
  candles: Candle[],
  strength = 2
): number[] {
  const levels: number[] = [];

  for (
    let i = strength;
    i < candles.length - strength;
    i++
  ) {
    const low = candles[i].low;

    let valid = true;

    for (let j = 1; j <= strength; j++) {
      if (
        low >= candles[i - j].low ||
        low >= candles[i + j].low
      ) {
        valid = false;
        break;
      }
    }

    if (valid) {
      levels.push(low);
    }
  }

  return levels;
}

function findEqualLevels(
  levels: number[],
  tolerance: number
): number[] {
  const result: number[] = [];

  for (let i = 0; i < levels.length; i++) {
    for (let j = i + 1; j < levels.length; j++) {
      if (
        Math.abs(levels[i] - levels[j]) <= tolerance
      ) {
        result.push(
          (levels[i] + levels[j]) / 2
        );
      }
    }
  }

  return uniqueSorted(result);
}

export function buildMarketLevels(
  candles: Candle[],
  options?: {
    swingStrength?: number;
    equalTolerance?: number;
    recentLookback?: number;
  }
): MarketLevels {
  if (candles.length === 0) {
    return {
      previousDayHigh: null,
      previousDayLow: null,
      sessionHigh: null,
      sessionLow: null,
      recentHigh: null,
      recentLow: null,
      equalHighs: [],
      equalLows: [],
      resistance: [],
      support: [],
    };
  }

  const strength =
    options?.swingStrength ?? 2;

  const recentLookback =
    options?.recentLookback ?? 100;

  const recent = candles.slice(-recentLookback);

  const last =
    recent[recent.length - 1];

  const swingHighs =
    detectSwingHighs(
      recent,
      strength
    );

  const swingLows =
    detectSwingLows(
      recent,
      strength
    );

  const tolerance =
    options?.equalTolerance ??
    Math.max(
      0.05,
      last.close * 0.00015
    );

  const equalHighs =
    findEqualLevels(
      swingHighs,
      tolerance
    );

  const equalLows =
    findEqualLevels(
      swingLows,
      tolerance
    );

  const sessionHigh =
    Math.max(
      ...recent.map(
        candle => candle.high
      )
    );

  const sessionLow =
    Math.min(
      ...recent.map(
        candle => candle.low
      )
    );

  const recentWindow =
    recent.slice(
      Math.max(
        0,
        recent.length - 20
      )
    );

  const recentHigh =
    Math.max(
      ...recentWindow.map(
        candle => candle.high
      )
    );

  const recentLow =
    Math.min(
      ...recentWindow.map(
        candle => candle.low
      )
    );

  /*
   * Current implementation treats the supplied
   * historical window as the available market session.
   *
   * True calendar-day Previous Day High/Low should
   * later be calculated from timestamp boundaries,
   * not from the candle array itself.
   */
  const previousCandles =
    recent.length > 1
      ? recent.slice(0, -1)
      : [];

  const previousDayHigh =
    previousCandles.length > 0
      ? Math.max(
          ...previousCandles.map(
            candle => candle.high
          )
        )
      : null;

  const previousDayLow =
    previousCandles.length > 0
      ? Math.min(
          ...previousCandles.map(
            candle => candle.low
          )
        )
      : null;

  const resistance = uniqueSorted([
    ...swingHighs.filter(
      level => level > last.close
    ),
    ...equalHighs.filter(
      level => level > last.close
    ),
  ]);

  const support = uniqueSorted([
    ...swingLows.filter(
      level => level < last.close
    ),
    ...equalLows.filter(
      level => level < last.close
    ),
  ]);

  return {
    previousDayHigh,
    previousDayLow,

    sessionHigh,
    sessionLow,

    recentHigh,
    recentLow,

    equalHighs,
    equalLows,

    resistance,
    support,
  };
}
