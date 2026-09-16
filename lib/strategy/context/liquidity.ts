import {
  Candle,
  LiquidityMap,
} from '../types';

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map(v => Number(v.toFixed(5))))]
    .sort((a, b) => a - b);
}

function findEqualLevels(
  levels: number[],
  tolerance: number
): number[] {
  const result: number[] = [];

  for (let i = 0; i < levels.length; i++) {
    for (let j = i + 1; j < levels.length; j++) {
      if (Math.abs(levels[i] - levels[j]) <= tolerance) {
        result.push((levels[i] + levels[j]) / 2);
      }
    }
  }

  return uniqueSorted(result);
}

function detectSwingHighs(
  candles: Candle[],
  strength = 2
): number[] {
  const result: number[] = [];

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
      result.push(high);
    }
  }

  return result;
}

function detectSwingLows(
  candles: Candle[],
  strength = 2
): number[] {
  const result: number[] = [];

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
      result.push(low);
    }
  }

  return result;
}

function detectFVGs(
  candles: Candle[]
) {
  const zones: LiquidityMap['imbalanceZones'] = [];

  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];

    // Bullish FVG
    if (a.high < c.low) {
      zones.push({
        direction: 'LONG',
        high: c.low,
        low: a.high,
        startIndex: i - 2,
        endIndex: i,
      });
    }

    // Bearish FVG
    if (a.low > c.high) {
      zones.push({
        direction: 'SHORT',
        high: a.low,
        low: c.high,
        startIndex: i - 2,
        endIndex: i,
      });
    }
  }

  return zones;
}

export function buildLiquidityMap(
  candles: Candle[],
  options?: {
    swingStrength?: number;
    equalTolerance?: number;
  }
): LiquidityMap {
  if (candles.length === 0) {
    return {
      buySide: [],
      sellSide: [],
      previousDayHigh: null,
      previousDayLow: null,
      sessionHigh: null,
      sessionLow: null,
      equalHighs: [],
      equalLows: [],
      imbalanceZones: [],
      spikeZones: [],
    };
  }

  const strength = options?.swingStrength ?? 2;

  const recent = candles.slice(-200);

  const highs = detectSwingHighs(
    recent,
    strength
  );

  const lows = detectSwingLows(
    recent,
    strength
  );

  const tolerance =
    options?.equalTolerance ??
    Math.max(
      0.05,
      (recent[recent.length - 1].close || 1) *
        0.00015
    );

  const equalHighs = findEqualLevels(
    highs,
    tolerance
  );

  const equalLows = findEqualLevels(
    lows,
    tolerance
  );

  const last = recent[recent.length - 1];

  const previous = recent
    .slice(0, -1);

  const previousDayHigh =
    previous.length > 0
      ? Math.max(...previous.map(c => c.high))
      : null;

  const previousDayLow =
    previous.length > 0
      ? Math.min(...previous.map(c => c.low))
      : null;

  const sessionHigh =
    Math.max(...recent.map(c => c.high));

  const sessionLow =
    Math.min(...recent.map(c => c.low));

  const currentPrice = last.close;

  const buySide = uniqueSorted([
    ...highs.filter(x => x > currentPrice),
    ...equalHighs.filter(x => x > currentPrice),
  ]);

  const sellSide = uniqueSorted([
    ...lows.filter(x => x < currentPrice),
    ...equalLows.filter(x => x < currentPrice),
  ]);

  return {
    buySide,
    sellSide,

    previousDayHigh,
    previousDayLow,

    sessionHigh,
    sessionLow,

    equalHighs,
    equalLows,

    imbalanceZones: detectFVGs(recent),

    spikeZones: [],
  };
}
