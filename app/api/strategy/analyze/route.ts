import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  analyze,
} from '@/lib/strategy/engine';

import {
  Candle,
} from '@/lib/strategy/types';

import {
  getXauUsdCandles,
} from '@/data/twelve-data';


function parseTime(
  value: unknown
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string'
  ) {
    const numeric =
      Number(value);

    if (
      Number.isFinite(numeric)
    ) {
      return numeric;
    }

    const parsed =
      Date.parse(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return NaN;
}


function normalizeCandles(
  rawCandles: unknown
): Candle[] {
  if (
    !Array.isArray(rawCandles)
  ) {
    return [];
  }

  return rawCandles

    .map(
      (value: unknown) => {
        const item =
          value as Record<
            string,
            unknown
          >;

        return {
          time:
            parseTime(
              item.time
            ),

          open:
            Number(
              item.open
            ),

          high:
            Number(
              item.high
            ),

          low:
            Number(
              item.low
            ),

          close:
            Number(
              item.close
            ),

          volume:
            item.volume ==
            null
              ? undefined
              : Number(
                  item.volume
                ),
        } satisfies Candle;
      }
    )

    .filter(
      (candle: Candle) =>
        [
          candle.time,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
        ].every(
          Number.isFinite
        )
    )

    .sort(
      (
        a: Candle,
        b: Candle
      ) =>
        a.time -
        b.time
    );
}


export async function GET(
  req: NextRequest
) {
  try {
    const {
      searchParams,
    } = new URL(
      req.url
    );

    const timeframe:
      | 'M1'
      | 'M5' =
        searchParams.get(
          'timeframe'
        ) === 'M5'
          ? 'M5'
          : 'M1';

    const requestedSize =
      Number(
        searchParams.get(
          'outputsize'
        ) || '100'
      );

    const outputsize =
      Number.isInteger(
        requestedSize
      ) &&
      requestedSize >= 30 &&
      requestedSize <= 5000
        ? requestedSize
        : 100;

    const interval =
      timeframe === 'M5'
        ? '5min'
        : '1min';

    const rawCandles =
      await getXauUsdCandles(
        interval,
        outputsize
      );

    const candles =
      normalizeCandles(
        rawCandles
      );

    if (
      candles.length <
      30
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            'Not enough valid market candles',

          count:
            candles.length,
        },
        {
          status: 400,
        }
      );
    }

    const result =
      analyze(
        candles,
        timeframe,
        0
      );

    return NextResponse.json({
      ok: true,

      source:
        'Twelve Data',

      symbol:
        'XAUUSD',

      timeframe,

      count:
        candles.length,

      candles,

      result,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,

        error:
          e instanceof Error
            ? e.message
            : 'Strategy analysis error',
      },
      {
        status: 500,
      }
    );
  }
}


export async function POST(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const candles =
      normalizeCandles(
        body.candles
      );

    if (
      candles.length <
      30
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            'At least 30 valid candles are required',

          count:
            candles.length,
        },
        {
          status: 400,
        }
      );
    }

    const timeframe:
      | 'M1'
      | 'M5' =
        body.timeframe ===
        'M5'
          ? 'M5'
          : 'M1';

    const spreadValue =
      Number(
        body.spread
      );

    const spread =
      Number.isFinite(
        spreadValue
      )
        ? spreadValue
        : 0;

    const result =
      analyze(
        candles,
        timeframe,
        spread
      );

    return NextResponse.json({
      ok: true,

      result,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,

        error:
          e instanceof Error
            ? e.message
            : 'Invalid request body',
      },
      {
        status: 400,
      }
    );
  }
}
