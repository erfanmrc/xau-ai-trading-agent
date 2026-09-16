import { Candle, StructureSummary, MarketBias, Direction } from '@/types/market';

function swingHigh(c: Candle[], i: number, strength=2) {
  if (i-strength < 0 || i+strength >= c.length) return false;
  for (let k=1;k<=strength;k++) if (c[i].high <= c[i-k].high || c[i].high <= c[i+k].high) return false;
  return true;
}
function swingLow(c: Candle[], i: number, strength=2) {
  if (i-strength < 0 || i+strength >= c.length) return false;
  for (let k=1;k<=strength;k++) if (c[i].low >= c[i-k].low || c[i].low >= c[i+k].low) return false;
  return true;
}
export function summarizeStructure(c: Candle[]): StructureSummary {
  if (!c.length) return {state:'UNCLEAR',bias:'NEUTRAL',lastClose:null,lastSwingHigh:null,lastSwingLow:null,breakout:null};
  const highs:number[]=[]; const lows:number[]=[];
  for(let i=2;i<c.length-2;i++) { if(swingHigh(c,i)) highs.push(c[i].high); if(swingLow(c,i)) lows.push(c[i].low); }
  const hh = highs.length>=2 && highs[highs.length-1] > highs[highs.length-2];
  const lh = highs.length>=2 && highs[highs.length-1] < highs[highs.length-2];
  const hl = lows.length>=2 && lows[lows.length-1] > lows[lows.length-2];
  const ll = lows.length>=2 && lows[lows.length-1] < lows[lows.length-2];
  const lastSwingHigh = highs.at(-1) ?? null;
  const lastSwingLow = lows.at(-1) ?? null;
  const close = c.at(-1)!.close;
  let breakout: Direction | null = null;
  if (lastSwingHigh !== null && close > lastSwingHigh) breakout='LONG';
  if (lastSwingLow !== null && close < lastSwingLow) breakout='SHORT';
  let state: StructureSummary['state']='UNCLEAR';
  if (hh && hl && !lh) state='UPTREND'; else if (lh && ll && !hh) state='DOWNTREND'; else if ((hh&&hl)||(lh&&ll)) state=breakout==='LONG'?'UPTREND':breakout==='SHORT'?'DOWNTREND':'RANGE';
  const bias: MarketBias = state==='UPTREND'?'LONG':state==='DOWNTREND'?'SHORT':'NEUTRAL';
  return {state,bias,lastClose:close,lastSwingHigh,lastSwingLow,breakout};
}
