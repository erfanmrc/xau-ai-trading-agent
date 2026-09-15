import { classifyScore } from "./risk";

export function decide(scores: number[]) {
  const best = Math.max(...scores, 0);
  const grade = classifyScore(best);

  return {
    score: best,
    grade,
    action: grade === "NO_TRADE" ? "WAIT" : "SETUP_DETECTED"
  };
}