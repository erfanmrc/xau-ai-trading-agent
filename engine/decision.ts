import { Candle, EconomicEvent, MarketBias, StrategyName, MarketPhase } from '@/types/market';
import { getXauUsdCandles } from '@/data/twelve-data';
import { detectSP2L } from '@/agents/sp2l';
import { detectProBTB } from '@/agents/pro-btb';
import { detectMicroMap } from '@/agents/micromap';
import { buildContext } from '@/engine/context';

export type DecisionCandidate={
  strategy:StrategyName; direction:'LONG'|'SHORT'; score:number; entry:number; stop:number; signalTime:string;
  h1Filter:'PASS'|'BLOCK'|'NEUTRAL'; m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL';
  dailyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL'; weeklyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';
  phaseRelation:'PRIMARY'|'SUPPORTIVE'|'NEUTRAL'|'OPPOSE';
  confluenceScore:number; confluenceLabels:string[]; reasons:string[];
};

export type UnifiedDecision={
  symbol:'XAUUSD'; timestamp:string; context:ReturnType<typeof buildContext>;
  signals:ReturnType<typeof detectSP2L>[]; candidates:DecisionCandidate[];
  selection:{strategy:StrategyName;direction:'LONG'|'SHORT';score:number}|null;
  consensus:{direction:'LONG'|'SHORT'|null;validCount:number;alignedCount:number;eligibleCount:number;mode:'EXECUTE'|'WATCH'|'NO_TRADE';reason:string};
  message:string;
};

const clamp=(n:number)=>Math.max(0,Math.min(100,n));
function relation(b:MarketBias,d:'LONG'|'SHORT'):{label:'CONFIRM'|'OPPOSE'|'NEUTRAL'}{return {label:b==='NEUTRAL'?'NEUTRAL':b===d?'CONFIRM':'OPPOSE'};}
function phaseRelation(phase:MarketPhase,strategy:StrategyName):DecisionCandidate['phaseRelation']{
  if(strategy==='MICROMAP') return phase==='CHANNEL'?'PRIMARY':phase==='SPIKE'?'SUPPORTIVE':phase==='RANGE'?'NEUTRAL':'OPPOSE';
  if(strategy==='SP2L') return phase==='SPIKE'?'PRIMARY':phase==='TRANSITION'?'SUPPORTIVE':phase==='CHANNEL'?'NEUTRAL':phase==='RANGE'?'OPPOSE':'NEUTRAL';
  return phase==='SPIKE'?'SUPPORTIVE':phase==='TRANSITION'?'PRIMARY':phase==='CHANNEL'?'SUPPORTIVE':phase==='RANGE'?'NEUTRAL':'NEUTRAL';
}
function enrich(signal:ReturnType<typeof detectSP2L>,context:ReturnType<typeof buildContext>):{score:number;h1Filter:'PASS'|'BLOCK'|'NEUTRAL';m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL';dailyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';weeklyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';phaseRelation:DecisionCandidate['phaseRelation']} {
  let score=signal.score; const d=signal.direction!;
  const h1Filter=context.h1==='NEUTRAL'?'NEUTRAL':context.h1===d?'PASS':'BLOCK';
  const m15Relation=relation(context.m15,d).label;
  const dailyRelation=relation(context.dailyBias,d).label;
  const weeklyRelation=relation(context.weeklyBias,d).label;
  const pRel=phaseRelation(context.phase,signal.strategy);
  if(h1Filter==='PASS') score+=10; else if(h1Filter==='BLOCK') score-=45;
  if(m15Relation==='CONFIRM') score+=6; else if(m15Relation==='OPPOSE') score-=6;
  if(dailyRelation==='CONFIRM') score+=7; else if(dailyRelation==='OPPOSE') score-=9;
  if(weeklyRelation==='CONFIRM') score+=5; else if(weeklyRelation==='OPPOSE') score-=6;
  if(pRel==='PRIMARY') score+=10; else if(pRel==='SUPPORTIVE') score+=5; else if(pRel==='OPPOSE') score-=10;
  if(context.m5===d) score+=4; else if(context.m5!=='NEUTRAL') score-=3;
  if(context.m1===d) score+=4; else if(context.m1!=='NEUTRAL') score-=3;
  if(context.economic.risk==='HIGH_IMPACT_NEAR') score-=10;
  return {score:clamp(score),h1Filter,m15Relation,dailyRelation,weeklyRelation,phaseRelation:pRel};
}

