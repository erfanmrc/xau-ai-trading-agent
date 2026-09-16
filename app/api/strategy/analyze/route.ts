import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  analyze,
  analyzeMultiTimeframe,
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
            item.volume == null
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


function getOutputSize(
  value: string | null,
  fallback = 200
): number {

  const requested =
    Number(
      value ||
        String(fallback)
    );

  if (
    !Number.isInteger(
      requested
    )
  ) {
    return fallback;
  }

  if (
    requested < 30 ||
    requested > 5000
  ) {
    return fallback;
  }

  return requested;
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

    /*
     * M1 mode is retained for
     * debugging/backward compatibility.
     *
     * Default mode is now MTF.
     */

    const mode =
      searchParams.get(
        'mode'
      ) || 'mtf';

    const requestedSize =
      getOutputSize(
        searchParams.get(
          'outputsize'
        ),
        200
      );

    const spreadValue =
      Number(
        searchParams.get(
          'spread'
        )
      );

    const spread =
      Number.isFinite(
        spreadValue
      )
        ? spreadValue
        : 0;


    /*
     * M1-only analysis.
     */

    if (
      mode === 'm1'
    ) {

      const rawCandles =
        await getXauUsdCandles(
          '1min',
          requestedSize
        );

      const candles =
        normalizeCandles(
          rawCandles
        );

      if (
        candles.length < 30
      ) {

        return NextResponse.json(
          {
            ok: false,

            error:
              'Not enough valid M1 market candles',

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
          'M1',
          spread
        );

      return NextResponse.json({
        ok: true,

        mode: 'm1',

        source:
          'Twelve Data',

        symbol:
          'XAUUSD',

        timeframe:
          'M1',

        count:
          candles.length,

        result,
      });
    }


    /*
     * Default:
     *
     * M5 = Context
     * M1 = Trigger
     */

    const [
      rawM5,
      rawM1,
    ] = await Promise.all([
      getXauUsdCandles(
        '5min',
        requestedSize
      ),

      getXauUsdCandles(
        '1min',
        requestedSize
      ),
    ]);


    const m5Candles =
      normalizeCandles(
        rawM5
      );

    const m1Candles =
      normalizeCandles(
        rawM1
      );


    if (
      m5Candles.length < 30 ||
      m1Candles.length < 30
    ) {

      return NextResponse.json(
        {
          ok: false,

          error:
            'Not enough valid M5/M1 market candles',

          m5Count:
            m5Candles.length,

          m1Count:
            m1Candles.length,
        },
        {
          status: 400,
        }
      );
    }


    const analysis =
      analyzeMultiTimeframe(
        m5Candles,
        m1Candles,
        spread
      );


    return NextResponse.json({

      ok: true,

      mode:
        'mtf',

      source:
        'Twelve Data',

      symbol:
        'XAUUSD',

      timeframes: {
        context:
          'M5',

        trigger:
          'M1',
      },

      counts: {
        M5:
          m5Candles.length,

        M1:
          m1Candles.length,
      },

      m5:
        analysis.m5,

      m1:
        analysis.m1,

      result:
        analysis.final,
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


    /*
     * MTF POST:
     *
     * {
     *   m5Candles: [...],
     *   m1Candles: [...]
     * }
     */

    if (
      Array.isArray(
        body.m5Candles
      ) &&
      Array.isArray(
        body.m1Candles
      )
    ) {

      const m5Candles =
        normalizeCandles(
          body.m5Candles
        );

      const m1Candles =
        normalizeCandles(
          body.m1Candles
        );

      if (
        m5Candles.length < 30 ||
        m1Candles.length < 30
      ) {

        return NextResponse.json(
          {
            ok: false,

            error:
              'At least 30 valid candles are required for both M5 and M1',

            m5Count:
              m5Candles.length,

            m1Count:
              m1Candles.length,
          },
          {
            status: 400,
          }
        );
      }

      const analysis =
        analyzeMultiTimeframe(
          m5Candles,
          m1Candles,
          spread
        );

      return NextResponse.json({
        ok: true,

        mode:
          'mtf',

        result:
          analysis.final,

        m5:
          analysis.m5,

        m1:
          analysis.m1,
      });
    }


    /*
     * M1-only POST remains available
     * for isolated strategy testing.
     */

    const candles =
      normalizeCandles(
        body.candles
      );

    if (
      candles.length < 30
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


    const result =
      analyze(
        candles,
        timeframe,
        spread
      );


    return NextResponse.json({
      ok: true,

      mode:
        'single',

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
