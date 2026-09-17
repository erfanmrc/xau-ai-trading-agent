# XAU AI Trading Agent — Batch 13

This batch rebuilds the strategy engine around a market-cycle model:

SPIKE → CHANNEL → RANGE → TRANSITION

## Strategy architecture

- H1: main directional filter.
- M15: market structure + support/resistance + 50/60-period averages.
- M5: setup/context.
- M1: trigger.
- Daily/weekly bias: broader directional context; only a simultaneous daily+weekly opposition blocks a candidate (plus the hard H1 filter).

## SP2L

- Mother spike = 3–4 strong full-body candles.
- Candles after the first must preserve a pressure/non-overlap gap from the first candle close.
- Expansion, displacement and directional efficiency are checked.
- Spike origin should have contextual support from higher-timeframe structure or a relevant price/average level.
- Pullback is intentionally simple: one counter-direction return candle can stabilize the first leg; no fixed pullback percentage is imposed.
- Entry is the first clean Leg-2 break after the return.
- Projected target is based on an equal second leg. A setup is not traded when that projection cannot justify the stop.
- If the first leg becomes too extended or the stop becomes too wide, wait for BTB rather than chase.

## PRO_BTB

- BTB zones are derived from M5/M15 mother-spike departures, using breakout/Order-Block-style origin zones.
- Return must touch the active zone after a real departure.
- Entry uses a two-step rejection confirmation rather than an instant touch-only trigger.
- Wide stops and entries too far from the level are rejected.

## Micro-MAP

- Reserved for directional channel structure, not mother spikes.
- Tight geometry, small stop and 4R target profile.
- No X2.

## X2

- X2 is deferred. Initial order is active first.
- A completed favorable candle must establish at least the configured favorable-R threshold before the next candle may trigger the midpoint add-on.
- X2 PnL, exposure and actual risk are counted only after activation.

## Context / economic data

POST endpoints can accept `dailyCandles[]` and `economicEvents[]`. Without a structured event feed, the economic layer remains neutral and explicitly reports that data is unavailable.

## Data time

Twelve Data requests for XAU/USD use `timezone=UTC` so session, daily and weekly context are calculated against a consistent timestamp basis.

## Backtest

GET:
`/api/backtest?candles=5000`

The backtest reports strategy-specific opportunity statistics, rejections, daily/weekly context, market phase and X2 diagnostics.


Batch 13 performance patch: backtest uses a rolling 1440-M1 analysis window by default (configurable as analysisWindowBars) and the backtest API declares a Node.js runtime with maxDuration=60s where supported by the deployment plan. This preserves 5000-candle coverage while avoiding O(n²)-style repeated full-history analysis.


Batch 14: performance patch. 5000-candle backtests use a bounded 360-bar analysis window and bounded recent M5/M15 BTB-zone scan to avoid repeated O(n^2) historical rescans. Context computes ImportantLevels once per analysis. Strategy rules remain unchanged.
