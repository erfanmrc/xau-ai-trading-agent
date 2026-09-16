import {
  Candle,
  Direction,
  MarketState,
  StrategyResult,
  StrategyScores,
  Structure,
  Setup,
} from './types';

import {
  CONFIG,
  StrategyConfig,
} from './config';

import { detectStructure } from './structure';
import { detectSpike } from './spike';
import { detectLeg2 } from './leg2';
import { buildRiskPlan } from './risk';

export interface MultiTimeframeResult {
  m5: StrategyResult;
  m1: StrategyResult;
  final: StrategyResult;
}

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function emptyScores(): StrategyScores {
  return {
    context: 0,
    structure: 0,
    spike: 0,
    pullback: 0,
    confirmation: 0,
    alignment: 0,
    setup: 0,
    final: 0,
  };
}

function emptySetup(): Setup {
  return {
    type: 'NONE',
    spike: null,
    leg2: null,
    entry: null,
    stop_loss: null,
    take_profit: null,
  };
}

function createBaseResult(
  timeframe: 'M1' | 'M5',
  structure: Structure
): StrategyResult {
  return {
    symbol: 'XAUUSD',
    timeframe,
    signal: 'WAIT',
    quality_score: 0,
    scores: emptyScores(),
    market_state: structure.state,
    structure,
    setup: emptySetup(),
    risk: null,
    reasons: [],
    warnings: [],
    invalidation: null,
  };
}

function scoreM5Context(
  structure: Structure
): number {
  if (
    structure.state === 'UPTREND' ||
    structure.state === 'DOWNTREND'
  ) {
    return clamp(
      structure.structureQuality ?? 0
    );
  }

  if (
    structure.state === 'RANGE'
  ) {
    return 25;
  }

  return 10;
}

function scoreStructure(
  structure: Structure
): number {
  if (
    structure.state === 'UPTREND' ||
    structure.state === 'DOWNTREND'
  ) {
    return clamp(
      structure.structureQuality ?? 0
    );
  }

  if (
    structure.state === 'RANGE'
  ) {
    return 30;
  }

  return 15;
}

function scoreSpike(
  result: StrategyResult
): number {
  return result.setup.spike
    ? clamp(
        result.setup.spike.score
      )
    : 0;
}

function scorePullback(
  result: StrategyResult
): number {
  const leg2 =
    result.setup.leg2;

  if (
    !leg2?.pullback
  ) {
    return 0;
  }

  const retrace =
    leg2.retrace ?? 0;

  if (
    retrace < 0.25 ||
    retrace > 0.70
  ) {
    return 20;
  }

  const distance =
    Math.abs(
      retrace - 0.50
    );

  return clamp(
    Math.round(
      100 -
      distance * 150
    )
  );
}

function scoreConfirmation(
  result: StrategyResult
): number {
  const leg2 =
    result.setup.leg2;

  if (
    !leg2
  ) {
    return 0;
  }

  if (
    leg2.confirmed
  ) {
    return 100;
  }

  if (
    leg2.pullback
  ) {
    return 35;
  }

  return 0;
}

function scoreAlignment(
  m5State: MarketState,
  m1State: MarketState,
  direction:
    | Direction
    | null
): number {
  if (
    !direction
  ) {
    return 0;
  }

  const m5Direction:
    | Direction
    | null =
    m5State === 'UPTREND'
      ? 'LONG'
      : m5State === 'DOWNTREND'
        ? 'SHORT'
        : null;

  if (
    !m5Direction
  ) {
    return 0;
  }

  if (
    direction !==
    m5Direction
  ) {
    return 0;
  }

  if (
    m1State === 'UPTREND' &&
    direction === 'LONG'
  ) {
    return 100;
  }

  if (
    m1State === 'DOWNTREND' &&
    direction === 'SHORT'
  ) {
    return 100;
  }

  return 65;
}

