import { Candle, MarketState, Structure } from '../types';

export interface MTFFrame {
  name: 'H1'|'M15'|'M5'|'M1';
  candles: Candle[];
  structure: Structure;
}

export interface MTFContext {
  h1: MTFFrame;
  m15: MTFFrame;
  m5: MTFFrame;
  m1: MTFFrame;
  directionalBias: 'LONG'|'SHORT'|null;
  alignmentScore: number;
  aligned: boolean;
  reasons: string[];
  warnings: string[];
}

function dir(s: MarketState): 'LONG'|'SHORT'|null {
  return s==='UPTREND'?'LONG':s==='DOWNTREND'?'SHORT':null;
}

export function buildMTFContext(h1: MTFFrame,m15: MTFFrame,m5: MTFFrame,m1: MTFFrame): MTFContext {
  const ds=[dir(h1.structure.state),dir(m15.structure.state),dir(m5.structure.state),dir(m1.structure.state)];
  const h=ds[0], i=ds[1], m=ds[2], e=ds[3];
  const longs=ds.filter(x=>x==='LONG').length, shorts=ds.filter(x=>x==='SHORT').length;
  const bias=longs>shorts?'LONG':shorts>longs?'SHORT':null;
  const aligned=bias!==null && ds.every(x=>x===bias);
  let score=0;
  if(h) score+=25; if(i) score+=25; if(m) score+=25; if(e) score+=25;
  return {
    h1,m15,m5,m1,
    directionalBias:bias,
    alignmentScore:score,
    aligned,
    reasons:[`H1: ${h1.structure.state}`,`M15: ${m15.structure.state}`,`M5: ${m5.structure.state}`,`M1: ${m1.structure.state}`,bias?`Directional bias: ${bias}`:'No clear higher-timeframe directional bias'],
    warnings:aligned?[]:['All timeframes are not directionally aligned']
  };
}
