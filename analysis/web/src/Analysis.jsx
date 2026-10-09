import React,{useEffect,useMemo,useState} from 'react';
import {loadData} from './data.js';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
import {benford,trailingZeros,lastDigits,roundingLadder,valueBands,kmeansClusters,exactConcentrations} from './analysisStats.js';
const names={third:'HGAB3 · 3rd reading',second:'HGAB2 · 2nd reading',nep:'DBM NEP',api:'DPWH Transparency NEP'};
const labels={'Bridge Program':'Bridges','Convergence and Special Support Program':'CSSP','Foreign-assisted projects':'FAPs'};
const short=value=>labels[value]??value;
const modes={no_suggestion:'House-only · no NEP suggestion',unresolved:'Unresolved NEP suggestions',third_only:'New 3rd-reading records'};
const views=[['overview','Overview'],['insertions','Insertions'],['revisions','Revisions'],['statistics','Statistics']];
const dimensions=[['overall','Overall'],['region','Region'],['office','District office'],['program','Category'],['pap','PAP']];
const pick=(params,key,allowed,fallback)=>allowed.includes(params.get(key))?params.get(key):fallback;
const dimensionTitle=dim=>dim==='office'?'district office':dim==='pap'?'PAP':dim;
export default function Analysis({route}){
 const [data,setData]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState('');
 const view=pick(route.params,'view',views.map(v=>v[0]),'overview');
 const source=pick(route.params,'source',Object.keys(names),'third');
 const ranking=pick(route.params,'ranking',Object.keys(modes),'no_suggestion');
 const dim=pick(route.params,'dim',dimensions.map(d=>d[0]),'overall');
 const direction=pick(route.params,'direction',['increased','reduced'],'increased');
 useEffect(()=>{const c=new AbortController();loadData('comparison_overview_2027.json',c.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 // Detail rows load lazily only when a view needs per-record data.
 useEffect(()=>{
  if(!['revisions','statistics'].includes(view)||!data||detail)return;
  const c=new AbortController();loadData('comparison_projects_2027.json',c.signal)
   .then(payload=>setDetail(payload.projects)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>c.abort();
 },[view,data,detail]);
 function change(key,value){const params=Object.fromEntries(route.params);params[key]=value;window.location.hash=routeHref('analysis',params);}
 if(error)return <p role="alert">{error}</p>;
 if(!data)return <p role="status">Loading analysis…</p>;
 const reading=['second','third'].includes(source)?source:'third';
 const stats=data.headlines.sources[source];
 const needsDetail=['revisions','statistics'].includes(view)&&!detail;
 return <div className="headline-analysis">
  <p className="eyebrow">DPWH · FY2027</p><h1>Analysis</h1>
  <p>Office assignments, program allocations and review candidates from the retained budget records.</p>
  <div className="analysis-controls"><label>Budget source<select aria-label="Analysis budget source" value={source} onChange={e=>change('source',e.target.value)}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><ShareLink /></div>
  <nav className="analysis-subtabs" role="tablist" aria-label="Analysis views">{views.map(([key,title])=>
   <button key={key} role="tab" aria-selected={view===key} onClick={()=>change('view',key)}>{title}</button>)}</nav>
  <p className="notice">Counts refer to source allocation records, including grouped members, rather than unique projects across stages. Office assignments come from the selected source; missing assignments are shown separately. Scope: operations, including local and foreign-assisted projects. Transparency reflects its retained listing.</p>
  {needsDetail&&<p role="status">Loading per-record data…</p>}
  {view==='overview'&&<Overview stats={stats} source={source}/>}
  {view==='insertions'&&<Insertions headlines={data.headlines} reading={reading} ranking={ranking} dim={dim} change={change}/>}
  {view==='revisions'&&detail&&<Revisions detail={detail} revisionSets={data.headlines.revisionSets} dim={dim} direction={direction} change={change}/>}
  {view==='statistics'&&detail&&<Statistics detail={detail} source={source} dim={dim} change={change}/>}
 </div>;
}
function DimensionChips({dim,change}){
 return <div className="dimension-chips" role="group" aria-label="Break down by">{dimensions.map(([key,title])=>
  <button key={key} className={dim===key?'active':''} aria-pressed={dim===key} onClick={()=>change('dim',key)}>{title}</button>)}</div>;
}
function Overview({stats,source}){
 return <>
  <div className="cards analysis-headlines"><article><h3>Source allocation records</h3><strong>{stats.records.toLocaleString()}</strong><p>{names[source]}</p></article><article><h3>Allocated amount</h3><strong>{amount(stats.amount_php)}</strong><p>PHP · selected source only</p></article><article><h3>Central Office / DEOs</h3><strong>{stats.offices['Central Office'].records.toLocaleString()} / {stats.offices['District engineering offices (DEOs)'].records.toLocaleString()}</strong><p>Allocation records · regional and missing offices separate</p></article></div>
  <div className="analysis-distributions"><Distribution title="Central Office vs DEOs" buckets={stats.offices} total={stats.records}/><Distribution title="Records by program" buckets={stats.programs} total={stats.records}/></div>
  <section className="analysis-section"><h2>Explore further</h2><div className="analysis-crosslinks">
   <a href={routeHref('analysis',{view:'insertions'})}>Insertion candidates by region, office and category →</a>
   <a href={routeHref('analysis',{view:'revisions'})}>Reading revisions and cross-document differences →</a>
   <a href={routeHref('analysis',{view:'statistics'})}>Rounding, Benford and value clustering →</a>
  </div></section>
 </>;
}
function Distribution({title,buckets,total}){
 return <section className="analysis-section"><h2>{title}</h2><div className="table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th>Category</th><th>Allocation records</th><th>Share of records</th><th>Allocation (PHP)</th></tr></thead><tbody>{Object.entries(buckets).map(([key,b])=><tr key={key}><th scope="row">{short(key)}</th><td className="num">{b.records.toLocaleString()}</td><td className="num">{total?(b.records/total*100).toFixed(1):'0.0'}%</td><td className="num" title={b.amount_php.toLocaleString('en-PH')+' PHP'}>{amount(b.amount_php)}</td></tr>)}</tbody></table></div></section>;
}
function Insertions({headlines,reading,ranking,dim,change}){
 const list=headlines.rankings[reading][ranking];
 return <section className="analysis-section"><h2>Top insertion candidates</h2>
  <div className="analysis-controls"><label>Candidate group<select aria-label="Analysis candidate group" value={ranking} onChange={e=>change('ranking',e.target.value)}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
  <DimensionChips dim={dim} change={change}/>
  <p className="muted">Ranked by {names[reading]} allocation · top 20 of {list.comparison_rows.toLocaleString()} comparison rows · {amount(list.amount_php)} across this group. Grouped allocations remain grouped.</p>
  <p className="notice">{ranking==='no_suggestion'?'House records with no attached NEP/Transparency source and no retained NEP suggestion. These are review candidates, not confirmed insertions.':ranking==='unresolved'?'House records with possible or ambiguous NEP counterparts are separated from the no-suggestion list. Review their suggestions before claiming an insertion.':'Records present only in HGAB3 under the retained reading key. This shows a reading difference, not confirmed absence from NEP.'} Unique different-region title candidates are linked for review and excluded from the House-only groups.</p>
  {dim!=='overall'&&<AggregateTable title={`Totals by ${dimensionTitle(dim)}`} groups={list.by_dim[dim]}/>}
  <div className="table-scroll" role="region" aria-label="Top insertion candidates" tabIndex={0}><table><thead><tr><th>Rank</th><th>Project / assignment</th><th>Allocation (PHP)</th><th>Records / status</th><th>Review</th></tr></thead><tbody>{list.top.map((r,i)=><tr key={r.id}><td>{i+1}</td><th scope="row">{r.title}<small>{r.zone==='fap'?'FAPs':short(r.program)} · {r.region} · {r.office||'No recorded office'}</small></th><td className="num" title={r.amount_php.toLocaleString('en-PH')+' PHP'}>{amount(r.amount_php)}</td><td>{r.allocation_records} source allocation {r.allocation_records===1?'record':'records'}<small>{r.trace.replaceAll('_',' ')}</small></td><td><a href={routeHref('compare',{view:'projects',region_match:'ignore',q:r.id,record:r.id})}>Review comparison</a><br/><a href={routeHref('house',{view:'projects',reading:reading==='third'?'third':'second',node:r.source_id})}>{r.allocation_records>1?'House source tree · first allocation':'House source tree'}</a></td></tr>)}</tbody></table></div>
  {!list.top.length && <p>No records in this group for the selected House reading.</p>}
 </section>;
}
function AggregateTable({title,groups}){
 if(!groups?.length)return null;
 const total=groups.reduce((sum,g)=>sum+g.amount_php,0);
 return <div className="table-scroll aggregate-table" role="region" aria-label={title} tabIndex={0}><h3>{title} · top {groups.length}</h3><table><thead><tr><th>Group</th><th>Rows</th><th>Allocation (PHP)</th></tr></thead><tbody>{groups.map(g=><tr key={g.label}><th scope="row">{short(g.label)??g.label}</th><td className="num">{g.rows.toLocaleString()}</td><td className="num" title={g.amount_php.toLocaleString('en-PH')+' PHP'}>{amount(g.amount_php)}</td></tr>)}</tbody></table></div>;
}
function Revisions({detail,revisionSets,dim,direction,change}){
 const cross=useMemo(()=>detail.filter(r=>['candidate_increase','candidate_decrease','transparency_gap_then_candidate_increase','transparency_gap_then_candidate_decrease'].includes(r.trace))
  .map(r=>({...r,gap:houseMinusNep(r)})).filter(r=>r.gap!==null),[detail]);
 const shown=useMemo(()=>[...cross].sort((a,b)=>direction==='increased'?b.gap-a.gap:a.gap-b.gap),[cross,direction]);
 const byDim=useMemo(()=>dim==='overall'?null:aggregate(cross.map(r=>{const house=r.third??r.second;
  return {amount_php:Math.abs(r.gap),region:r.region,office:house?.office??r.nep?.office??'',program:r.program,pap:r.pap};}),dim),[cross,dim]);
 return <>
  <section className="analysis-section"><h2>Reading revisions · HGAB3 vs HGAB2</h2>
   <p className="notice">Recorded 2nd→3rd reading differences under the retained matching key: {revisionSets.reading.length.toLocaleString()} rows · net {amount(revisionSets.delta_php)}. Repeated keys remain grouped.</p>
   <div className="table-scroll" role="region" aria-label="Reading revisions" tabIndex={0}><table><thead><tr><th>Project</th><th>HGAB2</th><th>HGAB3</th><th>Δ</th></tr></thead><tbody>{revisionSets.reading.map(r=><tr key={r.id}><th scope="row">{r.title}<small>{short(r.program)} · {r.region}</small></th><td className="num">{r.second_php!=null?amount(r.second_php):'—'}</td><td className="num">{r.third_php!=null?amount(r.third_php):'—'}</td><td className="num">{r.reading_delta_php!=null?amount(r.reading_delta_php):'new in HGAB3'}</td></tr>)}</tbody></table></div>
  </section>
  <section className="analysis-section"><h2>House vs NEP differences · provisional identity</h2>
   <DimensionChips dim={dim} change={change}/>
   <div className="analysis-controls"><label>Direction<select aria-label="Revision direction" value={direction} onChange={e=>change('direction',e.target.value)}><option value="increased">Most increased (House above NEP)</option><option value="reduced">Most reduced (House below NEP)</option></select></label></div>
   <p className="muted">{cross.length.toLocaleString()} comparison rows · {amount(cross.reduce((sum,r)=>sum+Math.abs(r.gap),0))} aggregate absolute difference.</p>
   <p className="notice">These rows carry exact House/NEP candidate pairs with unequal amounts. Identity is proposed by title/scope matching and is not manually certified; the House−NEP gap often reflects GAA-like versus full-project-cost bases, especially for FAPs. This is a cross-document comparison, not a House reading change.</p>
   {byDim&&<AggregateTable title={`Differences by ${dimensionTitle(dim)}`} groups={byDim}/>}
   <div className="table-scroll" role="region" aria-label="Top House vs NEP differences" tabIndex={0}><table><thead><tr><th>Project</th><th>House</th><th>NEP</th><th>House − NEP</th></tr></thead><tbody>{shown.slice(0,20).map(r=>{const house=r.third??r.second;return <tr key={r.id}><th scope="row">{r.title}<small>{short(r.program)} · {r.region} · {r.trace.replaceAll('_',' ')}</small></th><td className="num">{house?amount(house.amount_php):'—'}</td><td className="num">{amount(r.nep.amount_php)}</td><td className="num">{amount(r.gap)}</td></tr>;})}</tbody></table></div>
  </section>
 </>;
}
function houseMinusNep(row){const house=row.third??row.second;return house!=null&&row.nep!=null?house.amount_php-row.nep.amount_php:null;}
function aggregate(rows,dim){
 const groups=new Map();
 for(const row of rows){
  const label=dim==='office'?(row.office||'No recorded office'):row[dim]||`No recorded ${dim==='pap'?'PAP':dim}`;
  const entry=groups.get(label)||{label,rows:0,amount_php:0};
  entry.rows++;entry.amount_php+=row.amount_php;groups.set(label,entry);
 }
 return [...groups.values()].sort((a,b)=>b.amount_php-a.amount_php||a.label.localeCompare(b.label)).slice(0,10);
}
function Statistics({detail,source,dim,change}){
 const records=useMemo(()=>{
  const rows=[];
  for(const row of detail){
   const s=row[source];if(!s)continue;
   for(const member of s.records??[s])rows.push({amount_php:member.amount_php,
    program:(member.zone??row.zone)==='fap'?'Foreign-assisted projects':member.program??row.program??'Other / unclassified',
    pap:member.pap??row.pap,region:member.region??row.region,office:member.office??row.office??'',title:member.title??row.title});
  }
  return rows;
 },[detail,source]);
 const amounts=useMemo(()=>records.map(r=>r.amount_php),[records]);
 const ben=useMemo(()=>benford(amounts),[amounts]);
 const zeros=useMemo(()=>trailingZeros(amounts),[amounts]);
 const last=useMemo(()=>lastDigits(amounts),[amounts]);
 const ladder=useMemo(()=>roundingLadder(amounts),[amounts]);
 const bands=useMemo(()=>valueBands(amounts),[amounts]);
 const clusters=useMemo(()=>kmeansClusters(amounts,5),[amounts]);
 const deviants=useMemo(()=>deviantSubsets(records,dim),[records,dim]);
 const concentrations=useMemo(()=>exactConcentrations(records,5,dim==='overall'?'program':dim),[records,dim]);
 if(!amounts.length)return <p className="muted">No allocation records for this source.</p>;
 return <>
  <DimensionChips dim={dim} change={change}/>
  <p className="notice">These are descriptive lenses for targeting review, not fraud tests. Appropriations are policy numbers: round values are expected, and print conventions (thousands, memo amounts) can drive digit patterns. Benford conformity is not evidence of correctness, and deviation is not evidence of wrongdoing.</p>
  <section className="analysis-section"><h2>Rounding pattern</h2>
   <p className="muted">Share of {amounts.length.toLocaleString()} allocation records at each rounding granularity.</p>
   <div className="table-scroll" role="region" aria-label="Rounding pattern" tabIndex={0}><table><thead><tr><th>Granularity</th><th>Records</th><th>Share</th></tr></thead><tbody>{ladder.map(e=><tr key={e.step}><th scope="row">{amount(e.step)}</th><td className="num">{e.records.toLocaleString()}</td><td className="num">{(e.share*100).toFixed(1)}%</td></tr>)}</tbody></table></div>
  </section>
  <section className="analysis-section"><h2>Benford first-digit</h2>
   <p className="muted">Observed vs expected leading-digit share · mean absolute deviation {ben.mad.toFixed(4)}.</p>
   <DigitBars digits={ben.digits}/>
  </section>
  <div className="analysis-columns"><section className="analysis-section"><h2>Trailing zeros</h2>
   <p className="muted">Records by count of trailing zeros in the peso amount.</p>
   <DigitBars digits={zeros.counts.map((count,d)=>({digit:d,observed:zeros.total?count/zeros.total:0,expected:null}))}/>
  </section>
  <section className="analysis-section"><h2>Last digit</h2>
   <p className="muted">Records by final digit (0–9).</p>
   <DigitBars digits={last.counts.map((count,d)=>({digit:d,observed:last.total?count/last.total:0,expected:null}))}/>
  </section></div>
  <section className="analysis-section"><h2>Value bands and clusters</h2>
   <p className="muted">Fixed peso bands and deterministic k-means clusters on log amounts.</p>
   <div className="analysis-columns"><div className="table-scroll" role="region" aria-label="Value bands" tabIndex={0}><table><thead><tr><th>Band</th><th>Records</th><th>Share</th><th>Amount</th></tr></thead><tbody>{bands.map(b=><tr key={b.label}><th scope="row">{b.label}</th><td className="num">{b.records.toLocaleString()}</td><td className="num">{(b.share*100).toFixed(1)}%</td><td className="num">{amount(b.amount_php)}</td></tr>)}</tbody></table></div>
   <div className="table-scroll" role="region" aria-label="K-means clusters" tabIndex={0}><table><thead><tr><th>Cluster center</th><th>Share of records</th></tr></thead><tbody>{clusters.map((c,i)=><tr key={i}><th scope="row">{amount(c.center_php)}</th><td className="num">{(c.share*100).toFixed(1)}%</td></tr>)}</tbody></table></div></div>
  </section>
  {dim!=='overall'&&deviants&&<section className="analysis-section"><h2>Deviant subsets · by {dimensionTitle(dim)}</h2>
   <p className="muted">Groups with at least 100 records, ranked by million-round share against the overall baseline ({(amounts.filter(v=>v%1e6===0).length/amounts.length*100).toFixed(1)}%).</p>
   <div className="table-scroll" role="region" aria-label="Deviant subsets" tabIndex={0}><table><thead><tr><th>Group</th><th>Records</th><th>Million-round share</th><th>vs overall</th></tr></thead><tbody>{deviants.map(d=><tr key={d.label}><th scope="row">{short(d.label)??d.label}</th><td className="num">{d.records.toLocaleString()}</td><td className="num">{(d.share*100).toFixed(1)}%</td><td className="num">{d.deviation>=0?'+':''}{(d.deviation*100).toFixed(1)} pts</td></tr>)}</tbody></table></div>
  </section>}
  <section className="analysis-section"><h2>Exact repeated amounts · blanket fixed allocations</h2>
   <p className="muted">Where many line items share one exact peso value (≥5 repeats), grouped by {dimensionTitle(dim==='overall'?'program':dim)}.</p>
   {concentrations.length?<div className="table-scroll" role="region" aria-label="Exact repeated amounts" tabIndex={0}><table><thead><tr><th>Group</th><th>Exact amount</th><th>Line items</th><th>Examples</th></tr></thead><tbody>{concentrations.map((e,i)=><tr key={i}><th scope="row">{short(e.group)??e.group}</th><td className="num">{amount(e.amount_php)}</td><td className="num">{e.records}</td><td><small>{e.examples.join(' · ')}</small></td></tr>)}</tbody></table></div>:<p>No exact-value concentration at this threshold.</p>}
  </section>
 </>;
}
// Rank dimension groups by million-round share deviation from the baseline.
function deviantSubsets(records,dim){
 if(dim==='overall')return null;
 const groups=new Map();
 for(const row of records){
  const label=dim==='office'?(row.office||'No recorded office'):row[dim]||`No recorded ${dim==='pap'?'PAP':dim}`;
  const entry=groups.get(label)||{label,records:0,round:0};
  entry.records++;if(row.amount_php%1e6===0)entry.round++;groups.set(label,entry);
 }
 const baseline=records.length?records.filter(r=>r.amount_php%1e6===0).length/records.length:0;
 return [...groups.values()].filter(g=>g.records>=100)
  .map(g=>({...g,share:g.round/g.records,deviation:g.round/g.records-baseline}))
  .sort((a,b)=>Math.abs(b.deviation)-Math.abs(a.deviation)).slice(0,8);
}
function DigitBars({digits}){
 const max=Math.max(...digits.map(d=>Math.max(d.observed,d.expected??0)),0.01);
 return <div className="digit-bars" role="img" aria-label="Digit distribution">{digits.map(d=><div key={d.digit} className="digit-bar">
  <span className="digit-label">{d.digit}</span>
  <div className="digit-tracks"><div className="digit-track"><span className="observed" style={{height:`${d.observed/max*100}%`}}/></div>{d.expected!=null&&<div className="digit-track"><span className="expected" style={{height:`${d.expected/max*100}%`}}/></div>}</div>
  <small>{(d.observed*100).toFixed(1)}%{d.expected!=null?` / ${(d.expected*100).toFixed(1)}%`:''}</small>
 </div>)}</div>;
}
