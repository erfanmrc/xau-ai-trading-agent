import { Candle, Direction, StrategyName } from '@/types/market';
import { analyzeUnified } from '@/engine/decision';
import { BacktestConfig, BacktestInput, BacktestResult, BacktestTrade, BacktestOpportunity, BacktestStrategyStats } from '@/engine/backtest/types';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { buildRisk } from '@/engine/risk';

const DEFAULTS:BacktestConfig={balance:C.balance,riskPercent:C.riskPercent,dailyRiskLimitPercent:C.dailyMaxRiskPercent,maxTradesPerDay:3,spread:0.05,startIndex:60,execution:'NEXT_OPEN',allowX2:true};
const day=(t:string)=>new Date(t).toISOString().slice(0,10);
const pipsRisk=(entry:number,stop:number,dir:Direction)=>dir==='LONG'?entry-stop:stop-entry;
const emptyStats=(strategy:StrategyName):BacktestStrategyStats=>({strategy,opportunities:0,valid:0,watch:0,invalid:0,executed:0,rejected:0,wins:0,losses:0,pnl:0,totalR:0,avgR:0,winRate:0,profitFactor:null});

export function runBacktest(input:BacktestInput):BacktestResult {
  const candles=input.candles.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const cfg={...DEFAULTS,...input.config};
  const prop={profitTargetPct:10,maxTotalDrawdownPct:12,maxDailyDrawdownPct:5,minTradingDays:3,...input.propRules};
  let balance=cfg.balance, peak=balance, dayStart=balance, currentDay='';
  let open:{strategy:StrategyName;direction:Direction;signalTime:string;entryTime:string;entry:number;entry2:number|null;lot:number;lot2:number;stop:number;tp:number;plannedRiskPercent:number}|null=null;
  const trades:BacktestTrade[]=[];
  const opportunities:BacktestOpportunity[]=[];
  const dailyPnl=new Map<string,number>();
  const dailyRiskUsed=new Map<string,number>();
  const dailyTrades=new Map<string,number>();
  const rejectionCounts=new Map<string,number>();
  const stats=new Map<StrategyName,BacktestStrategyStats>([['SP2L',emptyStats('SP2L')],['PRO_BTB',emptyStats('PRO_BTB')],['MICROMAP',emptyStats('MICROMAP')]]);
  let maxDD=0,maxDailyDD=0,maxDailyRiskUsed=0;

  const addRejection=(reason:string)=>rejectionCounts.set(reason,(rejectionCounts.get(reason)||0)+1);
  const addOpportunity=(o:BacktestOpportunity)=>{
    opportunities.push(o);
    const st=stats.get(o.strategy)!;
    st.opportunities++;
    if(o.status==='VALID')st.valid++;
    if(o.status==='WATCH')st.watch++;
    if(o.status==='INVALID')st.invalid++;
    if(o.action==='REJECT'){st.rejected++;if(o.rejectionReason)addRejection(o.rejectionReason);}
  };
  const equityAt=(price:number, pos:typeof open)=>{
    if(!pos)return balance;
    const long=pos.direction==='LONG';
    let floating=(long?price-pos.entry:pos.entry-price)*pos.lot*C.contractSize;
    if(pos.lot2&&pos.entry2!==null) floating+=(long?price-pos.entry2:pos.entry2-price)*pos.lot2*C.contractSize;
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
    if(trade.pnl>0)st.wins++; else if(trade.pnl<0)st.losses++;
    st.pnl+=trade.pnl; st.totalR+=trade.rMultiple;
  };

  for(let i=Math.max(cfg.startIndex??60,1);i<candles.length;i++){
    const c=candles[i];
    const d=day(c.time);
    if(d!==currentDay){currentDay=d;dayStart=balance;dailyPnl.set(d,dailyPnl.get(d)||0);dailyRiskUsed.set(d,dailyRiskUsed.get(d)||0);dailyTrades.set(d,dailyTrades.get(d)||0);}

    if(open){
      const hi=c.high,lo=c.low,long=open.direction==='LONG';
      const hitStop=long?lo<=open.stop:hi>=open.stop;
      const hitTp=long?hi>=open.tp:lo<=open.tp;
      if(hitStop||hitTp){
        const exit=hitStop&&hitTp?open.stop:(hitStop?open.stop:open.tp);
        const outcome:BacktestTrade['outcome']=hitStop?'SL':'TP';
        let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
        if(open.lot2&&open.entry2!==null)pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
        balance+=pnl;
        dailyPnl.set(currentDay,(dailyPnl.get(currentDay)||0)+pnl);
        const risk=Math.max(Math.abs(open.entry-open.stop)*open.lot*C.contractSize + (open.lot2&&open.entry2!==null?Math.abs(open.entry2-open.stop)*open.lot2*C.contractSize:0),1e-9);
        recordTrade({id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:c.time,entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.lot2||0,entry2:open.entry2??null,pnl,rMultiple:pnl/risk,plannedRiskPercent:open.plannedRiskPercent,outcome});
        open=null;
      }
    }

    updateDrawdown(c.close);
    const used=dailyRiskUsed.get(currentDay)||0;
    maxDailyRiskUsed=Math.max(maxDailyRiskUsed,used);
    if(open) continue;

    const todayTrades=dailyTrades.get(currentDay)||0;
    if(todayTrades>=cfg.maxTradesPerDay || used>=cfg.dailyRiskLimitPercent-1e-9 || balance<=0) continue;

    const signal=analyzeUnified(candles.slice(0,i+1),balance,cfg.spread);
    const chosen=signal.selection;
    for(const s of signal.signals){
      const candidate=signal.candidates.find(x=>x.strategy===s.strategy);
      let action:'EXECUTE'|'WATCH'|'REJECT'='WATCH';
      let rejectionReason:string|null=null;
      if(s.status==='VALID' && candidate){
        if(chosen?.strategy===s.strategy) action='EXECUTE';
        else if(candidate.h1Filter==='BLOCK'){action='REJECT';rejectionReason='H1 filter blocks the strategy direction';}
        else {action='REJECT';rejectionReason=`Another valid candidate scored higher: ${chosen?.strategy??'none selected'}`;}
      }else if(s.status==='INVALID'){action='REJECT';rejectionReason=s.reason;}
      else {action='WATCH';}
      addOpportunity({index:i,time:c.time,strategy:s.strategy,direction:s.direction??null,status:s.status,action,score:candidate?.score??s.score,reason:s.reason,rejectionReason,entry:s.entry??null,stop:s.stop??null,h1:signal.context.h1,m15:signal.context.m15,m5:signal.context.m5,m1:signal.context.m1,confluenceScore:candidate?.confluenceScore??s.confluence?.score??0,confluenceLabels:candidate?.confluenceLabels??s.confluence?.labels??[]});
    }

    if(!chosen) continue;
    const source=signal.signals.find(x=>x.strategy===chosen.strategy);
    const markSelectedRejected=(reason:string)=>{
      for(let oi=opportunities.length-1;oi>=0;oi--){
        if(opportunities[oi].index===i && opportunities[oi].strategy===chosen.strategy && opportunities[oi].action==='EXECUTE'){
          opportunities[oi].action='REJECT';opportunities[oi].rejectionReason=reason;
          stats.get(chosen.strategy)!.rejected++;addRejection(reason);break;
        }
      }
    };
    if(!source?.direction||source.entry==null||source.stop==null||!source.risk){markSelectedRejected('Selected signal lacks complete entry/risk plan');continue;}

    const entry=i+1<candles.length&&cfg.execution==='NEXT_OPEN'?candles[i+1].open:source.entry;
    const stop=source.stop;
    const entryRisk=pipsRisk(entry,stop,source.direction);
    if(entryRisk<=0){markSelectedRejected('Entry/stop geometry is invalid after execution-price adjustment');continue;}

    const liveRisk=buildRisk(source.direction,entry,stop,balance,cfg.riskPercent,cfg.spread,source.risk.rr,cfg.allowX2);
    if(!liveRisk.tradable||!liveRisk.lotSize){markSelectedRejected('Risk engine rejected the position size');continue;}
    const plannedRiskPercent=liveRisk.combinedRiskPercent??liveRisk.riskPercent;
    const nowUsed=dailyRiskUsed.get(currentDay)||0;
    if(nowUsed+plannedRiskPercent>cfg.dailyRiskLimitPercent+1e-9){markSelectedRejected('Daily risk budget would be exceeded');continue;}

    const tp=liveRisk.takeProfit??(source.direction==='LONG'?entry+entryRisk*source.risk.rr:entry-entryRisk*source.risk.rr);
    const entry2=cfg.allowX2?liveRisk.x2Entry??null:null;
    const lot2=cfg.allowX2?liveRisk.x2LotSize??0:0;
    const entryTime=i+1<candles.length&&cfg.execution==='NEXT_OPEN'?candles[i+1].time:c.time;
    open={strategy:chosen.strategy,direction:chosen.direction,signalTime:c.time,entryTime,entry,entry2,lot:liveRisk.lotSize,lot2,stop,tp,plannedRiskPercent};
    dailyRiskUsed.set(currentDay,nowUsed+plannedRiskPercent);
    dailyTrades.set(currentDay,(dailyTrades.get(currentDay)||0)+1);
    stats.get(chosen.strategy)!.executed++;
  }

  if(open){
    const last=candles.at(-1)!;const long=open.direction==='LONG';const exit=last.close;
    let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
    if(open.lot2&&open.entry2!==null)pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
    balance+=pnl;dailyPnl.set(day(last.time),(dailyPnl.get(day(last.time))||0)+pnl);
    const risk=Math.max(Math.abs(open.entry-open.stop)*open.lot*C.contractSize+(open.lot2&&open.entry2!==null?Math.abs(open.entry2-open.stop)*open.lot2*C.contractSize:0),1e-9);
    recordTrade({id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:last.time,entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.lot2||0,entry2:open.entry2??null,pnl,rMultiple:pnl/risk,plannedRiskPercent:open.plannedRiskPercent,outcome:'EOD'});
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
    config:cfg,initialBalance:cfg.balance,finalBalance:Number(balance.toFixed(2)),netPnl:Number(net.toFixed(2)),returnPct:Number((net/cfg.balance*100).toFixed(2)),
    trades,tradeCount:trades.length,wins,losses,eod,winRate:trades.length?Number((wins/trades.length*100).toFixed(2)):0,
    grossProfit:Number(gp.toFixed(2)),grossLoss:Number(gl.toFixed(2)),profitFactor:gl>0?Number((gp/gl).toFixed(3)):null,
    avgR:trades.length?Number((trades.reduce((s,t)=>s+t.rMultiple,0)/trades.length).toFixed(3)):0,
    maxDrawdownPct:Number(maxDD.toFixed(2)),maxDailyDrawdownPct:Number(maxDailyDD.toFixed(2)),maxDailyLossDollars:Number(worstDailyDollars.toFixed(2)),maxDailyRiskUsedPercent:Number(maxDailyRiskUsed.toFixed(2)),
    propRules:prop,reachedProfitTarget:net/cfg.balance*100>=prop.profitTargetPct,breachedMaxDrawdown:maxDD>=prop.maxTotalDrawdownPct,breachedDailyDrawdown:maxDailyDD>=prop.maxDailyDrawdownPct,
    tradingDays:days.length,tradingDaySet:days,opportunityCount:opportunities.length,validOpportunities:opportunities.filter(x=>x.status==='VALID'),opportunityStats:[...stats.values()],
    rejectionReasons:[...rejectionCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})),
    dataCoverage:{start:candles[0]?.time??null,end:candles.at(-1)?.time??null,calendarDays:dataDays.length,tradingDaysWithData:dataDays.length,candles:candles.length}
  };
}
