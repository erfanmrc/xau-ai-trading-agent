import { NextResponse } from 'next/server';
import { runBacktest } from '@/engine/backtest/run';
import { getXauUsdCandles, getXauUsdCandlesAdaptive } from '@/data/twelve-data';
import type { Candle } from '@/types/market';

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
  const includeDaily=url.searchParams.get('includeDaily')==='1';

  // The large M1 request is the only critical upstream dependency. Twelve Data
  // permits up to 5000 points, but its own docs note that larger historical
  // requests can take longer. Try the requested size first; on an upstream
  // timeout, automatically fall back to smaller windows instead of letting the
  // whole Vercel function die. This keeps the backtest usable under variable API latency.
  const fetchStarted=Date.now();
  let m1Result;
  try {
    m1Result=await getXauUsdCandlesAdaptive('1min',requested);
  } catch(e){
    const details=errorDetails(e);
    return NextResponse.json({
      ok:false,
      error:details.message,
      stage:'M1_DATA_FETCH',
      details,
      diagnostics:{
        dataFetchMs:Date.now()-fetchStarted,
        totalMs:Date.now()-started,
        requestedCandles:requested,
        dailyStatus:'not_started'
      }
    },{status:504});
  }
  const dataFetchMs=Date.now()-fetchStarted;

  let dailyCandles:Candle[]=[];
  let dailyStatus:'skipped'|'fulfilled'|'rejected'='skipped';
  let dailyError:null|ReturnType<typeof errorDetails>=null;
  let dailyFetchMs=0;

  // Daily data is optional for the backtest. Keeping it out of the critical path
  // avoids a second upstream request delaying or blocking the core M1 backtest.
  if(includeDaily){
    const dailyStarted=Date.now();
    try{
      dailyCandles=await getXauUsdCandles('1day',120,{timeoutMs:10000,revalidateSeconds:300});
      dailyStatus='fulfilled';
    }catch(e){
      dailyStatus='rejected';
      dailyError=errorDetails(e);
    }
    dailyFetchMs=Date.now()-dailyStarted;
  }

  const engineStarted=Date.now();
  try {
    const backtest=runBacktest({candles:m1Result.candles,dailyCandles});
    const engineMs=Date.now()-engineStarted;
    return NextResponse.json({
      ok:true,
      backtest,
      diagnostics:{
        dataFetchMs,
        engineMs,
        totalMs:Date.now()-started,
        candleCount:m1Result.candles.length,
        dailyCandleCount:dailyCandles.length,
        requestedCandles:requested,
        actualCandles:m1Result.actual,
        adaptiveAttempts:m1Result.attempts,
        adaptiveFallbackUsed:m1Result.fallbackUsed,
        adaptiveLastError:m1Result.lastError||null,
        includeDaily,
        dailyStatus,
        dailyFetchMs,
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
      diagnostics:{
        dataFetchMs,
        engineMs:Date.now()-engineStarted,
        totalMs:Date.now()-started,
        candleCount:m1Result.candles.length,
        dailyCandleCount:dailyCandles.length,
        requestedCandles:requested,
        actualCandles:m1Result.actual,
        adaptiveAttempts:m1Result.attempts,
        adaptiveFallbackUsed:m1Result.fallbackUsed
      }
    },{status:500});
  }
}
