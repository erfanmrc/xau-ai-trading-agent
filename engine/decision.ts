import { Candle, EconomicEvent, MarketBias, StrategyName, MarketPhase } from '@/types/market';
import { getXauUsdCandles } from '@/data/twelve-data';
import { detectSP2L } from '@/agents/sp2l';
import { detectProBTB } from '@/agents/pro-btb';
import { detectMicroMap } from '@/agents/micromap';
import { buildContext } from '@/engine/context';
import { assessLiquidityConfluence } from '@/engine/liquidity';
import { STRATEGY_CONFIG as C } from '@/config/strategy';

export type DecisionCandidate={
  strategy:StrategyName; direction:'LONG'|'SHORT'; score:number; entry:number; stop:number; signalTime:string;
  h1Filter:'PASS'|'BLOCK'|'NEUTRAL'; m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL';
  dailyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL'; weeklyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';
  phaseRelation:'PRIMARY'|'SUPPORTIVE'|'NEUTRAL'|'OPPOSE';
  confluenceScore:number; confluenceLabels:string[];
  liquidityScore:number; liquidityLabels:string[]; orderBlock:{low:number;high:number;direction:'LONG'|'SHORT';timeframe:string;strength:number}|null;
  liquiditySweep:{direction:'LONG'|'SHORT';side:'HIGH'|'LOW';level:number;time:string;strength:number;reclaimed:boolean}|null;
  volumeProfileStatus:'AVAILABLE'|'UNAVAILABLE'; fvg?:ReturnType<typeof detectSP2L>['fvg']; reasons:string[];
};

export type UnifiedDecision={
  symbol:'XAUUSD'; timestamp:string; context:ReturnType<typeof buildContext>;
  signals:Array<ReturnType<typeof detectSP2L>>; candidates:DecisionCandidate[];
  selection:{strategy:StrategyName;direction:'LONG'|'SHORT';score:number}|null;
  consensus:{direction:'LONG'|'SHORT'|null;validCount:number;alignedCount:number;eligibleCount:number;mode:'EXECUTE'|'WATCH'|'NO_TRADE';reason:string};
  message:string;
};

const clamp=(n:number)=>Math.max(0,Math.min(100,n));
function relation(b:MarketBias,d:'LONG'|'SHORT'):{label:'CONFIRM'|'OPPOSE'|'NEUTRAL'}{return {label:b==='NEUTRAL'?'NEUTRAL':b===d?'CONFIRM':'OPPOSE'};}
function phaseRelation(phase:MarketPhase,strategy:StrategyName):DecisionCandidate['phaseRelation']{
  if(strategy==='SP2L') return phase==='SPIKE'?'PRIMARY':phase==='CHANNEL'?'SUPPORTIVE':phase==='TRANSITION'?'SUPPORTIVE':'OPPOSE';
  if(strategy==='PRO_BTB') return phase==='CHANNEL'?'PRIMARY':phase==='SPIKE'?'SUPPORTIVE':phase==='TRANSITION'?'SUPPORTIVE':'NEUTRAL';
  return phase==='CHANNEL'?'PRIMARY':phase==='SPIKE'?'SUPPORTIVE':phase==='TRANSITION'?'SUPPORTIVE':'OPPOSE';
}

