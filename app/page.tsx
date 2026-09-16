export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent</h1>
  <p>SP2L + PRO_BTB + Micro-MAP execution engine with permissive single-strategy entries.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest</code></p>
  <hr/>
  <p>Decision flow: H1 directional filter → M15 structure confirmation → M5 setup context → M1 trigger → any single VALID strategy may execute.</p>
  <p>Backtest diagnostics: VALID/WATCH/INVALID, EXECUTE/REJECT, rejection reasons, multi-day coverage, and per-strategy statistics.</p>
 </main>;
}
