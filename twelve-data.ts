import type { Candle, Timeframe } from "@/types/market";

const BASE_URL = "https://api.twelvedata.com";

function apiKey() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not configured");
  return key;
}

export async function getQuote(symbol = process.env.TWELVE_DATA_SYMBOL || "XAU/USD") {
  const url = new URL(`${BASE_URL}/quote`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || data.status === "error") {
    throw new Error(data.message || `Twelve Data quote error: ${res.status}`);
  }

  return {
    symbol: data.symbol ?? symbol,
    price: Number(data.close ?? data.price),
    timestamp: Number(data.timestamp ?? Math.floor(Date.now() / 1000))
  };
}

export async function getCandles(
  symbol = process.env.TWELVE_DATA_SYMBOL || "XAU/USD",
  interval: Timeframe = "5min",
  outputsize = 300
): Promise<Candle[]> {
  const url = new URL(`${BASE_URL}/time_series`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || data.status === "error") {
    throw new Error(data.message || `Twelve Data time_series error: ${res.status}`);
  }

  if (!Array.isArray(data.values)) return [];

  return data.values
    .map((x: any) => ({
      datetime: String(x.datetime),
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
      volume: x.volume == null ? undefined : Number(x.volume)
    }))
    .reverse();
}