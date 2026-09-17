import { NextResponse } from 'next/server';
import { runBacktest } from '@/engine/backtest/run';
import { getXauUsdCandles } from '@/data/twelve-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req:Request){
  try {
    const body=await req.json();
    if(!Array.isArray(body?.candles)) return NextResponse.json({ok:false,error:'candles[] is required'},{status:400});
    return NextResponse.json({ok:true,backtest:runBacktest({candles:body.candles,dailyCandles:Array.isArray(body.dailyCandles)?body.dailyCandles:undefined,economicEvents:Array.isArray(body.economicEvents)?body.economicEvents:undefined,config:body.config,propRules:body.propRules})});
  } catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Backtest error'},{status:400});}
}

export async function GET(req:Request){
  try {
    const url=new URL(req.url);
    const requested=Math.max(1500,Math.min(5000,Number(url.searchParams.get('candles')||5000)));
    const [candles,dailyCandles]=await Promise.all([getXauUsdCandles('1min',requested),getXauUsdCandles('1day',120)]);
    return NextResponse.json({ok:true,backtest:runBacktest({candles,dailyCandles})});
  } catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Backtest data error'},{status:500});}
}
