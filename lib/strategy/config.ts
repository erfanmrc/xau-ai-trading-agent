export const CONFIG = {
  structure:{lookback:80,swingStrength:2},
  spike:{minStrongCandles:3,bodyToRangeMin:.55,closeLocationMin:.65,expansionVsMedian:1.15,maxBars:6},
  imbalance:{minGapATR:.08,atrLength:14},
  pullback:{minRetrace:.25,maxRetrace:.70,maxBarsAfterSpike:10},
  confirmation:{minBodyToRange:.45,closeInDirection:.60},
  scoring:{minimumSignal:70,strongSignal:82},
  risk:{defaultRiskPercent:.5,maxRiskPercent:1,dailyMaxRiskPercent:3,balance:2000,minLot:.01,lotStep:.01,contractSize:100,targetRR:2,minRR:1.5,maxRR:3.5,x2Enabled:true,x2VolumeMultiplier:2,maxCombinedRiskPercent:1}
} as const;
