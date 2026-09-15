import type { Candle } from "@/types/market";

export interface MicroMapResult {
  strategy: "MICROMAP";
  direction: "LONG" | "SHORT" | "NONE";
  score: number;
  valid: boolean;
  reasons: string[];
}

export function evaluateMicroMap(candles: Candle[]): MicroMapResult {
  if (candles.length < 12) {
    return {
      strategy: "MICROMAP",
      direction: "NONE",
      score: 0,
      valid: false,
      reasons: ["Not enough M1 data"]
    };
  }

  const recent = candles.slice(-8);
  const rising = recent[recent.length - 1].close > recent[0].close;
  const falling = recent[recent.length - 1].close < recent[0].close;

  if (rising) {
    return {
      strategy: "MICROMAP",
      direction: "LONG",
      score: 55,
      valid: true,
      reasons: ["M1 microstructure currently rising"]
    };
  }

  if (falling) {
    return {
      strategy: "MICROMAP",
      direction: "SHORT",
      score: 55,
      valid: true,
      reasons: ["M1 microstructure currently falling"]
    };
  }

  return {
    strategy: "MICROMAP",
    direction: "NONE",
    score: 0,
    valid: false,
    reasons: ["No directional M1 structure"]
  };
}