function buildSingleTimeframeScores(
  result: StrategyResult
): StrategyScores {
  const structure =
    scoreStructure(
      result.structure
    );

  const spike =
    scoreSpike(result);

  const pullback =
    scorePullback(result);

  const confirmation =
    scoreConfirmation(result);

  const alignment =
    result.market_state === 'UPTREND' ||
    result.market_state === 'DOWNTREND'
      ? 100
      : 0;

  const setup =
    Math.round(
      structure * 0.20 +
      spike * 0.25 +
      pullback * 0.20 +
      confirmation * 0.25 +
      alignment * 0.10
    );

  return {
    context: 0,
    structure,
    spike,
    pullback,
    confirmation,
    alignment,
    setup,
    final: setup,
  };
}

function buildMTFScores(
  m5: StrategyResult,
  m1: StrategyResult
): StrategyScores {
  const context =
    scoreM5Context(
      m5.structure
    );

  const structure =
    scoreStructure(
      m1.structure
    );

  const spike =
    scoreSpike(m1);

  const pullback =
    scorePullback(m1);

  const confirmation =
    scoreConfirmation(m1);

  const direction =
    m1.setup.spike?.direction ??
    m1.setup.leg2?.direction ??
    null;

  const alignment =
    scoreAlignment(
      m5.market_state,
      m1.market_state,
      direction
    );

  const setup =
    Math.round(
      structure * 0.20 +
      spike * 0.25 +
      pullback * 0.20 +
      confirmation * 0.25 +
      alignment * 0.10
    );

  const final =
    Math.round(
      context * 0.30 +
      setup * 0.70
    );

  return {
    context,
    structure,
    spike,
    pullback,
    confirmation,
    alignment,
    setup,
    final,
  };
}

export function analyze(
  candles: Candle[],
  timeframe: 'M1' | 'M5',
  spread = 0,
  config:
    | StrategyConfig
    | typeof CONFIG = CONFIG
): StrategyResult {
  const structure =
    detectStructure(
      candles
    );

  const result =
    createBaseResult(
      timeframe,
      structure
    );

  if (
    candles.length < 30
  ) {
    result.warnings.push(
      'Insufficient candle history'
    );

    return result;
  }

  result.reasons.push(
    `Market state: ${structure.state}`
  );

  if (
    structure.breakout !== 'NONE'
  ) {
    result.reasons.push(
      `BOS: ${structure.breakout}`
    );
  }

  const spike =
    detectSpike(
      candles
    );

  result.setup.spike =
    spike;

  if (
    !spike
  ) {
    result.reasons.push(
      'No qualified spike'
    );
  } else {
    result.reasons.push(
      `Spike ${spike.direction} score=${spike.score}`
    );

    if (
      !spike.imbalance
    ) {
      result.warnings.push(
        'Spike has no detected imbalance'
      );
    }
  }

  const leg2 =
    spike
      ? detectLeg2(
          candles,
          spike
        )
      : null;

  result.setup.leg2 =
    leg2;

  if (
    !leg2
  ) {
    result.reasons.push(
      'No valid Leg2 setup'
    );
  } else if (
    leg2.pullback &&
    !leg2.confirmed
  ) {
    result.reasons.push(
      'Valid pullback but confirmation is missing'
    );
  }

  if (
    leg2?.confirmed &&
    leg2.entry != null &&
    leg2.stop != null
  ) {
    result.setup.type =
      'SP2L';

    result.setup.entry =
      leg2.entry;

    result.setup.stop_loss =
      leg2.stop;

    const risk =
      buildRiskPlan(
        leg2.direction,
        leg2.entry,
        leg2.stop,
        spread,
        config
      );

    result.risk =
      risk;

    result.setup.take_profit =
      risk.takeProfit;

    result.invalidation =
      risk.stopLoss;

    if (
      risk.tradable
    ) {
      result.reasons.push(
        `Risk plan valid: RR=${risk.rr.toFixed(2)}`
      );

      if (
        risk.x2Enabled
      ) {
        result.reasons.push(
          `X2 enabled at ${risk.x2Entry} with combined risk ${risk.combinedRiskPercent}%`
        );
      } else {
        result.warnings.push(
          'X2 disabled because combined risk limit would be exceeded'
        );
      }
    } else {
      result.warnings.push(
        risk.noTradeReason ??
        'Risk plan rejected'
      );
    }
  }

  const scores =
    buildSingleTimeframeScores(
      result
    );

  result.scores =
    scores;

  result.quality_score =
    scores.final;

  const structureDirection:
    | Direction
    | null =
    structure.state === 'UPTREND'
      ? 'LONG'
      : structure.state === 'DOWNTREND'
        ? 'SHORT'
        : null;

  const setupDirection =
    spike?.direction ??
    leg2?.direction ??
    null;

  const aligned =
    structureDirection !== null &&
    setupDirection !== null &&
    structureDirection ===
      setupDirection;

  if (
    spike &&
    leg2?.confirmed &&
    aligned &&
    result.risk?.tradable
  ) {
    result.signal =
      setupDirection === 'LONG'
        ? 'LONG'
        : 'SHORT';

    result.reasons.push(
      `Signal ${result.signal} confirmed`
    );
  }

  return result;
}

