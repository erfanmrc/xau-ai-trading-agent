# XAU AI Trading Agent — Batch 4

This batch completes the unified strategy layer and adds the first deterministic backtest engine.

## What changed

- Micro-MAP is now a real deterministic detector instead of a placeholder.
- SP2L, PRO_BTB and Micro-MAP use the same `StrategySignal` contract.
- M1 candles are resampled into M5/M15/H1 for MTF context.
- Previous-day, session and rolling-range levels are mapped from candle timestamps.
- Unified decision logic exposes all three strategy states and a consensus mode.
- `/api/strategy/analyze` supports live GET and candle-array POST.
- `/api/backtest` supports candle-array POST and a bounded live-data GET smoke backtest.
- Backtest includes spread, next-open execution, max 3 trades/day, daily risk cap, 0.5% base risk, x2 entry, TP/SL, equity drawdown and daily drawdown metrics.

## Important Micro-MAP note

The source material describes Micro-MAP as a micro-channel based approach using prior highs/lows, breakout/trigger logic, inside-bar / pullback structures and multiple entry attempts. The code is a deterministic implementation of the documented concepts, not a claim that a transcript alone reproduces every proprietary execution nuance.

## Backtest caveat

The engine is candle-based. When the same candle touches both stop and target, the implementation resolves that candle conservatively as stop-first because tick ordering is unavailable.

## Environment

`TWELVE_DATA_API_KEY`
`TELEGRAM_BOT_TOKEN`
`TELEGRAM_CHAT_ID`
`CRON_SECRET`

Build: `npm run build`
