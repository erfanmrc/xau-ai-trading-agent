export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent — Patch 46</h1>
  <p>Market-regime-first architecture: GLOBAL BIAS → EMA50/EMA60 M1/M5 → SPIKE / CHANNEL / RANGE → strategy entry.</p>
  <p>Spike definition: minimum 3 directional candles + displacement + at least one causal FVG + directional pressure/imbalance. The old Mother Spike requirement is removed.</p>
  <p>Strategy roles: SP2L for Spike pullback/continuation, PRO_BTB for breakout-retest, and Micro-MAP for directional channel breakouts.</p>
  <p>Risk rules: 0.5% initial risk, approximately 1% combined for X2, and the existing daily risk budget.</p>
  <p>Liquidity is price-action context derived from pools, sweeps, and order blocks. It is not a live DOM/order-book feed. Volume Profile remains optional.</p>
  <p>Backtest diagnostics include opportunity rate per day so the system can target roughly 10 candidate entry opportunities per day without forcing a trade quota.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest?candles=5000</code></p>
 </main>;
}
