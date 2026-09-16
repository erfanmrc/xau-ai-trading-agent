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
    // ریسک پیش‌فرض هر معامله
    defaultRiskPercent: 0.5,

    // حداکثر ریسک یک ستاپ
    maxRiskPercent: 1.0,

    // حداکثر ریسک مجموع X1 + X2
    maxCombinedRiskPercent: 1.0,

    // تارگت اصلی
    targetRR: 2.0,

    // حداقل R/R قابل قبول
    minRR: 1.5,

    // حداکثر R/R
    maxRR: 3.5,

    // فعال بودن X2
    x2Enabled: true,

    // حجم X2 نسبت به X1
    x2VolumeMultiplier: 2,
  },
};
