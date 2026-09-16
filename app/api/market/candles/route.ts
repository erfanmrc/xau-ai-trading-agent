import { NextResponse } from "next/server";
import { getXauUsdCandles } from "@/data/twelve-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const timeframe = searchParams.get("timeframe") || "M5";
    const outputsize = Number(searchParams.get("outputsize") || "100");

    const intervalMap: Record<string, string> = {
      M1: "1min",
      M5: "5min",
    };

    const interval = intervalMap[timeframe];

    if (!interval) {
      return NextResponse.json(
        {
          ok: false,
          error: "timeframe must be M1 or M5",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(outputsize) ||
      outputsize < 30 ||
      outputsize > 5000
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "outputsize must be an integer between 30 and 5000",
        },
        { status: 400 }
      );
    }

    const candles = await getXauUsdCandles(interval, outputsize);

    return NextResponse.json({
      ok: true,
      symbol: "XAUUSD",
      timeframe,
      count: candles.length,
      candles,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Market candles error",
      },
      { status: 500 }
    );
  }
}
