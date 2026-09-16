import {runBacktest} from '../engine/backtest/run';
import {Candle} from '../types/market';
const base=new Date('2026-01-02T00:00:00Z').getTime();
const candles:Candle[]=Array.from({length:1400},(_,i)=>{const p=2000 + Math.sin(i/17)*3 + i*0.01; return {time:new Date(base+i*60000).toISOString(),open:p,high:p+0.9,low:p-0.9,close:p+(i%3===0?0.7:-0.3),volume:10};});
console.log(JSON.stringify(runBacktest({candles}),null,2));
