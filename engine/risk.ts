import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { Direction, RiskPlan } from '@/types/market';
import { roundPrice } from '@/engine/indicators';

export function buildRisk(
  direction:Direction,
  entry:number,
  stop:number,
  balance:number=C.balance,
  riskPercent:number=C.riskPercent,
  spread:number=0,
  targetRR:number=C.singleStageMinRR,
  enableX2:boolean=C.x2Enabled
): RiskPlan {
  const warnings:string[]=[];
  const riskMoney=balance*riskPercent/100;
  // Spread is part of the effective stop distance. This is the same distance
  // used for lot sizing, RR validation and realized-risk accounting.
  const effectiveStop=direction==='LONG' ? entry-stop+spread : stop-entry+spread;
  if(effectiveStop<=0) return {tradable:false,riskPercent,riskMoney,stopDistance:0,lotSize:null,rr:0,warnings:['Invalid stop distance']};

  const stopPercent=effectiveStop/Math.max(Math.abs(entry),1e-9)*100;
  if(stopPercent>C.maxStopPercent+1e-9){
    return {
      tradable:false,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:null,rr:targetRR,
      warnings:[`Stop distance ${stopPercent.toFixed(3)}% exceeds maximum ${C.maxStopPercent.toFixed(2)}% including spread.`]
    };
  }

  const raw=riskMoney/(effectiveStop*C.contractSize);
  const lot=Math.floor((raw+1e-12)/C.lotStep)*C.lotStep;
  if(lot + 1e-9 < C.minLot) return {tradable:false,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:null,rr:targetRR,warnings:['Minimum lot would exceed requested risk; trade blocked.']};

  const tp=direction==='LONG'?entry+effectiveStop*targetRR:entry-effectiveStop*targetRR;
  let x2Entry:number|undefined, x2LotSize:number|undefined, combined:number|undefined;

  if(enableX2){
    // X2 is a deferred midpoint add-on. The intended combined risk is 1%:
    // first leg ~0.5% + X2 additional ~0.5%, with spread included in both legs.
    x2Entry=(entry+stop)/2;
    const combinedRiskMoney=balance*C.x2CombinedRiskPercent/100;
    const firstRiskMoney=lot*effectiveStop*C.contractSize;
    const additionalRiskMoney=Math.max(combinedRiskMoney-firstRiskMoney,0);
    const x2Dist=direction==='LONG'?x2Entry-stop:stop-x2Entry;
    const rawX2=x2Dist>0?additionalRiskMoney/((x2Dist+Math.max(spread,0))*C.contractSize):0;
    x2LotSize=Math.floor((rawX2+1e-12)/C.lotStep)*C.lotStep;
    const firstRisk=firstRiskMoney;
    const secondRisk=x2LotSize*Math.max(x2Dist+spread,1e-9)*C.contractSize;
    combined=(firstRisk+secondRisk)/Math.max(balance,1e-9)*100;
    if(x2LotSize<C.minLot || combined>C.x2CombinedRiskPercent+1e-9){
      x2Entry=undefined; x2LotSize=undefined; combined=undefined;
      warnings.push('X2 disabled by lot/risk cap; single-stage remains available when RR geometry permits.');
    }
  }

  return {
    tradable:true,
    riskPercent,
    riskMoney,
    stopDistance:effectiveStop,
    lotSize:Number(lot.toFixed(2)),
    takeProfit:roundPrice(tp,C.priceDecimals),
    rr:targetRR,
    x2Entry:x2Entry===undefined?null:roundPrice(x2Entry,C.priceDecimals),
    x2LotSize:x2LotSize===undefined?null:Number(x2LotSize.toFixed(2)),
    combinedRiskPercent:combined===undefined?null:Number(combined.toFixed(4)),
    warnings,
  };
}
