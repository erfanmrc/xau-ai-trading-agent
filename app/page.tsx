export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent — Batch 24</h1>
  <p>SP2L + PRO_BTB + strict Micro-MAP with market-cycle awareness: SPIKE → CHANNEL → RANGE.</p>
  <p>MTF roles: H1 directional filter → M15 structure/levels → M5 setup → M1 trigger; daily/weekly direction is contextual.</p>
  <p>Risk rules: 0.5% single-stage, approximately 1% combined for X2, and maximum 1.5% stop distance including spread.</p>
  <p>Target rules: Leg-1 length minus spread; single-stage 1–2R, X2/two-stage 2–5R, and BTB 2R+.</p>
  <p>Trend-following exit: reaching the target is a profit checkpoint; the position remains open while the trend holds and exits on a confirmed reversal, stop, or end of data.</p>
  <p>Daily trade count and daily take-profit count are unlimited by default. The 3% daily risk budget remains the risk-safety control.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest?candles=5000</code></p>
  <hr/>
  <p>SP2L detects a mother spike: 3–4 strong candles, breakout/pressure and a simple pullback, then projects the first-leg target minus spread.</p>
  <p>BTB uses M5/M15 mother-spike breakout/OB departure and M1 rejection. Micro-MAP remains reserved for clean channel structure.</p>
 </main>;
}
