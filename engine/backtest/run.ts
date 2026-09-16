import { Candle } from '@/types/market';
import { analyzeUnified } from '@/engine/decision';
import { BacktestConfig, BacktestInput, BacktestResult, BacktestTrade } from '@/engine/backtest/types';
import { STRATEGY_CONFIG as C } from '@/config/strategy';
import { buildRisk } from '@/engine/risk';

const DEFAULTS:BacktestConfig={balance:C.balance,riskPercent:C.riskPercent,dailyRiskLimitPercent:C.dailyMaxRiskPercent,maxTradesPerDay:3,spread:0.05,startIndex:60,execution:'NEXT_OPEN',allowX2:true};
const day=(t:string)=>new Date(t).toISOString().slice(0,10);
function pipsRisk(entry:number,stop:number,dir:'LONG'|'SHORT'){ return dir==='LONG'?entry-stop:stop-entry; }

export function runBacktest(input:BacktestInput):BacktestResult {
  const candles=input.candles.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
  const cfg={...DEFAULTS,...input.config};
  const prop={profitTargetPct:10,maxTotalDrawdownPct:12,maxDailyDrawdownPct:5,minTradingDays:3,...input.propRules};
  let balance=cfg.balance, peak=balance, dayStart=balance, currentDay='';
  let open:any=null; const trades:BacktestTrade[]=[]; const dailyPnl=new Map<string,number>();
  let maxDD=0,maxDailyDD=0;

  for(let i=Math.max(cfg.startIndex??60,1);i<candles.length;i++) {
    const c=candles[i]; const d=day(c.time);
    if(d!==currentDay){ currentDay=d; dayStart=balance; if(!dailyPnl.has(d)) dailyPnl.set(d,0); }

    if(open){
      const hi=c.high, lo=c.low;
      const long=open.direction==='LONG';
      let exit:number|null=null, outcome:any=null;
      const hitStop=long?lo<=open.stop:hi>=open.stop;
      const hitTp=long?hi>=open.tp:lo<=open.tp;
      if(hitStop || hitTp){
        if(hitStop && hitTp){ exit=open.stop; outcome='SL'; }
        else if(hitStop){ exit=open.stop; outcome='SL'; }
        else { exit=open.tp; outcome='TP'; }
      }
      if(exit!==null){
        let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
        if(open.lot2 && open.entry2!==null) pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
        balance+=pnl; dailyPnl.set(currentDay,(dailyPnl.get(currentDay)||0)+pnl);
        const risk=Math.max(Math.abs(open.entry-open.stop)*open.lot*C.contractSize + (open.lot2&&open.entry2!==null?Math.abs(open.entry2-open.stop)*open.lot2*C.contractSize:0),1e-9);
        trades.push({id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:c.time,entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.lot2||0,entry2:open.entry2??null,pnl,rMultiple:pnl/risk,outcome});
        open=null;
        peak=Math.max(peak,balance);
      }
    }

    peak=Math.max(peak,balance);
    maxDD=Math.max(maxDD,(peak-balance)/Math.max(peak,1e-9)*100);
    const ddDay=Math.max(0,(dayStart-balance)/Math.max(dayStart,1e-9)*100);
    maxDailyDD=Math.max(maxDailyDD,ddDay);
    if(open) continue;

    const todayTrades=trades.filter(x=>day(x.entryTime)===currentDay).length;
    const todayRiskPct=Math.max(0,-(dailyPnl.get(currentDay)||0)/Math.max(dayStart,1e-9)*100);
    if(todayTrades>=cfg.maxTradesPerDay || todayRiskPct>=cfg.dailyRiskLimitPercent || balance<=0) continue;

    const signal=analyzeUnified(candles.slice(0,i+1),balance,cfg.spread);
    const chosen=signal.signals.filter(x=>x.status==='VALID'&&x.direction).sort((a,b)=>b.score-a.score)[0];
    if(!chosen || !chosen.direction || !chosen.entry || !chosen.stop || !chosen.risk?.lotSize || signal.consensus.mode!=='EXECUTE') continue;
    const entry=i+1<candles.length && cfg.execution==='NEXT_OPEN'?candles[i+1].open:chosen.entry;
    const stop=chosen.stop;
    const entryRisk=pipsRisk(entry,stop,chosen.direction);
    if(entryRisk<=0) continue;
    const liveRisk=buildRisk(chosen.direction,entry,stop,balance,cfg.riskPercent,cfg.spread);
    const tp=chosen.tp1??(entry + (entry-stop)*(chosen.risk?.targetRR??C.targetRR)*(chosen.direction==='LONG'?1:-1));
    const entry2=cfg.allowX2?liveRisk.x2Entry??null:null;
    const lot2=cfg.allowX2?liveRisk.x2LotSize??0:0;
    open={strategy:chosen.strategy,direction:chosen.direction,signalTime:c.time,entryTime:(i+1<candles.length&&cfg.execution==='NEXT_OPEN'?candles[i+1].time:c.time),entry,entry2,lot:liveRisk.lotSize,lot2,stop,tp};
  }

  if(open){
    const last=candles.at(-1)!; const long=open.direction==='LONG'; const exit=last.close;
    let pnl=(long?exit-open.entry:open.entry-exit)*open.lot*C.contractSize;
    if(open.lot2&&open.entry2!==null) pnl+=(long?exit-open.entry2:open.entry2-exit)*open.lot2*C.contractSize;
    balance+=pnl; dailyPnl.set(day(last.time),(dailyPnl.get(day(last.time))||0)+pnl);
    const risk=Math.max(Math.abs(open.entry-open.stop)*open.lot*C.contractSize + (open.lot2&&open.entry2!==null?Math.abs(open.entry2-open.stop)*open.lot2*C.contractSize:0),1e-9);
    trades.push({id:trades.length+1,strategy:open.strategy,direction:open.direction,signalTime:open.signalTime,entryTime:open.entryTime,exitTime:last.time,entry:open.entry,exit,stop:open.stop,tp:open.tp,lot:open.lot,lot2:open.lot2||0,entry2:open.entry2??null,pnl,rMultiple:pnl/risk,outcome:'EOD'});
  }

  const net=balance-cfg.balance, wins=trades.filter(t=>t.pnl>0).length, losses=trades.filter(t=>t.pnl<0).length, eod=trades.filter(t=>t.outcome==='EOD').length;
  const gp=trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0), gl=-trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
  const days=[...new Set(trades.map(t=>day(t.entryTime)))];
  const worstDailyDollars=Math.max(0,...Array.from(dailyPnl.values()).map(x=>-x));
  return {config:cfg,initialBalance:cfg.balance,finalBalance:Number(balance.toFixed(2)),netPnl:Number(net.toFixed(2)),returnPct:Number((net/cfg.balance*100).toFixed(2)),trades,tradeCount:trades.length,wins,losses,eod,winRate:trades.length?Number((wins/trades.length*100).toFixed(2)):0,grossProfit:Number(gp.toFixed(2)),grossLoss:Number(gl.toFixed(2)),profitFactor:gl>0?Number((gp/gl).toFixed(3)):null,avgR:trades.length?Number((trades.reduce((s,t)=>s+t.rMultiple,0)/trades.length).toFixed(3)):0,maxDrawdownPct:Number(maxDD.toFixed(2)),maxDailyDrawdownPct:Number(maxDailyDD.toFixed(2)),maxDailyLossDollars:Number(worstDailyDollars.toFixed(2)),propRules:prop,reachedProfitTarget:net/cfg.balance*100>=prop.profitTargetPct,breachedMaxDrawdown:maxDD>=prop.maxTotalDrawdownPct,breachedDailyDrawdown:maxDailyDD>=prop.maxDailyDrawdownPct,tradingDays:days.length,tradingDaySet:days};
}
