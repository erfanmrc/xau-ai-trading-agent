import { getCandles, getQuote } from "@/data/twelve-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const symbol = process.env.TWELVE_DATA_SYMBOL || "XAU/USD";

    const [quote, m1, m5, m15, h1, h4, d1] = await Promise.all([
      getQuote(symbol),
      getCandles(symbol, "1min", 120),
      getCandles(symbol, "5min", 120),
      getCandles(symbol, "15min", 120),
      getCandles(symbol, "1h", 120),
      getCandles(symbol, "4h", 120),
      getCandles(symbol, "1day", 120)
    ]);

    return Response.json({
      ok: true,
      symbol,
      fetchedAt: new Date().toISOString(),
      quote,
      candles: { m1, m5, m15, h1, h4, d1 }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}