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


    /*
     * ============================
     * CANDLE NORMALIZATION
     * ============================
     */

    const candles =
      (body.candles || [])

        .map(
          (x: any) => ({

            time:
              Number(x.time),

            open:
              Number(x.open),

            high:
              Number(x.high),

            low:
              Number(x.low),

            close:
              Number(x.close),

            volume:
              x.volume == null
                ? undefined
                : Number(x.volume),
          })
        )

        .filter(
          (x: Candle) =>
            [
              x.time,
              x.open,
              x.high,
              x.low,
              x.close,
            ].every(
              Number.isFinite
            )
        )

        .sort(
          (
            a: Candle,
            b: Candle
          ) =>
            a.time - b.time
        );


    /*
     * Minimum candles
     */

    if (
      candles.length < 30
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


    /*
     * Timeframe
     */

    const timeframe:
      'M1' | 'M5' =

        body.timeframe === 'M5'
          ? 'M5'
          : 'M1';


    /*
     * Spread
     */

    const spread =
      Number.isFinite(
        Number(body.spread)
      )
        ? Number(body.spread)
        : 0;


    /*
     * ============================
     * STRATEGY ENGINE
     * ============================
     *
     * IMPORTANT:
     *
     * There is NO balance here.
     *
     * The strategy only knows:
     *
     * - price
     * - structure
     * - setup
     * - spread
     * - risk percentage
     *
     */

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
