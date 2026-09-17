export const STRATEGY_CONFIG = {
  symbol:'XAUUSD', contractSize:100, priceDecimals:2, minLot:0.01, lotStep:0.01,
  balance:2000,
  riskPercent:0.5,
  maxRiskPercent:1,
  dailyMaxRiskPercent:3,
  // No daily trade-count / take-profit-count cap. A value of 0 means unlimited.
  maxTradesPerDay:0,
  maxTakeProfitsPerDay:0,
  // Target geometry is derived from Leg-1 length minus spread. These RR bands
  // classify whether a setup is suitable as single-stage or X2/two-stage.
  singleStageMinRR:1,
  singleStageMaxRR:2,
  twoStageMinRR:2,
  twoStageMaxRR:5,
  btbMinRR:2,
  x2Enabled:true,
  x2VolumeMultiplier:2,
  x2CombinedRiskPercent:1,
  maxStopPercent:1.5,
  analysis:{
    minCandles:40,
    spike:{
      minStrongCandles:3, maxStrongCandles:4,
      bodyToRangeMin:0.60, closeLocationMin:0.72, oppositeWickMax:0.25,
      expansionVsMedian:1.10, minDisplacementATR:0.65, minEfficiency:0.48,
      minPressureGapATR:0.04, minNonOverlapGapATR:0.03,
      maxExtensionATR:6.00, maxStopATR:2.00,
      maxReturnBeyondBreakoutATR:0.15, maxReturnDepth:0.60, maxReturnCandleATR:0.90,
      minLeg2BodyToRange:0.55, leg2CloseInDirection:0.68,
      maxSpikeAgeBars:18, minContextScore:1,
      requireDailyTrend:true,
      requireStructuralBreak:true,
      minOriginLevelScore:0,
      rejectRangeInterior:true,
      rangeEdgeToleranceATR:0.25
    },
    imbalance:{minGapATR:0.06,atrLength:14},
    pullback:{minRetrace:0,maxRetrace:0.65,maxBarsAfterImpulse:4},
    confirmation:{minBodyToRange:0.50,closeInDirection:0.64},
    microMap:{
      minChannelBars:3,maxChannelBars:6,maxPullbackBars:2,maxTriggerDistanceATR:0.65,
      maxStopATR:0.90,minRR:4,maxRR:12,x2Enabled:false
    },
    btb:{
      maxZoneAgeBars:36,returnWindowBars:24,minDepartureBars:3,breakoutLookback:5,
      minDepartureATR:0.85,zonePaddingATR:0.08,maxStopATR:1.75,rejectionCloseATR:0.06,
      maxEntryFromZoneATR:0.50,requireTwoStepM1Rejection:true,
      minM1RejectionBodyToRange:0.55,minM1RejectionCloseInDirection:0.64,
      m1SourceEnabled:false,m5Enabled:true,m15Enabled:true,targetRR:2.0,
      rangeEdgeToleranceATR:0.25,rejectRangeInterior:true
    },
    execution:{minCooldownBars:0,minCooldownAfterLossBars:0,minFavorableRForX2:0.30},
    trendExit:{
      lookbackBars:20,
      minStrongCandles:2,
      minBodyToRange:0.55,
      minCloseLocation:0.65,
      breakSwingATR:0.05
    },
    context:{rangeLookbackBars:25,maxRangeWidthATR:2.8,rangeEdgeToleranceATR:0.25,requireHigherTFSupportWhenH1Neutral:true}
  }
};
