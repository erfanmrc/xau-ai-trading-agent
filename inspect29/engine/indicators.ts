import { Candle, Direction } from '@/types/market';

export function body(c: Candle) { return Math.abs(c.close - c.open); }
export function range(c: Candle) { return Math.max(c.high - c.low, 1e-9); }
export function bodyRatio(c: Candle) { return body(c) / range(c); }
export function closeLocation(c: Candle) { return (c.close - c.low) / range(c); }
export function candleDirection(c: Candle): Direction | null { return c.close > c.open ? 'LONG' : c.close < c.open ? 'SHORT' : null; }
export function median(values: number[]) {
  if (!values.length) return 0;
  const xs = [...values].sort((a,b)=>a-b);
  const m = Math.floor(xs.length/2);
  return xs.length % 2 ? xs[m] : (xs[m-1] + xs[m]) / 2;
}
export function atr(candles: Candle[], n=14) {
  if (candles.length < 2) return 0;
  const tr = candles.slice(1).map((c,i)=>Math.max(c.high-c.low, Math.abs(c.high-candles[i].close), Math.abs(c.low-candles[i].close)));
  return median(tr.slice(-n));
}
export function roundPrice(value: number, decimals=2) {
  return Number(value.toFixed(decimals));
}
export function resample(candles: Candle[], minutes: number): Candle[] {
  if (!candles.length) return [];
  const ms = minutes * 60_000;
  const out: Candle[] = [];
  let bucket = Math.floor(new Date(candles[0].time).getTime() / ms) * ms;
  let cur: Candle | null = null;
  for (const c of candles) {
    const t = new Date(c.time).getTime();
    const b = Math.floor(t / ms) * ms;
    if (b !== bucket && cur) {
      out.push(cur);
      cur = null;
      bucket = b;
    }
    if (!cur) {
      cur = { time: new Date(bucket).toISOString(), open:c.open, high:c.high, low:c.low, close:c.close, volume:c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}
