import type { Candle } from "@/types/market";

export interface BTBResult {
  strategy: "PRO_BTB";
  direction: "LONG" | "SHORT" | "NONE";
  score: number;
  valid: boolean;
  reasons: string[];
}

export function evaluateProBTB(candles: Candle[]): BTBResult {
  if (candles.length < 12) {
    return {
      strategy: "PRO_BTB",
      direction: "NONE",
      score: 0,
      valid: false,
      reasons: ["Not enough M5 data"]
    };
  }

  const before = candles.slice(-6, -2);
  const trigger = candles[candles.length - 2];
  const current = candles[candles.length - 1];

  const resistance = Math.max(...before.map(c => c.high));
  const support = Math.min(...before.map(c => c.low));

  if (trigger.close > resistance && current.low <= resistance && current.close > resistance) {
    return {
      strategy: "PRO_BTB",
      direction: "LONG",
      score: 65,
      valid: true,
      reasons: ["Breakout + retest/hold condition detected"]
    };
  }

  if (trigger.close < support && current.high >= support && current.close < support) {
    return {
      strategy: "PRO_BTB",
      direction: "SHORT",
      score: 65,
      valid: true,
      reasons: ["Breakout + retest/hold condition detected"]
    };
  }

  return {
    strategy: "PRO_BTB",
    direction: "NONE",
    score: 0,
    valid: false,
    reasons: ["No valid breakout-breakback trigger detected"]
  };
}