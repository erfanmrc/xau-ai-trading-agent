import {Candle} from "@/types/market";
const BASE="https://api.twelvedata.com";
function apiKey(){const k=process.env.TWELVE_DATA_API_KEY;if(!k)throw new Error("TWELVE_DATA_API_KEY is not configured");return k;}
async function request<T>(path:string):Promise<T>{
 const r=await fetch(`${BASE}${path}${path.includes("?")?"&":"?"}apikey=${encodeURIComponent(apiKey())}`,{cache:"no-store"});
 if(!r.ok)throw new Error(`Twelve Data HTTP ${r.status}`);
 const d=await r.json(); if(d.status==="error")throw new Error(d.message||"Twelve Data error"); return d;
}
export async function getXauUsdQuote(){return request<{symbol:string;close:string;datetime:string}>("/quote?symbol=XAU/USD&timezone=UTC");}
export async function getXauUsdCandles(interval="5min",outputsize=100):Promise<Candle[]>{
 const d=await request<{values?:Array<{datetime:string;open:string;high:string;low:string;close:string;volume?:string}>}>(`/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${outputsize}&timezone=UTC`);
 return (d.values||[]).reverse().map(v=>({time:v.datetime,open:+v.open,high:+v.high,low:+v.low,close:+v.close,volume:+(v.volume||0)}));
}