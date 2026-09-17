import { Candle, Direction, StrategyName } from '@/types/market';
import { analyzeUnified } from '@/engine/decision';
import { BacktestConfig, BacktestInput, BacktestResult, BacktestTrade, BacktestOpportunity, BacktestStrategyStats } from '@/engine/backtest/types';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { buildRisk } from '@/engine/risk';
import { fastGate } from '@/engine/backtest/fast-gate';
import { atr, bodyRatio, candleDirection, closeLocation, resample } from '@/engine/indicators';
import { assessDailyPriceAction, summarizeStructure } from '@/engine/market-structure';

const DEFAULTS:BacktestConfig={
  balance:C.balance,
  riskPercent:C.riskPercent,
  dailyRiskLimitPercent:C.dailyMaxRiskPercent,
  maxTradesPerDay:0,
  maxTakeProfitsPerDay:0,
  spread:0.05,
  startIndex:60,
  execution:'NEXT_OPEN',
  allowX2:true,
  cooldownBars:C.analysis.execution.minCooldownBars,
  cooldownAfterLossBars:C.analysis.execution.minCooldownAfterLossBars,
  analysisWindowBars:360,
};

const day=(t:string)=>new Date(t).toISOString().slice(0,10);
const pipsRisk=(entry:number,stop:number,dir:Direction)=>dir==='LONG'?entry-stop:stop-entry;
const emptyStats=(strategy:StrategyName):BacktestStrategyStats=>({strategy,opportunities:0,valid:0,watch:0,invalid:0,executed:0,rejected:0,wins:0,losses:0,pnl:0,totalR:0,avgR:0,winRate:0,profitFactor:null});
const riskDollars=(entry:number,stop:number,lot:number,spread:number)=> (Math.abs(entry-stop)+Math.max(spread,0))*lot*C.contractSize;
const initialRiskPercent=(lot:number,entry:number,stop:number,balance:number,spread:number)=>riskDollars(entry,stop,lot,spread)/Math.max(balance,1e-9)*100;

function targetPlan(source:ReturnType<typeof analyzeUnified>['signals'][number],entry:number,stop:number,spread:number){
  const leg1=source.targetLegSize??0;
  const targetDistance=Math.max(leg1-Math.max(spread,0),0);
  const effectiveStop=(source.direction==='LONG'?entry-stop:stop-entry)+Math.max(spread,0);
  const rr=targetDistance/Math.max(effectiveStop,1e-9);
  return {leg1,targetDistance,rr,tp:source.direction==='LONG'?entry+targetDistance:entry-targetDistance};
}

