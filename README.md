# XAU AI Trading Agent — Batch 6: SP2L/BTB/Micro-MAP practical execution

## Core execution model
- One `VALID` strategy with a complete entry/stop plan is sufficient.
- There is no requirement for two strategies to agree.
- H1 is the only hard directional filter: `LONG` blocks a `SHORT` candidate and vice versa; `NEUTRAL` does not block.
- M15 is structural context, M5 is setup context and M1 is trigger context. These affect scoring rather than acting as hard prerequisites.
- Round-number and important average/mean levels strengthen a setup when entry is close to them.

## SP2L practical rules
- Requires a completed spike breakout with at least 3 strong candles in the trend direction.
- The pullback is deliberately simple: a return from the extreme of the last spike candle is enough. There is no mandatory minimum retracement percentage.
- A directional stabilization candle at the start of Leg-2 confirms the entry.
- Stop is anchored below/above the Leg-1 spike structure.
- If the price has moved too far from the breakout/origin or the stop becomes too wide, SP2L does not chase the move; it reports a hand-off/wait state for BTB.
- X2 is placed at the midpoint between entry and stop when the combined risk cap permits it.
- FVG/imbalance and structure alignment are bonuses, not mandatory SP2L gates.

## PRO_BTB practical rules
- Uses breakout/retest zones from M5 and M15, with the existing M1 zones retained as a secondary source.
- The model looks for a strong directional departure from a breakout level, followed by a return to that level.
- Entry requires a visible rejection/strength candle in the expected direction.
- H1 remains the only hard direction filter.
- Round/mean price-level confluence increases score but does not create a trade by itself.

## Micro-MAP practical rules
- Intentionally the strictest and least frequent strategy.
- Requires a compact micro-channel, controlled pullback, clean trigger and strong confirmation.
- Stop must remain tight relative to ATR.
- Uses a higher target profile (`4R`) with a minimum RR guard (`3R`).
- A valid Micro-MAP remains rare by design; the system should not loosen it merely to increase trade count.

## Risk and X2
- Base risk defaults to 0.5% per trade.
- Daily planned-risk budget defaults to 3% and max trades to 3.
- X2 uses the defined volume multiplier from the first position at the midpoint, so the halved distance is handled by the doubled volume rather than by multiplying risk again.
- The combined-risk cap is enforced.
- Backtest re-calculates position size, X2 and target from the actual execution price when `NEXT_OPEN` is used.

## Diagnostic backtest
The backtest records every strategy evaluation and reports:
- VALID / WATCH / INVALID
- EXECUTE / REJECT
- detailed rejection reasons
- confluence labels and score
- per-strategy opportunities, executions, wins, losses, PnL, total/average R, win rate and profit factor
- total and daily drawdown including open-position mark-to-market equity
- daily planned-risk usage
- multi-day data coverage

## Data note
`GET /api/backtest?candles=5000` remains the bounded live-data smoke/backtest mode. For 30–60 day research, POST a larger historical `candles[]` dataset to `/api/backtest`.

## Candle backtest caveat
When the same candle touches both stop and target, the engine resolves the candle conservatively as stop-first because tick ordering is unavailable.
