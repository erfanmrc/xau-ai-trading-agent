import {Candle} from "@/types/market";

const BASE="https://api.twelvedata.com";
const DEFAULT_TIMEOUT_MS=60000;
const ADAPTIVE_TIMEOUTS_MS=[12000,10000,8000];
const DAILY_CHUNK_TIMEOUT_MS=12000;
const DAILY_CHUNK_DAYS_PER_BATCH=3;
const MAX_DAYS_LOOKBACK=35;

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
  if(!r.ok){
    const err= new Error(`Twelve Data HTTP ${r.status}`) as Error & {status?:number;retryAfterMs?:number};
    err.status=r.status;
    const retryAfter=r.headers.get("retry-after");
    if(retryAfter){
      const seconds=Number(retryAfter);
      if(Number.isFinite(seconds)) err.retryAfterMs=Math.max(1000,Math.min(30000,Math.round(seconds*1000)));
    }
    throw err;
  }
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

export async function getXauUsdCandles(interval="5min",outputsize=100,options:RequestOptions={}):Promise<Candle[]>{
  const safeSize=Math.max(1,Math.min(5000,Math.floor(outputsize)));
  const d=await request<{
    values?:Array<{datetime:string;open:string;high:string;low:string;close:string;volume?:string}>
  }>(
    `/time_series?symbol=XAU/USD&interval=${encodeURIComponent(interval)}&outputsize=${safeSize}&timezone=UTC`,
    // Historical time-series responses can be slow for large windows. Keep a short
    // server-side cache so repeated backtests do not repeatedly pay the full upstream latency.
    {timeoutMs:options.timeoutMs??60000,revalidateSeconds:options.revalidateSeconds??60}
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
export type AdaptiveCandleResult={
  candles:Candle[];
  requested:number;
  actual:number;
  attempts:number;
  fallbackUsed:boolean;
  sourceMode?:"DATE_RANGES"|"DAILY_CHUNKS"|"OUTPUTSIZE";
  chunkDays?:number;
  chunkErrors?:Array<{date:string;name:string;message:string;timeout:boolean}>;
  lastError?:{name:string;message:string;timeout:boolean};
};

function isTimeoutError(e:unknown){
  const err=e instanceof Error?e:null;
  return /timeout|aborted/i.test(`${err?.name||""} ${err?.message||e||""}`);
}

function detail(e:unknown){
  const err=e instanceof Error?e:null;
  const name=err?.name||"UnknownError";
  const message=err?.message||String(e);
  return {name,message,timeout:isTimeoutError(e)};
}

export async function getXauUsdCandlesForDate(
  interval="1min",
  date:string,
  options:RequestOptions={}
):Promise<Candle[]>{
  const d=await request<{
    values?:Array<{datetime:string;open:string;high:string;low:string;close:string;volume?:string}>
  }>(
    `/time_series?symbol=XAU/USD&interval=${encodeURIComponent(interval)}&date=${encodeURIComponent(date)}&timezone=UTC`,
    {timeoutMs:options.timeoutMs??DAILY_CHUNK_TIMEOUT_MS,revalidateSeconds:options.revalidateSeconds??300}
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

function utcDateMinusDays(days:number){
  const d=new Date();
  d.setUTCDate(d.getUTCDate()-days);
  return d.toISOString().slice(0,10);
}

function uniqueSortedCandles(candles:Candle[]):Candle[]{
  const seen=new Map<string,Candle>();
  for(const c of candles){
    if(Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)){
      seen.set(c.time,c);
    }
  }
  return [...seen.values()].sort((a,b)=>a.time.localeCompare(b.time));
}

async function sleepMs(ms:number){
  await new Promise<void>(resolve=>setTimeout(resolve,ms));
}

function utcDateAt(daysAgo:number){
  const d=new Date();
  d.setUTCDate(d.getUTCDate()-daysAgo);
  return d.toISOString().slice(0,10);
}

async function getXauUsdCandlesForRange(
  interval="1min",
  startDate:string,
  endDate:string,
  options:RequestOptions={}
):Promise<Candle[]>{
  const d=await request<{
    values?:Array<{datetime:string;open:string;high:string;low:string;close:string;volume?:string}>
  }>(
    `/time_series?symbol=XAU/USD&interval=${encodeURIComponent(interval)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&timezone=UTC`,
    {timeoutMs:options.timeoutMs??DAILY_CHUNK_TIMEOUT_MS,revalidateSeconds:options.revalidateSeconds??300}
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

async function fetchRangeWith429Retry(
  startDate:string,
  endDate:string,
  maxRetries=2
):Promise<Candle[]>{
  let attempt=0;
  while(true){
    try{
      return await getXauUsdCandlesForRange("1min",startDate,endDate,{
        timeoutMs:DAILY_CHUNK_TIMEOUT_MS,
        revalidateSeconds:300
      });
    }catch(e){
      const err=e as Error & {status?:number;retryAfterMs?:number};
      if(err.status!==429 || attempt>=maxRetries) throw e;
      const waitMs=err.retryAfterMs??10000;
      await sleepMs(waitMs);
      attempt++;
    }
  }
}

async function getRecentMinuteCandlesByDay(requested:number):Promise<AdaptiveCandleResult>{
  const target=Math.max(1,Math.min(20000,Math.floor(requested)));
  const all:Candle[]=[];
  const chunkErrors:NonNullable<AdaptiveCandleResult["chunkErrors"]>=[];
  let attempts=0;
  const RANGE_DAYS=3;
  const MAX_LOOKBACK_DAYS=30;
  const INTER_CHUNK_DELAY_MS=1000;

  // A 3-calendar-day range stays below the 5,000-record maximum for XAU/USD
  // while keeping request count low enough to avoid plan-level 429 throttling.
  for(let offset=0;offset<MAX_LOOKBACK_DAYS && all.length<target;offset+=RANGE_DAYS){
    const endDate=utcDateAt(offset);
    const startDate=utcDateAt(offset+RANGE_DAYS-1);
    attempts++;
    try{
      const values=await fetchRangeWith429Retry(startDate,endDate,2);
      all.push(...values);
    }catch(e){
      chunkErrors.push({date:`${startDate}..${endDate}`,...detail(e)});
    }

    const merged=uniqueSortedCandles(all);
    all.length=0;
    all.push(...merged);

    if(all.length<target) await sleepMs(INTER_CHUNK_DELAY_MS);
  }

  const candles=uniqueSortedCandles(all).slice(-target);
  if(candles.length===0){
    const firstError=chunkErrors[0];
    if(firstError) throw new Error(`Twelve Data historical-range fetch failed: ${firstError.message}`);
    throw new Error("Twelve Data returned no 1-minute candles for the requested historical ranges");
  }

  return {
    candles,
    requested:target,
    actual:candles.length,
    attempts,
    fallbackUsed:candles.length<target,
    sourceMode:"DATE_RANGES",
    chunkDays:RANGE_DAYS,
    chunkErrors,
    lastError:chunkErrors[chunkErrors.length-1]
  };
}

export async function getXauUsdCandlesAdaptive(interval="1min",outputsize=5000):Promise<AdaptiveCandleResult>{
  const requested=Math.max(1,Math.min(20000,Math.floor(outputsize)));

  // For minute-level backtests, prefer bounded date ranges over many per-day requests.
  // Each 3-calendar-day window stays below the 5,000-record limit while keeping
  // the number of upstream calls low enough to reduce plan-level 429 throttling.
  if(interval==="1min"){
    try{
      return await getRecentMinuteCandlesByDay(requested);
    }catch(e){
      const last=detail(e);
      const sizes=[...new Set([requested, requested>=3000?3000:requested, requested>=1500?1500:requested])];
      let attempts=0;
      let lastError=last;

      for(let i=0;i<sizes.length;i++){
        const size=sizes[i];
        attempts++;
        try{
          const candles=await getXauUsdCandles(interval,size,{
            timeoutMs:ADAPTIVE_TIMEOUTS_MS[Math.min(i,ADAPTIVE_TIMEOUTS_MS.length-1)],
            revalidateSeconds:60
          });
          return {
            candles,
            requested,
            actual:candles.length,
            attempts,
            fallbackUsed:size!==requested,
            sourceMode:"OUTPUTSIZE",
            lastError
          };
        }catch(err){
          lastError=detail(err);
          if(!lastError.timeout || i===sizes.length-1) throw err;
        }
      }
    }
  }

  const candles=await getXauUsdCandles(interval,requested,{timeoutMs:DEFAULT_TIMEOUT_MS,revalidateSeconds:60});
  return {
    candles,
    requested,
    actual:candles.length,
    attempts:1,
    fallbackUsed:false,
    sourceMode:"OUTPUTSIZE"
  };
}