export function analyzeUnified(c:Candle[],balance=2000,spread=0,dailyCandles?:Candle[],economicEvents?:EconomicEvent[]):UnifiedDecision{
  const context=buildContext(c,dailyCandles,economicEvents);
  const signals=[detectSP2L(c,balance,spread),detectProBTB(c,balance,spread),detectMicroMap(c,balance,spread)];
  const valid=signals.filter(x=>x.status==='VALID'&&x.direction&&x.entry!=null&&x.stop!=null);
  const candidates=valid.map((s):DecisionCandidate=>{
    const e=enrich(s,context); const conf=s.confluence;
    return {
      strategy:s.strategy,direction:s.direction!,score:clamp(e.score+(conf?.score??0)),
      entry:s.entry!,stop:s.stop!,signalTime:c.at(-1)!.time,h1Filter:e.h1Filter,m15Relation:e.m15Relation,
      dailyRelation:e.dailyRelation,weeklyRelation:e.weeklyRelation,phaseRelation:e.phaseRelation,
      confluenceScore:conf?.score??0,confluenceLabels:conf?.labels??[],
      reasons:[s.reason,`H1 filter: ${e.h1Filter}`,`M15: ${e.m15Relation}`,`Daily: ${e.dailyRelation}`,`Weekly: ${e.weeklyRelation}`,`Market phase: ${context.phase} → ${e.phaseRelation}`,`M5 role: ${context.m5===s.direction?'aligned':context.m5==='NEUTRAL'?'neutral':'opposed'}`,`M1 role: ${context.m1===s.direction?'aligned':context.m1==='NEUTRAL'?'neutral':'opposed'}`,conf?.labels?.length?`Confluence +${conf.score}: ${conf.labels.join(', ')}`:'No important-level confluence']
    };
  });
  const eligible=candidates.filter(x=>x.h1Filter!=='BLOCK' && !(context.dailyBias!=='NEUTRAL'&&context.weeklyBias!=='NEUTRAL'&&context.dailyBias!==x.direction&&context.weeklyBias!==x.direction));
  // Strategy selection follows the market-cycle hierarchy: an active mother-spike entry (SP2L)
  // is preferred during SPIKE; otherwise BTB is the re-entry mechanism; MicroMAP is for CHANNEL.
  const ranked=eligible.slice().sort((a,b)=>{
    const aPrimary=a.phaseRelation==='PRIMARY'?1:0,bPrimary=b.phaseRelation==='PRIMARY'?1:0;
    if(aPrimary!==bPrimary) return bPrimary-aPrimary;
    if(a.strategy!==b.strategy){const rank=(s:StrategyName)=>s==='SP2L'?3:s==='PRO_BTB'?2:1; return rank(b.strategy)-rank(a.strategy);}
    return b.score-a.score;
  });
  const selection=ranked[0]??null;
  const validDirections=valid.map(x=>x.direction!); const long=validDirections.filter(x=>x==='LONG').length,short=validDirections.filter(x=>x==='SHORT').length;
  const direction=selection?.direction??(long>short?'LONG':short>long?'SHORT':valid.length===1?valid[0].direction??null:null);
  const mode:UnifiedDecision['consensus']['mode']=selection?'EXECUTE':valid.length?'WATCH':'NO_TRADE';
  const reason=selection
    ?`One valid strategy is sufficient. ${selection.strategy} selected as ${selection.phaseRelation.toLowerCase()} in ${context.phase} phase; H1=${selection.h1Filter}, Daily=${selection.dailyRelation}, Weekly=${selection.weeklyRelation}.`
    :valid.length?'Valid setup exists but higher-timeframe filter rejected it':'No valid strategy entry yet';
  return {
    symbol:'XAUUSD',timestamp:c.at(-1)?.time??new Date().toISOString(),context,signals,candidates,
    selection:selection?{strategy:selection.strategy,direction:selection.direction,score:selection.score}:null,
    consensus:{direction,validCount:valid.length,alignedCount:eligible.length,eligibleCount:eligible.length,mode,reason},
    message:['XAU AI Trading Agent',`Bias: ${context.bias}`,`Phase: ${context.phase}`,`H1 ${context.h1} filter | M15 ${context.m15} structure | M5 ${context.m5} setup | M1 ${context.m1} trigger`,`Daily: ${context.dailyBias} | Weekly: ${context.weeklyBias}`,`Mother move: ${context.motherMove?`${context.motherMove.timeframe} ${context.motherMove.direction} strength=${context.motherMove.strength}`:'NONE'}`,`Session: ${context.session}`,...signals.map(s=>`${s.strategy}: ${s.status}${s.direction?` ${s.direction}`:''} score=${s.score}`),`Valid candidates: ${candidates.length}`,`Eligible candidates: ${eligible.length}`,`Selected: ${selection?`${selection.strategy} ${selection.direction} score=${selection.score}`:'NONE'}`,`Consensus: ${mode}${direction?` ${direction}`:''}`,`Reason: ${reason}`,`Economic: ${context.economic.status} / ${context.economic.risk} / ${context.economic.bias}`].join('\n')
  };
}

export async function buildDecision(){
  const [m1,daily]=await Promise.all([getXauUsdCandles('1min',500),getXauUsdCandles('1day',120)]);
  return analyzeUnified(m1,2000,0,daily);
}
