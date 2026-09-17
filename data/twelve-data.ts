import {Candle} from "@/types/market";

const BASE="https://api.twelvedata.com";
const DEFAULT_TIMEOUT_MS=60000;

function apiKey(){
  const k=process.env.TWELVE_DATA_API_KEY;
  if(!k) throw new Error("TWELVE_DATA_API_KEY is not configured");
  return k;
}

type RequestOptions={timeoutMs?:number;revalidateSeconds?:number};

async function request<T>(path:string,options:RequestOptions={}):Promise<T>{
  const timeoutMs=options.timeoutMs??DEFAULT_TIMEOUT_MS;
  const revalidateSeconds=options.revalidateSeconds;
  const url=`${BASE}${path}${path.includes("?")?"&":"?"}apikey=${encodeURIComponent(apiKey())}`;
  const fetchOptions:RequestInit & {next?:{revalidate:number}} =
    typeof revalidateSeconds === "number"
      ? {next:{revalidate:revalidateSeconds},signal:AbortSignal.timeout(timeoutMs)}
      : {cache:"no-store",signal:AbortSignal.timeout(timeoutMs)};

  const r=await fetch(url,fetchOptions);
  if(!r.ok) throw new Error(`Twelve Data HTTP ${r.status}`);
  const d=await r.json();
  if(d.status==="error") throw new Error(d.message||"Twelve Data error");
  return d;
}

export async function getXauUsdQuote(){
  return request<{symbol:string;close:string;datetime:string}>(
    "/quote?symbol=XAU/USD&timezone=UTC",
    {timeoutMs:15000,revalidateSeconds:5}
  );
}

export async function getXauUsdCandles(interval="5min",outputsize=100):Promise<Candle[]>{
  const safeSize=Math.max(1,Math.min(5000,Math.floor(outputsize)));
  const d=await request<{
    values?:Array<{datetime:string;open:string;high:string;low:string;close:string;volume?:string}>
  }>(
    `/time_series?symbol=XAU/USD&interval=${encodeURIComponent(interval)}&outputsize=${safeSize}&timezone=UTC`,
    // Historical time-series responses can be slow for large windows. Keep a short
    // server-side cache so repeated backtests do not repeatedly pay the full upstream latency.
    {timeoutMs:60000,revalidateSeconds:60}
  );

  return (d.values||[]).reverse().map(v=>({
    time:v.datetime,
    open:+v.open,
    high:+v.high,
    low:+v.low,
    close:+v.close,
    volume:+(v.volume||0)
  }));
}
