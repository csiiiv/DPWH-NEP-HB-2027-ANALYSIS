import React,{lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {loadData} from './data.js';
import {hydrateProjects} from './comparisonData.js';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
import SortableTable from './SortableTable.jsx';
import {benford,trailingZeros,lastDigits,roundingLadder,valueBands,kmeansClusters,exactConcentrations} from './analysisStats.js';
import {CHAINAGE_FOCUS,CHAINAGE_MODUS,MODUS_DEADBAND,amountChangeBins,chainageAmendmentRows,filterChainageRows,modusSummary,perKmChangeBins,redFlagPerKm,summarizeChainage} from './chainageAnalysis.js';
import {roadGroupStats} from './roadGroups.js';
import {BENCHMARK_DIMENSIONS,BENCHMARK_SOURCES,outlierUnits,peerCohorts,perKmBands,summarizeUnits,unitPerKm} from './chainageBenchmark.js';
import ChainageGuide,{Term,GUIDE_CONCEPTS} from './ChainageGuide.jsx';
import {formatLengthKm,formatSignedKm} from './chainageDisplay.js';
import {officeName,regionName} from './regionNames.js';
import {openModalDialog} from './modalLifecycle.js';
import LoadingModal from './LoadingModal.jsx';
const GroupProjectsModal=lazy(()=>import('./GroupProjectsModal.jsx'));
const names={third:'HGAB3 · 3rd reading',second:'HGAB2 · 2nd reading',nep:'DBM NEP',api:'DPWH Transparency NEP'};
const labels={'Bridge Program':'Bridges','Convergence and Special Support Program':'CSSP','Foreign-assisted projects':'FAPs'};
const short=value=>labels[value]??value;
const modes={no_suggestion:'House-only · no NEP suggestion',unresolved:'Unresolved NEP suggestions',third_only:'New 3rd-reading records'};
const deletionModes={no_suggestion:'No House record · no suggestion',suggested:'Possible replacements · House rows suggest this NEP item',second_only:'HGAB2 only · dropped in HGAB3'};
const views=[['overview','Overview'],['insertions','Insertions'],['deletions','Deletions'],['adjustments','Adjustments'],['chainage','Chainage'],['roadgroups','Groupings'],['statistics','Statistics']];
const dimensions=[['overall','Overall'],['region','Region'],['office','District office'],['program','Category'],['pap','PAP']];
const pick=(params,key,allowed,fallback)=>allowed.includes(params.get(key))?params.get(key):fallback;
const dimensionTitle=dim=>dim==='office'?'district office':dim==='pap'?'PAP':dim;
const groupLabel=(dim,label)=>dim==='region'?regionName(label):dim==='office'?officeName(label):label;
const amountCell=(value,title)=><span title={(title??(value?.toLocaleString('en-PH')??''))+' PHP'}>{amount(value)}</span>;
const smallOf=text=><small className="cell-sub">{text}</small>;
const pctCell=v=>v==null?<span>—</span>:<span className={v>0?'up':v<0?'down':''}>{v>0?'+':''}{v.toFixed(1)}%</span>;
const fmtSignedPctLabel=v=>v===0?'0':v>0?`+${v}`:`−${Math.abs(v)}`;
const fmtPctBinEdge=edge=>edge===200?'> +200%':edge===-100?'−100%':`${fmtSignedPctLabel(edge)}% to ${fmtSignedPctLabel(edge+25)}%`;
// Signed amounts color green when positive, red when negative.
const signedCell=value=><span className={value>0?'up':value<0?'down':''} title={(value?.toLocaleString('en-PH')??'')+' PHP'}>{value>0?'+':''}{amount(value)}</span>;
const signedCount=value=><span className={value>0?'up':value<0?'down':''}>{value>0?'+':''}{(value??0).toLocaleString()}</span>;
const signedPercent=value=>value==null?<span>n/a</span>
 :<span className={value>0?'up':value<0?'down':''}>{value>0?'+':''}{value.toFixed(1)}%</span>;
function percentChange(current,prior){
 if(current==null||prior==null||!Number.isFinite(current)||!Number.isFinite(prior)||prior===0)return null;
 return (current-prior)/Math.abs(prior)*100;
}
export default function Analysis({route}){
 const [data,setData]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(''),[benchmark,setBenchmark]=useState(null);
 const view=pick(route.params,'view',views.map(v=>v[0]),'overview');
 const source=pick(route.params,'source',Object.keys(names),'third');
 const ranking=pick(route.params,'ranking',Object.keys(modes),'no_suggestion');
 const dim=pick(route.params,'dim',dimensions.map(d=>d[0]),'overall');
 const direction=pick(route.params,'direction',['increased','reduced'],'increased');
 const chainageFocus=pick(route.params,'focus',Object.keys(CHAINAGE_FOCUS),'all');
 const chainageStage=pick(route.params,'stage',['patterns','benchmark','records','overview'],'patterns');
 const chainageScope=pick(route.params,'scope',['all','revised'],'all');
 const deletionRanking=pick(route.params,'ranking',Object.keys(deletionModes),'no_suggestion');
 // Overview defaults to region so the NEP vs House change table is immediately useful.
 const overviewDim=view==='overview'&&!route.params.get('dim')?'region':dim;
 // Modal state rides the URL so drill-downs are shareable and the back
 // button closes them: `group`+`g` for aggregate group records, `shell`+
 // `side`+`zone`+`pap`+`region` for grouping members, `drill`+`axis` for
 // the overview nested breakdown. Everything else (source, ranking, dim)
 // is already in the URL and re-derived on load.
 const groupScope=pick(route.params,'group',['insertions','deletions','differences'],null);
 const groupLabelRaw=route.params.get('g');
 const group=useMemo(()=>groupScope&&groupLabelRaw!=null?{scope:groupScope,label:groupLabelRaw,
  reading:groupScope==='insertions'?reading(source):'third',
  ranking:groupScope==='deletions'?deletionRanking:ranking,
  dim,displayLabel:groupLabel(dim,groupLabelRaw)}:null,
  [groupScope,groupLabelRaw,source,ranking,deletionRanking,dim]);
 const shellOpen=route.params.get('shell')&&route.params.get('side')?{
  shell:route.params.get('shell'),side:pick(route.params,'side',['hgab','nep'],'hgab'),
  zone:route.params.get('zone')||'',pap:route.params.get('pap')||'',region:route.params.get('region')||''}:null;
 const drill=route.params.get('drill')?{label:route.params.get('drill'),axis:pick(route.params,'axis',['region','office','pap'],'region')}:null;
 useEffect(()=>{const c=new AbortController();loadData('comparison_overview_2027.json',c.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 // Detail rows load lazily for deletions/adjustments/chainage/statistics, or when a group modal opens.
 useEffect(()=>{
  if((!['deletions','adjustments','chainage','statistics'].includes(view)&&!group)||!data||detail)return;
  // Warm the modal chunk alongside the payload so the loading dialog swaps
  // straight into the real modal — no second waiting state.
  import('./GroupProjectsModal.jsx').catch(()=>{});
  const c=new AbortController();loadData('comparison_projects_2027.json',c.signal)
   .then(payload=>setDetail(hydrateProjects(payload))).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>c.abort();
 },[view,data,detail,group]);
 // Chainage benchmark sidecar: every chainage-bearing unit, all sources —
 // independent of the matched-pair amendments above.
 useEffect(()=>{
  if(view!=='chainage'||benchmark)return;
  const c=new AbortController();loadData('chainage_units_2027.json',c.signal)
   .then(payload=>setBenchmark(payload.units)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>c.abort();
 },[view,benchmark]);
 // Road-group sidecar: same-road House/NEP groups with exhausted-supply
 // insertion candidates.
 const [roadGroups,setRoadGroups]=useState(null);
 useEffect(()=>{
  if(view!=='roadgroups'||roadGroups)return;
  const c=new AbortController();loadData('road_group_candidates_2027.json',c.signal)
   .then(payload=>setRoadGroups(payload)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>c.abort();
 },[view,roadGroups]);
 // Table deep link: scroll the targeted table into view when the table=
 // param arrives (initial open or link navigation) and flash its highlight.
 // Re-runs as lazy payloads (detail rows, groupings sidecar) land because
 // the target table may not exist on first paint.
 const tableTarget=route.params.get('table');
 useEffect(()=>{
  if(!tableTarget||!data)return;
  const id=`table-${tableTarget}`;
  const t=setTimeout(()=>{
   const element=document.getElementById(id);
   if(!element)return;
   element.scrollIntoView({behavior:'smooth',block:'start'});
   element.focus({preventScroll:true});
  },80);
  return ()=>clearTimeout(t);
 },[tableTarget,data,detail,roadGroups]);
 function change(key,value){const params=Object.fromEntries(route.params);params[key]=value;
  // View switches start the new view from its own defaults: a degenerate
  // dim=overall would otherwise ride along and pin the one-row overview
  // table (or hide aggregates) on every tab. Modal and deep-link params
  // belong to the old view and never survive a tab change.
  if(key==='view'){if(params.dim==='overall')delete params.dim;for(const stale of ['drill','axis','table'])delete params[stale];}
  window.location.hash=routeHref('analysis',params);}
 // Modal open/close writes the modal params into the hash — shareable links,
 // and the browser back button closes the dialog.
 function openModal(params){const next=Object.fromEntries(route.params);Object.assign(next,params);window.location.hash=routeHref('analysis',next);}
 function closeModal(){const next=Object.fromEntries(route.params);
  for(const key of ['group','g','shell','side','zone','pap','region','drill','axis'])delete next[key];
  window.location.hash=routeHref('analysis',next);}
 function openGroup(next){openModal({group:next.scope,g:next.label});}
 if(error)return <p role="alert">{error}</p>;
 if(!data)return <p role="status">Loading analysis…</p>;
 const stats=data.headlines.sources[source];
 const needsDetail=(['deletions','adjustments','chainage','statistics'].includes(view)||group)&&!detail;
 return <div className="headline-analysis">
  <section className="hero">
   <p className="eyebrow">DPWH · FY2027</p>
   <h1>Analysis</h1>
   <p>Office assignments, program allocations and review candidates from the retained budget records.</p>
   <div className="hero-actions">
    <label className="hero-source">Budget source<select aria-label="Analysis budget source" value={source} onChange={e=>change('source',e.target.value)}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <ShareLink />
   </div>
  </section>
  <nav className="analysis-subtabs" role="tablist" aria-label="Analysis views">{views.map(([key,title])=>
   <button key={key} role="tab" aria-selected={view===key} onClick={()=>change('view',key)}>{title}</button>)}</nav>
  <p className="notice">Counts refer to source allocation records, including grouped members, rather than unique projects across stages. Office assignments come from the selected source; missing assignments are shown separately. Scope: operations, including local and foreign-assisted projects. Transparency reflects its retained listing. Tables sort on any column. Click a group name to list its comparison rows.</p>
  {needsDetail&&<p role="status">Loading per-record data…</p>}
  {view==='overview'&&<Overview stats={stats} source={source} headlines={data.headlines} dim={overviewDim} change={change} onOpenGroup={openGroup} drill={drill} onOpenDrill={d=>openModal({drill:d.label,axis:d.axis})} onCloseDrill={closeModal}/>}
  {view==='insertions'&&<Insertions headlines={data.headlines} reading={reading(source)} ranking={ranking} dim={dim} change={change} onOpenGroup={openGroup}/>}
  {view==='deletions'&&<Deletions headlines={data.headlines} ranking={deletionRanking} dim={dim} change={change} onOpenGroup={openGroup}/>}
  {view==='adjustments'&&detail&&<Adjustments detail={detail} revisionSets={data.headlines.revisionSets} dim={dim} direction={direction} change={change} onOpenGroup={openGroup}/>}
  {view==='chainage'&&<Chainage detail={detail} focus={chainageFocus} change={change} benchmark={benchmark} setBenchmark={setBenchmark} stage={chainageStage} scope={chainageScope}/>}
  {view==='roadgroups'&&<RoadGroups payload={roadGroups} open={shellOpen} onOpenShell={g=>openModal({shell:g.shell,side:g.state==='nep_leftover'?'nep':'hgab',zone:g.zone||'',pap:g.pap||'',region:g.region||''})} onClose={closeModal}/>}
  {view==='statistics'&&detail&&<Statistics detail={detail} source={source} dim={dim} change={change}/>}
  {/* Heavy-modal loading states: group records need the 50 MB per-record payload
      (plus a lazy chunk), shell members need the road-group sidecar. Until the
      payload lands a modal-shaped loading dialog keeps the user oriented and
      the modal contract intact (backdrop, scroll lock, Esc cancels). */}
  {group&&!detail&&<LoadingModal eyebrow="GROUP RECORDS" title={group.displayLabel} note="Loading per-record comparison data — a large payload fetched once per session." onClose={closeModal}/>}
  {group&&detail&&<Suspense fallback={<LoadingModal eyebrow="GROUP RECORDS" title={group.displayLabel} note="Opening group records…" onClose={closeModal}/>}>
   <GroupProjectsModal projects={detail} group={group} onClose={closeModal}/>
  </Suspense>}
  {view==='roadgroups'&&shellOpen&&!roadGroups&&<LoadingModal eyebrow="SHELL GROUPING" title={shellOpen.shell} note="Loading road-group candidates…" onClose={closeModal}/>}
 </div>;
}
const reading=source=>['second','third'].includes(source)?source:'third';
function DimensionChips({dim,change}){
 return <div className="dimension-chips" role="group" aria-label="Break down by">{dimensions.map(([key,title])=>
  <button key={key} className={dim===key?'active':''} aria-pressed={dim===key} onClick={()=>change('dim',key)}>{title}</button>)}</div>;
}
function Overview({stats,source,headlines,dim,change,onOpenGroup,drill,onOpenDrill,onCloseDrill}){
 const houseSide=reading(source);
 const houseLabel=houseSide==='third'?'HGAB3':'HGAB2';
 const compare=headlines.sourceCompare[houseSide];
 const rows=compare.by_dim[dim]??compare.by_dim.region;
 const dimLabel=dim==='overall'?'Group':dim==='office'?'District office':dim==='pap'?'PAP':dim==='program'?'Category':'Region';
 // Drill-down state lives in the URL (drill+axis): shareable links and the
 // back button closes the modal. PAP parents break down by region or
 // office; region/office parents by PAP.
 const drillAxisNoun=axis=>axis==='region'?'region':axis==='office'?'office':'PAP';
 const drillButton=(row,axis)=>{
  const list=row[axis==='region'?'by_region':axis==='office'?'by_office':'by_pap'];
  if(!list?.length)return null;
  const open=drill?.label===row.label&&drill.axis===axis;
  const noun=drillAxisNoun(axis);
  const countLabel=`${list.length.toLocaleString()} ${noun}${list.length===1?'':'s'}`;
  const action=`Show by ${noun}`;
  return <button type="button" className={`overview-drill-btn${open?' open':''}`} aria-expanded={open} aria-label={`${action} · ${countLabel}`} onClick={e=>onOpenDrill({label:row.label,axis})}>
   <span className="overview-drill-chevron" aria-hidden="true">▸</span>
   <span className="overview-drill-label" aria-hidden="true">{action}</span>
   <span className="overview-drill-count" aria-hidden="true">{countLabel}</span>
  </button>;
 };
 const parentTitle=drill?dim==='program'?short(drill.label):groupLabel(dim,drill.label):'';
 return <>
  <div className="cards analysis-headlines"><article><h3>Source allocation records</h3><strong>{stats.records.toLocaleString()}</strong><p>{names[source]}</p></article><article><h3>Allocated amount</h3><strong>{amount(stats.amount_php)}</strong><p>PHP · selected source only</p></article><article><h3>Central Office / DEOs</h3><strong>{stats.offices['Central Office'].records.toLocaleString()} / {stats.offices['District engineering offices (DEOs)'].records.toLocaleString()}</strong><p>Allocation records · regional and missing offices separate</p></article></div>
  <section className="analysis-section"><h2>NEP → {houseLabel}{dim==='overall'?'':' by '+dimensionTitle(dim)}</h2>
   <DimensionChips dim={dim} change={change}/>
   <p className="muted">Operations comparison grain. Totals: NEP {amount(compare.nep_php)} ({headlines.sources.nep.records.toLocaleString()} records) · {houseLabel} {amount(compare.house_php)} ({headlines.sources[houseSide].records.toLocaleString()} records) · records change {signedCount(headlines.sources[houseSide].records-headlines.sources.nep.records)} · allocation change {signedCell(compare.delta_php)}. Each source uses its own assignment for the selected breakdown; a paired row can land in different groups when labels differ.{dim!=='overall'&&' Use the Show by … buttons under a group name to open its nested breakdown (regions/offices → PAPs; PAPs → regions or offices).'}</p>
   <SortableTable tableId={`overview-${dim}`} ariaLabel={`NEP to ${houseLabel} by ${dimLabel}`} initialSort={{key:'delta_php',direction:'desc'}} rows={rows.map(r=>{
    const nepRecords=r.nep_records??0,houseRecords=r.house_records??0;
    return {...r,delta_records:houseRecords-nepRecords,pct_records:percentChange(houseRecords,nepRecords),pct_alloc:percentChange(r.house_php,r.nep_php)};
   })} columns={[
    {key:'label',label:dimLabel,scope:'row',render:r=><span className="overview-group-cell">
     <span className="overview-group-label">{dim==='overall'?r.label:dim==='program'?short(r.label):groupLabel(dim,r.label)}</span>
     {dim!=='overall'&&dim!=='program'&&<span className="overview-drill-actions" role="group" aria-label={`Drill down ${groupLabel(dim,r.label)}`}>
      {dim==='pap'?<>{drillButton(r,'region')}{drillButton(r,'office')}</>:drillButton(r,'pap')}
     </span>}
    </span>},
    {key:'nep_records',label:'NEP records',align:'num',band:'records',bandLabel:'Records',render:r=><span>{(r.nep_records??0).toLocaleString()}</span>},
    {key:'house_records',label:`${houseLabel} records`,align:'num',band:'records',render:r=><span>{(r.house_records??0).toLocaleString()}</span>},
    {key:'delta_records',label:'Records change',align:'num',band:'records',render:r=>signedCount(r.delta_records)},
    {key:'pct_records',label:'% records change',align:'num',band:'records',render:r=>signedPercent(r.pct_records)},
    {key:'nep_php',label:'NEP allocation',align:'num',band:'allocations',bandLabel:'Allocations',divider:true,render:r=>amountCell(r.nep_php)},
    {key:'house_php',label:`${houseLabel} allocation`,align:'num',band:'allocations',render:r=>amountCell(r.house_php)},
    {key:'delta_php',label:'Allocation change',align:'num',band:'allocations',render:r=>signedCell(r.delta_php)},
    {key:'pct_alloc',label:'% allocation change',align:'num',band:'allocations',render:r=>signedPercent(r.pct_alloc)},
   ]}/>
   {drill&&<DrilldownModal drill={drill} dim={dim} compare={compare} houseLabel={houseLabel} onClose={onCloseDrill}/>}
  </section>
  <div className="analysis-distributions"><Distribution title="Central Office vs DEOs" buckets={stats.offices} total={stats.records}/><Distribution title="Records by program" buckets={stats.programs} total={stats.records}/></div>
  <section className="analysis-section"><h2>Explore further</h2><div className="analysis-crosslinks">
   <a href={routeHref('analysis',{view:'insertions'})}>Insertion candidates by region, office, category and PAP →</a>
   <a href={routeHref('analysis',{view:'deletions'})}>Deletion candidates · NEP items without House records, with possible replacements →</a>
   <a href={routeHref('analysis',{view:'adjustments'})}>Reading adjustments and cross-document differences →</a>
   <a href={routeHref('analysis',{view:'chainage'})}>Chainage amendments · length Δ and OCR length review →</a>
   <a href={routeHref('analysis',{view:'statistics'})}>Rounding, Benford and value clustering →</a>
  </div></section>
 </>;
}
function DrilldownModal({drill,dim,compare,houseLabel,onClose}){
 const dialog=useRef(null);
 useEffect(()=>openModalDialog(dialog.current),[]);
 const drillParent=(compare.by_dim[dim]??[]).find(g=>g.label===drill.label);
 const drillRows=(drillParent?.[drill.axis==='region'?'by_region':drill.axis==='office'?'by_office':'by_pap'])||[];
 const drillAxis=drill.axis;
 const drillDimLabel=drillAxis==='region'?'Region':drillAxis==='office'?'District office':'PAP';
 const parentTitle=dim==='program'?short(drill.label):groupLabel(dim,drill.label);
 return <dialog ref={dialog} className="analytics-dialog grouping-members-dialog" aria-labelledby="drilldown-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
  if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose();
 }}>
  <header className="analytics-header">
   <div className="analytics-heading"><div><p className="eyebrow">DRILL-DOWN</p><h2 id="drilldown-title">{drillDimLabel} breakdown · {parentTitle}</h2></div>
    <button onClick={onClose} autoFocus aria-label="Close breakdown">Close</button></div>
   <p>Records and allocations per {drillDimLabel.toLowerCase()} inside {parentTitle} — each source counts under its own recorded {drillDimLabel.toLowerCase()}, so a pair split across labels appears in both. Sorted by allocation change.</p>
  </header>
  <div className="analytics-content group-projects-content">
   <SortableTable tableId="overview-drill" ariaLabel={`${drillDimLabel} breakdown for ${drill.label}`} initialSort={{key:'delta_php',direction:'desc'}} rows={drillRows.map(r=>{
    const nepRecords=r.nep_records??0,houseRecords=r.house_records??0;
    return {...r,delta_records:houseRecords-nepRecords,pct_records:percentChange(houseRecords,nepRecords),pct_alloc:percentChange(r.house_php,r.nep_php)};
   })} columns={[
    {key:'label',label:drillDimLabel,scope:'row',render:r=><span>{drillAxis==='region'?groupLabel('region',r.label):drillAxis==='office'?groupLabel('office',r.label):r.label}</span>},
    {key:'nep_records',label:'NEP records',align:'num',band:'records',bandLabel:'Records',render:r=><span>{(r.nep_records??0).toLocaleString()}</span>},
    {key:'house_records',label:`${houseLabel} records`,align:'num',band:'records',render:r=><span>{(r.house_records??0).toLocaleString()}</span>},
    {key:'delta_records',label:'Records change',align:'num',band:'records',render:r=>signedCount(r.delta_records)},
    {key:'pct_records',label:'% records change',align:'num',band:'records',render:r=>signedPercent(r.pct_records)},
    {key:'nep_php',label:'NEP allocation',align:'num',band:'allocations',bandLabel:'Allocations',divider:true,render:r=>amountCell(r.nep_php)},
    {key:'house_php',label:`${houseLabel} allocation`,align:'num',band:'allocations',render:r=>amountCell(r.house_php)},
    {key:'delta_php',label:'Allocation change',align:'num',band:'allocations',render:r=>signedCell(r.delta_php)},
    {key:'pct_alloc',label:'% allocation change',align:'num',band:'allocations',render:r=>signedPercent(r.pct_alloc)},
   ]} empty={`No ${drillDimLabel.toLowerCase()} rows in this group.`}/>
   <p className="muted">Total {drillRows.length.toLocaleString()} {drillAxis==='region'?'region':drillAxis==='office'?'office':'PAP'}{drillRows.length===1?'':'s'} · records {drillRows.reduce((s,p)=>s+(p.nep_records??0),0).toLocaleString()} NEP → {drillRows.reduce((s,p)=>s+(p.house_records??0),0).toLocaleString()} {houseLabel} · allocation {amount(drillRows.reduce((s,p)=>s+(p.nep_php??0),0))} → {amount(drillRows.reduce((s,p)=>s+(p.house_php??0),0))}.</p>
  </div>
 </dialog>;
}
function Distribution({title,buckets,total}){
 const rows=Object.entries(buckets).map(([key,b])=>({id:key,label:short(key),records:b.records,share:b.records/(total||1),amount_php:b.amount_php}));
 return <section className="analysis-section"><h2>{title}</h2>
  <SortableTable tableId={`overview-distribution-${title.includes('program')?'programs':'offices'}`} ariaLabel={title} initialSort={{key:'amount_php',direction:'desc'}} rows={rows} columns={[
   {key:'label',label:'Category',scope:'row'},
   {key:'records',label:'Allocation records',align:'num'},
   {key:'share',label:'Share of records',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
   {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
  ]}/>
 </section>;
}
function Insertions({headlines,reading,ranking,dim,change,onOpenGroup}){
 const list=headlines.rankings[reading][ranking];
 const shown=Math.min(100,list.comparison_rows);
 return <section className="analysis-section"><h2>Top insertion candidates</h2>
  <div className="analysis-controls"><label>Candidate group<select aria-label="Analysis candidate group" value={ranking} onChange={e=>change('ranking',e.target.value)}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
  <DimensionChips dim={dim} change={change}/>
  <div className="cards analysis-headlines">
   <article><h3>Comparison rows</h3><strong>{list.comparison_rows.toLocaleString()}</strong><p>{modes[ranking]}</p></article>
   <article><h3>Group allocation</h3><strong>{amount(list.amount_php)}</strong><p>{names[reading]} · ranked by amount</p></article>
   <article><h3>Showing</h3><strong>Top {shown.toLocaleString()}</strong><p>of {list.comparison_rows.toLocaleString()} rows · grouped allocations remain grouped</p></article>
  </div>
  <p className="notice">{ranking==='no_suggestion'?'House records with no attached NEP/Transparency source and no retained NEP suggestion. These are review candidates, not confirmed insertions.':ranking==='unresolved'?'House records with possible or ambiguous NEP counterparts are separated from the no-suggestion list. Review their suggestions before claiming an insertion.':'Records present only in HGAB3 under the retained reading key. This shows a reading difference, not confirmed absence from NEP.'} Unique different-region title candidates are linked for review and excluded from the House-only groups.</p>
  {dim!=='overall'&&<AggregateTable tableId={`insertions-by-${dim}`} title={`Totals by ${dimensionTitle(dim)}`} dim={dim} groups={list.by_dim[dim]}
   onOpenGroup={g=>onOpenGroup({scope:'insertions',reading,ranking,dim,label:g.label,displayLabel:groupLabel(dim,g.label)})}/>}
  <SortableTable tableId="insertions-top" ariaLabel="Top insertion candidates" initialSort={{key:'amount_php',direction:'desc'}} rows={list.top} columns={[
   {key:'rank',label:'#',sortable:false,width:'1%',render:(r,i)=><span>{i+1}</span>},
   {key:'title',label:'Project / assignment',scope:'row',render:r=><span className="cell-main">{r.title}<small>{r.zone==='fap'?'FAPs':short(r.program)} · {regionName(r.region)} · {officeName(r.office)||'No recorded office'}</small></span>},
   {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
   {key:'allocation_records',label:'Records / status',align:'num',render:r=><span>{r.allocation_records} source allocation {r.allocation_records===1?'record':'records'}<small>{r.trace.replaceAll('_',' ')}</small></span>},
   {key:'review',label:'Review',sortable:false,render:r=><span><a href={routeHref('compare',{view:'projects',region_match:'ignore',q:r.id,record:r.id})}>Review comparison</a><br/><a href={routeHref('house',{view:'projects',reading:reading==='third'?'third':'second',node:r.source_id})}>{r.allocation_records>1?'House source tree · first allocation':'House source tree'}</a></span>},
  ]} empty="No records in this group for the selected House reading."/>
 </section>;
}
function Deletions({headlines,ranking,dim,change,onOpenGroup}){
 const list=headlines.deletions[ranking];
 const shown=Math.min(100,list.comparison_rows);
 return <section className="analysis-section"><h2>Top deletion candidates</h2>
  <div className="analysis-controls"><label>Candidate group<select aria-label="Analysis deletion group" value={ranking} onChange={e=>change('ranking',e.target.value)}>{Object.entries(deletionModes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
  <DimensionChips dim={dim} change={change}/>
  <div className="cards analysis-headlines">
   <article><h3>Comparison rows</h3><strong>{list.comparison_rows.toLocaleString()}</strong><p>{deletionModes[ranking]}</p></article>
   <article><h3>NEP allocation</h3><strong>{amount(list.amount_php)}</strong><p>Ranked by NEP amount · grouped allocations remain grouped</p></article>
   <article><h3>Showing</h3><strong>Top {shown.toLocaleString()}</strong><p>of {list.comparison_rows.toLocaleString()} rows</p></article>
  </div>
  <p className="notice">{ranking==='no_suggestion'?'NEP line items with no attached House record and no House row suggesting them as a counterpart. These are review candidates, not confirmed deletions — title or assignment differences can prevent pairing.':ranking==='suggested'?'NEP-only items that unmatched House rows name as possible counterparts. Review the referring House rows: a re-titled or re-scoped line item can look like a deletion plus an insertion when it is a replacement. Suggestion counts refer to House rows, not certified identities.':'Records present only in HGAB2 under the retained reading key — dropped between readings. Currently none; the group guards future readings data.'}</p>
  {dim!=='overall'&&<AggregateTable tableId={`deletions-by-${dim}`} title={`Totals by ${dimensionTitle(dim)}`} dim={dim} groups={list.by_dim[dim]}
   onOpenGroup={g=>onOpenGroup({scope:'deletions',ranking,dim,label:g.label,displayLabel:groupLabel(dim,g.label)})}/>}
  <SortableTable tableId="deletions-top" ariaLabel="Top deletion candidates" initialSort={{key:'amount_php',direction:'desc'}} rows={list.top} columns={[
   {key:'rank',label:'#',sortable:false,width:'1%',render:(r,i)=><span>{i+1}</span>},
   {key:'title',label:'Project / assignment',scope:'row',render:r=><span className="cell-main">{r.title}<small>{r.zone==='fap'?'FAPs':short(r.program)} · {regionName(r.region)} · {officeName(r.office)||'No recorded office'}</small></span>},
   {key:'amount_php',label:'NEP allocation (PHP)',align:'num',render:r=>amountCell(r.amount_php)},
   {key:'allocation_records',label:'Records / status',align:'num',render:r=><span>{r.allocation_records} NEP allocation {r.allocation_records===1?'record':'records'}<small>{r.trace.replaceAll('_',' ')}</small></span>},
   {key:'referring_house_rows',label:'Referring House rows',align:'num',render:r=><span>{ranking==='suggested'?`${r.referring_house_rows.toLocaleString()} referring House ${r.referring_house_rows===1?'row':'rows'}`:'—'}</span>},
   {key:'review',label:'Review',sortable:false,render:r=><span><a href={routeHref('compare',{view:'projects',q:r.id,record:r.id})}>Review comparison</a>{r.source_kind==='nep'&&r.source_id&&<><br/><a href={routeHref('nep',{node:r.source_id})}>NEP source tree</a></>}</span>},
  ]} empty="No records in this group."/>
 </section>;
}
function AggregateTable({title,groups,dim,onOpenGroup,tableId}){
 if(!groups?.length)return null;
 return <div className="aggregate-table"><h3>{title} · {groups.length.toLocaleString()} group{groups.length===1?'':'s'}</h3>
  <SortableTable tableId={tableId} ariaLabel={title} initialSort={{key:'amount_php',direction:'desc'}} rows={groups.map(g=>({...g,id:g.label}))} columns={[
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
  <div className="cards analysis-headlines">
   <article><h3>House vs NEP pairs</h3><strong>{cross.length.toLocaleString()}</strong><p>Unequal-amount candidate pairs</p></article>
   <article><h3>Cross-doc net</h3><strong>{signedCell(totals.net)}</strong><p>Increased {signedCell(totals.increased)} · decreased {signedCell(-totals.decreased)}</p></article>
   <article><h3>Reading adjustments</h3><strong>{revisionSets.reading.length.toLocaleString()}</strong><p>HGAB3 vs HGAB2 · retained matching key</p></article>
   <article><h3>Reading net Δ</h3><strong>{signedCell(revisionSets.delta_php)}</strong><p>2nd → 3rd · repeated keys remain grouped</p></article>
  </div>
  <section className="analysis-section"><h2>House vs NEP differences · provisional identity</h2>
   <DimensionChips dim={dim} change={change}/>
   <div className="analysis-controls"><label>Direction<select aria-label="Revision direction" value={direction} onChange={e=>change('direction',e.target.value)}><option value="increased">Most increased (House above NEP)</option><option value="reduced">Most reduced (House below NEP)</option></select></label></div>
   <p className="muted">{cross.length.toLocaleString()} comparison rows · increased {signedCell(totals.increased)} · decreased {signedCell(-totals.decreased)} · net {signedCell(totals.net)}. Direction presets the sort; click any column to re-sort.</p>
   <p className="notice">These rows carry exact House/NEP candidate pairs with unequal amounts. Identity is proposed by title/scope matching and is not manually certified; the House−NEP gap often reflects GAA-like versus full-project-cost bases, especially for FAPs. This is a cross-document comparison, not a House reading change. % change is House relative to NEP.</p>
   {byDim&&<DifferenceAggregate tableId={`differences-by-${dim}`} title={`Differences by ${dimensionTitle(dim)}`} dim={dim} groups={byDim}
    onOpenGroup={g=>onOpenGroup({scope:'differences',reading:'third',dim,label:g.raw||g.label,displayLabel:g.label})}/>}
   <SortableTable key={direction} tableId="differences-top" ariaLabel="Top House vs NEP differences" initialSort={{key:'gap',direction:direction==='increased'?'desc':'asc'}} rows={shown.slice(0,100)} columns={[
    {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{short(r.program)} · {regionName(r.region)} · {r.trace.replaceAll('_',' ')}</small></span>},
    {key:'house_php',label:'House',align:'num',render:r=>r.house_php!=null?amountCell(r.house_php):<span>—</span>},
    {key:'nep_php',label:'NEP',align:'num',render:r=>r.nep_php!=null?amountCell(r.nep_php):<span>—</span>},
    {key:'gap',label:'House − NEP',align:'num',render:r=>signedCell(r.gap)},
    {key:'pct',label:'% change',align:'num',render:r=>signedPercent(r.pct)},
   ]}/>
  </section>
  <section className="analysis-section"><h2>Reading adjustments · HGAB3 vs HGAB2</h2>
   <p className="notice">Recorded 2nd→3rd reading differences under the retained matching key: {revisionSets.reading.length.toLocaleString()} rows · net {amount(revisionSets.delta_php)}. Repeated keys remain grouped. This ledger is far smaller than the cross-document comparison above — reading edits only, not House-versus-NEP changes.</p>
   <SortableTable tableId="adjustments-reading" ariaLabel="Reading adjustments" initialSort={{key:'reading_delta_php',direction:'desc'}} rows={revisionSets.reading} columns={[
    {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{short(r.program)} · {regionName(r.region)}</small></span>},
    {key:'second_php',label:'HGAB2',align:'num',render:r=>r.second_php!=null?amountCell(r.second_php):<span>—</span>},
    {key:'third_php',label:'HGAB3',align:'num',render:r=>r.third_php!=null?amountCell(r.third_php):<span>—</span>},
    {key:'reading_delta_php',label:'Δ',align:'num',render:r=>r.reading_delta_php!=null?signedCell(r.reading_delta_php):<span>new in HGAB3</span>},
    {key:'pct',label:'% change',align:'num',value:r=>percentChange(r.third_php,r.second_php),render:r=>signedPercent(percentChange(r.third_php,r.second_php))},
   ]}/>
  </section>
 </>;
}
const CHAINAGE_SORTS=[
 ['per_km_delta','Δ price/km'],
 ['per_km_pct','% Δ price/km'],
 ['length_delta_m','Δ chainage length'],
 ['length_delta_pct','% Δ chainage length'],
 ['budget_gap_php','Δ amount'],
 ['budget_gap_pct','% Δ amount'],
 ['modus','Modus'],
 ['nep_per_km','NEP price/km'],
 ['house_per_km','HGAB price/km'],
 ['nep_length_m','NEP length'],
 ['house_length_m','HGAB length'],
 ['title','Project'],
];
// Focus groups for the records table, grouped for the dropdown.
function chainageFocusGroups(){
 const base=[['Basics',Object.entries(CHAINAGE_FOCUS).filter(([key])=>!key.startsWith('modus_'))]];
 return [...base,['Amendment modus',Object.entries(CHAINAGE_FOCUS).filter(([key])=>key.startsWith('modus_'))]];
}
// One step of the How-to-read collapsible. Tooltip already shows the short
// definition; this adds the worked detail only when asked for.
function HowToRead({conceptKey,label='How to read this'}){
 const concept=GUIDE_CONCEPTS.find(c=>c.key===conceptKey);
 if(!concept)return null;
 return <details className="howto"><summary>{label}</summary>
  <p><strong>{concept.term}.</strong> {concept.short}</p>
  {concept.body}
 </details>;
}
// Modal band of a source's ₱/km distribution — "where most sit" hint for the
// population table. Falls back to a dash when nothing is measurable.
function perKmBandHint(units,source){
 const result=perKmBands(units,{source});
 const top=[...result.bands].sort((a,b)=>b.units-a.units)[0];
 if(!top||!top.units)return '—';
 return `${top.label} · ${top.units.toLocaleString()} of ${result.measurable.toLocaleString()}`;
}
function Chainage({detail,focus,change,benchmark,setBenchmark,stage,scope}){
 const [sort,setSort]=useState('per_km_delta');
 const [benchSource,setBenchSource]=useState('all');
 // Benchmark peer axis: region cohorts pool every DEO in the region; DEO
 // cohorts compare a ₱/km against its own district's norm.
 const [benchDimension,setBenchDimension]=useState('region');
 const [outliersOpen,setOutliersOpen]=useState(false);
 const rows=useMemo(()=>chainageAmendmentRows(detail),[detail]);
 const summary=useMemo(()=>summarizeChainage(rows),[rows]);
 const shown=useMemo(()=>filterChainageRows(rows,focus),[rows,focus]);
 const sorted=useMemo(()=>{
  const copy=[...shown];
  if(sort==='title'){
   copy.sort((a,b)=>String(a.title).localeCompare(String(b.title),'en',{numeric:true,sensitivity:'base'}));
   return copy;
  }
  copy.sort((a,b)=>{
   const x=a[sort],y=b[sort];
   if(sort==='modus')return String(x??'').localeCompare(String(y??''),'en');
   if(x==null&&y==null)return 0;
   if(x==null)return 1;
   if(y==null)return -1;
   return Math.abs(y)-Math.abs(x);
  });
  return copy;
 },[shown,sort]);
 const redFlags=useMemo(()=>redFlagPerKm(rows),[rows]);
 const bins=useMemo(()=>perKmChangeBins(rows),[rows]);
 const amountBins=useMemo(()=>amountChangeBins(rows),[rows]);
 const modus=useMemo(()=>modusSummary(rows),[rows]);
 const measurableUnits=useMemo(()=>benchmark?benchmark.filter(u=>!u.point_only&&u.amount_php):[],[benchmark]);
 const cohorts=useMemo(()=>benchmark?peerCohorts(benchmark,{source:benchSource,minPeers:5,dimension:benchDimension}):[],[benchmark,benchSource,benchDimension]);
 const outliers=useMemo(()=>benchmark?outlierUnits(benchmark,{source:benchSource,minPeers:5,dimension:benchDimension}).slice(0,100):[],[benchmark,benchSource,benchDimension]);
 const cohortAxis=benchDimension==='deo'?'DEO':'region';
 // All-data overview tallies (sidecar population, not matched pairs).
 const unitTotals=useMemo(()=>benchmark?summarizeUnits(benchmark):[],[benchmark]);
 const unitBands=useMemo(()=>benchmark?perKmBands(benchmark):null,[benchmark]);
 const unitsTotalKm=useMemo(()=>unitTotals.reduce((s,t)=>s+t.length_m,0),[unitTotals]);
 const unitsTotalPhp=useMemo(()=>unitTotals.reduce((s,t)=>s+t.amount_php,0),[unitTotals]);
 // Full outlier tally for the hero card (the table still shows the top 100).
 const outlierCount=useMemo(()=>benchmark?outlierUnits(benchmark,{minPeers:5,dimension:benchDimension}).filter(r=>Math.abs(r.z)>=3).length:null,[benchmark,benchDimension]);
 // Stages differ per scope: the all-data scope carries the population
 // overview and benchmark; the revised scope keeps the matched-pair stages.
 const stageChips=scope==='all'
  ?[['overview','① Overview'],['benchmark','② Peer ₱/km benchmark']]
  :[['patterns','① Amendment patterns'],['benchmark','② Peer ₱/km benchmark'],['records','③ Project records']];
 const activeStage=stageChips.some(([key])=>key===stage)?stage:stageChips[0][0];
 return <section className="analysis-section"><h2>Chainage amendments</h2>
  {/* Scope split: every chainage-bearing unit vs the matched-pair subset.
      Each stage below is one standalone question with its own tables;
      all stages are URL-addressable so a shared link opens exactly one. */}
  <div className="chainage-scopes" role="tablist" aria-label="Chainage scope">
   {[['all','All chainage data'],['revised','Revised / adjusted chainage']].map(([key,label])=>
    <button key={key} role="tab" aria-selected={scope===key} onClick={()=>change('scope',key)}>{label}</button>)}
  </div>
  <p className="muted chainage-scope-note">{scope==='all'
   ?<>Every allocation record with parsed chainage spans — {benchmark?`${benchmark.length.toLocaleString()} units`:''} across DBM NEP, HGAB2 and HGAB3, matched or not. Answers “what does the ₱/km landscape look like, and which units are outliers against their peers?”</>
   :<>The {rows.length.toLocaleString()} House↔NEP pairs attached after the chainage check — same road <code>title_base</code>, different station spans. Answers “what changed between readings, and in which of the three amendment levers?”</>}</p>
  <div className="chainage-stages" role="tablist" aria-label="Chainage stages">
   {stageChips.map(([key,label])=>
    <button key={key} role="tab" aria-selected={activeStage===key} onClick={()=>change('stage',key)}>{label}</button>)}
  </div>
  {scope==='all'&&activeStage==='overview'&&<>
  <div className="cards analysis-headlines">
   <article><h3>Chainage units</h3><strong>{benchmark?benchmark.length.toLocaleString():'…'}</strong><p>All sources · matched or not</p></article>
   <article><h3>Measurable length</h3><strong>{unitTotals.length?unitTotals.reduce((s,t)=>s+t.measurable,0).toLocaleString():'…'}</strong><p>Points {unitTotals.length?unitTotals.reduce((s,t)=>s+t.points,0).toLocaleString():''} · review {unitTotals.length?unitTotals.reduce((s,t)=>s+t.review,0).toLocaleString():''}</p></article>
   <article><h3>Total chainage length</h3><strong>{benchmark?formatLengthKm(unitsTotalKm):'…'}</strong><p>Sum of repaired span lengths</p></article>
   <article><h3>Allocation carried</h3><strong>{benchmark?amount(unitsTotalPhp):'…'}</strong><p>NEP + HGAB2 + HGAB3 units</p></article>
   <article><h3>Cohorts · outliers</h3><strong>{cohorts.length.toLocaleString()} · {outlierCount==null?'…':outlierCount.toLocaleString()}</strong><p>{cohortAxis} axis · |z| ≥ 3 units of {measurableUnits.length.toLocaleString()} measurable</p></article>
  </div>
  <section className="analysis-section"><h3>Population by source</h3>
   <p className="muted">Every chainage-bearing unit per source: total units, how many carry a measurable length (vs single point stations and review flags), and the length and allocation they represent. House sides largely shadow each other; the NEP side is the pre-House baseline.</p>
   <SortableTable tableId="chainage-population" ariaLabel="Chainage population by source" initialSort={{key:'order',direction:'asc'}} rows={unitTotals.map((t,i)=>({...t,order:i}))} columns={[
    {key:'order',label:'#',align:'num',sortable:false,render:(r,i)=><span>{i+1}</span>},
    {key:'source',label:'Source',scope:'row',render:r=><span>{BENCHMARK_SOURCES[r.source]||r.source}</span>},
    {key:'units',label:'Units',align:'num',render:r=>r.units.toLocaleString()},
    {key:'measurable',label:'Measurable',align:'num',render:r=>r.measurable.toLocaleString()},
    {key:'points',label:'Point stations',align:'num',render:r=>r.points.toLocaleString()},
    {key:'review',label:'Length review',align:'num',render:r=>r.review.toLocaleString()},
    {key:'length_m',label:'Chainage length',align:'num',render:r=>formatLengthKm(r.length_m)},
    {key:'amount_php',label:'Allocation',align:'num',render:r=>amountCell(r.amount_php)},
    {key:'median_band',label:'Where most sit',sortable:false,render:r=>benchmark?perKmBandHint(benchmark,r.source):'…'},
   ]} empty={benchmark?'No units.':'Loading chainage units…'}/>
  </section>
  <section className="analysis-section"><h3>Price-per-km bands · {unitBands?unitBands.measurable.toLocaleString():'…'} measurable units</h3>
   <HowToRead conceptKey="perKm"/>
   <p className="muted">Fixed peso bands of <Term k="perKm">price per km</Term> across the whole population — the FY2027 landscape is right-skewed (median ≈ ₱41M/km), so band counts show where the bulk sits before any cohort reasoning. Units without measurable length ({unitBands?unitBands.unmeasurable.toLocaleString():''}) are excluded. <span className="band-bars">{unitBands&&unitBands.bands.map(b=>{const max=Math.max(...unitBands.bands.map(x=>x.units))||1;return <span key={b.label} className="band-bar"><i style={{height:`${Math.max(4,b.units/max*46)}px`}}/></span>;})}</span></p>
   <SortableTable tableId="chainage-perkm-bands" ariaLabel="Price per km bands" initialSort={{key:'min',direction:'asc'}} rows={unitBands?unitBands.bands:[]} columns={[
    {key:'label',label:'₱/km band',scope:'row'},
    {key:'units',label:'Units',align:'num',render:r=><span>{r.units.toLocaleString()}<small> · {unitBands&&unitBands.measurable?((r.units/unitBands.measurable)*100).toFixed(1):'0.0'}%</small></span>},
    {key:'length_m',label:'Chainage length',align:'num',render:r=>formatLengthKm(r.length_m)},
    {key:'amount_php',label:'Allocation',align:'num',render:r=>amountCell(r.amount_php)},
   ]} empty={benchmark?'No measurable units.':'Loading chainage units…'}/>
   <p className="muted">Explore further: switch to <button type="button" className="link-button" onClick={()=>change('stage','benchmark')}>② Peer ₱/km benchmark</button> for cohort medians and outliers, or <button type="button" className="link-button" onClick={()=>change('scope','revised')}>Revised / adjusted chainage</button> for what changed between readings.</p>
  </section>
  </>}
  {scope==='revised'&&activeStage==='patterns'&&<>
  <p className="notice">Rows attached after chainage check: same road <code>title_base</code>, different station spans. Length Δ is HGAB minus NEP (sum of repaired span lengths). Price per km divides each source’s allocation by its listed chainage length; both bases differ between readings, so treat Δ price/km as a review lens, not a unit-cost finding. Point stations have no length. OCR km repairs and absurd unresolved spans are flagged.</p>
  <div className="cards analysis-headlines">
   <article><h3>Chainage matches</h3><strong>{summary.rows.toLocaleString()}</strong><p>Attached House↔NEP pairs</p></article>
   <article><h3>Length up / down</h3><strong>{summary.length_up.toLocaleString()} / {summary.length_down.toLocaleString()}</strong><p>Same length {summary.length_same.toLocaleString()} · points {summary.point_only.toLocaleString()}</p></article>
   <article><h3>Length review</h3><strong>{summary.review.toLocaleString()}</strong><p>Repaired OCR {summary.repaired_km_ocr.toLocaleString()} · absurd {summary.absurd_unresolved.toLocaleString()}</p></article>
   <article><h3>Net length Δ</h3><strong>{formatSignedKm(summary.length_delta_m_net)??'—'}</strong><p>Budget net {signedCell(summary.budget_gap_php_net)}</p></article>
   <article className="red-flag"><h3><Term k="redFlag">Price/km red flags</Term></h3><strong>{redFlags.length.toLocaleString()}</strong><p>|Δ| &gt; 10% · {amount(redFlags.reduce((s,r)=>s+(r.house_php??0),0))} HGAB</p></article>
  </div>
  <section className="analysis-section"><h3>Amendment modus · {modus.measurable.toLocaleString()} measurable rows</h3>
   <HowToRead conceptKey="modus"/>
   <p className="muted">Every measurable row classified on <Term k="modus">budget Δ × scope Δ × unit-rate Δ</Term> (±{MODUS_DEADBAND}% <Term k="deadband">deadband</Term> each) and named for the archetype that trio implies. Directions use HGAB vs NEP. <Term k="median">Median Δ</Term> columns show the group’s middle record — half the rows above, half below — robust to OCR outliers. Per record the identity (1+budget)=(1+scope)(1+rate) holds exactly, so a flat budget with scope −45% ⇒ rate ≈ +82%.</p>
   <SortableTable tableId="chainage-modus" ariaLabel="Amendment modus" initialSort={{key:'records',direction:'desc'}} rows={modus.groups} columns={[
    {key:'records',label:'Records',align:'num',render:r=><span>{r.records.toLocaleString()}<small> · {modus.measurable?((r.records/modus.measurable)*100).toFixed(1):'0.0'}%</small></span>},
    {key:'modus',label:'Modus',scope:'row',render:r=><span>{CHAINAGE_MODUS[r.modus].label}{smallOf(CHAINAGE_MODUS[r.modus].hint)}</span>},
    {key:'median_budget_pct',label:'Median budget Δ',align:'num',render:r=>pctCell(r.median_budget_pct)},
    {key:'median_scope_pct',label:'Median scope Δ',align:'num',render:r=>pctCell(r.median_scope_pct)},
    {key:'median_rate_pct',label:'Median rate Δ',align:'num',render:r=>pctCell(r.median_rate_pct)},
    {key:'house_php',label:'HGAB allocation',align:'num',render:r=>amountCell(r.house_php)},
    {key:'gap_php',label:'Net gap',align:'num',render:r=>signedCell(r.gap_php)},
   ]} empty="No measurable chainage rows."/>
  </section>
  <section className="analysis-section"><h3>Δ price/km distribution · {bins.measurable.toLocaleString()} measurable rows</h3>
   <p className="muted">Bins of |%Δ price per km| in 25-point steps. Records without a measurable length on either side ({bins.noLength.toLocaleString()}) are excluded. House allocations per bin; the first bin contains the &gt;10% red-flag slice.</p>
   <SortableTable tableId="chainage-perkm-change" ariaLabel="Price per km change bins" initialSort={{key:'edge',direction:'asc'}} rows={bins.bins} columns={[
    {key:'edge',label:'|%Δ price/km|',scope:'row',render:r=><span>{r.edge===200?'200%+':`${r.edge}–${r.edge+25}%`}{r.red_flag&&<span className="red-flag-pill">red flag</span>}</span>},
    {key:'records',label:'Records',align:'num',render:r=><span>{r.records.toLocaleString()}<small> · {bins.measurable?((r.records/bins.measurable)*100).toFixed(1):'0.0'}%</small></span>},
    {key:'nep_php',label:'NEP allocation',align:'num',render:r=>amountCell(r.nep_php)},
    {key:'house_php',label:'HGAB allocation',align:'num',render:r=>amountCell(r.house_php)},
   ]} empty="No measurable chainage rows."/>
  </section>
  <section className="analysis-section"><h3>Δ allocation amount distribution · {amountBins.measurable.toLocaleString()} measurable rows</h3>
   <p className="muted">Signed 25-point bins of %Δ allocation amount (HGAB − NEP over |NEP|); decreases bottom out at −100%. Point-only rows without an NEP amount or length are excluded. Amounts are HGAB allocations of the records in each bin.</p>
   <SortableTable tableId="chainage-amount-change" ariaLabel="Allocation amount change bins" initialSort={{key:'edge',direction:'asc'}} rows={amountBins.bins} columns={[
    {key:'edge',label:'%Δ amount',scope:'row',render:r=><span>{fmtPctBinEdge(r.edge)}{r.edge===200&&<span className="red-flag-pill">red flag</span>}</span>},
    {key:'records',label:'Records',align:'num',render:r=><span>{r.records.toLocaleString()}<small> · {amountBins.measurable?((r.records/amountBins.measurable)*100).toFixed(1):'0.0'}%</small></span>},
    {key:'nep_php',label:'NEP allocation',align:'num',render:r=>amountCell(r.nep_php)},
    {key:'house_php',label:'HGAB allocation',align:'num',render:r=>amountCell(r.house_php)},
   ]} empty="No rows with an amount change."/>
  </section>
  </>}
  {activeStage==='benchmark'&&<>
  <div className="cards analysis-headlines">
   <article><h3>Measurable units</h3><strong>{measurableUnits.length.toLocaleString()}</strong><p>All sources · min length for ₱/km</p></article>
   <article><h3>Peer cohorts</h3><strong>{cohorts.length.toLocaleString()}</strong><p>{cohortAxis} axis · min 5 peers</p></article>
   <article className="red-flag"><h3>Outliers · |z| ≥ 3</h3><strong>{outlierCount==null?'…':outlierCount.toLocaleString()}</strong><p>Robust z vs cohort median</p></article>
   <article><h3>Showing outliers</h3><strong>{Math.min(100,outliers.length).toLocaleString()}</strong><p>Top table rows · source filter applies</p></article>
  </div>
  <section className="analysis-section"><h3>Price-per-km peer benchmark · all chainage records</h3>
   <p className="muted">Every chainage-bearing allocation — matched or not — from DBM NEP, HGAB2 and HGAB3, grouped into program × <Term k="cohort">{cohortAxis}</Term> × zone <Term k="cohort">cohorts</Term> (min 5 peers with measurable length; {measurableUnits.length.toLocaleString()} measurable units). Each cohort shows the <Term k="median">median ₱/km</Term> with its interquartile band; the outlier table ranks units by <Term k="robustZ">robust z</Term> (deviation from the cohort median in <Term k="mad">MADs</Term>). Use this to ask whether a ₱/km is plausible for similar PAPs in the same {cohortAxis} — not whether a pair changed.</p>
   <div className="analysis-controls">
    <label>Peer axis<select aria-label="Benchmark peer axis" value={benchDimension} onChange={e=>setBenchDimension(e.target.value)}>{Object.entries(BENCHMARK_DIMENSIONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Benchmark source<select aria-label="Benchmark source" value={benchSource} onChange={e=>setBenchSource(e.target.value)}>{Object.entries(BENCHMARK_SOURCES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   </div>
   <HowToRead conceptKey={benchDimension==='deo'?'deo':'cohort'} label={benchDimension==='deo'?'Region vs DEO cohorts — how to choose':'How to read peer cohorts'}/>
   <SortableTable tableId="chainage-cohorts" ariaLabel="Price per km peer cohorts" initialSort={{key:'units',direction:'desc'}} rows={cohorts} columns={[
    {key:'program',label:'Cohort',scope:'row',render:r=><span className="cell-main">{r.program}<small>{benchDimension==='deo'?officeName(r.office):r.region}{r.zone?` · ${r.zone}`:''}</small></span>},
    {key:'units',label:'Units',align:'num',render:r=>r.units.toLocaleString()},
    {key:'length_m',label:'Total length',align:'num',render:r=>formatLengthKm(r.length_m)},
    {key:'amount_php',label:'Allocation',align:'num',render:r=>amountCell(r.amount_php)},
    {key:'median_per_km',label:'Median ₱/km',align:'num',render:r=>amountCell(r.median_per_km)},
    {key:'p25_per_km',label:'P25 ₱/km',align:'num',render:r=>amountCell(r.p25_per_km)},
    {key:'p75_per_km',label:'P75 ₱/km',align:'num',render:r=>amountCell(r.p75_per_km)},
    {key:'min_per_km',label:'Min ₱/km',align:'num',render:r=>amountCell(r.min_per_km)},
    {key:'max_per_km',label:'Max ₱/km',align:'num',render:r=>amountCell(r.max_per_km)},
   ]} empty={benchmark?'No cohorts with enough measurable peers.':'Loading chainage units…'}/>
   {benchmark&&<details className="benchmark-outliers" open={outliersOpen} onToggle={e=>setOutliersOpen(e.currentTarget.open)}>
    <summary>Top 100 per-km outliers by robust z</summary>
    <SortableTable tableId="chainage-outliers" ariaLabel="Price per km outliers" initialSort={{key:'z',direction:'desc'}} rows={outliers.map(r=>({...r.unit,z:r.z,cohort_median:r.cohort.median_per_km,cohort_units:r.cohort.units}))} columns={[
     {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{BENCHMARK_SOURCES[r.source]||r.source} · {r.program} · {benchDimension==='deo'?officeName(r.office):r.region}</small></span>},
     {key:'per_km',label:'₱/km',align:'num',render:r=>amountCell(unitPerKm(r))},
     {key:'cohort_median',label:'Cohort median ₱/km',align:'num',render:r=>amountCell(r.cohort_median)},
     {key:'cohort_units',label:'Cohort units',align:'num',render:r=>r.cohort_units.toLocaleString()},
     {key:'z',label:'Robust z',align:'num',render:r=><span className={Math.abs(r.z)>=3?'red-flag-pill':Math.abs(r.z)>=2?'up':''}>{r.z>0?'+':''}{r.z.toFixed(1)} MADs</span>},
    ]} empty="No measurable outliers."/>
   </details>}
  </section>
  </>}
  {scope==='revised'&&activeStage==='records'&&<>
  <div className="analysis-controls">
   <label>Focus<select aria-label="Chainage focus" value={focus} onChange={e=>change('focus',e.target.value)}>{chainageFocusGroups().map(([group,entries])=><optgroup key={group} label={group}>{entries.map(([key,label])=><option key={key} value={key}>{label}</option>)}</optgroup>)}</select></label>
   <label>Sort<select aria-label="Chainage sort" value={sort} onChange={e=>setSort(e.target.value)}>{CHAINAGE_SORTS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <a href={routeHref('compare',{view:'projects',match:'matched_chainage'})}>Open all in Compare →</a></div>
  <div className="cards analysis-headlines">
   <article><h3>Focus rows</h3><strong>{shown.length.toLocaleString()}</strong><p>{CHAINAGE_FOCUS[focus]||focus}</p></article>
   <article><h3>All chainage pairs</h3><strong>{rows.length.toLocaleString()}</strong><p>Attached House↔NEP matches</p></article>
   <article className="red-flag"><h3>Price/km red flags</h3><strong>{redFlags.length.toLocaleString()}</strong><p>|Δ| &gt; 10% in full set</p></article>
   <article><h3>Sort</h3><strong>{CHAINAGE_SORTS.find(([k])=>k===sort)?.[1]??sort}</strong><p>HGAB − NEP deltas in the Δ columns</p></article>
  </div>
  <p className="muted">{shown.length.toLocaleString()} of {rows.length.toLocaleString()} chainage rows · sorted by {CHAINAGE_SORTS.find(([k])=>k===sort)?.[1].toLowerCase()}. Each source column carries its allocation, station spans, length and price/km; the Δ columns hold the HGAB−NEP deltas with percent change.</p>
  <SortableTable key={focus+sort} ariaLabel="Chainage amendments" initialSort={{key:sort,direction:'desc'}} rows={sorted} columns={[
   {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}{r.modus&&<span className="modus-pill" data-modus={r.modus}>{CHAINAGE_MODUS[r.modus].label}</span>}<small>{short(r.program)} · {regionName(r.region)} · {officeName(r.office)||'No recorded office'}{r.reason?` · ${r.reason}`:''}</small></span>},
   {key:'nep_php',label:'NEP',band:'nep',bandLabel:'DBM NEP',align:'num',render:r=><span className="chainage-cell"><strong>{amount(r.nep_php)}</strong><small>{r.nep_spans}</small>{r.nep_length_m!=null&&<small>{formatLengthKm(r.nep_length_m)} · {amount(r.nep_per_km)}/km</small>}</span>},
   {key:'house_php',label:'HGAB',band:'house',bandLabel:'House reading',divider:true,align:'num',render:r=><span className="chainage-cell"><strong>{amount(r.house_php)}</strong><small>{r.house_spans}</small>{r.length_review&&<small className="chainage-length-review">{r.length_review_label}</small>}{r.house_length_m!=null&&<small>{formatLengthKm(r.house_length_m)} · {amount(r.house_per_km)}/km</small>}</span>},
   {key:'per_km_delta',label:'Δ price/km',align:'num',render:r=>r.per_km_delta==null?<span>—</span>:<span className="chainage-cell"><span className={r.per_km_delta>0?'up':r.per_km_delta<0?'down':''}>{r.per_km_delta>0?'+':''}{amount(r.per_km_delta)}</span>{r.per_km_pct!=null&&<small className={`delta ${r.per_km_delta>0?'up':r.per_km_delta<0?'down':''}`}>{r.per_km_pct>0?'+':''}{r.per_km_pct.toFixed(1)}%</small>}</span>},
   {key:'length_delta_m',label:'Δ length',align:'num',render:r=>r.length_delta_m==null?<span>—</span>:<span className="chainage-cell"><span className={r.length_direction==='up'?'up':r.length_direction==='down'?'down':''}>{formatSignedKm(r.length_delta_m)}</span>{r.length_delta_pct&&<small className={`delta ${r.length_direction==='up'?'up':r.length_direction==='down'?'down':''}`}>{r.length_delta_pct}</small>}</span>},
   {key:'budget_gap_php',label:'Δ amount',align:'num',render:r=>r.budget_gap_php==null?<span>—</span>:<span className="chainage-cell"><span className={r.budget_gap_php>0?'up':r.budget_gap_php<0?'down':''}>{r.budget_gap_php>0?'+':''}{amount(r.budget_gap_php)}</span>{r.budget_gap_pct!=null&&<small className={`delta ${r.budget_gap_php>0?'up':r.budget_gap_php<0?'down':''}`}>{r.budget_gap_pct>0?'+':''}{r.budget_gap_pct.toFixed(1)}%</small>}</span>},
   {key:'review',label:'Open',sortable:false,render:r=><a href={routeHref('compare',{view:'projects',match:'matched_chainage',q:r.id,record:r.id})}>Compare</a>},
  ]} empty="No chainage matches in this focus."/>
  </>}
  <ChainageGuide/>
 </section>;
}
function houseMinusNep(row){const house=row.third??row.second;return house!=null&&row.nep!=null?house.amount_php-row.nep.amount_php:null;}
// Groupings tab: same-shell House/NEP allocations grouped by zone+PAP+region —
// road corridors by chainage-stripped base, everything else by place shell
// (work + municipality + province; barangay/street dropped — the split axis).
// Exhausted groups (NEP supply fully attached, House leftovers) are split /
// insertion candidates. All data — not just fuzzy rows.
function RoadGroups({payload,open,onOpenShell,onClose}){
 const summary=payload?.summary;
 const groups=payload?.groups??[];
 const nepGroups=payload?.nep_leftover_groups??[];
 const regions=payload?.region_summary??[];
 const stats=roadGroupStats(groups);
 const [kind,setKind]=useState('all');
 const [pattern,setPattern]=useState('all');
 const kindFilter=v=>kind==='all'||v===kind;
 const patternFilter=v=>pattern==='all'||v===pattern;
 const shown=groups.filter(g=>kindFilter(g.kind)&&patternFilter(g.pattern));
 const nepShown=nepGroups.filter(g=>kindFilter(g.kind));
 const PATTERN_LABELS={split_like:'Split-like',unsupplied_cluster:'Unsupplied cluster',micro_supplied:'Micro-supplied'};
 if(!payload)return <p role="status">Loading groupings…</p>;
 const fmtKm=m=>m==null?'—':`${(m/1000).toLocaleString('en-PH',{maximumFractionDigits:3})} km`;
 const perKm=v=>v==null?'—':`${amount(v)}/km`;
 return <section className="analysis-section road-groups">
  <h2>Groupings · same-project-shell crosschecking</h2>
  <p className="muted">Every House (HGAB) and NEP allocation grouped by funding zone + PAP + region. Roads group by chainage-stripped title base; other projects group by <strong>place shell</strong> — work phrase + municipality + province, dropping barangay/street, the axis a single allocation gets salami-sliced along. Matched pairs collapse into one final-sheet record (NEP side kept as provenance). Whatever remains <strong>unpaired</strong> is the signal: <strong>{summary.leftover_house_rows.toLocaleString()} HGAB rows worth {amount(summary.leftover_amount_php)}</strong> are on the House sheet with no NEP counterpart in their shell — <em>insertion candidates</em>. <strong>{summary.leftover_nep_rows.toLocaleString()} NEP rows worth {amount(summary.leftover_nep_amount_php)}</strong> never received House funding in their shell — <em>deletion candidates</em> (dropped or re-titled). Shell context only — identity never certified.</p>
  <dl className="stat-strip">
   <div><dt>Insertion candidates (HGAB)</dt><dd>{summary.leftover_house_rows.toLocaleString()} rows</dd></div>
   <div><dt>Insertion amount</dt><dd>{amount(summary.leftover_amount_php)}</dd></div>
   <div><dt>in {summary.exhausted_groups.toLocaleString()} shells</dt><dd>{stats.roads.toLocaleString()} roads · {stats.shells.toLocaleString()} project shells</dd></div>
   <div><dt>Deletion candidates (NEP)</dt><dd>{summary.leftover_nep_rows.toLocaleString()} rows</dd></div>
   <div><dt>Deletion amount</dt><dd>{amount(summary.leftover_nep_amount_php)}</dd></div>
   <div><dt>in {summary.nep_leftover_groups.toLocaleString()} shells</dt><dd>{summary.groups_with_nep_supply.toLocaleString()} shells carry any NEP supply</dd></div>
  </dl>
  <div className="analysis-controls">
   <label>Group kind<select aria-label="Grouping kind" value={kind} onChange={e=>setKind(e.target.value)}>
    <option value="all">All groups</option>
    <option value="road">Road corridors</option>
    <option value="place_shell">Project shells (non-road)</option>
   </select></label>
   <label>Insertion pattern<select aria-label="Insertion pattern" value={pattern} onChange={e=>setPattern(e.target.value)}>
    <option value="all">All patterns</option>
    <option value="split_like">Split-like · NEP scale matches leftovers</option>
    <option value="unsupplied_cluster">Unsupplied cluster · paired NEP is different work</option>
    <option value="micro_supplied">Micro-supplied · tiny NEP beside large leftovers</option>
   </select></label>
  </div>
  <h3>Insertion candidates · HGAB rows with no NEP counterpart in the shell</h3>
  <SortableTable tableId="groupings-region-rollup" ariaLabel="Insertion region rollup" initialSort={{key:'leftover_amount_php',direction:'desc'}} rows={regions} columns={[
   {key:'region',label:'Region',scope:'row'},
   {key:'exhausted_groups',label:'Shells with insertions',align:'num',render:r=><span>{r.exhausted_groups}<small> {r.road_groups} road · {r.place_shell_groups} shell</small></span>},
   {key:'leftover_house_rows',label:'Insertion rows (unpaired HGAB)',align:'num'},
   {key:'leftover_amount_php',label:'Insertion amount',align:'num',render:r=>amountCell(r.leftover_amount_php)},
   {key:'nep_leftover_groups',label:'Shells with deletions',align:'num'},
   {key:'leftover_nep_rows',label:'Deletion rows (unpaired NEP)',align:'num'},
   {key:'leftover_nep_amount_php',label:'Deletion amount',align:'num',render:r=>amountCell(r.leftover_nep_amount_php)},
  ]} empty="No candidate shells."/>
  <SortableTable tableId="groupings-insertions" ariaLabel="Insertion candidate groups" initialSort={{key:'leftover_amount_php',direction:'desc'}} rows={shown} columns={[
   {key:'title',label:'Group',scope:'row',render:r=><span className="cell-main">{r.title}<small>{regionName(r.region)} · {short(r.pap||r.program||'')} · {r.kind==='road'?'road corridor':'place shell'} · {PATTERN_LABELS[r.pattern]||r.pattern}</small></span>},
   {key:'house_rows',label:'Final-sheet rows',align:'num'},
   {key:'paired_rows',label:'Paired with NEP',align:'num',render:r=><span>{r.paired_rows}<small> collapsed pairs</small></span>},
   {key:'split_ratio',label:'Final ÷ paired',align:'num',sortable:false,render:r=>`${(r.house_rows/r.paired_rows).toFixed(1)}×`},
   {key:'leftover_house_rows',label:'Insertion rows',align:'num'},
   {key:'leftover_amount_php',label:'Insertion amount',align:'num',render:r=>amountCell(r.leftover_amount_php)},
   {key:'house_amount_php',label:'Final-sheet total',align:'num',render:r=>amountCell(r.house_amount_php)},
   {key:'nep_amount_php',label:'NEP paired total',align:'num',render:r=>amountCell(r.nep_amount_php)},
   {key:'members',label:'Members',sortable:false,render:r=><button type="button" className="group-open" onClick={e=>onOpenShell(r)}>{(r.house_rows).toLocaleString()} rows</button>},
  ]} empty="No insertion-candidate groups."/>
  <h3>Deletion candidates · NEP rows never funded by this shell at HGAB</h3>
  <p className="muted">Mirror direction: the House side of the shell is fully paired, but these NEP items remain unmatched. Overlaps the global deletion queues — here they gain shell context (roads with segments left unclaimed, shells where a lookalike was funded instead).</p>
  <SortableTable tableId="groupings-deletions" ariaLabel="Deletion candidate groups" initialSort={{key:'leftover_nep_amount_php',direction:'desc'}} rows={nepShown} columns={[
   {key:'title',label:'Group',scope:'row',render:r=><span className="cell-main">{r.title}<small>{regionName(r.region)} · {short(r.pap||r.program||'')} · {r.kind==='road'?'road corridor':'place shell'}</small></span>},
   {key:'paired_rows',label:'Paired with HGAB',align:'num'},
   {key:'leftover_nep_rows',label:'Deletion rows',align:'num'},
   {key:'leftover_nep_amount_php',label:'Deletion amount',align:'num',render:r=>amountCell(r.leftover_nep_amount_php)},
   {key:'nep_amount_php',label:'NEP paired total',align:'num',render:r=>amountCell(r.nep_amount_php)},
   {key:'members',label:'Members',sortable:false,render:r=><button type="button" className="group-open" onClick={e=>onOpenShell(r)}>{(r.paired_rows+r.leftover_nep_rows).toLocaleString()} rows</button>},
  ]} empty="No deletion-candidate groups."/>
  {open&&<GroupingMembersModal g={resolveGroup(open,{groups,nepGroups})} isNep={open.side==='nep'} onClose={onClose}/>}
  </section>;
}

// The URL carries the full group key (shell+side+zone+pap+region) because the
// same shell can appear under different PAPs. Resolves against the full
// sidecar lists so shared links open regardless of active filters; falls back
// through progressively looser key matches.
function resolveGroup(open,{groups,nepGroups}){
 const all=[...groups,...nepGroups];
 return all.find(g=>g.shell===open.shell&&g.zone===open.zone&&g.pap===open.pap&&g.region===open.region)
  ||all.find(g=>g.shell===open.shell&&g.zone===open.zone&&g.pap===open.pap)
  ||all.find(g=>g.shell===open.shell);
}

function GroupingMembersModal({g,isNep,onClose}){
 const dialog=useRef(null);
 useEffect(()=>openModalDialog(dialog.current),[]);
 const fmtKm=m=>m==null?'—':`${(m/1000).toLocaleString('en-PH',{maximumFractionDigits:3})} km`;
 const perKm=v=>v==null?'—':`${amount(v)}/km`;
 if(!g)return <dialog ref={dialog} className="analytics-dialog grouping-members-dialog" open><header className="analytics-header"><div className="analytics-heading"><div><p className="eyebrow">SHELL GROUPING</p><h2 id="grouping-members-title">Grouping not found</h2></div><button onClick={onClose} autoFocus aria-label="Close">Close</button></div><p className="muted">No group matches this link — the shell key may have changed after a rebuild. Close and pick a group from the table.</p></header></dialog>;
 return <dialog ref={dialog} className="analytics-dialog grouping-members-dialog" aria-labelledby="grouping-members-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
  if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose();
 }}>
  <header className="analytics-header">
   <div className="analytics-heading"><div><p className="eyebrow">{isNep?'DELETION CANDIDATES · SHELL GROUPING':'INSERTION CANDIDATES · SHELL GROUPING'}</p><h2 id="grouping-members-title">{g.title}</h2></div>
    <button onClick={onClose} autoFocus aria-label="Close group members">Close</button></div>
   <p>{g.paired_rows.toLocaleString()} paired with {isNep?'HGAB':'NEP'} · {(g.leftover_house_rows||0).toLocaleString()} unpaired HGAB rows worth {amount(g.leftover_amount_php||0)} · {(g.leftover_nep_rows||0).toLocaleString()} unpaired NEP rows worth {amount(g.leftover_nep_amount_php||0)} · {g.kind==='road'?'road corridor':'place shell'}</p>
   <p className="muted">Member rows reflect the final budget sheet: matched pairs collapsed to one HGAB-anchored record, unpaired rows carry their shell context. Shell context only — identity never certified.</p>
  </header>
  <div className="analytics-content group-projects-content">
   <SortableTable tableId="groupings-members" ariaLabel="Group member allocations" initialSort={{key:'amount_php',direction:'desc'}} rows={g.members} columns={[
     {key:'title',label:'Allocation',scope:'row',render:r=><span className="cell-main">{r.title}<small>{isNep?(r.attached?'paired with HGAB':'UNPAIRED NEP — deletion candidate'):(r.attached?`paired with NEP${r.delta_php!=null?` · Δ ${r.delta_php>0?'+':''}${amount(r.delta_php)}`:''}`:'UNPAIRED HGAB — insertion candidate')}</small></span>},
     {key:'amount_php',label:isNep?'NEP amount':'Final-sheet amount',align:'num',render:r=>amountCell(r.amount_php)},
     {key:'nep_amount_php',label:'Paired NEP amount',align:'num',render:r=>r.attached?amountCell(r.nep_amount_php??r.amount_php):<span>—</span>},
     {key:'length_m',label:'Length',align:'num',render:r=>fmtKm(r.length_m)},
     {key:'amount_per_km_php',label:'₱/km',align:'num',render:r=>perKm(r.amount_per_km_php)},
     {key:'chainages',label:'Spans',sortable:false,render:r=>(r.chainages||[]).map((c,i)=><small key={i}>{c.from}–{c.to}</small>)},
     {key:'open',label:'Open',sortable:false,render:r=><a href={routeHref('compare',{view:'projects',flag:isNep?'group_nep_leftover':'group_exhausted',q:r.id,record:r.id})}>Compare</a>},
    ]} empty="No members."/>
  </div>
 </dialog>;
}
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
function DifferenceAggregate({title,groups,onOpenGroup,tableId}){
 if(!groups?.length)return null;
 return <div className="aggregate-table"><h3>{title} · {groups.length.toLocaleString()} group{groups.length===1?'':'s'}</h3>
  <SortableTable tableId={tableId} ariaLabel={title} initialSort={{key:'net',direction:'desc'}} rows={groups.map(g=>({...g,id:g.raw||g.label}))} columns={[
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
 const millionRound=useMemo(()=>amounts.length?amounts.filter(v=>v%1e6===0).length/amounts.length:0,[amounts]);
 if(!amounts.length)return <p className="muted">No allocation records for this source.</p>;
 return <>
  <DimensionChips dim={dim} change={change}/>
  <div className="cards analysis-headlines">
   <article><h3>Allocation records</h3><strong>{amounts.length.toLocaleString()}</strong><p>{names[source]} · descriptive lenses only</p></article>
   <article><h3>Million-round share</h3><strong>{(millionRound*100).toFixed(1)}%</strong><p>Exact multiples of ₱1,000,000</p></article>
   <article><h3>Benford MAD</h3><strong>{ben.mad.toFixed(4)}</strong><p>Mean absolute deviation · first digit</p></article>
   <article><h3>Exact concentrations</h3><strong>{concentrations.length.toLocaleString()}</strong><p>Repeated amounts (≥5) by {dimensionTitle(dim==='overall'?'program':dim)}</p></article>
  </div>
  <p className="notice">These are descriptive lenses for targeting review, not fraud tests. Appropriations are policy numbers: round values are expected, and print conventions (thousands, memo amounts) can drive digit patterns. Benford conformity is not evidence of correctness, and deviation is not evidence of wrongdoing.</p>
  <section className="analysis-section"><h2>Rounding pattern</h2>
   <p className="muted">Share of {amounts.length.toLocaleString()} allocation records at each rounding granularity.</p>
   <SortableTable tableId="statistics-rounding" ariaLabel="Rounding pattern" initialSort={{key:'step',direction:'asc'}} rows={ladder} columns={[
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
   <SortableTable tableId="statistics-bands" ariaLabel="Value bands" initialSort={{key:'order',direction:'asc'}} rows={bands.map((b,i)=>({...b,id:`band-${i}`,order:i}))} columns={[
    {key:'label',label:'Band',scope:'row'},
    {key:'records',label:'Records',align:'num'},
    {key:'share',label:'Share',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
    {key:'amount_php',label:'Amount',align:'num',render:r=>amountCell(r.amount_php)},
   ]}/>
   </div><div>
   <SortableTable tableId="statistics-clusters" ariaLabel="K-means clusters" initialSort={{key:'share',direction:'desc'}} rows={clusters.map((c,i)=>({...c,id:`cluster-${i}`}))} columns={[
    {key:'center_php',label:'Cluster center',scope:'row',render:r=><span>{amount(r.center_php)}</span>},
    {key:'share',label:'Share of records',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
   ]}/>
   </div></div>
  </section>
  {dim!=='overall'&&deviants&&<section className="analysis-section"><h2>Deviant subsets · by {dimensionTitle(dim)}</h2>
   <p className="muted">Groups with at least 100 records, ranked by million-round share against the overall baseline ({(amounts.filter(v=>v%1e6===0).length/amounts.length*100).toFixed(1)}%).</p>
   <SortableTable tableId="statistics-deviants" ariaLabel="Deviant subsets" initialSort={{key:'deviation',direction:'desc'}} rows={deviants} columns={[
    {key:'label',label:'Group',scope:'row'},
    {key:'records',label:'Records',align:'num'},
    {key:'share',label:'Million-round share',align:'num',render:r=><span>{(r.share*100).toFixed(1)}%</span>},
    {key:'deviation',label:'vs overall',align:'num',render:r=><span className={r.deviation>0?'up':r.deviation<0?'down':''}>{r.deviation>=0?'+':''}{(r.deviation*100).toFixed(1)} pts</span>},
   ]}/>
  </section>}
  <section className="analysis-section"><h2>Exact repeated amounts · blanket fixed allocations</h2>
   <p className="muted">Where many line items share one exact peso value (≥5 repeats), grouped by {dimensionTitle(dim==='overall'?'program':dim)}.</p>
   {concentrations.length?<SortableTable tableId="statistics-concentrations" ariaLabel="Exact repeated amounts" initialSort={{key:'total_php',direction:'desc'}} rows={concentrations.map((e,i)=>({...e,id:`conc-${i}`}))} columns={[
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
