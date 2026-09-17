import { EconomicContext, EconomicEvent, MarketBias } from '@/types/market';

const HORIZON_MS = 20 * 60_000;
const DIRECTIONAL_TITLES = [
  'interest rate', 'cpi', 'inflation', 'ppi', 'nfp', 'nonfarm', 'payroll',
  'fomc', 'fed ', 'employment', 'unemployment', 'pce', 'ism', 'retail sales',
  'gdp', 'powell'
];

function inferEventBias(e: EconomicEvent): MarketBias {
  const text = e.title.toLowerCase();
  if (!DIRECTIONAL_TITLES.some(x=>text.includes(x))) return 'NEUTRAL';
  if (e.actual==null || e.forecast==null || e.forecast===0) return 'NEUTRAL';
  // This is intentionally conservative: the system only uses a directional
  // cue when the event itself has a numerical surprise. It never invents a
  // news bias when no structured event data is available.
  const surprise=(e.actual-e.forecast)/Math.abs(e.forecast);
  const cpiLike=/cpi|inflation|ppi|interest rate|fed |powell/.test(text);
  if (Math.abs(surprise)<0.01) return 'NEUTRAL';
  if (cpiLike) return surprise>0?'SHORT':'LONG';
  return surprise>0?'LONG':'SHORT';
}

export function buildEconomicContext(now:string, events: EconomicEvent[]|undefined): EconomicContext {
  if (!events?.length) {
    return {status:'UNAVAILABLE',risk:'NONE',bias:'NEUTRAL',upcoming:[],notes:['No structured economic-event feed supplied; economic filter remains neutral.']};
  }
  const t=new Date(now).getTime();
  const upcoming=events.filter(e=>Math.abs(new Date(e.time).getTime()-t)<=24*60*60_000)
    .sort((a,b)=>Math.abs(new Date(a.time).getTime()-t)-Math.abs(new Date(b.time).getTime())).slice(0,12);
  const highNear=upcoming.some(e=>e.impact==='HIGH' && Math.abs(new Date(e.time).getTime()-t)<=HORIZON_MS);
  const biasCounts=upcoming.filter(e=>e.impact!=='LOW').map(inferEventBias).filter(x=>x!=='NEUTRAL');
  const long=biasCounts.filter(x=>x==='LONG').length, short=biasCounts.filter(x=>x==='SHORT').length;
  const bias:MarketBias=long>short?'LONG':short>long?'SHORT':'NEUTRAL';
  const notes:string[]=[];
  if(highNear) notes.push('High-impact event is within the configured near-event window.');
  if(bias!=='NEUTRAL') notes.push(`Structured event surprise bias: ${bias}. Treat as contextual, not standalone entry logic.`);
  return {status:'AVAILABLE',risk:highNear?'HIGH_IMPACT_NEAR':upcoming.some(e=>e.impact==='HIGH')?'ELEVATED':'NONE',bias,upcoming,notes};
}
