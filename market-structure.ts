import type { Candle } from "@/types/market";

export function detectTrend(candles: Candle[]) {
  if (candles.length < 10) return "UNKNOWN" as const;

  const recent = candles.slice(-10);
  const first = recent[0].close;
  const last = recent[recent.length - 1].close;

  if (last > first) return "BULLISH" as const;
  if (last < first) return "BEARISH" as const;
  return "RANGE" as const;
}

export function getRecentLevels(candles: Candle[]) {
  const recent = candles.slice(-50);
  if (!recent.length) {
    return { high: null, low: null };
  }

  return {
    high: Math.max(...recent.map(c => c.high)),
    low: Math.min(...recent.map(c => c.low))
  };
}