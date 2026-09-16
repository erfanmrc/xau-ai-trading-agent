import {
  Candle,
  Direction,
  MarketState,
  Signal,
  StrategyConfig,
  StrategyResult,
  StrategyScores,
  Structure,
  Setup,
  RiskPlan,
} from './types';

import {
  CONFIG,
} from './config';

import {
  detectStructure,
} from './structure';

import {
  detectSpike,
} from './spike';

import {
  detectLeg2,
} from './leg2';

import {
  buildRiskPlan,
} from './risk';

export interface MultiTimeframeResult {
  m5: StrategyResult;
  m1: StrategyResult;
  final: StrategyResult;
}

function oppositeDirection(
  direction: Direction
): Direction {
  return direction === 'LONG'
    ? 'SHORT'
    : 'LONG';
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

function scoreM5Context(
  structure: Structure
): number {
  if (
    structure.state === 'UPTREND' ||
    structure.state === 'DOWNTREND'
  ) {
    const quality =
      structure.structureQuality ?? 0;

    return clamp(
      Math.round(
        60 +
        quality * 0.4
      )
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
  const quality =
    structure.structureQuality ?? 0;

  if (
    structure.state === 'UPTREND' ||
    structure.state === 'DOWNTREND'
  ) {
    return clamp(
      Math.round(
        quality
      )
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
  if (!result.setup.spike) {
    return 0;
  }

  return clamp(
    result.setup.spike.score
  );
}

function scorePullback(
  result: StrategyResult
): number {
  const leg2 =
    result.setup.leg2;

  if (!leg2) {
    return 0;
  }

  if (
    !leg2.pullback
  ) {
    return 0;
  }

  const retrace =
    leg2.retrace ?? 0;

  if (
    retrace >= 0.25 &&
    retrace <= 0.70
  ) {
    /*
     * Middle retracement area is preferred.
     */
    const distanceFromIdeal =
      Math.abs(
        retrace - 0.50
      );

    return clamp(
      Math.round(
        100 -
        distanceFromIdeal * 150
      )
    );
  }

  return 20;
}

function scoreConfirmation(
  result: StrategyResult
): number {
  const leg2 =
    result.setup.leg2;

  if (!leg2) {
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
  spikeDirection:
    | Direction
    | null
): number {
  if (!spikeDirection) {
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

  if (!m5Direction) {
    return 0;
  }

  if (
    spikeDirection !==
    m5Direction
  ) {
    return 0;
  }

  if (
    m1State === 'UPTREND' &&
    spikeDirection === 'LONG'
  ) {
    return 100;
  }

  if (
    m1State === 'DOWNTREND' &&
    spikeDirection === 'SHORT'
  ) {
    return 100;
  }

  /*
   * M1 can be temporarily neutral during a
   * pullback while still being aligned with M5.
   */
  return 65;
}

function buildScores(
  result: StrategyResult,
  m5State?: MarketState
): StrategyScores {
  const context =
    m5State
      ? scoreM5Context(
          result.structure
        )
      : 0;

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

  let alignment = 0;

  if (
    m5State
  ) {
    alignment =
      scoreAlignment(
        m5State,
        result.market_state,
        result.setup.spike?.direction ??
          null
      );
  } else {
    alignment =
      result.market_state ===
      'UPTREND' ||
      result.market_state ===
      'DOWNTREND'
        ? 100
        : 0;
  }

  /*
   * Setup score:
   *
   * Structure 20%
   * Spike 25%
   * Pullback 20%
   * Confirmation 25%
   * Alignment 10%
   */
  const setup =
    Math.round(
      structure * 0.20 +
      spike * 0.25 +
      pullback * 0.20 +
      confirmation * 0.25 +
      alignment * 0.10
    );

  const final =
    m5State
      ? Math.round(
          context * 0.30 +
          setup * 0.70
        )
      : setup;

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

    scores: {
      context: 0,
      structure: 0,
      spike: 0,
      pullback: 0,
      confirmation: 0,
      alignment: 0,
      setup: 0,
      final: 0,
    },

    market_state:
      structure.state,

    structure,

    setup:
      emptySetup(),

    risk: null,

    reasons: [],

    warnings: [],

    invalidation: null,
  };
}

export function analyze(
  candles: Candle[],
  timeframe:
    | 'M1'
    | 'M5',
  spread = 0,
  config:
    | StrategyConfig
    | typeof CONFIG =
      CONFIG
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

  const reasons =
    result.reasons;

  const warnings =
    result.warnings;

  if (
    candles.length < 30
  ) {
    warnings.push(
      'Insufficient candle history'
    );

    return result;
  }

  reasons.push(
    `Market state: ${structure.state}`
  );

  if (
    structure.breakout !== 'NONE'
  ) {
    reasons.push(
      `BOS: ${structure.breakout}`
    );
  }

  const spike =
    detectSpike(
      candles,
      config
    );

  result.setup.spike =
    spike;

  if (!spike) {
    reasons.push(
      'No qualified spike'
    );
  } else {
    reasons.push(
      `Spike ${spike.direction} score=${spike.score}`
    );

    if (
      !spike.imbalance
    ) {
      warnings.push(
        'Spike has no detected imbalance'
      );
    }
  }

  const leg2 =
    spike
      ? detectLeg2(
          candles,
          spike,
          config
        )
      : null;

  result.setup.leg2 =
    leg2;

  if (!leg2) {
    reasons.push(
      'No valid Leg2 setup'
    );
  } else if (
    leg2.pullback &&
    !leg2.confirmed
  ) {
    reasons.push(
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

    const direction =
      leg2.direction;

    const risk =
      buildRiskPlan(
        direction,
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
      reasons.push(
        `Risk plan valid: RR=${risk.rr.toFixed(2)}`
      );
    } else {
      warnings.push(
        risk.noTradeReason ??
          'Risk plan rejected'
      );
    }
  }

  const scores =
    buildScores(
      result
    );

  result.scores =
    scores;

  result.quality_score =
    scores.final;

  /*
   * Single timeframe signal.
   *
   * We still require:
   * 1. directional structure
   * 2. spike
   * 3. Leg2 confirmation
   * 4. structure/spike alignment
   * 5. valid risk plan
   */
  const directionalStructure =
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
    directionalStructure !== null &&
    setupDirection !== null &&
    directionalStructure ===
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

    reasons.push(
      `Signal ${result.signal} confirmed`
    );
  } else {
    result.signal =
      'WAIT';
  }

  return result;
}

export function analyzeMultiTimeframe(
  m5Candles: Candle[],
  m1Candles: Candle[],
  spread = 0,
  config:
    | StrategyConfig
    | typeof CONFIG =
      CONFIG
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

  const m5Direction:
    | Direction
    | null =
    m5.market_state ===
    'UPTREND'
      ? 'LONG'
      : m5.market_state ===
        'DOWNTREND'
        ? 'SHORT'
        : null;

  const m1SpikeDirection =
    m1.setup.spike?.direction ??
    null;

  const finalStructure =
    m1.structure;

  const final =
    createBaseResult(
      'M1',
      finalStructure
    );

  final.reasons.push(
    `M5 market context: ${m5.market_state}`
  );

  final.reasons.push(
    `M1 market state: ${m1.market_state}`
  );

  if (
    m5Direction === null
  ) {
    final.reasons.push(
      'M5 does not provide a clear directional context'
    );

    final.warnings.push(
      'No M5 directional bias'
    );

    final.scores =
      buildScores(
        m1,
        m5.market_state
      );

    final.quality_score =
      final.scores.final;

    return {
      m5,
      m1,
      final,
    };
  }

  final.reasons.push(
    `M5 directional bias: ${m5Direction}`
  );

  if (
    m1SpikeDirection === null
  ) {
    final.reasons.push(
      'M1 has no qualified spike'
    );

    final.warnings.push(
      'No M1 spike'
    );
  }

  const spikeAligned =
    m1SpikeDirection ===
    m5Direction;

  if (
    m1SpikeDirection &&
    !spikeAligned
  ) {
    final.reasons.push(
      `M1 spike ${m1SpikeDirection} conflicts with M5 ${m5Direction}`
    );

    final.warnings.push(
      'M1/M5 directional conflict'
    );
  }

  const leg2 =
    m1.setup.leg2;

  const confirmed =
    !!leg2?.confirmed;

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

  /*
   * Copy the complete M1 setup into final result.
   */
  final.setup = {
    ...m1.setup,
  };

  const scores =
    buildScores(
      m1,
      m5.market_state
    );

  final.scores =
    scores;

  final.quality_score =
    scores.final;

  if (
    m1.risk
  ) {
    final.risk =
      m1.risk;
  }

  final.invalidation =
    m1.invalidation;

  const validRisk =
    !!m1.risk?.tradable;

  const validSetup =
    !!m1.setup.spike &&
    !!m1.setup.leg2?.confirmed;

  const validAlignment =
    spikeAligned;

  if (
    validSetup &&
    validAlignment &&
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
      !validAlignment
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
