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
  targetRR:number=C.targetRR,
  enableX2:boolean=C.x2Enabled
): RiskPlan {
  const warnings:string[]=[];
  const riskMoney=balance*riskPercent/100;
  const effectiveStop=direction==='LONG' ? entry-stop+spread : stop-entry+spread;
  if(effectiveStop<=0) return {tradable:false,riskPercent,riskMoney,stopDistance:0,lotSize:null,rr:0,warnings:['Invalid stop distance']};
  const raw=riskMoney/(effectiveStop*C.contractSize);
  const lot=Math.floor((raw+1e-12)/C.lotStep)*C.lotStep;
  if(lot + 1e-9 < C.minLot) return {tradable:false,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:null,rr:0,warnings:['Minimum lot would exceed requested risk; trade blocked.']};

  const tp=direction==='LONG'?entry+effectiveStop*targetRR:entry-effectiveStop*targetRR;
  let x2Entry:number|undefined, x2LotSize:number|undefined, combined:number|undefined;
  if(enableX2){
    x2Entry=(entry+stop)/2;
    const x2BaseLot=lot*C.x2VolumeMultiplier;
    x2LotSize=Math.floor((x2BaseLot+1e-12)/C.lotStep)*C.lotStep;
    const x2Dist=direction==='LONG'?x2Entry-stop:stop-x2Entry;
    const firstRisk=lot*effectiveStop*C.contractSize;
    const secondRisk=x2LotSize*Math.max(x2Dist,1e-9)*C.contractSize;
    combined=(firstRisk+secondRisk)/balance*100;
    if(x2LotSize<C.minLot || combined>C.maxCombinedRiskPercent+1e-9){
      x2Entry=undefined; x2LotSize=undefined; combined=undefined;
      warnings.push('X2 disabled by lot/risk cap');
    }
  }
  return {
    tradable:true,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:Number(lot.toFixed(2)),takeProfit:roundPrice(tp,C.priceDecimals),rr:targetRR,
    x2Entry:x2Entry===undefined?null:roundPrice(x2Entry,C.priceDecimals),
    x2LotSize:x2LotSize===undefined?null:Number(x2LotSize.toFixed(2)),
    combinedRiskPercent:combined===undefined?null:Number(combined.toFixed(4)),warnings
  };
}
