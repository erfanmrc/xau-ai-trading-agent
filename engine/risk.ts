export type RiskGrade="A+"|"A"|"B"|"NO TRADE";
export function riskForGrade(g:RiskGrade){return g==="A+"?.01:g==="A"?.0075:g==="B"?.005:0;}
export function positionSize(p:{balance:number;riskPct:number;entry:number;stop:number;valuePerPriceUnitPerLot?:number;minLot?:number}){
 const v=p.valuePerPriceUnitPerLot??100,m=p.minLot??.01,d=Math.abs(p.entry-p.stop);
 if(d<=0)return {lot:0,riskDollars:p.balance*p.riskPct};
 const raw=(p.balance*p.riskPct)/(d*v);
 return {lot:Math.max(m,Math.floor(raw*100)/100),riskDollars:p.balance*p.riskPct};
}