import { Candle, Direction } from '../types';

export type ZoneSource = 'SPIKE' | 'FVG' | 'BREAKOUT';

export interface StrategyZone {
  direction: Direction;
  high: number;
  low: number;
  source: ZoneSource;
  strength: number;
  startIndex: number;
  endIndex: number;
  active: boolean;
}

function unique(zones: StrategyZone[]) {
  return zones.filter((z, i, a) =>
    a.findIndex(x =>
      x.direction === z.direction &&
      x.source === z.source &&
      Math.abs(x.high - z.high) < 1e-5 &&
      Math.abs(x.low - z.low) < 1e-5
    ) === i
  );
}

function spikeZones(c: Candle[]): StrategyZone[] {
  const out: StrategyZone[] = [];
  for (let i = 2; i < c.length; i++) {
    const a=c[i-2], b=c[i-1], d=c[i];
    if (a.close>a.open && b.close>b.open && d.close>d.open)
      out.push({direction:'LONG',high:Math.max(a.high,b.high,d.high),low:Math.min(a.low,b.low,d.low),source:'SPIKE',strength:70,startIndex:i-2,endIndex:i,active:true});
    if (a.close<a.open && b.close<b.open && d.close<d.open)
      out.push({direction:'SHORT',high:Math.max(a.high,b.high,d.high),low:Math.min(a.low,b.low,d.low),source:'SPIKE',strength:70,startIndex:i-2,endIndex:i,active:true});
  }
  return out;
}

function fvgZones(c: Candle[]): StrategyZone[] {
  const out: StrategyZone[] = [];
  for (let i=2;i<c.length;i++) {
    const a=c[i-2], d=c[i];
    if (a.high<d.low)
      out.push({direction:'LONG',high:d.low,low:a.high,source:'FVG',strength:65,startIndex:i-2,endIndex:i,active:true});
    if (a.low>d.high)
      out.push({direction:'SHORT',high:a.low,low:d.high,source:'FVG',strength:65,startIndex:i-2,endIndex:i,active:true});
  }
  return out;
}

function breakoutZones(c: Candle[]): StrategyZone[] {
  const out: StrategyZone[] = [];
  for (let i=5;i<c.length;i++) {
    const p=c.slice(i-5,i), d=c[i];
    const hi=Math.max(...p.map(x=>x.high)), lo=Math.min(...p.map(x=>x.low));
    if (d.close>hi) out.push({direction:'LONG',high:d.close,low:hi,source:'BREAKOUT',strength:60,startIndex:i-5,endIndex:i,active:true});
    if (d.close<lo) out.push({direction:'SHORT',high:lo,low:d.close,source:'BREAKOUT',strength:60,startIndex:i-5,endIndex:i,active:true});
  }
  return out;
}

export function buildStrategyZones(candles: Candle[], options?: {maxZones?: number}): StrategyZone[] {
  if (candles.length<5) return [];
  return unique([...spikeZones(candles),...fvgZones(candles),...breakoutZones(candles)])
    .sort((a,b)=>b.endIndex-a.endIndex)
    .slice(0, options?.maxZones ?? 100);
}

export function zoneContainsPrice(z: StrategyZone, price: number) {
  return price>=z.low && price<=z.high;
}

export function detectZoneReturn(candles: Candle[], z: StrategyZone, departureBars=3): boolean {
  if (candles.length<departureBars+2) return false;
  const last=candles[candles.length-1];
  const start=Math.max(z.endIndex+1,candles.length-departureBars-5);
  if (start>=candles.length-1) return false;
  const departure=candles.slice(start,-1);
  const left=z.direction==='LONG'
    ? departure.some(x=>x.low>z.high)
    : departure.some(x=>x.high<z.low);
  const returned=last.high>=z.low && last.low<=z.high;
  return left && returned;
}
