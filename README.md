# XAU AI Trading Agent — Patch 43

Purpose: make the Liquidity/Order Block execution requirement self-verifying and enforce it at the final position-opening point.

Files to replace:
- engine/decision.ts
- engine/backtest/run.ts

Config prerequisite:
- config/strategy.ts must keep `analysis.priceAction.requireLiquidityOrOrderBlock: true`.

Patch 43 adds a final execution invariant immediately before constructing `OpenPosition`, and exposes:
- `engineRevision: "PATCH43_LIQUIDITY_HARD_GATE"`
- `liquidityGate.required`
- `liquidityGate.selectedStrategy`
- `liquidityGate.executionStrategy`
- `liquidityGate.selectedHasDirectionMatchedEvidence`

Expected result for the previously offending 2026-09-16 17:04 SP2L SHORT:
- it must NOT be present in `trades[]`.
- its valid opportunity must be `action: "REJECT"` with a Liquidity/Order Block rejection reason.
- the backtest response must contain `engineRevision: "PATCH43_LIQUIDITY_HARD_GATE"`.
