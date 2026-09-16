export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent — Batch 6</h1>
  <p>SP2L + PRO_BTB + strict Micro-MAP execution engine with permissive single-strategy entries.</p>
  <p>MTF roles: H1 directional filter → M15 structure → M5 setup context → M1 trigger.</p>
  <p>Entry confluence: daily round numbers + important mean/average levels can strengthen a signal.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest?candles=5000</code></p>
  <hr/>
  <p>SP2L uses a simple return from the last spike candle followed by Leg-2 stabilization. Extended moves are handed off to BTB rather than chased.</p>
  <p>BTB uses M5/M15 breakout-departure and retest logic. Micro-MAP remains intentionally strict with a tight stop and 4R target profile.</p>
 </main>;
}
