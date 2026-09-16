import { Candle, Structure } from './types';
import { CONFIG } from './config';
function isHigh(c:Candle[],i:number,s:number){for(let k=1;k<=s;k++)if(c[i].high<=c[i-k].high||c[i].high<=c[i+k].high)return false;return true}
function isLow(c:Candle[],i:number,s:number){for(let k=1;k<=s;k++)if(c[i].low>=c[i-k].low||c[i].low>=c[i+k].low)return false;return true}
export function detectStructure(c:Candle[]):Structure{
 const s=CONFIG.structure.swingStrength, highs:number[]=[],lows:number[]=[];
 for(let i=s;i<c.length-s;i++){if(isHigh(c,i,s))highs.push(c[i].high);if(isLow(c,i,s))lows.push(c[i].low)}
 const hh:number[]=[],lh:number[]=[],hl:number[]=[],ll:number[]=[];
 for(let i=1;i<highs.length;i++)(highs[i]>highs[i-1]?hh:lh).push(highs[i]);
 for(let i=1;i<lows.length;i++)(lows[i]>lows[i-1]?hl:ll).push(lows[i]);
 const lastHigh=highs.at(-1),lastLow=lows.at(-1), close=c.at(-1)!.close;
 const breakout=lastHigh&&close>lastHigh?'LONG':lastLow&&close<lastLow?'SHORT':null;
 let state:Structure['state']='UNCLEAR';
 if(hh.length&&hl.length&&!lh.length)state='UPTREND'; else if(lh.length&&ll.length&&!hh.length)state='DOWNTREND';
 else if((hh.length&&hl.length)||(lh.length&&ll.length))state=breakout==='LONG'?'UPTREND':breakout==='SHORT'?'DOWNTREND':'RANGE';
 return {state,hh,hl,lh,ll,breakout,lastSwingHigh:lastHigh,lastSwingLow:lastLow};
}
