import type { Candle } from "@/types/market";

export interface StrategyResult {
  strategy: "SP2L";
  direction: "LONG" | "SHORT" | "NONE";
  score: number;
  valid: boolean;
  reasons: string[];
}

export function evaluateSP2L(candles: Candle[]): StrategyResult {
  if (candles.length < 20) {
    return {
      strategy: "SP2L",
      direction: "NONE",
      score: 0,
      valid: false,
      reasons: ["Not enough M5 data"]
    };
  }

  const c = candles.slice(-10);
  const prevHigh = Math.max(...c.slice(0, -2).map(x => x.high));
  const prevLow = Math.min(...c.slice(0, -2).map(x => x.low));
  const last = c[c.length - 1];

  const bullishBreak = last.close > prevHigh;
  const bearishBreak = last.close < prevLow;

  if (bullishBreak) {
    return {
      strategy: "SP2L",
      direction: "LONG",
      score: 60,
      valid: true,
      reasons: ["Recent M5 displacement/break condition detected"]
    };
  }

  if (bearishBreak) {
    return {
      strategy: "SP2L",
      direction: "SHORT",
      score: 60,
      valid: true,
      reasons: ["Recent M5 displacement/break condition detected"]
    };
  }

  return {
    strategy: "SP2L",
    direction: "NONE",
    score: 0,
    valid: false,
    reasons: ["No valid trigger detected"]
  };
}