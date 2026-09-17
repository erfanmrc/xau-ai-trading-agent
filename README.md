# XAU AI Trading Agent - Batch 16

Batch 16 fixes the 5000-candle timeout at the backtest-engine level.

## What changed
- Two-stage backtest gate: cheap trigger screening first, deep Unified Decision only on trigger-capable candles.
- Non-trigger candles use a lightweight no-entry path.
- 5000-candle local benchmark: ~4.3s on the development environment.
- Deep analysis rate on benchmark: ~11.1% of scanned candles.
- Strategy, X2, risk, and execution logic are otherwise preserved from Batch 14.

## Batch 19 change
The backtest GET route uses an adaptive M1 fetch: requested candles first, then 3000/1500 only after an upstream timeout. Daily candles are optional via `includeDaily=1` and are no longer on the critical path.
