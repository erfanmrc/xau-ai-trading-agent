import { CONFIG } from './config';
import { Candle, Structure, MarketState } from './types';


interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
}


function isSwingHigh(
  candles: Candle[],
  index: number,
  strength: number
): boolean {
  const current = candles[index];

  for (let i = 1; i <= strength; i++) {
    if (
      current.high <= candles[index - i].high ||
      current.high < candles[index + i].high
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

  for (let i = 1; i <= strength; i++) {
    if (
      current.low >= candles[index - i].low ||
      current.low > candles[index + i].low
    ) {
      return false;
    }
  }

  return true;
}


function detectSwings(
  candles: Candle[]
): SwingPoint[] {
  const strength =
    CONFIG.swingStrength;

  const swings: SwingPoint[] = [];

  for (
    let i = strength;
    i < candles.length - strength;
    i++
  ) {
    if (
      isSwingHigh(
        candles,
        i,
        strength
      )
    ) {
      swings.push({
        index: i,
        price: candles[i].high,
        type: 'HIGH',
      });
    }

    if (
      isSwingLow(
        candles,
        i,
        strength
      )
    ) {
      swings.push({
        index: i,
        price: candles[i].low,
        type: 'LOW',
      });
    }
  }

  return swings.sort(
    (a, b) =>
      a.index - b.index
  );
}


function getRecentSwings(
  swings: SwingPoint[],
  candlesLength: number
): SwingPoint[] {
  const lookback =
    CONFIG.structureLookback;

  const minimumIndex =
    Math.max(
      0,
      candlesLength - lookback
    );

  return swings.filter(
    swing =>
      swing.index >=
      minimumIndex
  );
}


function getLastTwo(
  swings: SwingPoint[],
  type: 'HIGH' | 'LOW'
): SwingPoint[] {
  return swings
    .filter(
      swing =>
        swing.type === type
    )
    .slice(-2);
}


function detectMarketState(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentClose: number
): MarketState {
  if (
    highs.length < 2 ||
    lows.length < 2
  ) {
    return 'UNCLEAR';
  }

  const previousHigh =
    highs[highs.length - 2];

  const latestHigh =
    highs[highs.length - 1];

  const previousLow =
    lows[lows.length - 2];

  const latestLow =
    lows[lows.length - 1];


  const higherHigh =
    latestHigh.price >
    previousHigh.price;

  const higherLow =
    latestLow.price >
    previousLow.price;

  const lowerHigh =
    latestHigh.price <
    previousHigh.price;

  const lowerLow =
    latestLow.price <
    previousLow.price;


  if (
    higherHigh &&
    higherLow
  ) {
    return 'UPTREND';
  }


  if (
    lowerHigh &&
    lowerLow
  ) {
    return 'DOWNTREND';
  }


  /*
   * اگر ساختار کاملاً روندی نیست،
   * در صورتی که قیمت بین آخرین Swing High
   * و Swing Low قرار داشته باشد، بازار را Range
   * در نظر می‌گیریم.
   */

  const rangeHigh =
    latestHigh.price;

  const rangeLow =
    latestLow.price;

  const rangeSize =
    rangeHigh -
    rangeLow;


  if (
    rangeSize > 0 &&
    currentClose <= rangeHigh &&
    currentClose >= rangeLow
  ) {
    return 'RANGE';
  }


  return 'UNCLEAR';
}


function detectBreakout(
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[]
):
  | 'BULLISH'
  | 'BEARISH'
  | 'NONE' {

  if (
    candles.length === 0
  ) {
    return 'NONE';
  }

  const lastCandle =
    candles[candles.length - 1];

  const latestHigh =
    highs[highs.length - 1];

  const latestLow =
    lows[lows.length - 1];


  if (
    latestHigh &&
    lastCandle.close >
      latestHigh.price
  ) {
    return 'BULLISH';
  }


  if (
    latestLow &&
    lastCandle.close <
      latestLow.price
  ) {
    return 'BEARISH';
  }


  return 'NONE';
}


export function detectStructure(
  candles: Candle[]
): Structure {

  if (
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
    };
  }


  const swings =
    detectSwings(candles);


  const recentSwings =
    getRecentSwings(
      swings,
      candles.length
    );


  const highs =
    getLastTwo(
      recentSwings,
      'HIGH'
    );


  const lows =
    getLastTwo(
      recentSwings,
      'LOW'
    );


  const currentClose =
    candles[candles.length - 1]
      .close;


  const state =
    detectMarketState(
      highs,
      lows,
      currentClose
    );


  const breakout =
    detectBreakout(
      candles,
      highs,
      lows
    );


  let hh:
    number | null = null;

  let hl:
    number | null = null;

  let lh:
    number | null = null;

  let ll:
    number | null = null;


  if (
    highs.length >= 2
  ) {
    const previousHigh =
      highs[highs.length - 2];

    const latestHigh =
      highs[highs.length - 1];


    if (
      latestHigh.price >
      previousHigh.price
    ) {
      hh =
        latestHigh.price;
    } else {
      lh =
        latestHigh.price;
    }
  }


  if (
    lows.length >= 2
  ) {
    const previousLow =
      lows[lows.length - 2];

    const latestLow =
      lows[lows.length - 1];


    if (
      latestLow.price >
      previousLow.price
    ) {
      hl =
        latestLow.price;
    } else {
      ll =
        latestLow.price;
    }
  }


  return {
    state,
    breakout,
    hh,
    hl,
    lh,
    ll,
  };
}
