export default function Home(){
 return <main style={{maxWidth:980,margin:'0 auto',padding:32}}>
  <h1>XAU AI Trading Agent</h1>
  <p>Unified SP2L + PRO_BTB + Micro-MAP engine is online.</p>
  <p>Health: <code>/api/health</code></p>
  <p>Market: <code>/api/market</code></p>
  <p>Live strategy: <code>/api/strategy/analyze</code></p>
  <p>Backtest: <code>/api/backtest</code></p>
  <hr/>
  <p>Decision flow: MTF context → levels/liquidity → three independent strategies → unified consensus → risk plan.</p>
 </main>;
}
