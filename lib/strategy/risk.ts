import {
  Direction,
  RiskPlan,
} from './types';

import {
  StrategyConfig,
} from './config';

export function buildRiskPlan(
  direction: Direction,
  entry: number,
  stopLoss: number,
  spread: number,
  config: StrategyConfig
): RiskPlan {
  const riskPercent =
    config.risk
      .defaultRiskPercent;

  const rawDistance =
    Math.abs(
      entry -
      stopLoss
    );

  const effectiveDistance =
    rawDistance +
    Math.max(
      0,
      spread
    );

  if (
    !Number.isFinite(
      entry
    ) ||
    !Number.isFinite(
      stopLoss
    ) ||
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

      combinedRiskPercent:
        null,

      tradable: false,

      noTradeReason:
        'Invalid entry or stop distance',
    };
  }

  if (
    riskPercent <= 0 ||
    riskPercent >
      config.risk
        .maxRiskPercent
  ) {
    return {
      riskPercent,

      rr: 0,

      entry,

      stopLoss,

      takeProfit: entry,

      stopDistance:
        effectiveDistance,

      x2Enabled: false,

      x2Entry: null,

      x2RiskPercent: null,

      combinedRiskPercent:
        null,

      tradable: false,

      noTradeReason:
        'Configured risk percentage is outside the allowed range',
    };
  }

  const rr =
    Math.max(
      config.risk.minRR,

      Math.min(
        config.risk.targetRR,
        config.risk.maxRR
      )
    );

  const takeProfit =
    direction === 'LONG'
      ? entry +
        effectiveDistance *
          rr
      : entry -
        effectiveDistance *
          rr;

  let x2Enabled =
    false;

  let x2Entry:
    number | null =
    null;

  let x2RiskPercent:
    number | null =
    null;

  let combinedRiskPercent:
    number | null =
    null;

  if (
    config.risk.x2Enabled
  ) {
    x2Entry =
      direction ===
      'LONG'
        ? entry -
          rawDistance / 2
        : entry +
          rawDistance / 2;

    x2RiskPercent =
      riskPercent;

    combinedRiskPercent =
      riskPercent +
      x2RiskPercent;

    if (
      combinedRiskPercent <=
      config.risk
        .maxCombinedRiskPercent
    ) {
      x2Enabled =
        true;
    } else {
      x2Enabled =
        false;

      x2Entry =
        null;

      x2RiskPercent =
        null;

      combinedRiskPercent =
        riskPercent;
    }
  }

  return {
    riskPercent,

    rr,

    entry,

    stopLoss,

    takeProfit,

    stopDistance:
      effectiveDistance,

    x2Enabled,

    x2Entry,

    x2RiskPercent,

    combinedRiskPercent,

    tradable: true,
  };
}
