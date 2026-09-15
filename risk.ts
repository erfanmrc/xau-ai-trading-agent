export type RiskGrade = "A+" | "A" | "B" | "NO_TRADE";

export interface RiskInput {
  balance: number;
  entry: number;
  stop: number;
  riskPercent: number;
  tickSize: number;
  tickValuePerLot: number;
  minLot?: number;
  lotStep?: number;
}

export function calculateLot(input: RiskInput) {
  const {
    balance,
    entry,
    stop,
    riskPercent,
    tickSize,
    tickValuePerLot,
    minLot = 0.01,
    lotStep = 0.01
  } = input;

  const riskMoney = balance * (riskPercent / 100);
  const distance = Math.abs(entry - stop);

  if (distance <= 0 || tickSize <= 0 || tickValuePerLot <= 0) {
    throw new Error("Invalid risk parameters");
  }

  const lossPerLot = (distance / tickSize) * tickValuePerLot;
  const rawLot = riskMoney / lossPerLot;

  const stepped = Math.floor(rawLot / lotStep) * lotStep;
  return Math.max(minLot, Number(stepped.toFixed(2)));
}

export function classifyScore(score: number): RiskGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  return "NO_TRADE";
}