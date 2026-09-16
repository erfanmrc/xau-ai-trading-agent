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

export async function GET() {
  return NextResponse.json({
    ok: true,

    endpoint:
      '/api/strategy/analyze',

    method:
      'POST',

    body: {
      candles:
        'Candle[]',

      timeframe:
        'M1|M5',

      spread:
        'number?',
    },

    riskModel: {
      balanceIndependent:
        true,

      defaultRiskPercent:
        0.5,

      maxRiskPercent:
        1,

      maxCombinedRiskPercent:
        1,
    },
  });
}

export async function POST(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const rawCandles =
      Array.isArray(
        body.candles
      )
        ? body.candles
        : [];

    const candles =
      rawCandles

        .map(
          (value: unknown) => {
            const item =
              value as Record<
                string,
                unknown
              >;

            return {
              time:
                Number(
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

    if (
      candles.length <
      30
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            'At least 30 candles are required',
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
  } catch {
    return NextResponse.json(
      {
        ok: false,

        error:
          'Invalid request body',
      },
      {
        status: 400,
      }
    );
  }
}
