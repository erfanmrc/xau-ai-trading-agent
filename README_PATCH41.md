# XAU AI Trading Agent — Patch 41

Target repository: xau-ai-trading-agent

## Replace

Replace exactly this file in the repository:

`engine/decision.ts`

## Change

When `STRATEGY_CONFIG.analysis.priceAction.requireLiquidityOrOrderBlock` is enabled,
a candidate is now eligible for execution only when it has either:

- an identified order block, or
- a nearby liquidity label containing `LIQUIDITY`.

Volume profile remains soft context only.

No other project files are included in this patch.
