# XAU AI Trading Agent — Batch 5: permissive execution + diagnostic backtest

## Trading decision model

- A single `VALID` strategy with a complete entry/stop plan is sufficient to create an execution candidate.
- Agreement between multiple strategies is **not required**.
- H1 is the primary directional filter: a candidate is blocked only when H1 explicitly points opposite to the strategy direction. H1=NEUTRAL does not block.
- M15 is treated as structure confirmation and contributes to scoring, not as a hard prerequisite.
- M5 is setup context and M1 is trigger context; they contribute to scoring, not hard alignment.
- The highest-scoring non-blocked valid strategy is selected.

## Diagnostic backtest

The backtest now records every strategy evaluation as an opportunity and reports:

- VALID / WATCH / INVALID counts
- EXECUTE / REJECT counts
- rejection reasons
- per-strategy opportunity statistics for SP2L, PRO_BTB and MICROMAP
- multi-day data coverage
- normal trading performance metrics and prop-rule checks

This makes it possible to measure whether a strategy is naturally producing setups before adding tighter execution filters in a later batch.

## Data note

`GET /api/backtest` requests up to 5000 M1 candles by default (about several trading days depending on the feed). Use `?candles=1500` through `?candles=5000` to adjust within the bounded live-data smoke range. For longer research, prefer POSTing a larger historical candle set.

## Micro-MAP note

The source material describes Micro-MAP as a micro-channel based approach using prior highs/lows, breakout/trigger logic, inside-bar / pullback structures and multiple entry attempts. The code is a deterministic implementation of the documented concepts, not a claim that a transcript alone reproduces every proprietary execution nuance.

## Backtest caveat

The engine is candle-based. When the same candle touches both stop and target, the implementation resolves that candle conservatively as stop-first because tick ordering is unavailable.
