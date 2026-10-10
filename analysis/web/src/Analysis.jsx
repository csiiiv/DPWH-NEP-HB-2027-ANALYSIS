import React,{lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {loadData} from './data.js';
import {hydrateProjects} from './comparisonData.js';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
import SortableTable from './SortableTable.jsx';
import {benford,trailingZeros,lastDigits,roundingLadder,valueBands,kmeansClusters,exactConcentrations} from './analysisStats.js';
import {officeName,regionName} from './regionNames.js';
const GroupProjectsModal=lazy(()=>import('./GroupProjectsModal.jsx'));
const names={third:'HGAB3 · 3rd reading',second:'HGAB2 · 2nd reading',nep:'DBM NEP',api:'DPWH Transparency NEP'};
const labels={'Bridge Program':'Bridges','Convergence and Special Support Program':'CSSP','Foreign-assisted projects':'FAPs'};
const short=value=>labels[value]??value;
const modes={no_suggestion:'House-only · no NEP suggestion',unresolved:'Unresolved NEP suggestions',third_only:'New 3rd-reading records'};
const views=[['overview','Overview'],['insertions','Insertions'],['adjustments','Adjustments'],['statistics','Statistics']];
const dimensions=[['overall','Overall'],['region','Region'],['office','District office'],['program','Category'],['pap','PAP']];
const pick=(params,key,allowed,fallback)=>allowed.includes(params.get(key))?params.get(key):fallback;
const dimensionTitle=dim=>dim==='office'?'district office':dim==='pap'?'PAP':dim;
const groupLabel=(dim,label)=>dim==='region'?regionName(label):dim==='office'?officeName(label):label;
const amountCell=(value,title)=><span title={(title??(value?.toLocaleString('en-PH')??''))+' PHP'}>{amount(value)}</span>;
// Signed amounts color green when positive, red when negative.
const signedCell=value=><span className={value>0?'up':value<0?'down':''} title={(value?.toLocaleString('en-PH')??'')+' PHP'}>{value>0?'+':''}{amount(value)}</span>;
const signedPercent=value=>value==null?<span>n/a</span>
 :<span className={value>0?'up':value<0?'down':''}>{value>0?'+':''}{value.toFixed(1)}%</span>;
function percentChange(current,prior){
 if(current==null||prior==null||!Number.isFinite(current)||!Number.isFinite(prior)||prior===0)return null;
 return (current-prior)/Math.abs(prior)*100;
}
export default function Analysis({route}){
 const [data,setData]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(''),[group,setGroup]=useState(null);
 const view=pick(route.params,'view',views.map(v=>v[0]),'overview');
 const source=pick(route.params,'source',Object.keys(names),'third');
 const ranking=pick(route.params,'ranking',Object.keys(modes),'no_suggestion');
 const dim=pick(route.params,'dim',dimensions.map(d=>d[0]),'overall');
 const direction=pick(route.params,'direction',['increased','reduced'],'increased');
 useEffect(()=>{const c=new AbortController();loadData('comparison_overview_2027.json',c.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 // Detail rows load lazily for adjustments/statistics, or when a group modal opens.
 useEffect(()=>{
  if((!['adjustments','statistics'].includes(view)&&!group)||!data||detail)return;
  const c=new AbortController();loadData('comparison_projects_2027.json',c.signal)
   .then(payload=>setDetail(hydrateProjects(payload))).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>c.abort();
 },[view,data,detail,group]);
 function change(key,value){const params=Object.fromEntries(route.params);params[key]=value;window.location.hash=routeHref('analysis',params);}
 function openGroup(next){setGroup(next);}
 if(error)return <p role="alert">{error}</p>;
 if(!data)return <p role="status">Loading analysis…</p>;
 const stats=data.headlines.sources[source];
 const needsDetail=(['adjustments','statistics'].includes(view)||group)&&!detail;
 return <div className="headline-analysis">
  <p className="eyebrow">DPWH · FY2027</p><h1>Analysis</h1>
  <p>Office assignments, program allocations and review candidates from the retained budget records.</p>
  <div className="analysis-controls"><label>Budget source<select aria-label="Analysis budget source" value={source} onChange={e=>change('source',e.target.value)}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><ShareLink /></div>
  <nav className="analysis-subtabs" role="tablist" aria-label="Analysis views">{views.map(([key,title])=>
   <button key={key} role="tab" aria-selected={view===key} onClick={()=>change('view',key)}>{title}</button>)}</nav>
  <p className="notice">Counts refer to source allocation records, including grouped members, rather than unique projects across stages. Office assignments come from the selected source; missing assignments are shown separately. Scope: operations, including local and foreign-assisted projects. Transparency reflects its retained listing. Tables sort on any column. Click a group name to list its comparison rows.</p>
  {needsDetail&&<p role="status">Loading per-record data…</p>}
  {view==='overview'&&<Overview stats={stats} source={source}/>}
  {view==='insertions'&&<Insertions headlines={data.headlines} reading={reading(source)} ranking={ranking} dim={dim} change={change} onOpenGroup={openGroup}/>}
  {view==='adjustments'&&detail&&<Adjustments detail={detail} revisionSets={data.headlines.revisionSets} dim={dim} direction={direction} change={change} onOpenGroup={openGroup}/>}
  {view==='statistics'&&detail&&<Statistics detail={detail} source={source} dim={dim} change={change}/>}
  {group&&detail&&<Suspense fallback={null}><GroupProjectsModal projects={detail} group={group} onClose={()=>setGroup(null)}/></Suspense>}
 </div>;
}
const reading=source=>['second','third'].includes(source)?source:'third';
function DimensionChips({dim,change}){
 return <div className="dimension-chips" role="group" aria-label="Break down by">{dimensions.map(([key,title])=>
  <button key={key} className={dim===key?'active':''} aria-pressed={dim===key} onClick={()=>change('dim',key)}>{title}</button>)}</div>;
}
function Overview({stats,source}){
 return <>
  <div className="cards analysis-headlines"><article><h3>Source allocation records</h3><strong>{stats.records.toLocaleString()}</strong><p>{names[source]}</p></article><article><h3>Allocated amount</h3><strong>{amount(stats.amount_php)}</strong><p>PHP · selected source only</p></article><article><h3>Central Office / DEOs</h3><strong>{stats.offices['Central Office'].records.toLocaleString()} / {stats.offices['District engineering offices (DEOs)'].records.toLocaleString()}</strong><p>Allocation records · regional and missing offices separate</p></article></div>
  <div className="analysis-distributions"><Distribution title="Central Office vs DEOs" buckets={stats.offices} total={stats.records}/><Distribution title="Records by program" buckets={stats.programs} total={stats.records}/></div>
  <section className="analysis-section"><h2>Explore further</h2><div className="analysis-crosslinks">
   <a href={routeHref('analysis',{view:'insertions'})}>Insertion candidates by region, office, category and PAP →</a>
   <a href={routeHref('analysis',{view:'adjustments'})}>Reading adjustments and cross-document differences →</a>
   <a href={routeHref('analysis',{view:'statistics'})}>Rounding, Benford and value clustering →</a>
  </div></section>
 </>;
}
function Distribution({title,buckets,total}){
 const rows=Object.entries(buckets).map(([key,b])=>({id:key,label:short(key),records:b.records,share:b.records/(total||1),amount_php:b.amount_php}));
 return <section className="analysis-section"><h2>{title}</h2>
  <SortableTable ariaLabel={title} initialSort={{key:'amount_php',direction:'desc'}} rows={rows} columns={[
   {key:'label',label:'Category',scope:'row'},
   {key:'records',label:'Allocation records',align:'num'},
   {key:'share',label:'Share of records',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
   {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
  ]}/>
 </section>;
}
function Insertions({headlines,reading,ranking,dim,change,onOpenGroup}){
 const list=headlines.rankings[reading][ranking];
 return <section className="analysis-section"><h2>Top insertion candidates</h2>
  <div className="analysis-controls"><label>Candidate group<select aria-label="Analysis candidate group" value={ranking} onChange={e=>change('ranking',e.target.value)}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
  <DimensionChips dim={dim} change={change}/>
  <p className="muted">Ranked by {names[reading]} allocation · top {Math.min(100,list.comparison_rows).toLocaleString()} of {list.comparison_rows.toLocaleString()} comparison rows · {amount(list.amount_php)} across this group. Grouped allocations remain grouped.</p>
   <p className="notice">{ranking==='no_suggestion'?'House records with no attached NEP/Transparency source and no retained NEP suggestion. These are review candidates, not confirmed insertions.':ranking==='unresolved'?'House records with possible or ambiguous NEP counterparts are separated from the no-suggestion list. Review their suggestions before claiming an insertion.':'Records present only in HGAB3 under the retained reading key. This shows a reading difference, not confirmed absence from NEP.'} Unique different-region title candidates are linked for review and excluded from the House-only groups.</p>
  {dim!=='overall'&&<AggregateTable title={`Totals by ${dimensionTitle(dim)}`} dim={dim} groups={list.by_dim[dim]}
   onOpenGroup={g=>onOpenGroup({scope:'insertions',reading,ranking,dim,label:g.label,displayLabel:groupLabel(dim,g.label)})}/>}
  <SortableTable ariaLabel="Top insertion candidates" initialSort={{key:'amount_php',direction:'desc'}} rows={list.top} columns={[
   {key:'rank',label:'#',sortable:false,render:(r,i)=><span>{i+1}</span>},
   {key:'title',label:'Project / assignment',scope:'row',render:r=><span className="cell-main">{r.title}<small>{r.zone==='fap'?'FAPs':short(r.program)} · {regionName(r.region)} · {officeName(r.office)||'No recorded office'}</small></span>},
   {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
   {key:'allocation_records',label:'Records / status',align:'num',render:r=><span>{r.allocation_records} source allocation {r.allocation_records===1?'record':'records'}<small>{r.trace.replaceAll('_',' ')}</small></span>},
   {key:'review',label:'Review',sortable:false,render:r=><span><a href={routeHref('compare',{view:'projects',region_match:'ignore',q:r.id,record:r.id})}>Review comparison</a><br/><a href={routeHref('house',{view:'projects',reading:reading==='third'?'third':'second',node:r.source_id})}>{r.allocation_records>1?'House source tree · first allocation':'House source tree'}</a></span>},
  ]} empty="No records in this group for the selected House reading."/>
 </section>;
}
function AggregateTable({title,groups,dim,onOpenGroup}){
 if(!groups?.length)return null;
 return <div className="aggregate-table"><h3>{title} · {groups.length.toLocaleString()} group{groups.length===1?'':'s'}</h3>
  <SortableTable ariaLabel={title} initialSort={{key:'amount_php',direction:'desc'}} rows={groups.map(g=>({...g,id:g.label}))} columns={[
   {key:'label',label:'Group',scope:'row',render:r=><button type="button" className="group-open" onClick={()=>onOpenGroup?.(r)}>{groupLabel(dim,r.label)}</button>},
   {key:'rows',label:'Rows',align:'num'},
   {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
   {key:'projects',label:'Projects',sortable:false,render:r=><button type="button" className="group-open" onClick={()=>onOpenGroup?.(r)}>Show {r.rows.toLocaleString()} rows</button>},
  ]}/>
 </div>;
}
function Adjustments({detail,revisionSets,dim,direction,change,onOpenGroup}){
 const cross=useMemo(()=>detail.filter(r=>['candidate_increase','candidate_decrease','transparency_gap_then_candidate_increase','transparency_gap_then_candidate_decrease'].includes(r.trace))
  .map(r=>{const house=r.third??r.second,gap=houseMinusNep(r);
   return {...r,gap,house_php:house?.amount_php??null,nep_php:r.nep?.amount_php??null,
    pct:percentChange(house?.amount_php,r.nep?.amount_php)};}).filter(r=>r.gap!==null),[detail]);
 const shown=useMemo(()=>direction==='increased'?[...cross].sort((a,b)=>b.gap-a.gap):[...cross].sort((a,b)=>a.gap-b.gap),[cross,direction]);
 const totals=useMemo(()=>signedTotals(cross),[cross]);
 const byDim=useMemo(()=>dim==='overall'?null:differenceByDimension(cross,dim),[cross,dim]);
 return <>
  <section className="analysis-section"><h2>Reading adjustments · HGAB3 vs HGAB2</h2>
   <p className="notice">Recorded 2nd→3rd reading differences under the retained matching key: {revisionSets.reading.length.toLocaleString()} rows · net {amount(revisionSets.delta_php)}. Repeated keys remain grouped.</p>
   <SortableTable ariaLabel="Reading adjustments" initialSort={{key:'reading_delta_php',direction:'desc'}} rows={revisionSets.reading} columns={[
    {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{short(r.program)} · {regionName(r.region)}</small></span>},
    {key:'second_php',label:'HGAB2',align:'num',render:r=>r.second_php!=null?amountCell(r.second_php):<span>—</span>},
    {key:'third_php',label:'HGAB3',align:'num',render:r=>r.third_php!=null?amountCell(r.third_php):<span>—</span>},
    {key:'reading_delta_php',label:'Δ',align:'num',render:r=>r.reading_delta_php!=null?signedCell(r.reading_delta_php):<span>new in HGAB3</span>},
    {key:'pct',label:'% change',align:'num',value:r=>percentChange(r.third_php,r.second_php),render:r=>signedPercent(percentChange(r.third_php,r.second_php))},
   ]}/>
  </section>
  <section className="analysis-section"><h2>House vs NEP differences · provisional identity</h2>
   <DimensionChips dim={dim} change={change}/>
   <div className="analysis-controls"><label>Direction<select aria-label="Revision direction" value={direction} onChange={e=>change('direction',e.target.value)}><option value="increased">Most increased (House above NEP)</option><option value="reduced">Most reduced (House below NEP)</option></select></label></div>
   <p className="muted">{cross.length.toLocaleString()} comparison rows · increased {signedCell(totals.increased)} · decreased {signedCell(-totals.decreased)} · net {signedCell(totals.net)}. Direction presets the sort; click any column to re-sort.</p>
   <p className="notice">These rows carry exact House/NEP candidate pairs with unequal amounts. Identity is proposed by title/scope matching and is not manually certified; the House−NEP gap often reflects GAA-like versus full-project-cost bases, especially for FAPs. This is a cross-document comparison, not a House reading change. % change is House relative to NEP.</p>
   {byDim&&<DifferenceAggregate title={`Differences by ${dimensionTitle(dim)}`} dim={dim} groups={byDim}
    onOpenGroup={g=>onOpenGroup({scope:'differences',reading:'third',dim,label:g.raw||g.label,displayLabel:g.label})}/>}
   <SortableTable key={direction} ariaLabel="Top House vs NEP differences" initialSort={{key:'gap',direction:direction==='increased'?'desc':'asc'}} rows={shown.slice(0,100)} columns={[
    {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{short(r.program)} · {regionName(r.region)} · {r.trace.replaceAll('_',' ')}</small></span>},
    {key:'house_php',label:'House',align:'num',render:r=>r.house_php!=null?amountCell(r.house_php):<span>—</span>},
    {key:'nep_php',label:'NEP',align:'num',render:r=>r.nep_php!=null?amountCell(r.nep_php):<span>—</span>},
    {key:'gap',label:'House − NEP',align:'num',render:r=>signedCell(r.gap)},
    {key:'pct',label:'% change',align:'num',render:r=>signedPercent(r.pct)},
   ]}/>
  </section>
 </>;
}
function houseMinusNep(row){const house=row.third??row.second;return house!=null&&row.nep!=null?house.amount_php-row.nep.amount_php:null;}
function signedTotals(rows){
 let increased=0,decreased=0;
 for(const row of rows){if(row.gap>0)increased+=row.gap;else if(row.gap<0)decreased+=-row.gap;}
 return {increased,decreased,net:increased-decreased};
}
// Per-dimension House−NEP aggregates keep increased, decreased and net
// separate so a large cut elsewhere cannot hide a large add.
function differenceByDimension(rows,dim){
 const groups=new Map();
 for(const row of rows){
  const house=row.third??row.second;
  const raw=dim==='office'?(house?.office??row.nep?.office??'')||'No recorded office'
   :row[dim]||`No recorded ${dim==='pap'?'PAP':dim}`;
  const entry=groups.get(raw)||{label:raw,rows:0,increased:0,decreased:0,net:0};
  entry.rows++;
  if(row.gap>0)entry.increased+=row.gap;else if(row.gap<0)entry.decreased+=-row.gap;
  entry.net+=row.gap;groups.set(raw,entry);
 }
 return [...groups.values()].sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)||a.label.localeCompare(b.label)).slice(0,100)
  .map(g=>({...g,raw:g.label,label:groupLabel(dim,g.label)}));
}
function DifferenceAggregate({title,groups,onOpenGroup}){
 if(!groups?.length)return null;
 return <div className="aggregate-table"><h3>{title} · {groups.length.toLocaleString()} group{groups.length===1?'':'s'}</h3>
  <SortableTable ariaLabel={title} initialSort={{key:'net',direction:'desc'}} rows={groups.map(g=>({...g,id:g.raw||g.label}))} columns={[
   {key:'label',label:'Group',scope:'row',render:r=><button type="button" className="group-open" onClick={()=>onOpenGroup?.(r)}>{r.label}</button>},
   {key:'rows',label:'Rows',align:'num'},
   {key:'increased',label:'Total increased',align:'num',render:r=>signedCell(r.increased)},
   {key:'decreased',label:'Total decreased',align:'num',render:r=>r.decreased?signedCell(-r.decreased):amountCell(0)},
   {key:'net',label:'Total change',align:'num',render:r=>signedCell(r.net)},
   {key:'projects',label:'Projects',sortable:false,render:r=><button type="button" className="group-open" onClick={()=>onOpenGroup?.(r)}>Show {r.rows.toLocaleString()} rows</button>},
  ]}/>
 </div>;
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
   <SortableTable ariaLabel="Rounding pattern" initialSort={{key:'step',direction:'asc'}} rows={ladder} columns={[
    {key:'step',label:'Granularity',scope:'row',value:r=>r.step,render:r=><span>{amount(r.step)}</span>},
    {key:'records',label:'Records',align:'num'},
    {key:'share',label:'Share',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
   ]}/>
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
   <div className="analysis-columns"><div>
   <SortableTable ariaLabel="Value bands" initialSort={{key:'order',direction:'asc'}} rows={bands.map((b,i)=>({...b,id:`band-${i}`,order:i}))} columns={[
    {key:'label',label:'Band',scope:'row'},
    {key:'records',label:'Records',align:'num'},
    {key:'share',label:'Share',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
    {key:'amount_php',label:'Amount',align:'num',render:r=>amountCell(r.amount_php)},
   ]}/>
   </div><div>
   <SortableTable ariaLabel="K-means clusters" initialSort={{key:'share',direction:'desc'}} rows={clusters.map((c,i)=>({...c,id:`cluster-${i}`}))} columns={[
    {key:'center_php',label:'Cluster center',scope:'row',render:r=><span>{amount(r.center_php)}</span>},
    {key:'share',label:'Share of records',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
   ]}/>
   </div></div>
  </section>
  {dim!=='overall'&&deviants&&<section className="analysis-section"><h2>Deviant subsets · by {dimensionTitle(dim)}</h2>
   <p className="muted">Groups with at least 100 records, ranked by million-round share against the overall baseline ({(amounts.filter(v=>v%1e6===0).length/amounts.length*100).toFixed(1)}%).</p>
   <SortableTable ariaLabel="Deviant subsets" initialSort={{key:'deviation',direction:'desc'}} rows={deviants} columns={[
    {key:'label',label:'Group',scope:'row'},
    {key:'records',label:'Records',align:'num'},
    {key:'share',label:'Million-round share',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
    {key:'deviation',label:'vs overall',align:'num',render:r=><span className={r.deviation>0?'up':r.deviation<0?'down':''}>{r.deviation>=0?'+':''}{(r.deviation*100).toFixed(1)} pts</span>},
   ]}/>
  </section>}
  <section className="analysis-section"><h2>Exact repeated amounts · blanket fixed allocations</h2>
   <p className="muted">Where many line items share one exact peso value (≥5 repeats), grouped by {dimensionTitle(dim==='overall'?'program':dim)}.</p>
   {concentrations.length?<SortableTable ariaLabel="Exact repeated amounts" initialSort={{key:'total_php',direction:'desc'}} rows={concentrations.map((e,i)=>({...e,id:`conc-${i}`}))} columns={[
    {key:'group',label:'Group',scope:'row'},
    {key:'amount_php',label:'Exact amount',align:'num',render:r=>amountCell(r.amount_php)},
    {key:'records',label:'Line items',align:'num'},
    {key:'total_php',label:'Total allocation',align:'num',render:r=>amountCell(r.total_php)},
    {key:'examples',label:'Examples',sortable:false,render:r=><small className="cell-inline">{r.examples.join(' · ')}</small>},
   ]}/>:<p>No exact-value concentration at this threshold.</p>}
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
  .map(g=>({...g,share:g.round/g.records,deviation:g.round/g.records-baseline,label:groupLabel(dim,g.label)}))
  .sort((a,b)=>Math.abs(b.deviation)-Math.abs(a.deviation)).slice(0,100);
}
function DigitBars({digits}){
 const max=Math.max(...digits.map(d=>Math.max(d.observed,d.expected??0)),0.01);
 return <div className="digit-bars" role="img" aria-label="Digit distribution">{digits.map(d=><div key={d.digit} className="digit-bar">
  <span className="digit-label">{d.digit}</span>
  <div className="digit-tracks"><div className="digit-track"><span className="observed" style={{height:`${d.observed/max*100}%`}}/></div>{d.expected!=null&&<div className="digit-track"><span className="expected" style={{height:`${d.expected/max*100}%`}}/></div>}</div>
  <small>{(d.observed*100).toFixed(1)}%{d.expected!=null?` / ${(d.expected*100).toFixed(1)}%`:''}</small>
 </div>)}</div>;
}
