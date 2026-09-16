import {
  Direction,
  RiskPlan,
} from './types';

import {
  CONFIG,
  StrategyConfig,
} from './config';

function roundPrice(
  value: number,
  decimals = 2
): number {
  const factor =
    Math.pow(10, decimals);

  return (
    Math.round(value * factor) /
    factor
  );
}

function isValidNumber(
  value: number
): boolean {
  return (
    Number.isFinite(value) &&
    value > 0
  );
}

function getDirectionDistance(
  direction: Direction,
  entry: number,
  stopLoss: number
): number {
  if (
    direction === 'LONG'
  ) {
    return entry - stopLoss;
  }

  return stopLoss - entry;
}

function calculateX2Entry(
  direction: Direction,
  entry: number,
  stopLoss: number
): number {
  /*
   * X2 is exactly halfway between X1 entry
   * and the common stop.
   *
   * LONG:
   * Entry > X2 > SL
   *
   * SHORT:
   * Entry < X2 < SL
   */

  return roundPrice(
    (entry + stopLoss) / 2
  );
}

function calculateTakeProfit(
  direction: Direction,
  entry: number,
  stopDistance: number,
  rr: number
): number {
  if (
    direction === 'LONG'
  ) {
    return roundPrice(
      entry +
      stopDistance * rr
    );
  }

  return roundPrice(
    entry -
    stopDistance * rr
  );
}

function validateDirection(
  direction: Direction,
  entry: number,
  stopLoss: number
): boolean {
  if (
    direction === 'LONG'
  ) {
    return stopLoss < entry;
  }

  return stopLoss > entry;
}

function calculateRR(
  direction: Direction,
  entry: number,
  stopLoss: number,
  takeProfit: number
): number {
  const stopDistance =
    Math.abs(
      entry - stopLoss
    );

  if (
    stopDistance <= 0
  ) {
    return 0;
  }

  const reward =
    direction === 'LONG'
      ? takeProfit - entry
      : entry - takeProfit;

  if (
    reward <= 0
  ) {
    return 0;
  }

  return reward / stopDistance;
}

export function buildRiskPlan(
  direction: Direction,
  entry: number,
  stopLoss: number,
  spread = 0,
  config:
    | StrategyConfig
    | typeof CONFIG =
      CONFIG
): RiskPlan {
  /*
   * ------------------------------------------------
   * 1. Basic validation
   * ------------------------------------------------
   */

  if (
    !isValidNumber(entry) ||
    !isValidNumber(stopLoss)
  ) {
    return {
      riskPercent:
        config.risk.defaultRiskPercent,

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

      noTradeReason:
        'Invalid entry or stop loss',
    };
  }

  if (
    !validateDirection(
      direction,
      entry,
      stopLoss
    )
  ) {
    return {
      riskPercent:
        config.risk.defaultRiskPercent,

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

      noTradeReason:
        'Stop loss is on the wrong side of entry',
    };
  }

  /*
   * ------------------------------------------------
   * 2. Spread
   * ------------------------------------------------
   *
   * Spread is added conservatively to the
   * effective risk distance.
   */

  const safeSpread =
    Number.isFinite(spread) &&
    spread > 0
      ? spread
      : 0;

  const rawStopDistance =
    Math.abs(
      entry - stopLoss
    );

  const effectiveStopDistance =
    rawStopDistance +
    safeSpread;

  if (
    effectiveStopDistance <= 0
  ) {
    return {
      riskPercent:
        config.risk.defaultRiskPercent,

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

      noTradeReason:
        'Invalid stop distance',
    };
  }

  /*
   * ------------------------------------------------
   * 3. Risk percentage
   * ------------------------------------------------
   */

  const riskPercent =
    Math.min(
      config.risk.defaultRiskPercent,
      config.risk.maxRiskPercent
    );

  /*
   * ------------------------------------------------
   * 4. RR
   * ------------------------------------------------
   *
   * Keep RR inside the configured range.
   */

  const rr =
    Math.max(
      config.risk.minRR,
      Math.min(
        config.risk.targetRR,
        config.risk.maxRR
      )
    );

  /*
   * ------------------------------------------------
   * 5. Take Profit
   * ------------------------------------------------
   */

  const takeProfit =
    calculateTakeProfit(
      direction,
      entry,
      effectiveStopDistance,
      rr
    );

  const actualRR =
    calculateRR(
      direction,
      entry,
      stopLoss,
      takeProfit
    );

  /*
   * ------------------------------------------------
   * 6. X2
   * ------------------------------------------------
   */

  let x2Enabled =
    false;

  let x2Entry:
    | number
    | null = null;

  let x2RiskPercent:
    | number
    | null = null;

  let combinedRiskPercent:
    | number
    | null = null;

  if (
    config.risk.x2Enabled
  ) {
    const candidateX2 =
      calculateX2Entry(
        direction,
        entry,
        stopLoss
      );

    const x2Distance =
      Math.abs(
        candidateX2 -
        stopLoss
      );

    /*
     * Because X2 uses 2x X1 volume and its
     * distance to the common SL is approximately
     * half of X1's distance:
     *
     * X2 risk ≈ X1 risk.
     */

    const estimatedX2Risk =
      riskPercent *
      (
        (
          x2Distance /
          rawStopDistance
        ) *
        config.risk.x2VolumeMultiplier
      );

    const estimatedCombinedRisk =
      riskPercent +
      estimatedX2Risk;

    if (
      x2Distance > 0 &&
      estimatedCombinedRisk <=
        config.risk.maxCombinedRiskPercent
    ) {
      x2Enabled =
        true;

      x2Entry =
        candidateX2;

      x2RiskPercent =
        Math.round(
          estimatedX2Risk * 100
        ) / 100;

      combinedRiskPercent =
        Math.round(
          estimatedCombinedRisk * 100
        ) / 100;
    }
  }

  /*
   * ------------------------------------------------
   * 7. Final validation
   * ------------------------------------------------
   */

  if (
    actualRR <
    config.risk.minRR
  ) {
    return {
      riskPercent,
      rr: actualRR,

      entry,
      stopLoss,
      takeProfit,

      stopDistance:
        effectiveStopDistance,

      x2Enabled: false,
      x2Entry: null,

      x2RiskPercent: null,
      combinedRiskPercent: null,

      tradable: false,

      noTradeReason:
        `RR ${actualRR.toFixed(2)} is below minimum ${config.risk.minRR}`,
    };
  }

  return {
    riskPercent,

    rr:
      Math.round(
        actualRR * 100
      ) / 100,

    entry,
    stopLoss,
    takeProfit,

    stopDistance:
      roundPrice(
        effectiveStopDistance
      ),

    x2Enabled,

    x2Entry,

    x2RiskPercent,

    combinedRiskPercent,

    tradable: true,
  };
}