function enrich(signal:ReturnType<typeof detectSP2L>,context:ReturnType<typeof buildContext>):{score:number;h1Filter:'PASS'|'BLOCK'|'NEUTRAL';m15Relation:'CONFIRM'|'OPPOSE'|'NEUTRAL';dailyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';weeklyRelation:'CONFIRM'|'OPPOSE'|'NEUTRAL';phaseRelation:DecisionCandidate['phaseRelation']} {
  const d=signal.direction!;
  let score=signal.score;
  const h1Filter=context.h1==='NEUTRAL'?'NEUTRAL':context.h1===d?'PASS':'BLOCK';
  const m15Relation=relation(context.m15,d).label;
  const dailyRelation=relation(context.dailyBias,d).label;
  const weeklyRelation=relation(context.weeklyBias,d).label;
  const pRel=phaseRelation(context.phase,signal.strategy);
  if(h1Filter==='PASS') score+=7; else if(h1Filter==='BLOCK') score-=12;
  if(m15Relation==='CONFIRM') score+=5; else if(m15Relation==='OPPOSE') score-=4;
  if(dailyRelation==='CONFIRM') score+=10; else if(dailyRelation==='OPPOSE') score-=20;
  if(weeklyRelation==='CONFIRM') score+=3; else if(weeklyRelation==='OPPOSE') score-=4;
  if(pRel==='PRIMARY') score+=10; else if(pRel==='SUPPORTIVE') score+=5; else if(pRel==='OPPOSE') score-=12;
  if(context.regime.m5Trend.trend===d) score+=8;
  if(context.regime.m1Trend.trend===d) score+=7; else if(context.regime.m1Trend.trend==='NEUTRAL') score+=2; else score-=10;
  if(context.dailyPriceAction.entryReady===false && context.dailyPriceAction.confirmed) score-=5;
  if(context.economic.risk==='HIGH_IMPACT_NEAR') score-=10;
  return {score:clamp(score),h1Filter,m15Relation,dailyRelation,weeklyRelation,phaseRelation:pRel};
}

