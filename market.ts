export type Timeframe =
  | "1min"
  | "5min"
  | "15min"
  | "1h"
  | "4h"
  | "1day";

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Quote {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface MarketSnapshot {
  symbol: string;
  quote: Quote | null;
  candles: Partial<Record<Timeframe, Candle[]>>;
  fetchedAt: string;
}