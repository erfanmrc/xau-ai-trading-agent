# XAUUSD Strategy Engine v1
Drop-in Strategy Engine for a Next.js/TypeScript project.

## Install
Copy `lib/strategy` into `lib/strategy` and `app/api/strategy/analyze/route.ts` into the matching route. The API assumes the Next.js `@/*` alias points to the project root.

## Test
GET `/api/strategy/analyze` for endpoint info.
POST JSON:
```json
{"timeframe":"M1","balance":2000,"spread":0.2,"candles":[{"time":1,"open":1,"high":2,"low":0,"close":1.5}]}
```
At least 30 candles are required.

## Important
The engine is a fixed-rule baseline, not a claim of profitability or >70% win rate. It must be backtested on XAUUSD data with the actual broker's contract size, spread, commission and slippage before use.

A13 observations to integrate later: ATR-scaled breakout gap, displacement/volume confirmation, pullback retest or inside-bar confirmation, multiple SL engines, MTF EMA filter, session/date filters, consecutive-loss protection, and realistic slippage. The TradingView A13 source is protected, so only its publicly described methodology is used.