export function analyzeUnified(c:Candle[],balance=2000,spread=0,dailyCandles?:Candle[],economicEvents?:EconomicEvent[]):UnifiedDecision{
  const context=buildContext(c,dailyCandles,economicEvents);
  const signals=[detectSP2L(c,balance,spread,context),detectProBTB(c,balance,spread,context),detectMicroMap(c,balance,spread,context)];
  const valid=signals.filter(x=>x.status==='VALID'&&x.direction&&x.entry!=null&&x.stop!=null);
  const candidates=valid.map((s):DecisionCandidate=>{
    const e=enrich(s,context);
    const a=Math.max(context.liquidity.atrReference,0.25);
    const liq=assessLiquidityConfluence(context.liquidity,s.entry!,s.direction!,a);
    const hasFvg=s.fvg??null;
    const fvgBonus=hasFvg?Math.min(8,Math.round(hasFvg.strength*0.08)):0;
    const score=clamp(e.score+(s.confluence?.score??0)+Math.min(10,liq.score)+fvgBonus);
    return {
      strategy:s.strategy,direction:s.direction!,score,entry:s.entry!,stop:s.stop!,signalTime:c.at(-1)!.time,
      h1Filter:e.h1Filter,m15Relation:e.m15Relation,dailyRelation:e.dailyRelation,weeklyRelation:e.weeklyRelation,phaseRelation:e.phaseRelation,
      confluenceScore:s.confluence?.score??0,confluenceLabels:s.confluence?.labels??[],
      liquidityScore:liq.score,liquidityLabels:liq.labels,
      orderBlock:liq.orderBlock?{low:liq.orderBlock.low,high:liq.orderBlock.high,direction:liq.orderBlock.direction,timeframe:liq.orderBlock.timeframe,strength:liq.orderBlock.strength}:null,
      liquiditySweep:liq.sweep,volumeProfileStatus:context.liquidity.volumeProfile.status,fvg:hasFvg,reasons:[
        s.reason,`Market regime: ${context.phase}`,`Global bias: ${context.dailyBias}`,`M5 EMA50/60: ${context.regime.m5Trend.trend}`,`M1 EMA50/60: ${context.regime.m1Trend.trend}`,
        `Execution alignment: ${context.regime.executionAligned?'YES':'NO'}`,`FVG: ${hasFvg?'present':'none'}`,`Liquidity/OB: ${liq.labels.join(', ')||'none'}`,`Daily PA entry-ready: ${context.dailyPriceAction.entryReady===false?'NO':'YES/UNSPECIFIED'}`
      ]
    };
  });

  const eligible=candidates.filter(x=>{
    const globalBias=context.dailyBias;
    if(globalBias==='NEUTRAL') return false;
    if(x.direction!==globalBias) return false;
    if(!context.dailyPriceAction.confirmed || context.dailyPriceAction.correction) return false;
    if(!context.regime.executionAligned) return false;
    if(context.phase==='RANGE') return false;
    if(x.phaseRelation==='OPPOSE') return false;
    if(C.analysis.priceAction.requireLiquidityOrOrderBlock){
      const hasRequired=x.orderBlock?.direction===x.direction || x.liquidityLabels.some(label=>label.startsWith(`${x.direction}_`)&&label.includes('LIQUIDITY'));
      if(!hasRequired) return false;
    }
    return true;
  });

  const rank=(s:StrategyName)=>s==='SP2L'?3:s==='PRO_BTB'?2:1;
  const selection=eligible.slice().sort((a,b)=>{
    if(a.score!==b.score) return b.score-a.score;
    const ap=a.phaseRelation==='PRIMARY'?1:0,bp=b.phaseRelation==='PRIMARY'?1:0;
    if(ap!==bp) return bp-ap;
    return rank(b.strategy)-rank(a.strategy);
  })[0]??null;
  const validDirections=valid.map(x=>x.direction!);
  const long=validDirections.filter(x=>x==='LONG').length,short=validDirections.filter(x=>x==='SHORT').length;
  const direction=selection?.direction??(long>short?'LONG':short>long?'SHORT':null);
  const mode:UnifiedDecision['consensus']['mode']=selection?'EXECUTE':valid.length?'WATCH':'NO_TRADE';
  const reason=selection
    ?`${selection.strategy} selected: ${selection.direction} ${selection.phaseRelation.toLowerCase()} in ${context.phase}; M5=${context.regime.m5Trend.trend}, M1=${context.regime.m1Trend.trend}, Global=${context.dailyBias}.`
    :valid.length?'Valid setup exists but the market/EMA/global alignment or execution gate is not ready.':'No valid strategy entry yet';
  return {
    symbol:'XAUUSD',timestamp:c.at(-1)?.time??new Date().toISOString(),context,signals,candidates,
    selection:selection?{strategy:selection.strategy,direction:selection.direction,score:selection.score}:null,
    consensus:{direction,validCount:valid.length,alignedCount:eligible.length,eligibleCount:eligible.length,mode,reason},
    message:['XAU AI Trading Agent',`Global Bias: ${context.dailyBias}`,`Market Regime: ${context.phase}`,`M5 EMA: ${context.regime.m5Trend.trend} | M1 EMA: ${context.regime.m1Trend.trend}`,`EMA/Global alignment: ${context.regime.executionAligned?'YES':'NO'}`,`Spike: ${context.regime.spike?`${context.regime.spike.direction} ${context.regime.spike.candleCount} candles | ${context.regime.spike.displacementATR.toFixed(2)} ATR | FVG ${context.regime.spike.fvg?'YES':'NO'}`:'NONE'}`,`Daily PA: ${context.dailyPriceAction.state} / confirmed=${context.dailyPriceAction.confirmed?'YES':'NO'} / entryReady=${context.dailyPriceAction.entryReady===false?'NO':'YES/UNSPECIFIED'}`,`Liquidity: score=${context.liquidity.executionScore} | ${context.liquidity.executionLabels.join(', ')||'none'} | VP=${context.liquidity.volumeProfile.status}`,...signals.map(s=>`${s.strategy}: ${s.status}${s.direction?` ${s.direction}`:''} score=${s.score}`),`Valid candidates=${candidates.length}`,`Eligible candidates=${eligible.length}`,`Selected=${selection?`${selection.strategy} ${selection.direction} score=${selection.score}`:'NONE'}`,`Consensus=${mode}${direction?` ${direction}`:''}`,`Reason=${reason}`,`Economic=${context.economic.status}/${context.economic.risk}/${context.economic.bias}`].join('\n')
  };
}

export async function buildDecision(){
  const [m1,daily]=await Promise.all([getXauUsdCandles('1min',500),getXauUsdCandles('1day',120)]);
  return analyzeUnified(m1,2000,0,daily);
}
