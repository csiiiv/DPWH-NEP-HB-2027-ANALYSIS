import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {amount,programLabel} from './model.js';
import {analyticsSources,projectAnalytics,compareDistribution} from './projectAnalytics.js';
import {readingInfo,matchInfo,flagInfo} from './analyticsStatusInfo.js';
const sections=[['overview','Overview'],['distribution','Distribution'],['changes','Changes & matches'],['flags','Review flags']];
const human=value=>String(value ?? 'Unavailable').replaceAll('_',' ');
export default function ProjectAnalytics({rows,finding,onClose,returnFocus}) {
 const dialog=useRef(null),summary=useMemo(()=>projectAnalytics(rows),[rows]);
 const [tab,setTab]=useState('overview');
 const regions=useMemo(()=>compareDistribution(rows,'region'),[rows]);
 const offices=useMemo(()=>compareDistribution(rows,'office'),[rows]);
 useEffect(()=>{
  const element=dialog.current,previous=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return ()=>{element.close();document.body.style.overflow=previous;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
 },[]);
 const changed=rows.filter(r=>['third_only','second_only'].includes(r.reading_status) || r.reading_delta_php!=null && r.reading_delta_php!==0).length;
 const flagged=summary.flaggedRows;
 const filters=[finding.query && `Search: ${finding.query}`,finding.program && `Program: ${programLabel(finding.program)}`,finding.region && `Region: ${finding.region}`,finding.office && `Office: ${finding.office}`,finding.trace && `Match: ${matchInfo[finding.trace]?.[0] || human(finding.trace)}`,finding.readingStatus && `Reading: ${readingInfo[finding.readingStatus]?.[0] || human(finding.readingStatus)}`].filter(Boolean);
 function changeTab(next){setTab(next);dialog.current.querySelector('.analytics-content')?.scrollTo(0,0);}
 return <dialog ref={dialog} className="analytics-dialog" aria-labelledby="analytics-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
  if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left || e.clientX>b.right || e.clientY<b.top || e.clientY>b.bottom)onClose();
 }}>
  <header className="analytics-header">
   <div className="analytics-heading"><div><p className="eyebrow">FILTERED FINDING</p><h2 id="analytics-title">Project result analytics</h2></div><button onClick={onClose} autoFocus aria-label="Close analytics">Close</button></div>
   <p>{summary.count.toLocaleString()} filtered comparison rows · includes every results page.</p>
   <div className="analytics-filter-tags" aria-label="Applied analytics filters">{(filters.length?filters:['All project records']).map(text=><span key={text}>{text}</span>)}<span>{finding.regionMatching==='ignore'?'Region differences allowed and flagged':'Strict region matching'}</span></div>
   <nav className="analytics-tabs" role="tablist" aria-label="Analytics sections">{sections.map(([key,title],index)=><button key={key} id={`analytics-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls="analytics-panel" tabIndex={tab===key?0:-1} onClick={()=>changeTab(key)} onKeyDown={e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    const next=e.key==='Home'?0:e.key==='End'?sections.length-1:(index+(e.key==='ArrowRight'?1:-1)+sections.length)%sections.length;
    changeTab(sections[next][0]);e.currentTarget.parentElement.children[next].focus();
   }}>{title}{key==='flags' && <span className="analytics-tab-count">{flagged.toLocaleString()}</span>}</button>)}</nav>
  </header>
  <div className="analytics-content" id="analytics-panel" role="tabpanel" aria-labelledby={`analytics-tab-${tab}`} tabIndex={0}>
   {tab==='overview' && <>
    <div className="analytics-summary-cards"><Metric title="HGAB3 · 3rd reading" value={summary.totals.third.rows?amount(summary.totals.third.amount):'—'} note={`${summary.totals.third.rows.toLocaleString()} of ${summary.count.toLocaleString()} rows · ${summary.totals.third.records.toLocaleString()} allocation records`}/><Metric title="DBM NEP" value={summary.totals.nep.rows?amount(summary.totals.nep.amount):'—'} note={`${summary.totals.nep.rows.toLocaleString()} of ${summary.count.toLocaleString()} rows · ${summary.totals.nep.records.toLocaleString()} allocation records`}/><Metric title="HGAB3 − HGAB2" value={amount(summary.readingDelta)} note={`${changed.toLocaleString()} reading changes · recorded ledger delta`}/></div>
    <section className="analytics-card"><h3>Source coverage and totals</h3><p className="muted">Each source is counted independently. Unresolved House/NEP counterparts may occupy separate comparison rows for the same project. Allocation record counts refer to that source only; they are not added across stages. Grouped entries retain their member allocations.</p>
     <div className="table-scroll analytics-coverage" tabIndex={0} aria-label="Analytics source coverage"><table><thead><tr><th>Source</th><th>Comparison rows with source</th><th>Source allocation records</th><th>Allocation total</th></tr></thead><tbody>{analyticsSources.map(([key,name])=><tr key={key}><th scope="row">{name}</th><td data-label="Comparison rows with source">{summary.totals[key].rows.toLocaleString()} / {summary.count.toLocaleString()}</td><td data-label="Source allocation records">{summary.totals[key].records.toLocaleString()}</td><td data-label="Allocation total">{summary.totals[key].rows?amount(summary.totals[key].amount):'—'}</td></tr>)}</tbody></table></div>
    </section>
    <details className="analytics-method"><summary>How to read these metrics</summary><p>Comparison rows include named projects, coarser allocations and grouped entries. They are not deduplicated unique projects: unresolved suggested counterparts remain separate. Status counts describe rows, not certified insertions or removals. Source totals have different coverage and are never added together. Reading-only records and unmatched candidates do not certify policy insertions or removals. Review flags point to evidence to inspect, not fraud findings.</p><p>The House ledger delta treats a missing reading record as zero; an unavailable source total is displayed as a dash. FAP’s missing Transparency amounts reflect listing coverage.</p></details>
   </>}
   {tab==='distribution' && <>
    <p className="analytics-section-intro">House (HGAB3) and DBM NEP allocations shown side by side per group. Bars share one scale within a chart; each source is grouped by its own recorded region or office, so a source with a different recorded label for the same project is charted under its own label. Shares use each source’s own filtered total.</p>
    <div className="analytics-columns"><Distribution title="Region distribution" data={regions}/><Distribution title="Engineering office distribution" data={offices}/></div>
   </>}
   {tab==='changes' && <><p className="analytics-section-intro">House reading statuses compare HGAB2 with HGAB3. Cross-source statuses describe retained HGAB2/NEP candidate matches and any optional different-region joins. Select an info tag for its definition.</p><div className="analytics-columns"><Counts title="House reading status" entries={summary.changes} definitions={readingInfo}/><Counts title="Cross-source match status" entries={summary.matches} definitions={matchInfo}/></div></>}
   {tab==='flags' && <><p className="analytics-section-intro">{flagged.toLocaleString()} rows have at least one review flag. Categories can overlap, so their counts do not add up to a unique project total. These flags identify review needs.</p><Counts title="Review flags" entries={summary.flags} definitions={flagInfo} /></>}
  </div>
 </dialog>;
}
function Metric({title,value,note}){return <article><h3>{title}</h3><strong>{value}</strong><p>{note}</p></article>;}
function Distribution({title,data}) {
 const [expanded,setExpanded]=useState(false),limit=expanded?Infinity:8,shown=data.entries.slice(0,limit),max=data.entries.reduce((peak,group)=>Math.max(peak,group.hb,group.nep),0) || 1;
 return <section className="analytics-card"><h3>{title}</h3><p className="muted">{data.entries.length} recorded groups · ordered by larger of the two sources</p>{shown.length?<><div className="analytics-legend" aria-hidden="true"><span className="analytics-key analytics-key-hb"></span>House · HGAB3<span className="analytics-key analytics-key-nep"></span>DBM NEP</div><ul className="analytics-bars">{shown.map(group=><li key={group.label}><div className="analytics-bar-head"><span>{group.label}</span></div><div className="analytics-pair">
  <div className="analytics-pair-track"><span className="hb" style={{width:`${group.hb/max*100}%`}}/><small>HB {amount(group.hb)}</small></div>
  <div className="analytics-pair-track"><span className="nep" style={{width:`${group.nep/max*100}%`}}/><small>NEP {amount(group.nep)}</small></div>
 </div><small>{group.rows.toLocaleString()} rows with either source · HB {data.totals.hb?(group.hb/data.totals.hb*100).toFixed(1):'0.0'}% · NEP {data.totals.nep?(group.nep/data.totals.nep*100).toFixed(1):'0.0'}%</small></li>)}</ul></>:<p>No recorded allocations for these sources.</p>}{data.entries.length>8 && <button className="analytics-show-more" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show top 8':`Show all ${data.entries.length} groups`}</button>}</section>;
}
function Counts({title,entries,definitions}) {
 return <section className="analytics-card"><h3>{title}</h3><ul className="analytics-counts">{Object.entries(entries).sort((a,b)=>b[1]-a[1]).map(([key,count])=><Status key={key} title={definitions[key]?.[0] || human(key)} count={count} description={definitions[key]?.[1] || 'A retained source status; inspect the source record for its evidence and matching context.'}/>)}</ul></section>;
}
function Status({title,count,description}) {
 const [open,setOpen]=useState(false),id=useId();
 return <li><div className="analytics-status-row"><span>{title}<button className="analytics-info" aria-label={`About ${title}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} title={`Explain ${title}`}>i</button></span><strong>{count.toLocaleString()}</strong></div><p id={id} hidden={!open} className="analytics-status-description">{description}</p></li>;
}
