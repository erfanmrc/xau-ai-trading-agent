import { NextResponse } from 'next/server';
import { runBacktest } from '@/engine/backtest/run';
import { getXauUsdCandles } from '@/data/twelve-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function errorDetails(e:unknown){
  const err=e instanceof Error?e:null;
  const name=err?.name||'UnknownError';
  const message=err?.message||String(e);
  const timeout=/timeout|aborted/i.test(`${name} ${message}`);
  return {name,message,timeout};
}

export async function POST(req:Request){
  try {
    const body=await req.json();
    if(!Array.isArray(body?.candles)){
      return NextResponse.json({ok:false,error:'candles[] is required'},{status:400});
    }
    const engineStarted=Date.now();
    const backtest=runBacktest({
      candles:body.candles,
      dailyCandles:Array.isArray(body.dailyCandles)?body.dailyCandles:undefined,
      economicEvents:Array.isArray(body.economicEvents)?body.economicEvents:undefined,
      config:body.config,
      propRules:body.propRules
    });
    const engineMs=Date.now()-engineStarted;
    return NextResponse.json({ok:true,backtest,diagnostics:{engineMs,candleCount:body.candles.length}});
  } catch(e){
    const details=errorDetails(e);
    return NextResponse.json({ok:false,error:details.message,stage:'ENGINE',details},{status:400});
  }
}

export async function GET(req:Request){
  const started=Date.now();
  const url=new URL(req.url);
  const requested=Math.max(1500,Math.min(5000,Number(url.searchParams.get('candles')||5000)));

  // Keep M1 as the critical dependency. Daily candles are useful context but are
  // optional because the engine can derive daily structure from the M1 window.
  const fetchStarted=Date.now();
  const results=await Promise.allSettled([
    getXauUsdCandles('1min',requested),
    getXauUsdCandles('1day',120)
  ]);
  const dataFetchMs=Date.now()-fetchStarted;

  const m1=results[0];
  const daily=results[1];

  if(m1.status==='rejected'){
    const details=errorDetails(m1.reason);
    return NextResponse.json({
      ok:false,
      error:details.message,
      stage:'M1_DATA_FETCH',
      details,
      diagnostics:{dataFetchMs,totalMs:Date.now()-started,requestedCandles:requested,dailyStatus:daily.status}
    },{status:504});
  }

  const candles=m1.value;
  const dailyCandles=daily.status==='fulfilled'?daily.value:[];
  const dailyError=daily.status==='rejected'?errorDetails(daily.reason):null;

  const engineStarted=Date.now();
  try {
    const backtest=runBacktest({candles,dailyCandles});
    const engineMs=Date.now()-engineStarted;
    return NextResponse.json({
      ok:true,
      backtest,
      diagnostics:{
        dataFetchMs,
        engineMs,
        totalMs:Date.now()-started,
        candleCount:candles.length,
        dailyCandleCount:dailyCandles.length,
        requestedCandles:requested,
        dailyDataFallback:!!dailyError,
        dailyDataError:dailyError
      }
    });
  } catch(e){
    const details=errorDetails(e);
    return NextResponse.json({
      ok:false,
      error:details.message,
      stage:'ENGINE',
      details,
      diagnostics:{dataFetchMs,engineMs:Date.now()-engineStarted,totalMs:Date.now()-started,candleCount:candles.length,dailyCandleCount:dailyCandles.length}
    },{status:500});
  }
}