export function runBacktest(input:BacktestInput):BacktestResult {
  const candles=input.candles.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const cfg={...DEFAULTS,...input.config};
  const prop={profitTargetPct:10,maxTotalDrawdownPct:12,maxDailyDrawdownPct:5,minTradingDays:3,...input.propRules};
  let balance=cfg.balance, peak=balance, dayStart=balance, currentDay='';

  type OpenPosition={
    strategy:StrategyName;direction:Direction;signalTime:string;entryTime:string;entryBar:number;entry:number;entry2:number|null;lot:number;lot2:number;stop:number;tp:number;
    plannedRiskPercent:number;initialRiskPercent:number;x2RiskPercent:number;x2Activated:boolean;x2ActivationTime:string|null;favorableMove:number;mfeR:number;setupScore:number;x2TriggeredAtR:number|null;
    targetLegSize:number;targetDistance:number;plannedRR:number;targetReached:boolean;
    marketPhase:string;dailyBias:string;weeklyBias:string;dailyTrendState:string;
  };
  let open:OpenPosition|null=null;

  const trades:BacktestTrade[]=[];
  const opportunities:BacktestOpportunity[]=[];
  const dailyPnl=new Map<string,number>();
  const dailyRiskUsed=new Map<string,number>();
  const dailyActualRisk=new Map<string,number>();
  const dailyTrades=new Map<string,number>();
  const rejectionCounts=new Map<string,number>();
  const stats=new Map<StrategyName,BacktestStrategyStats>([['SP2L',emptyStats('SP2L')],['PRO_BTB',emptyStats('PRO_BTB')],['MICROMAP',emptyStats('MICROMAP')]]);
  const dailySeries=(input.dailyCandles??[]).slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const dailyPACache=new Map<string,ReturnType<typeof assessDailyPriceAction>>();
  const getDailyPriceActionForDay=(dayKey:string)=>{
    const cached=dailyPACache.get(dayKey);
    if(cached) return cached;
    const prior=dailySeries.filter(x=>day(x.time)<dayKey);
    const result=assessDailyPriceAction(prior);
    dailyPACache.set(dayKey,result);
    dailyPAStates.set(dayKey,result);
    return result;
  };
  const lastTradeIndex=new Map<StrategyName,number>();
  const lastLossIndex=new Map<StrategyName,number>();
  let maxDD=0,maxDailyDD=0,maxDailyRiskUsed=0,maxDailyActualRisk=0;
  let deepAnalysisCount=0,fastGateSkipCount=0;
  let dailyTrendBlockedCandles=0,dailyTrendPrecheckCount=0;
  const dailyPAStates=new Map<string,ReturnType<typeof assessDailyPriceAction>>();

  const addRejection=(reason:string)=>rejectionCounts.set(reason,(rejectionCounts.get(reason)||0)+1);
  const addOpportunity=(o:BacktestOpportunity)=>{
    opportunities.push(o);
    const st=stats.get(o.strategy)!;
    st.opportunities++;
    if(o.status==='VALID') st.valid++;
    if(o.status==='WATCH') st.watch++;
    if(o.status==='INVALID') st.invalid++;
    if(o.action==='REJECT'){
      st.rejected++;
      if(o.rejectionReason) addRejection(o.rejectionReason);
    }
  };

  const equityAt=(price:number,pos:OpenPosition|null)=>{
    if(!pos) return balance;
    const long=pos.direction==='LONG';
    let floating=(long?price-pos.entry:pos.entry-price)*pos.lot*C.contractSize;
    if(pos.x2Activated && pos.lot2&&pos.entry2!==null) floating+=(long?price-pos.entry2:pos.entry2-price)*pos.lot2*C.contractSize;
    return balance+floating;
  };
  const updateDrawdown=(price:number)=>{
    const equity=equityAt(price,open);
    peak=Math.max(peak,equity);
    maxDD=Math.max(maxDD,(peak-equity)/Math.max(peak,1e-9)*100);
    const ddDay=Math.max(0,(dayStart-equity)/Math.max(dayStart,1e-9)*100);
    maxDailyDD=Math.max(maxDailyDD,ddDay);
  };
  const recordTrade=(trade:BacktestTrade)=>{
    trades.push(trade);
    const st=stats.get(trade.strategy)!;
    if(trade.pnl>0) st.wins++; else if(trade.pnl<0) st.losses++;
    st.pnl+=trade.pnl; st.totalR+=trade.rMultiple;
  };

  const markOpportunity=(index:number,strategy:StrategyName,action:'EXECUTE'|'WATCH'|'REJECT',reason:string|null)=>{
    for(let oi=opportunities.length-1;oi>=0;oi--){
      const o=opportunities[oi];
      if(o.index===index && o.strategy===strategy && o.status==='VALID'){
        if(o.action==='EXECUTE' && action==='REJECT') stats.get(strategy)!.rejected++;
        o.action=action;
        o.rejectionReason=reason;
        if(action==='REJECT' && reason) addRejection(reason);
        break;
      }
    }
  };

  for(let i=Math.max(cfg.startIndex??60,1);i<candles.length;i++){
    const c=candles[i];
    const d=day(c.time);
    if(d!==currentDay){
      currentDay=d;
      dayStart=balance;
      dailyPnl.set(d,dailyPnl.get(d)||0);
      dailyRiskUsed.set(d,dailyRiskUsed.get(d)||0);
      dailyActualRisk.set(d,dailyActualRisk.get(d)||0);
      dailyTrades.set(d,dailyTrades.get(d)||0);
    }

    if(open){
      const long=open.direction==='LONG';
      const prior=candles[i-1];
      const closeFavorable=prior ? (long?Math.max(0,prior.close-open.entry):Math.max(0,open.entry-prior.close)) : 0;
      open.favorableMove=Math.max(open.favorableMove,closeFavorable);
      const firstStopDistance=pipsRisk(open.entry,open.stop,open.direction);
      const firstRiskDistance=firstStopDistance+Math.max(cfg.spread,0);
      const favorableThreshold=Math.max(cfg.spread*2,firstStopDistance*C.analysis.execution.minFavorableRForX2);
      const intrabarMfe=long?Math.max(0,c.high-open.entry):Math.max(0,open.entry-c.low);
      open.mfeR=Math.max(open.mfeR,intrabarMfe/Math.max(firstRiskDistance,1e-9));
      const x2CanActivate=i>open.entryBar && open.favorableMove>=favorableThreshold;
      if(!open.x2Activated && open.entry2!==null && open.lot2>0 && x2CanActivate){
        const x2Hit=long?c.low<=open.entry2:c.high>=open.entry2;
        const currentUsed=dailyRiskUsed.get(currentDay)||0;
        const x2WithinDailyBudget=currentUsed+open.x2RiskPercent<=cfg.dailyRiskLimitPercent+1e-9;
        if(x2Hit && x2WithinDailyBudget){
          open.x2Activated=true;
          open.x2ActivationTime=c.time;
          open.x2TriggeredAtR=Number((open.favorableMove/Math.max(firstStopDistance,1e-9)).toFixed(3));
          dailyRiskUsed.set(currentDay,currentUsed+open.x2RiskPercent);
          dailyActualRisk.set(currentDay,(dailyActualRisk.get(currentDay)||0)+open.x2RiskPercent);
        }
      }

      const hitStop=long?c.low<=open.stop:c.high>=open.stop;
      if(hitStop){
        const exit=open.stop;
        const outcome:'SL'='SL';
        let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
        if(open.x2Activated && open.lot2&&open.entry2!==null) pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
        balance+=pnl;
        dailyPnl.set(currentDay,(dailyPnl.get(currentDay)||0)+pnl);
        const firstRiskDollars=riskDollars(open.entry,open.stop,open.lot,cfg.spread);
        const secondRiskDollars=open.x2Activated&&open.entry2!==null?riskDollars(open.entry2,open.stop,open.lot2,cfg.spread):0;
        const actualRisk=Math.max(firstRiskDollars+secondRiskDollars,1e-9);
        const actualRiskPct=actualRisk/Math.max(balance-pnl,1e-9)*100;
        recordTrade({
          id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:c.time,
          entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.x2Activated?open.lot2:0,entry2:open.entry2??null,
          x2Triggered:open.x2Activated,x2ActivationTime:open.x2ActivationTime,initialRiskPercent:open.initialRiskPercent,x2RiskPercent:open.x2Activated?open.x2RiskPercent:0,
          plannedRiskPercent:open.plannedRiskPercent,actualRiskPercent:Number(actualRiskPct.toFixed(4)),pnl,rMultiple:pnl/actualRisk,outcome,
          diagnostics:{x2TriggeredAtR:open.x2TriggeredAtR,mfeR:Number(open.mfeR.toFixed(3)),setupScore:open.setupScore,marketPhase:open.marketPhase,dailyBias:open.dailyBias,weeklyBias:open.weeklyBias,exitReason:'STOP',targetReached:open.targetReached,plannedRR:open.plannedRR,leg1Size:open.targetLegSize,dailyTrendState:open.dailyTrendState}
        });
        lastLossIndex.set(open.strategy,i);
        open=null;
      }else{
        const hitTarget=long?c.high>=open.tp:c.low<=open.tp;
        if(hitTarget){
          // Profit is closed strictly at the precomputed TP level. Market-trend
          // analysis governs NEW entries only; it never turns a TP into an early
          // discretionary exit.
          const exit=open.tp;
          open.targetReached=true;
          const outcome:'TP'='TP';
          let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
          if(open.x2Activated && open.lot2&&open.entry2!==null) pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
          balance+=pnl;
          dailyPnl.set(currentDay,(dailyPnl.get(currentDay)||0)+pnl);
          const firstRiskDollars=riskDollars(open.entry,open.stop,open.lot,cfg.spread);
          const secondRiskDollars=open.x2Activated&&open.entry2!==null?riskDollars(open.entry2,open.stop,open.lot2,cfg.spread):0;
          const actualRisk=Math.max(firstRiskDollars+secondRiskDollars,1e-9);
          const actualRiskPct=actualRisk/Math.max(balance-pnl,1e-9)*100;
          recordTrade({
            id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:c.time,
            entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.x2Activated?open.lot2:0,entry2:open.entry2??null,
            x2Triggered:open.x2Activated,x2ActivationTime:open.x2ActivationTime,initialRiskPercent:open.initialRiskPercent,x2RiskPercent:open.x2Activated?open.x2RiskPercent:0,
            plannedRiskPercent:open.plannedRiskPercent,actualRiskPercent:Number(actualRiskPct.toFixed(4)),pnl,rMultiple:pnl/actualRisk,outcome,
            diagnostics:{x2TriggeredAtR:open.x2TriggeredAtR,mfeR:Number(open.mfeR.toFixed(3)),setupScore:open.setupScore,marketPhase:open.marketPhase,dailyBias:open.dailyBias,weeklyBias:open.weeklyBias,exitReason:'TARGET',targetReached:true,plannedRR:open.plannedRR,leg1Size:open.targetLegSize,dailyTrendState:open.dailyTrendState}
          });
          open=null;
        }
      }
    }

    updateDrawdown(c.close);
    const used=dailyRiskUsed.get(currentDay)||0;
    const actualUsed=dailyActualRisk.get(currentDay)||0;
    maxDailyRiskUsed=Math.max(maxDailyRiskUsed,used);
    maxDailyActualRisk=Math.max(maxDailyActualRisk,actualUsed);
    if(open) continue;

    const todayTrades=dailyTrades.get(currentDay)||0;
    // maxTradesPerDay=0 means unlimited. There is deliberately no daily
    // take-profit-count limit; the remaining daily safety control is risk.
    if((cfg.maxTradesPerDay>0 && todayTrades>=cfg.maxTradesPerDay) || used>=cfg.dailyRiskLimitPercent-1e-9 || balance<=0) continue;

    // Daily direction is decided by price action, not by Daily swing labels.
    // The Daily H/L structure remains available for execution/levels only.
    dailyTrendPrecheckCount++;
    const dailyPA=getDailyPriceActionForDay(currentDay);
    if(C.analysis.spike.requireDailyTrend && (!dailyPA.confirmed || !dailyPA.entryReady || dailyPA.bias==='NEUTRAL' || dailyPA.correction)){
      dailyTrendBlockedCandles++;
      addRejection(`Daily price action is ${dailyPA.state}; ${dailyPA.reason}`);
      continue;
    }

    const gate=fastGate(candles.slice(Math.max(0,i-9),i+1));
    let signal;
    if(gate.deepAnalysis){
      deepAnalysisCount++;
      const windowBars=Math.max(240,Math.min(cfg.analysisWindowBars,candles.length));
      const analysisStart=Math.max(0,i+1-windowBars);
      signal=analyzeUnified(candles.slice(analysisStart,i+1),balance,cfg.spread,input.dailyCandles,input.economicEvents);
    } else {
      fastGateSkipCount++;
      signal={
        symbol:'XAUUSD',timestamp:c.time,
        context: { bias:'NEUTRAL',h1:'NEUTRAL',m15:'NEUTRAL',m5:'NEUTRAL',m1:'NEUTRAL',dailyBias:'NEUTRAL',weeklyBias:'NEUTRAL',phase:'TRANSITION',motherMove:null,alignmentScore:0,aligned:false,session:undefined,importantLevels:{round5:Math.round(c.close/5)*5,round10:Math.round(c.close/10)*10,previousDayHigh:null,previousDayLow:null,previousDayMid:null,sessionHigh:null,sessionLow:null,sessionMid:null,rangeHigh:null,rangeLow:null,rangeMid:null,sma50M5:null,sma60M5:null,sma50M15:null,sma60M15:null,sma50H1:null,sma60H1:null,ema20M5:null,ema50M5:null,ema20M15:null,m15SwingHigh:null,m15SwingLow:null},liquidity:{previousDayHigh:null,previousDayLow:null,sessionHigh:null,sessionLow:null,rangeHigh:null,rangeLow:null},dailyPriceAction:{state:'UNCLEAR',bias:'NEUTRAL',confirmed:false,entryReady:false,correction:false,score:0,pressure:0,recentImpulse:0,candleQuality:0,reason:'Fast gate skipped deep analysis'},
          economic:{status:'UNAVAILABLE',risk:'NONE',bias:'NEUTRAL',upcoming:[],notes:['Fast gate skipped deep analysis']}
        },
        signals:[
          {strategy:'SP2L',status:'INVALID',score:0,reason:'Fast gate: candle cannot trigger a valid SP2L entry',reasons:['No valid entry-trigger geometry on current candle'],warnings:['Deep analysis skipped for performance'],direction:null},
          {strategy:'PRO_BTB',status:'INVALID',score:0,reason:'Fast gate: candle cannot trigger a valid BTB entry',reasons:['No valid rejection-trigger geometry on current candle'],warnings:['Deep analysis skipped for performance'],direction:null},
          {strategy:'MICROMAP',status:'INVALID',score:0,reason:'Fast gate: candle cannot trigger a valid Micro-MAP entry',reasons:['No valid trigger candle on current bar'],warnings:['Deep analysis skipped for performance'],direction:null}
        ],
        candidates:[],selection:null,
        consensus:{direction:null,validCount:0,alignedCount:0,eligibleCount:0,mode:'NO_TRADE',reason:'Fast gate skipped deep strategy analysis'},
        message:'Fast gate skipped deep strategy analysis'
      } as unknown as ReturnType<typeof analyzeUnified>;
    }
    const chosen=signal.selection;
    for(const s of signal.signals){
      const candidate=signal.candidates.find(x=>x.strategy===s.strategy);
      let action:'EXECUTE'|'WATCH'|'REJECT'='WATCH';
      let rejectionReason:string|null=null;
      if(s.status==='VALID' && candidate){
        if(chosen?.strategy===s.strategy) action='EXECUTE';
        else if(candidate.h1Filter==='BLOCK'){action='REJECT';rejectionReason='H1 filter blocks the strategy direction';}
        else if(candidate.dailyRelation!=='CONFIRM'){action='REJECT';rejectionReason=`Daily price action does not confirm ${candidate.direction}: ${signal.context.dailyPriceAction.state}`;}
        else if(signal.context.phase==='RANGE'){action='REJECT';rejectionReason='Market phase is RANGE; no entry in range interior';}
        else if(!chosen){action='REJECT';rejectionReason='No eligible strategy selected after hard filters';}
        else {action='REJECT';rejectionReason=`Another eligible candidate selected: ${chosen.strategy}`;}
      } else if(s.status==='INVALID'){ action='REJECT'; rejectionReason=s.reason; }
      addOpportunity({
        index:i,time:c.time,strategy:s.strategy,direction:s.direction??null,status:s.status,action,score:candidate?.score??s.score,reason:s.reason,rejectionReason,
        entry:s.entry??null,stop:s.stop??null,h1:signal.context.h1,m15:signal.context.m15,m5:signal.context.m5,m1:signal.context.m1,
        dailyBias:signal.context.dailyBias,weeklyBias:signal.context.weeklyBias,phase:signal.context.phase,phaseRelation:candidate?.phaseRelation??'NEUTRAL',
        confluenceScore:candidate?.confluenceScore??s.confluence?.score??0,confluenceLabels:candidate?.confluenceLabels??s.confluence?.labels??[],
        dailyTrendHighLabel:signal.context.structure?.daily?.highLabel??null,
        dailyTrendLowLabel:signal.context.structure?.daily?.lowLabel??null,
        dailyTrendState:signal.context.dailyPriceAction?.state??'UNCLEAR'
      });
    }

    if(!chosen) continue;
    const source=signal.signals.find(x=>x.strategy===chosen.strategy);
    if(!source?.direction||source.entry==null||source.stop==null||!source.risk){markOpportunity(i,chosen.strategy,'REJECT','Selected signal lacks complete entry/risk plan');continue;}

    const lastTrade=lastTradeIndex.get(chosen.strategy);
    if(lastTrade!=null && i-lastTrade<cfg.cooldownBars){
      markOpportunity(i,chosen.strategy,'REJECT',`Strategy cooldown active (${cfg.cooldownBars} bars)`); continue;
    }
    const lastLoss=lastLossIndex.get(chosen.strategy);
    if(lastLoss!=null && i-lastLoss<cfg.cooldownAfterLossBars){
      markOpportunity(i,chosen.strategy,'REJECT',`Post-loss cooldown active (${cfg.cooldownAfterLossBars} bars)`); continue;
    }

    const entry=i+1<candles.length&&cfg.execution==='NEXT_OPEN'?candles[i+1].open:source.entry;
    const stop=source.stop;
    const entryRisk=pipsRisk(entry,stop,source.direction);
    if(entryRisk<=0){markOpportunity(i,chosen.strategy,'REJECT','Entry/stop geometry is invalid after execution-price adjustment');continue;}

    const plan=targetPlan(source,entry,stop,cfg.spread);
    const stage=source.targetMode==='X2_LEG1_MINUS_SPREAD'?'X2':source.targetMode==='SINGLE_LEG1_MINUS_SPREAD'?'SINGLE':'OTHER';
    const targetAllowed=stage==='SINGLE'
      ? plan.rr>=C.singleStageMinRR-1e-9 && plan.rr<=C.singleStageMaxRR+1e-9
      : stage==='X2'
        ? plan.rr>=C.twoStageMinRR-1e-9 && plan.rr<=C.twoStageMaxRR+1e-9
        : chosen.strategy==='PRO_BTB'
          ? plan.rr>=C.btbMinRR-1e-9
          : chosen.strategy==='MICROMAP'
            ? plan.rr>=C.analysis.microMap.minRR-1e-9
            : false;
    if(!targetAllowed){markOpportunity(i,chosen.strategy,'REJECT',`Leg-1 target RR ${plan.rr.toFixed(2)}R falls outside ${stage==='SINGLE'?'1-2R':stage==='X2'?'2-5R':stage==='OTHER'&&chosen.strategy==='MICROMAP'?'>4R':'BTB >=2R'} after execution-price adjustment`);continue;}

    const x2EnabledForTrade=cfg.allowX2 && chosen.strategy!=='MICROMAP' && stage!=='SINGLE';
    const liveRisk=buildRisk(source.direction,entry,stop,balance,C.riskPercent,cfg.spread,plan.rr,x2EnabledForTrade);
    if(!liveRisk.tradable||!liveRisk.lotSize){markOpportunity(i,chosen.strategy,'REJECT','Risk engine rejected the position size');continue;}
    if(stage==='X2' && (!liveRisk.x2Entry||!liveRisk.x2LotSize)){markOpportunity(i,chosen.strategy,'REJECT','Two-stage setup requires the combined 1% X2 risk plan');continue;}
    const initialRisk=initialRiskPercent(liveRisk.lotSize,entry,stop,balance,cfg.spread);
    const combinedRisk=liveRisk.combinedRiskPercent??initialRisk;
    const x2RiskPct=x2EnabledForTrade&&liveRisk.x2Entry!==null&&liveRisk.x2LotSize!==null?Math.max(0,combinedRisk-initialRisk):0;
    const nowUsed=dailyRiskUsed.get(currentDay)||0;
    // At entry only the first 0.5% is committed. The extra ~0.5% is committed
    // only when X2 actually activates at the midpoint.
    if(nowUsed+initialRisk>cfg.dailyRiskLimitPercent+1e-9){markOpportunity(i,chosen.strategy,'REJECT','Daily initial-risk budget would be exceeded');continue;}

    const tp=plan.tp;
    const entry2=x2EnabledForTrade?liveRisk.x2Entry??null:null;
    const lot2=x2EnabledForTrade?liveRisk.x2LotSize??0:0;
    const entryTime=i+1<candles.length&&cfg.execution==='NEXT_OPEN'?candles[i+1].time:c.time;
    open={
      strategy:chosen.strategy,direction:chosen.direction,signalTime:c.time,entryTime,entryBar:(i+1<candles.length&&cfg.execution==='NEXT_OPEN'?i+1:i),entry,entry2,lot:liveRisk.lotSize,lot2,stop,tp,
      plannedRiskPercent:Number((initialRisk+x2RiskPct).toFixed(4)),initialRiskPercent:Number(initialRisk.toFixed(4)),x2RiskPercent:Number(x2RiskPct.toFixed(4)),
      x2Activated:false,x2ActivationTime:null,favorableMove:0,mfeR:0,setupScore:chosen.score,x2TriggeredAtR:null,
      targetLegSize:plan.leg1,targetDistance:plan.targetDistance,plannedRR:plan.rr,targetReached:false,
      marketPhase:signal.context.phase,dailyBias:signal.context.dailyBias,weeklyBias:signal.context.weeklyBias,
      dailyTrendState:signal.context.dailyPriceAction.state
    };
    dailyRiskUsed.set(currentDay,nowUsed+initialRisk);
    dailyActualRisk.set(currentDay,(dailyActualRisk.get(currentDay)||0)+initialRisk);
    dailyTrades.set(currentDay,(dailyTrades.get(currentDay)||0)+1);
    lastTradeIndex.set(chosen.strategy,i);
    stats.get(chosen.strategy)!.executed++;
  }

  if(open){
    const last=candles.at(-1)!; const long=open.direction==='LONG'; const exit=last.close;
    let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
    if(open.x2Activated && open.lot2&&open.entry2!==null) pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
    balance+=pnl;
    const lastDay=day(last.time);
    dailyPnl.set(lastDay,(dailyPnl.get(lastDay)||0)+pnl);
    const firstRiskDollars=riskDollars(open.entry,open.stop,open.lot,cfg.spread);
    const secondRiskDollars=open.x2Activated&&open.entry2!==null?riskDollars(open.entry2,open.stop,open.lot2,cfg.spread):0;
    const actualRisk=Math.max(firstRiskDollars+secondRiskDollars,1e-9);
    const actualRiskPct=actualRisk/Math.max(balance-pnl,1e-9)*100;
    recordTrade({
      id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:last.time,
      entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.x2Activated?open.lot2:0,entry2:open.entry2??null,
      x2Triggered:open.x2Activated,x2ActivationTime:open.x2ActivationTime,initialRiskPercent:open.initialRiskPercent,x2RiskPercent:open.x2Activated?open.x2RiskPercent:0,
      plannedRiskPercent:open.plannedRiskPercent,actualRiskPercent:Number(actualRiskPct.toFixed(4)),pnl,rMultiple:pnl/actualRisk,outcome:'EOD',diagnostics:{x2TriggeredAtR:open.x2TriggeredAtR,mfeR:Number(open.mfeR.toFixed(3)),setupScore:open.setupScore,marketPhase:open.marketPhase,dailyBias:open.dailyBias,weeklyBias:open.weeklyBias,exitReason:'EOD',targetReached:open.targetReached,plannedRR:open.plannedRR,leg1Size:open.targetLegSize,dailyTrendState:open.dailyTrendState}
    });
    open=null;
    updateDrawdown(last.close);
  }

  for(const st of stats.values()){
    st.avgR=st.executed?Number((st.totalR/st.executed).toFixed(3)):0;
    st.winRate=st.executed?Number((st.wins/st.executed*100).toFixed(2)):0;
    const gp=trades.filter(t=>t.strategy===st.strategy&&t.pnl>0).reduce((s,t)=>s+t.pnl,0);
    const gl=-trades.filter(t=>t.strategy===st.strategy&&t.pnl<0).reduce((s,t)=>s+t.pnl,0);
    st.profitFactor=gl>0?Number((gp/gl).toFixed(3)):null;
    st.pnl=Number(st.pnl.toFixed(2)); st.totalR=Number(st.totalR.toFixed(3));
  }

  const net=balance-cfg.balance;
  const wins=trades.filter(t=>t.pnl>0).length;
  const losses=trades.filter(t=>t.pnl<0).length;
  const eod=trades.filter(t=>t.outcome==='EOD').length;
  const gp=trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0);
  const gl=-trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
  const days=[...new Set(trades.map(t=>day(t.entryTime)))];
  const dataDays=[...new Set(candles.map(x=>day(x.time)))];
  const worstDailyDollars=Math.max(0,...Array.from(dailyPnl.values()).map(x=>-x));

  return {
    config:cfg,
    initialBalance:cfg.balance,
    finalBalance:Number(balance.toFixed(2)),
    netPnl:Number(net.toFixed(2)),
    returnPct:Number((net/cfg.balance*100).toFixed(2)),
    trades,
    tradeCount:trades.length,
    wins,
    losses,
    eod,
    winRate:trades.length?Number((wins/trades.length*100).toFixed(2)):0,
    grossProfit:Number(gp.toFixed(2)),
    grossLoss:Number(gl.toFixed(2)),
    profitFactor:gl>0?Number((gp/gl).toFixed(3)):null,
    avgR:trades.length?Number((trades.reduce((s,t)=>s+t.rMultiple,0)/trades.length).toFixed(3)):0,
    maxDrawdownPct:Number(maxDD.toFixed(2)),
    maxDailyDrawdownPct:Number(maxDailyDD.toFixed(2)),
    maxDailyLossDollars:Number(worstDailyDollars.toFixed(2)),
    maxDailyRiskUsedPercent:Number(maxDailyRiskUsed.toFixed(2)),
    maxDailyActualRiskPercent:Number(maxDailyActualRisk.toFixed(2)),
    propRules:prop,
    reachedProfitTarget:net/cfg.balance*100>=prop.profitTargetPct,
    breachedMaxDrawdown:maxDD>=prop.maxTotalDrawdownPct,
    breachedDailyDrawdown:maxDailyDD>=prop.maxDailyDrawdownPct,
    tradingDays:days.length,
    tradingDaySet:days,
    opportunityCount:opportunities.length,
    validOpportunities:opportunities.filter(x=>x.status==='VALID'),
    opportunityStats:[...stats.values()],
    rejectionReasons:[...rejectionCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})),
    performance:{mode:'TWO_STAGE_FAST',scannedCandles:candles.length,deepAnalysisCount,fastGateSkipCount,deepAnalysisPct:Number((deepAnalysisCount/Math.max(candles.length,1)*100).toFixed(2)),dailyTrendBlockedCandles,dailyTrendPrecheckCount,dailyPAByDay:[...dailyPAStates.entries()].map(([day,state])=>({day,state:state.state,bias:state.bias,confirmed:state.confirmed,entryReady:state.entryReady,correction:state.correction,score:state.score,pressure:state.pressure,recentImpulse:state.recentImpulse,candleQuality:state.candleQuality,reason:state.reason}))} as any,
    dataCoverage:{start:candles[0]?.time??null,end:candles.at(-1)?.time??null,calendarDays:dataDays.length,tradingDaysWithData:dataDays.length,candles:candles.length}
  };
}
