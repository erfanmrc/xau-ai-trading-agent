import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { Direction, RiskPlan } from '@/types/market';
import { roundPrice } from '@/engine/indicators';

export function buildRisk(direction:Direction, entry:number, stop:number, balance:number=C.balance, riskPercent:number=C.riskPercent, spread:number=0): RiskPlan {
  const warnings:string[]=[];
  const riskMoney=balance*riskPercent/100;
  const effectiveStop=direction==='LONG' ? entry-stop+spread : stop-entry+spread;
  if(effectiveStop<=0) return {tradable:false,riskPercent,riskMoney,stopDistance:0,lotSize:null,rr:0,warnings:['Invalid stop distance']};
  const raw=riskMoney/(effectiveStop*C.contractSize);
  const lot=Math.floor((raw+1e-12)/C.lotStep)*C.lotStep;
  if(lot + 1e-9 < C.minLot) return {tradable:false,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:null,rr:0,warnings:['Minimum lot would exceed requested risk; trade blocked.']};
  const tp=direction==='LONG'?entry+effectiveStop*C.targetRR:entry-effectiveStop*C.targetRR;
  let x2Entry:number|undefined, x2LotSize:number|undefined, combined:number|undefined;
  if(C.x2Enabled){
    x2Entry=(entry+stop)/2;
    const x2Dist=direction==='LONG'?x2Entry-stop:stop-x2Entry;
    const rawX2=riskMoney/(Math.max(x2Dist,1e-9)*C.contractSize)*C.x2VolumeMultiplier;
    x2LotSize=Math.floor(rawX2/C.lotStep)*C.lotStep;
    combined=((lot*effectiveStop*C.contractSize)+(x2LotSize*x2Dist*C.contractSize))/balance*100;
    if(x2LotSize<C.minLot || combined>C.maxCombinedRiskPercent){ x2Entry=undefined; x2LotSize=undefined; combined=undefined; warnings.push('X2 disabled by lot/risk cap'); }
  }
  return {tradable:true,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:Number(lot.toFixed(2)),takeProfit:roundPrice(tp,C.priceDecimals),rr:C.targetRR,x2Entry:x2Entry===undefined?null:roundPrice(x2Entry,C.priceDecimals),x2LotSize:x2LotSize===undefined?null:Number(x2LotSize.toFixed(2)),combinedRiskPercent:combined===undefined?null:Number(combined.toFixed(4)),warnings};
}
