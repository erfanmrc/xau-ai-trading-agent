# XAU AI Trading Agent — Patch 42

## Purpose
Patch 42 makes the `requireLiquidityOrOrderBlock` rule an actual execution hard-gate in both layers:

1. `engine/decision.ts` — candidates without direction-matched liquidity evidence or a direction-matched order block are not eligible for selection when the config flag is enabled.
2. `engine/backtest/run.ts` — the backtest execution layer independently re-checks the same rule before opening a position, preventing a stale/older decision path from bypassing the hard-gate.

Volume Profile remains soft context only.

## Files to replace
- `engine/decision.ts`
- `engine/backtest/run.ts`

## Expected change
A setup such as:
- `liquidityScore: 0`
- `liquidityLabels: []`
- `orderBlock: null`

must not be executed when:
`config.analysis.priceAction.requireLiquidityOrOrderBlock === true`.

The backtest records an explicit rejection reason:
`Liquidity/Order Block required for execution: no qualifying nearby direction-matched liquidity or order block`
