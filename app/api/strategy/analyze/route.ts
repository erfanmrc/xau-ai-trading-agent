import { NextResponse } from 'next/server';
import { getXauUsdCandles } from '@/data/twelve-data';
import { analyzeUnified } from '@/engine/decision';

export async function GET(){
  try { const candles=await getXauUsdCandles('1min',500); return NextResponse.json({ok:true,decision:analyzeUnified(candles)}); }
  catch(e){ return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Strategy analysis error'},{status:500}); }
}

export async function POST(req:Request){
  try { const body=await req.json(); const candles=body?.candles; if(!Array.isArray(candles)) return NextResponse.json({ok:false,error:'candles[] is required'},{status:400}); return NextResponse.json({ok:true,decision:analyzeUnified(candles,body.balance??2000,body.spread??0)}); }
  catch(e){ return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Strategy analysis error'},{status:400}); }
}
