import {
  Candle,
  Direction,
} from './types';

export function range(
  candle: Candle
): number {
  return Math.max(
    0,
    candle.high - candle.low
  );
}

export function body(
  candle: Candle
): number {
  return Math.abs(
    candle.close - candle.open
  );
}

export function bodyRatio(
  candle: Candle
): number {
  const r = range(candle);

  if (r <= 0) {
    return 0;
  }

  return body(candle) / r;
}

export function closeLocation(
  candle: Candle
): number {
  const r = range(candle);

  if (r <= 0) {
    return 0.5;
  }

  return (
    (candle.close - candle.low) / r
  );
}

export function dir(
  candle: Candle
): Direction | null {
  if (
    candle.close >
    candle.open
  ) {
    return 'LONG';
  }

  if (
    candle.close <
    candle.open
  ) {
    return 'SHORT';
  }

  return null;
}

export function median(
  values: number[]
): number {
  if (
    values.length === 0
  ) {
    return 0;
  }

  const sorted = [
    ...values,
  ].sort(
    (a, b) => a - b
  );

  const middle =
    Math.floor(
      sorted.length / 2
    );

  if (
    sorted.length % 2 === 0
  ) {
    return (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2;
  }

  return sorted[middle];
}

export function medianRange(
  candles: Candle[],
  length = 20
): number {
  const values =
    candles
      .slice(
        -Math.max(
          1,
          length
        )
      )
      .map(
        range
      );

  return median(values);
}

export function atr(
  candles: Candle[],
  length = 14
): number {
  if (
    candles.length < 2
  ) {
    return medianRange(
      candles,
      length
    );
  }

  const start =
    Math.max(
      1,
      candles.length -
        Math.max(
          1,
          length
        )
    );

  const trueRanges: number[] =
    [];

  for (
    let i = start;
    i < candles.length;
    i += 1
  ) {
    const current =
      candles[i];

    const previousClose =
      candles[
        i - 1
      ].close;

    const tr =
      Math.max(
        current.high -
          current.low,

        Math.abs(
          current.high -
            previousClose
        ),

        Math.abs(
          current.low -
            previousClose
        )
      );

    trueRanges.push(tr);
  }

  return (
    median(
      trueRanges
    ) ||
    medianRange(
      candles,
      length
    ) ||
    0
  );
}
