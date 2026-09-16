import { CONFIG } from './config'; import { Direction,RiskPlan } from './types'; import { roundPrice } from './math';
export function buildRisk(direction:Direction,entry:number,stop:number,balance=CONFIG.risk.balance,riskPercent=CONFIG.risk.defaultRiskPercent,spread=0):RiskPlan{
 const warnings:string[]=[];const riskMoney=balance*riskPercent/100;const effectiveStop=direction==='LONG'?entry-stop+spread:stop-entry+spread; if(effectiveStop<=0)return {tradable:false,riskPercent,riskMoney,stopDistance:0,lotSize:null,rr:0,warnings:['Invalid stop distance']};
 const raw=riskMoney/(effectiveStop*CONFIG.risk.contractSize);const lot=Math.floor(raw/CONFIG.risk.lotStep)*CONFIG.risk.lotStep;
 if(lot<CONFIG.risk.minLot){warnings.push('Minimum lot would exceed requested risk; trade blocked.');return {tradable:false,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:null,rr:0,warnings}}
 const target=direction==='LONG'?entry+effectiveStop*CONFIG.risk.targetRR:entry-effectiveStop*CONFIG.risk.targetRR;
 const x2Entry=(entry+stop)/2;const x2Dist=direction==='LONG'?x2Entry-stop:stop-x2Entry;const x2Lot=Math.floor((riskMoney/(x2Dist*CONFIG.risk.contractSize))*CONFIG.risk.x2VolumeMultiplier/CONFIG.risk.lotStep)*CONFIG.risk.lotStep;const combined=lot*effectiveStop*CONFIG.risk.contractSize/balance*100 + (x2Lot?x2Lot*x2Dist*CONFIG.risk.contractSize/balance*100:0);
 if(combined>CONFIG.risk.maxCombinedRiskPercent){warnings.push('X2 disabled because combined risk cap would be exceeded.');return {tradable:true,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:lot,takeProfit:roundPrice(target),rr:CONFIG.risk.targetRR,warnings}}
 return {tradable:true,riskPercent,riskMoney,stopDistance:effectiveStop,lotSize:lot,takeProfit:roundPrice(target),rr:CONFIG.risk.targetRR,x2Entry:roundPrice(x2Entry),x2LotSize:x2Lot||undefined,combinedRiskPercent:combined,warnings};
}
