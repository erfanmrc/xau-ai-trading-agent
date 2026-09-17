export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent — Batch 12</h1>
  <p>SP2L + PRO_BTB + strict Micro-MAP with market-cycle awareness: SPIKE → CHANNEL → RANGE.</p>
  <p>MTF roles: H1 directional filter → M15 structure/levels → M5 setup → M1 trigger; daily/weekly direction is contextual.</p>
  <p>Entry confluence: daily gold round numbers + 50/60-period averages + session/range levels can strengthen a valid setup.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest?candles=5000</code></p>
  <hr/>
  <p>SP2L detects the mother spike: 3–4 strong candles + pressure gap + displacement, then a simple return and early Leg-2 trigger. Extended/wide-risk moves are handed off to BTB.</p>
  <p>BTB uses M5/M15 mother-spike breakout/OB departure and two-step retest confirmation. Micro-MAP is reserved for channel structure with tight geometry and a 4R target profile.</p>
 </main>;
}
