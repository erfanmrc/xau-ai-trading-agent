export interface StrategyConfig {
  structureLookback: number;
  swingStrength: number;

  spike: {
    minStrongCandles: number;
    bodyToRangeMin: number;
    directionalCloseMin: number;
    expansionVsMedian: number;
    maxBars: number;
  };

  imbalance: {
    minGapATR: number;
  };

  pullback: {
    minRetrace: number;
    maxRetrace: number;
    maxBarsAfterSpike: number;
  };

  confirmation: {
    minBodyToRange: number;
    closeInDirection: number;
  };

  scoring: {
    minimumSignal: number;
    strongSignal: number;
  };

  risk: {
    defaultRiskPercent: number;
    maxRiskPercent: number;
    maxCombinedRiskPercent: number;
    targetRR: number;
    minRR: number;
    maxRR: number;
    x2Enabled: boolean;
    x2VolumeMultiplier: number;
  };
}

export const DEFAULT_CONFIG: StrategyConfig = {
  structureLookback: 80,

  swingStrength: 2,

  spike: {
    minStrongCandles: 3,
    bodyToRangeMin: 0.55,
    directionalCloseMin: 0.65,
    expansionVsMedian: 1.15,
    maxBars: 6,
  },

  imbalance: {
    minGapATR: 0.08,
  },

  pullback: {
    minRetrace: 0.25,
    maxRetrace: 0.70,
    maxBarsAfterSpike: 10,
  },

  confirmation: {
    minBodyToRange: 0.45,
    closeInDirection: 0.60,
  },

  scoring: {
    minimumSignal: 70,
    strongSignal: 82,
  },

  risk: {
    defaultRiskPercent: 0.5,
    maxRiskPercent: 1.0,
    maxCombinedRiskPercent: 1.0,
    targetRR: 2.0,
    minRR: 1.5,
    maxRR: 3.5,
    x2Enabled: true,
    x2VolumeMultiplier: 2,
  },
};

/*
 * Backward compatibility
 *
 * structure.ts, spike.ts and leg2.ts هنوز از CONFIG
 * استفاده می‌کنند. بنابراین فعلاً CONFIG را به عنوان
 * alias برای DEFAULT_CONFIG نگه می‌داریم.
 *
 * هیچ وابستگی به balance یا account size وجود ندارد.
 */
export const CONFIG = DEFAULT_CONFIG;
