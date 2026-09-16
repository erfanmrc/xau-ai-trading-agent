import { Direction, RiskPlan } from './types';
import { StrategyConfig } from './config';

export function buildRiskPlan(
  direction: Direction,
  entry: number,
  stopLoss: number,
  spread: number,
  config: StrategyConfig
): RiskPlan {
  /*
   * IMPORTANT:
   * This layer is completely independent from account balance.
   *
   * Risk is expressed only as a percentage of account equity.
   *
   * Example:
   * 0.5% risk means:
   *
   * $1000 account -> $5 risk
   * $2000 account -> $10 risk
   * $10000 account -> $50 risk
   *
   * The actual lot size will be calculated later by the
   * broker/execution layer using the broker's contract specification.
   */

  const riskPercent = config.risk.defaultRiskPercent;

  const rawDistance = Math.abs(entry - stopLoss);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(stopLoss) ||
    rawDistance <= 0
  ) {
    return {
      riskPercent,

      rr: 0,

      entry,

      stopLoss,

      takeProfit: entry,

      stopDistance: 0,

      x2Enabled: false,

      x2Entry: null,

      x2RiskPercent: null,

      combinedRiskPercent: null,

      tradable: false,

      noTradeReason: 'Invalid entry or stop distance',
    };
  }

  /*
   * Spread is added to the effective stop distance.
   *
   * This keeps the risk model conservative.
   */

  const effectiveDistance =
    rawDistance + Math.max(0, spread);

  /*
   * Validate risk percentage.
   */

  if (
    riskPercent <= 0 ||
    riskPercent > config.risk.maxRiskPercent
  ) {
    return {
      riskPercent,

      rr: 0,

      entry,

      stopLoss,

      takeProfit: entry,

      stopDistance: effectiveDistance,

      x2Enabled: false,

      x2Entry: null,

      x2RiskPercent: null,

      combinedRiskPercent: null,

      tradable: false,

      noTradeReason:
        'Configured risk percentage is outside the allowed range',
    };
  }

  /*
   * Keep RR inside configured boundaries.
   */

  const rr = Math.max(
    config.risk.minRR,
    Math.min(
      config.risk.targetRR,
      config.risk.maxRR
    )
  );

  /*
   * Calculate TP from entry and effective stop distance.
   */

  const takeProfit =
    direction === 'LONG'
      ? entry + effectiveDistance * rr
      : entry - effectiveDistance * rr;

  /*
   * X2 logic:
   *
   * X2 is placed approximately at the midpoint between
   * the original entry and original stop.
   *
   * Because the distance to the common SL is approximately
   * half of X1's distance, X2 can use approximately double
   * the volume while keeping approximately the same
   * percentage risk.
   *
   * Therefore:
   *
   * X1 = 0.5%
   * X2 = 0.5%
   * Combined = approximately 1%
   */

  let x2Enabled = false;

  let x2Entry: number | null = null;

  let x2RiskPercent: number | null = null;

  let combinedRiskPercent: number | null = null;

  if (config.risk.x2Enabled) {
    x2Entry =
      direction === 'LONG'
        ? entry - rawDistance / 2
        : entry + rawDistance / 2;

    x2RiskPercent = riskPercent;

    combinedRiskPercent =
      riskPercent + x2RiskPercent;

    /*
     * X2 is allowed only when combined risk is
     * within the configured maximum.
     */

    if (
      combinedRiskPercent <=
      config.risk.maxCombinedRiskPercent
    ) {
      x2Enabled = true;
    } else {
      x2Enabled = false;

      x2Entry = null;

      x2RiskPercent = null;

      combinedRiskPercent = riskPercent;
    }
  }

  return {
    riskPercent,

    rr,

    entry,

    stopLoss,

    takeProfit,

    stopDistance: effectiveDistance,

    x2Enabled,

    x2Entry,

    x2RiskPercent,

    combinedRiskPercent,

    tradable: true,
  };
}
