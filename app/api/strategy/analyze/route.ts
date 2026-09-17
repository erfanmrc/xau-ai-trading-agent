import { NextResponse } from 'next/server';
import { getXauUsdCandles } from '@/data/twelve-data';
import { analyzeUnified } from '@/engine/decision';

export async function GET(){
  try {
    const [candles,dailyCandles]=await Promise.all([getXauUsdCandles('1min',500),getXauUsdCandles('1day',120)]);
    return NextResponse.json({ok:true,decision:analyzeUnified(candles,2000,0,dailyCandles)});
  } catch(e){
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Strategy analysis error'},{status:500});
  }
}

export async function POST(req:Request){
  try {
    const body=await req.json();
    if(!Array.isArray(body?.candles)) return NextResponse.json({ok:false,error:'candles[] is required'},{status:400});
    return NextResponse.json({ok:true,decision:analyzeUnified(body.candles,body.balance??2000,body.spread??0,Array.isArray(body.dailyCandles)?body.dailyCandles:undefined,Array.isArray(body.economicEvents)?body.economicEvents:undefined)});
  } catch(e){
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Strategy analysis error'},{status:400});
  }
}
