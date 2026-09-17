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

## Backtest risk / exit rules (Batch 24)
- No daily trade-count cap by default (`maxTradesPerDay=0` = unlimited).
- No daily take-profit-count cap (`maxTakeProfitsPerDay=0` = unlimited / not enforced).
- Single-stage position risk: 0.5% of current balance.
- X2 setup: combined planned risk is 1% (approximately 0.5% initial + approximately 0.5% added at midpoint), with spread included in both legs.
- Maximum stop distance: 1.5% of entry price, including spread in the effective stop distance.
- SP2L / MicroMAP single-stage target RR: 1R to 2R.
- SP2L X2 / two-stage target RR: 2R to 5R.
- PRO_BTB target RR: at least 2R.
- Target price is derived from the detected first-leg size minus spread, not an arbitrary fixed RR multiple.
- A target being reached does not force an exit while the prevailing trend remains intact. The backtest marks the target as reached and keeps the position until a confirmed reversal, stop, or end of data.
- Trend reversal requires two stabilized opposite M1 candles and a break of the protected prior swing; M5 confirmation strengthens the reason when available but is not mandatory.

### Batch 25 structure rules
- Daily direction is derived only from completed Daily H/L structure: HH+HL = LONG, LH+LL = SHORT. Mixed/neutral structure is uncertainty and blocks new scalp entries.
- All executable scalp positions must match the Daily direction.
- SP2L requires a meaningful break of a confirmed prior structural swing H/L before the pullback trigger.
- M1/M5/M15/H1 swing highs and lows are exposed as important levels and are used for structural stops/confluence.
- Existing positions exit at their planned TP or SL; market trend analysis controls the direction of future entries, not TP exits.
- Micro-MAP requires a projected reward above 4R.

## Batch 29 Daily Price-Action Direction
The Daily trading-direction filter is based on price action rather than Daily H/L labels.
It evaluates directional pressure, close progression, recent impulse/follow-through,
candle quality and controlled correction behavior using completed daily candles only.
Daily H/L remains important for structural levels and execution logic on lower timeframes.
A confirmed Daily price-action trend permits new scalp entries only when the market is not in a
controlled correction; ambiguous/range conditions remain blocked.
