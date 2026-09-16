Batch 2 — MTF + Zone Engine

New:
- lib/strategy/context/mtf.ts
- lib/strategy/context/zones.ts
- lib/strategy/mtf-engine.ts

MTF: H1 → M15 → M5 → M1.
Zone Engine: Spike / FVG / Breakout + zone return.

Important:
- BTB is not yet switched to consume these zones.
- Micro-MAP remains non-trading until its exact rules are validated.
- Previous Day High/Low must later use real timestamp/session boundaries.
