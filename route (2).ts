import { getCandles, getQuote } from "@/data/twelve-data";
import { detectTrend, getRecentLevels } from "@/engine/market-structure";
import { evaluateSP2L } from "@/agents/sp2l";
import { evaluateProBTB } from "@/agents/pro-btb";
import { evaluateMicroMap } from "@/agents/micromap";
import { decide } from "@/engine/decision";
import { sendTelegramMessage } from "@/telegram/bot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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

    const sp2l = evaluateSP2L(m5);
    const btb = evaluateProBTB(m5);
    const micromap = evaluateMicroMap(m1);

    const decision = decide([
      sp2l.valid ? sp2l.score : 0,
      btb.valid ? btb.score : 0,
      micromap.valid ? micromap.score : 0
    ]);

    const h4Trend = detectTrend(h4);
    const h1Trend = detectTrend(h1);
    const m15Levels = getRecentLevels(m15);

    const message = [
      `🟡 <b>XAUUSD AI MORNING REPORT</b>`,
      ``,
      `Price: <b>${quote.price}</b>`,
      `H4: ${h4Trend}`,
      `H1: ${h1Trend}`,
      `M15 High: ${m15Levels.high ?? "-"}`,
      `M15 Low: ${m15Levels.low ?? "-"}`,
      ``,
      `<b>Independent strategies</b>`,
      `SP2L: ${sp2l.valid ? sp2l.direction : "WAIT"} (${sp2l.score})`,
      `PRO BTB: ${btb.valid ? btb.direction : "WAIT"} (${btb.score})`,
      `MicroMap: ${micromap.valid ? micromap.direction : "WAIT"} (${micromap.score})`,
      ``,
      `<b>Decision</b>: ${decision.action}`,
      `Grade: ${decision.grade}`,
      `Score: ${decision.score}`,
      ``,
      `⚠️ This first build does not place orders automatically.`
    ].join("\\n");

    await sendTelegramMessage(message);

    return Response.json({
      ok: true,
      decision,
      strategies: { sp2l, btb, micromap },
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}