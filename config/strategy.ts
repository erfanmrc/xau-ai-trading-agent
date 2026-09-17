export const STRATEGY_CONFIG = {
  symbol:'XAUUSD', contractSize:100, priceDecimals:2, minLot:0.01, lotStep:0.01,
  balance:2000, riskPercent:0.5, maxRiskPercent:1, dailyMaxRiskPercent:3,
  targetRR:2, minRR:1.5, maxRR:4.5,
  x2Enabled:true, x2VolumeMultiplier:2, maxCombinedRiskPercent:1,
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
      minOriginLevelScore:0,
      rejectRangeInterior:true,
      rangeEdgeToleranceATR:0.25
    },
    imbalance:{minGapATR:0.06,atrLength:14},
    pullback:{minRetrace:0,maxRetrace:0.65,maxBarsAfterImpulse:4},
    confirmation:{minBodyToRange:0.50,closeInDirection:0.64},
    microMap:{
      minChannelBars:3,maxChannelBars:6,maxPullbackBars:2,maxTriggerDistanceATR:0.65,
      maxStopATR:0.90,targetRR:4,minRR:3,x2Enabled:false
    },
    btb:{
      maxZoneAgeBars:24,returnWindowBars:10,minDepartureBars:3,breakoutLookback:5,
      minDepartureATR:0.85,zonePaddingATR:0.08,maxStopATR:1.75,rejectionCloseATR:0.06,
      maxEntryFromZoneATR:0.50,requireTwoStepM1Rejection:true,
      minM1RejectionBodyToRange:0.55,minM1RejectionCloseInDirection:0.64,
      m1SourceEnabled:false,m5Enabled:true,m15Enabled:true,targetRR:2.0,
      rangeEdgeToleranceATR:0.25,rejectRangeInterior:true
    },
    execution:{minCooldownBars:3,minCooldownAfterLossBars:5,minFavorableRForX2:0.30},
    context:{rangeLookbackBars:25,maxRangeWidthATR:2.8,rangeEdgeToleranceATR:0.25,requireHigherTFSupportWhenH1Neutral:true}
  }
};
