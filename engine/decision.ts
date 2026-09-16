import { Candle, StrategyName } from '@/types/market';
import { getXauUsdCandles } from '@/data/twelve-data';
import { detectSP2L } from '@/agents/sp2l';
import { detectProBTB } from '@/agents/pro-btb';
import { detectMicroMap } from '@/agents/micromap';
import { buildContext } from '@/engine/context';

export type DecisionCandidate={
  strategy:StrategyName;
  direction:'LONG'|'SHORT';
  score:number;
  entry:number;
  stop:number;
  signalTime:string;
  h1Filter:'PASS'|'BLOCK'|'NEUTRAL';
  m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL';
  confluenceScore:number;
  confluenceLabels:string[];
  reasons:string[];
};

export type UnifiedDecision={
  symbol:'XAUUSD'; timestamp:string; context:ReturnType<typeof buildContext>;
  signals:ReturnType<typeof detectSP2L>[];
  candidates:DecisionCandidate[];
  selection:{strategy:StrategyName;direction:'LONG'|'SHORT';score:number}|null;
  consensus:{direction:'LONG'|'SHORT'|null;validCount:number;alignedCount:number;eligibleCount:number;mode:'EXECUTE'|'WATCH'|'NO_TRADE';reason:string};
  message:string;
};

function enrichScore(signal:ReturnType<typeof detectSP2L>, context:ReturnType<typeof buildContext>):{score:number;h1Filter:'PASS'|'BLOCK'|'NEUTRAL';m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL'} {
  let score=signal.score;
  const d=signal.direction;
  if(!d) return {score,h1Filter:'NEUTRAL',m15Relation:'NEUTRAL'};
  const h1Filter=context.h1==='NEUTRAL'?'NEUTRAL':context.h1===d?'PASS':'BLOCK';
  const m15Relation=context.m15==='NEUTRAL'?'NEUTRAL':context.m15===d?'CONFIRM':'OPPOSE';
  if(h1Filter==='PASS') score+=15;
  if(h1Filter==='BLOCK') score-=45;
  if(m15Relation==='CONFIRM') score+=8;
  if(m15Relation==='OPPOSE') score-=5;
  if(context.m5===d) score+=4;
  if(context.m1===d) score+=6;
  return {score:Math.max(0,Math.min(100,score)),h1Filter,m15Relation};
}

export function analyzeUnified(c:Candle[], balance=2000, spread=0):UnifiedDecision {
  const context=buildContext(c);
  const signals=[detectSP2L(c,balance,spread),detectProBTB(c,balance,spread),detectMicroMap(c,balance,spread)];
  const valid=signals.filter(x=>x.status==='VALID' && x.direction && x.entry!=null && x.stop!=null);
  const candidates:DecisionCandidate[]=valid.map((s):DecisionCandidate=>{
    const e=enrichScore(s,context);
    const conf=s.confluence;
    return {strategy:s.strategy,direction:s.direction!,score:Math.max(0,e.score+(conf?.score??0)),entry:s.entry!,stop:s.stop!,signalTime:c.at(-1)?.time??new Date().toISOString(),h1Filter:e.h1Filter,m15Relation:e.m15Relation,confluenceScore:conf?.score??0,confluenceLabels:conf?.labels??[],reasons:[s.reason,`H1 filter: ${e.h1Filter}`,`M15: ${e.m15Relation}`,`M5 role: ${context.m5===s.direction?'aligned':'context only'}`,`M1 role: ${context.m1===s.direction?'aligned':'trigger context'}`,conf?.labels?.length?`Entry confluence +${conf.score}: ${conf.labels.join(', ')}`:'No round/mean level confluence']};
  });
  const executable=candidates.filter(x=>x.h1Filter!=='BLOCK');
  const selection=executable.slice().sort((a,b)=>b.score-a.score)[0]??null;
  const validDirections=valid.map(x=>x.direction!).filter(Boolean);
  const long=validDirections.filter(x=>x==='LONG').length, short=validDirections.filter(x=>x==='SHORT').length;
  const direction=selection?.direction??(long>short?'LONG':short>long?'SHORT':valid.length===1?valid[0].direction??null:null);
  const mode:'EXECUTE'|'WATCH'|'NO_TRADE'=selection?'EXECUTE':valid.length?'WATCH':'NO_TRADE';
  const reason=selection?`Single valid strategy is sufficient; selected ${selection.strategy}; H1 is ${selection.h1Filter}. M15/M5/M1 are contextual.`:valid.length?'Valid setup exists, but H1 blocks its direction':'No valid strategy entry yet';
  const lines=['XAU AI Trading Agent',`Bias: ${context.bias}`,`MTF roles: H1 ${context.h1} (filter) | M15 ${context.m15} (structure) | M5 ${context.m5} (setup) | M1 ${context.m1} (trigger)`,`Session: ${context.session}`,...signals.map(s=>`${s.strategy}: ${s.status}${s.direction?` ${s.direction}`:''} score=${s.score}`),`Valid candidates: ${candidates.length}`,`Eligible candidates: ${executable.length}`,`Selected: ${selection?`${selection.strategy} ${selection.direction} score=${selection.score}`:'NONE'}`,`Consensus: ${mode}${direction?` ${direction}`:''}`,`Reason: ${reason}`];
  return {symbol:'XAUUSD',timestamp:c.at(-1)?.time??new Date().toISOString(),context,signals,candidates,selection:selection?{strategy:selection.strategy,direction:selection.direction,score:selection.score}:null,consensus:{direction,validCount:valid.length,alignedCount:executable.length,eligibleCount:executable.length,mode,reason},message:lines.join('\n')};
}

export async function buildDecision(){ const c=await getXauUsdCandles('1min',500); return analyzeUnified(c); }
