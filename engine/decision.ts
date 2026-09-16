import { Candle } from '@/types/market';
import { getXauUsdCandles } from '@/data/twelve-data';
import { detectSP2L } from '@/agents/sp2l';
import { detectProBTB } from '@/agents/pro-btb';
import { detectMicroMap } from '@/agents/micromap';
import { buildContext } from '@/engine/context';

export type UnifiedDecision={
  symbol:'XAUUSD'; timestamp:string; context:ReturnType<typeof buildContext>;
  signals:ReturnType<typeof detectSP2L>[]; consensus:{direction:'LONG'|'SHORT'|null; validCount:number; alignedCount:number; mode:'EXECUTE'|'WATCH'|'NO_TRADE'};
  message:string;
};

export function analyzeUnified(c:Candle[], balance=2000, spread=0):UnifiedDecision {
  const context=buildContext(c);
  const signals=[detectSP2L(c,balance,spread),detectProBTB(c,balance,spread),detectMicroMap(c,balance,spread)];
  const valid=signals.filter(x=>x.status==='VALID' && x.direction);
  const long=valid.filter(x=>x.direction==='LONG').length, short=valid.filter(x=>x.direction==='SHORT').length;
  const direction=long>short?'LONG':short>long?'SHORT':valid.length===1?valid[0].direction??null:null;
  const alignedCount=valid.filter(x=>x.direction===direction).length;
  const mode: 'EXECUTE'|'WATCH'|'NO_TRADE' = direction && context.aligned && alignedCount>=2 ? 'EXECUTE' : direction && alignedCount>=1 ? 'WATCH' : 'NO_TRADE';
  const lines=['XAU AI Trading Agent',`Bias: ${context.bias}`,`MTF: H1 ${context.h1} | M15 ${context.m15} | M5 ${context.m5} | M1 ${context.m1}`,`Session: ${context.session}`,...signals.map(s=>`${s.strategy}: ${s.status}${s.direction?` ${s.direction}`:''} score=${s.score}`),`Consensus: ${mode}${direction?` ${direction}`:''}`];
  return {symbol:'XAUUSD',timestamp:c.at(-1)?.time??new Date().toISOString(),context,signals,consensus:{direction,validCount:valid.length,alignedCount,mode},message:lines.join('\n')};
}
export async function buildDecision(){ const c=await getXauUsdCandles('1min',500); return analyzeUnified(c); }
