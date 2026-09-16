import {detectSP2L} from "@/agents/sp2l";
import {detectProBTB} from "@/agents/pro-btb";
import {detectMicroMap} from "@/agents/micromap";
import {getXauUsdCandles} from "@/data/twelve-data";
import {summarizeStructure} from "@/engine/market-structure";
import {mapLiquidity} from "@/engine/liquidity";
export async function buildDecision(){
 const c=await getXauUsdCandles("5min",100),s=summarizeStructure(c),l=mapLiquidity(c);
 const signals=[detectSP2L(c),detectProBTB(c),detectMicroMap(c)];
 const valid=signals.filter(x=>x.valid).sort((a,b)=>b.score-a.score);
 const best=valid[0]??null;
 const message=["XAU AI Trading Agent",`Structure: ${s.bias}`,`Last: ${s.lastClose??"N/A"}`,`Liquidity H/L: ${l.high??"N/A"} / ${l.low??"N/A"}`,...signals.map(x=>`${x.strategy}: ${x.valid?"VALID":"NO TRADE"}`),best?`Best valid setup: ${best.strategy} | ${best.score}`:"Decision: NO TRADE"].join("\n");
 return {structure:s,liquidity:l,signals,best,message};
}