export function analyzeMultiTimeframe(
  m5Candles: Candle[],
  m1Candles: Candle[],
  spread = 0,
  config:
    | StrategyConfig
    | typeof CONFIG = CONFIG
): MultiTimeframeResult {
  const m5 =
    analyze(
      m5Candles,
      'M5',
      spread,
      config
    );

  const m1 =
    analyze(
      m1Candles,
      'M1',
      spread,
      config
    );

  const final =
    createBaseResult(
      'M1',
      m1.structure
    );

  final.setup = {
    ...m1.setup,
  };

  final.risk =
    m1.risk;

  final.invalidation =
    m1.invalidation;

  final.reasons.push(
    `M5 market context: ${m5.market_state}`
  );

  final.reasons.push(
    `M1 market state: ${m1.market_state}`
  );

  const scores =
    buildMTFScores(
      m5,
      m1
    );

  final.scores =
    scores;

  final.quality_score =
    scores.final;

  const m5Direction:
    | Direction
    | null =
    m5.market_state === 'UPTREND'
      ? 'LONG'
      : m5.market_state === 'DOWNTREND'
        ? 'SHORT'
        : null;

  if (
    !m5Direction
  ) {
    final.reasons.push(
      'M5 does not provide a clear directional context'
    );

    final.warnings.push(
      'No M5 directional bias'
    );

    return {
      m5,
      m1,
      final,
    };
  }

  final.reasons.push(
    `M5 directional bias: ${m5Direction}`
  );

  const spikeDirection =
    m1.setup.spike?.direction ??
    null;

  if (
    !spikeDirection
  ) {
    final.reasons.push(
      'M1 has no qualified spike'
    );

    final.warnings.push(
      'No M1 spike'
    );
  }

  const spikeAligned =
    spikeDirection ===
    m5Direction;

  if (
    spikeDirection &&
    !spikeAligned
  ) {
    final.reasons.push(
      `M1 spike ${spikeDirection} conflicts with M5 ${m5Direction}`
    );

    final.warnings.push(
      'M1/M5 directional conflict'
    );
  }

  const confirmed =
    !!m1.setup.leg2?.confirmed;

  if (
    confirmed
  ) {
    final.reasons.push(
      'M1 Leg2 confirmation detected'
    );
  } else {
    final.reasons.push(
      'M1 Leg2 confirmation is missing'
    );
  }

  const validRisk =
    !!m1.risk?.tradable;

  const validSetup =
    !!m1.setup.spike &&
    !!m1.setup.leg2?.confirmed;

  if (
    validSetup &&
    spikeAligned &&
    validRisk
  ) {
    final.signal =
      m5Direction;

    final.reasons.push(
      `MTF signal ${final.signal} confirmed`
    );
  } else {
    final.signal =
      'WAIT';

    if (
      !validSetup
    ) {
      final.warnings.push(
        'M1 setup is not fully confirmed'
      );
    }

    if (
      !spikeAligned
    ) {
      final.warnings.push(
        'M1 trigger is not aligned with M5 context'
      );
    }

    if (
      !validRisk
    ) {
      final.warnings.push(
        'Risk plan is not tradable'
      );
    }
  }

  return {
    m5,
    m1,
    final,
  };
}
