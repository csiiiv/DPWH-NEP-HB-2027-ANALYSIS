import React,{useEffect,useState} from 'react';
import {loadData} from './data.js';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
const names={third:'HGAB3 · 3rd reading',second:'HGAB2 · 2nd reading',nep:'DBM NEP',api:'DPWH Transparency NEP'};
const labels={'Bridge Program':'Bridges','Convergence and Special Support Program':'CSSP','Foreign-assisted projects':'FAPs'};
const modes={no_suggestion:'House-only · no NEP suggestion',unresolved:'Unresolved NEP suggestions',third_only:'New 3rd-reading records'};
export default function Analysis({route}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 const source=Object.hasOwn(names,route.params.get('source'))?route.params.get('source'):'third';
 const ranking=Object.hasOwn(modes,route.params.get('ranking'))?route.params.get('ranking'):'no_suggestion';
 const reading=['second','third'].includes(source)?source:'third';
 useEffect(()=>{const c=new AbortController();loadData('comparison_overview_2027.json',c.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 function change(key,value){const params=Object.fromEntries(route.params);params[key]=value;window.location.hash=routeHref('analysis',params);}
 if(error)return <p role="alert">{error}</p>;
 if(!data)return <p role="status">Loading headline analysis…</p>;
 const stats=data.headlines.sources[source],list=data.headlines.rankings[reading][ranking];
 return <div className="headline-analysis">
  <p className="eyebrow">DPWH · FY2027</p><h1>Analysis</h1>
  <p>Office assignments, program allocations and House insertion candidates from the retained budget records.</p>
  <div className="analysis-controls"><label>Budget source<select aria-label="Analysis budget source" value={source} onChange={e=>change('source',e.target.value)}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><ShareLink /></div>
  <p className="notice">Counts refer to source allocation records, including grouped members, rather than unique projects across stages. Office assignments come from the selected source; missing assignments are shown separately. Scope: operations, including local and foreign-assisted projects. Transparency reflects its retained listing.</p>
  <div className="cards analysis-headlines"><article><h3>Source allocation records</h3><strong>{stats.records.toLocaleString()}</strong><p>{names[source]}</p></article><article><h3>Allocated amount</h3><strong>{amount(stats.amount_php)}</strong><p>PHP · selected source only</p></article><article><h3>Central Office / DEOs</h3><strong>{stats.offices['Central Office'].records.toLocaleString()} / {stats.offices['District engineering offices (DEOs)'].records.toLocaleString()}</strong><p>Allocation records · regional and missing offices separate</p></article></div>
  <div className="analysis-distributions"><Distribution title="Central Office vs DEOs" buckets={stats.offices} total={stats.records}/><Distribution title="Records by program" buckets={stats.programs} total={stats.records}/></div>
  <section className="analysis-section"><h2>Top insertion candidates</h2>
   <label>Candidate group<select aria-label="Analysis candidate group" value={ranking} onChange={e=>change('ranking',e.target.value)}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <p className="muted">Ranked by {names[reading]} allocation · top 20 of {list.comparison_rows.toLocaleString()} comparison rows · {amount(list.amount_php)} across this group. Grouped allocations remain grouped.</p>
   <p className="notice">{ranking==='no_suggestion'?'House records with no attached NEP/Transparency source and no retained NEP suggestion. These are review candidates, not confirmed insertions.':ranking==='unresolved'?'House records with possible or ambiguous NEP counterparts are separated from the no-suggestion list. Review their suggestions before claiming an insertion.':'Records present only in HGAB3 under the retained reading key. This shows a reading difference, not confirmed absence from NEP.'} Unique different-region title candidates are linked for review and excluded from the House-only groups.</p>
   <div className="table-scroll" role="region" aria-label="Top insertion candidates" tabIndex={0}><table><thead><tr><th>Rank</th><th>Project / assignment</th><th>Allocation (PHP)</th><th>Records / status</th><th>Review</th></tr></thead><tbody>{list.top.map((r,i)=><tr key={r.id}><td>{i+1}</td><th scope="row">{r.title}<small>{r.zone==='fap'?'FAPs':labels[r.program]??r.program} · {r.region} · {r.office||'No recorded office'}</small></th><td className="num" title={r.amount_php.toLocaleString('en-PH')+' PHP'}>{amount(r.amount_php)}</td><td>{r.allocation_records} source allocation {r.allocation_records===1?'record':'records'}<small>{r.trace.replaceAll('_',' ')}</small></td><td><a href={routeHref('compare',{view:'projects',region_match:'ignore',q:r.id,record:r.id})}>Review comparison</a><br/><a href={routeHref('house',{view:'projects',reading:reading==='third'?'third':'second',node:r.source_id})}>{r.allocation_records>1?'House source tree · first allocation':'House source tree'}</a></td></tr>)}</tbody></table></div>
   {!list.top.length && <p>No records in this group for the selected House reading.</p>}
  </section>
 </div>;
}
function Distribution({title,buckets,total}){
 return <section className="analysis-section"><h2>{title}</h2><div className="table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th>Category</th><th>Allocation records</th><th>Share of records</th><th>Allocation (PHP)</th></tr></thead><tbody>{Object.entries(buckets).map(([key,b])=><tr key={key}><th scope="row">{labels[key]??key}</th><td className="num">{b.records.toLocaleString()}</td><td className="num">{total?(b.records/total*100).toFixed(1):'0.0'}%</td><td className="num" title={b.amount_php.toLocaleString('en-PH')+' PHP'}>{amount(b.amount_php)}</td></tr>)}</tbody></table></div></section>;
}
