import React,{lazy,Suspense,useEffect,useState} from 'react';
import {loadData,siteUrl,sourceReference} from './data.js';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import {regionName} from './regionNames.js';
import ShareLink from './ShareLink.jsx';
import {PdfSourceLink} from './PdfSourceModal.jsx';
import LoadingModal from './LoadingModal.jsx';
import './Highlights.css';
import {hydrateHighlightDetails} from './highlightDetails.js';
const HighlightModal=lazy(()=>import('./HighlightModal.jsx'));

const number=value=>value.toLocaleString('en-PH');
const billion=value=>`₱${(value/1e9).toFixed(2)}B`;
const percent=(value,base)=>base?`${(100*value/base).toFixed(1)}%`:'unavailable';
const compare=params=>routeHref('compare',{view:'projects',region_match:'ignore',...params});
const agencies=['DPWH','DA Farm to Market Roads','NIA Irrigation','DOH Health Facilities','Total · DPWH coverage only'];
const exact=value=>`${number(value)} PHP`;
const fmrHref=(key='',params={})=>routeHref(key,params,'fmr');

function AllocationCell({value,change=false,href,note}){
 if(!value)return <span className="highlights-unavailable">Not covered</span>;
 const content=<><strong>{number(value.records)} allocation records</strong><span title={exact(value.amount_php)}>{change?'Change of ':'Worth '}{amount(value.amount_php)}</span>{note&&<small className="highlights-cell-note">{note}</small>}</>;
 return href?<a className="highlights-cell-link" href={href}>{content}</a>:<div className="highlights-cell-value">{content}</div>;
}

// Split buckets carry comparison rows and amounts only (no grouped member
// counts), so they render through a dedicated cell instead of AllocationCell.
function SplitCell({value}){
 if(!value)return <span className="highlights-unavailable">Not covered</span>;
 return <div className="highlights-cell-value"><strong>{number(value.comparison_rows)} comparison rows</strong><span title={exact(value.amount_php)}>Worth {amount(value.amount_php)}</span></div>;
}

function CoverageTable({data}){
 return <section className="analysis-section highlights-table-section" aria-labelledby="coverage-heading">
  <h2 id="coverage-heading">Budget coverage by stage</h2>
  <p>DPWH operations: <strong>{number(data.sources.nep.records)} NEP allocation records worth {billion(data.sources.nep.amount_php)}</strong>, compared with both House readings. Each stage is counted separately.</p>
  <div className="table-scroll" role="region" aria-label="Budget coverage table" tabIndex={0}>
   <table className="highlights-table"><caption>Source allocation records and amounts · operations, including local and foreign-assisted projects</caption>
    <thead><tr><th scope="col">Agency / infrastructure</th><th scope="col">NEP</th><th scope="col">HGAB 2nd</th><th scope="col">HGAB 3rd</th></tr></thead>
    <tbody>{agencies.map((agency,index)=>{
     const covered=index===0||index===agencies.length-1;
     return <tr key={agency} className={index===agencies.length-1?'highlights-total':''}><th scope="row">{agency}</th>
      {['nep','second','third'].map(side=><td key={side}><AllocationCell value={covered?data.sources[side]:null}/></td>)}
     </tr>;
    })}</tbody>
   </table>
  </div>
  <p className="muted">Coverage is DPWH only. Other agencies are unavailable, rather than zero. Counts are source allocation records, not independently verified or deduplicated projects across stages. Funding components and parent controls are not counted again. Operations exclude the overhead controls above them: NEP {amount(data.controls.nep_php)} and HGAB3 {amount(data.controls.third_php)} of General Administration and Support plus Support to Operations sit outside these tables. Full agency new appropriations: NEP {amount(data.agency.nep_php)}; both House readings {amount(data.agency.house_php)}.</p>
 </section>;
}

function ChangesTable({data}){
 const columns=[['insertions','Insertion candidates',false,compare({flag:'house_only',match:'no_match'})],['deletions','Deletion candidates',false,compare({flag:'nep_only'})],['increased','Increase of existing candidates',true,compare({flag:'amount_increase'})],['decreased','Decrease of existing candidates',true,compare({flag:'amount_decrease'})]];
 return <section className="analysis-section highlights-table-section" aria-labelledby="changes-heading">
  <h2 id="changes-heading">HGAB 3rd vs. NEP: candidate changes</h2>
  <p>House-only and NEP-only records, plus amount differences on attached candidate pairs. Select a DPWH figure to review the underlying records.</p>
  <div className="table-scroll" role="region" aria-label="HGAB 3rd versus NEP candidate changes" tabIndex={0}>
   <table className="highlights-table highlights-changes"><caption>Candidate changes · full allocations for insertions/deletions; absolute differences for increases/decreases</caption>
    <thead><tr><th scope="col">Agency / infrastructure</th>{columns.map(([key,label])=><th key={key} scope="col">{label}</th>)}<th scope="col">HGAB 3rd</th></tr></thead>
    <tbody>{agencies.map((agency,index)=>{
     const covered=index===0||index===agencies.length-1;
     return <tr key={agency} className={index===agencies.length-1?'highlights-total':''}><th scope="row">{agency}</th>
      {columns.map(([key,,change,href])=><td key={key}><AllocationCell value={covered?data.changes[key]:null} change={change} href={covered&&index===0?href:null}/></td>)}
      <td><AllocationCell value={covered?data.sources.third:null}/></td>
     </tr>;
    })}</tbody>
   </table>
  </div>
  <p className="muted">Insertions mean no attached NEP record; deletions mean no attached third-reading House record. Neither is a certified policy change. Only validated candidates are counted: rows with plausible-but-unverified counterparts are held out — {number(data.unresolved_insertions)} insertion rows and {number(data.deletion_split.suggested.comparison_rows)} deletion rows. Counts include grouped allocation members.</p>
  <div className="table-scroll highlights-splits" role="region" aria-label="Candidate ambiguity split" tabIndex={0}>
   <table className="highlights-table"><caption>Traceability split of the candidate columns · {number(data.traceability.rows)} rows worth {amount(data.traceability.amount_php)} cannot be matched line-to-line by title</caption>
    <thead><tr><th scope="col">Candidate column</th><th scope="col">No counterpart found</th><th scope="col">Plausible counterpart · unresolved</th><th scope="col">Total</th></tr></thead>
    <tbody>
     <tr><th scope="row">Insertion candidates</th>
      <td><SplitCell value={data.insertion_split.no_suggestion}/></td>
      <td><SplitCell value={data.insertion_split.unresolved}/></td>
      <td><AllocationCell value={data.changes_full.insertions}/></td></tr>
     <tr><th scope="row">Deletion candidates</th>
      <td><SplitCell value={data.deletion_split.no_suggestion}/></td>
      <td><SplitCell value={data.deletion_split.suggested}/></td>
      <td><AllocationCell value={data.changes_full.deletions}/></td></tr>
    </tbody>
   </table>
  </div>
  <div className="highlights-bridge highlights-traceability"><strong>{number(data.traceability.rows)} candidate rows worth {amount(data.traceability.amount_php)} cannot be traced line-to-line from NEP to House</strong><span>{number(data.insertion_split.unresolved.comparison_rows)} House lines ({amount(data.insertion_split.unresolved.amount_php)}) resemble existing NEP projects but were not paired; {number(data.deletion_split.suggested.comparison_rows)} NEP lines ({amount(data.deletion_split.suggested.amount_php)}) are named by unmatched House rows as possible re-titled replacements. Title continuity is broken for these items — the printed records alone do not say which NEP project they continue.</span><small>These rows are held out of the insertion and deletion columns above until verified, and they are excluded from the change reconciliation. Each one must be checked against the original printed pages before it is described as new, deleted or replaced. This is a property of the printed documents, not a defect in the review method.</small></div>
  <div className="highlights-bridge"><strong>Validated change reconciles to {amount(data.validated_net_php)}</strong><span>{amount(data.changes.insertions.amount_php)} − {amount(data.changes.deletions.amount_php)} + {amount(data.changes.increased.amount_php)} − {amount(data.changes.decreased.amount_php)} = {amount(data.validated_net_php)}</span><small>The full candidate bridge — including the {number(data.traceability.rows)} held rows — reconciles to the printed operations change of {amount(data.net_change_php)}. {number(data.changes.unchanged.records)} attached allocation records have unchanged amounts and are outside the four change columns. Amounts shown are rounded; the reconciliations use exact pesos.</small></div>
  <div className="highlights-bridge highlights-controls"><strong>Controls above the project layer are outside this bridge</strong><span>New appropriations minus operations (General Administration and Support + Support to Operations): NEP {amount(data.controls.nep_php)} · HGAB3 {amount(data.controls.third_php)} · change {amount(data.controls.delta_php)}.</span><small>The four candidate columns and the reconciliation cover named project and office allocations only. The agency total moves {amount(data.agency.house_php-data.agency.nep_php)} because this overhead layer also changes; those adjustments appear in no project row and need Volume I-B control review.</small></div>
 </section>;
}

function stories(data){
 const pap=prefix=>data.paps.find(row=>row.label.startsWith(prefix));
 const fap=pap('Foreign-assisted projects'),mpb=pap('BIP - Multi-Purpose'),access=pap('BIP - Access Roads'),drain=pap('Construction/ Maintenance of Flood'),river=pap('Construction/ Rehabilitation of Flood');
 const papDelta=p=>p.third_php-p.nep_php;
 const convergence=data.paps.filter(p=>p.program==='Convergence and Special Support Program').reduce((sum,p)=>sum+papDelta(p),0);
 const regionTop=data.regions.filter(r=>r.delta_php>0).slice(0,3),regionGain=regionTop.reduce((sum,r)=>sum+r.delta_php,0);
 const nonFapGain=(data.sources.third.amount_php-fap.third_php)-(data.sources.nep.amount_php-fap.nep_php);
 const deo=data.offices.third['District engineering offices (DEOs)'],priorDeo=data.offices.nep['District engineering offices (DEOs)'],central=data.offices.third['Central Office'];
 const added=data.reading.added,example=data.chainage.example,group=data.grouping;
 return [
  {id:'funding-shift',label:'Program controls',title:`${billion(data.agency.house_php-data.agency.nep_php)} agency increase masks a major funding shift`,
   evidence:`Foreign-assisted funding changes from ${billion(fap.nep_php)} to ${billion(fap.third_php)}, a reduction of ${billion(-papDelta(fap))}. Convergence and Special Support increases by ${billion(convergence)}.`,
   prompt:'Who proposed these changes? Do project readiness and implementation schedules explain them? Obtain amendment records before describing the parallel changes as a direct transfer.',href:compare({program:'fap'})},
  {id:'multi-purpose',label:'Printed PAP controls',title:`Multi-purpose building funding rises to ${billion(mpb.third_php)}`,
   evidence:`NEP ${billion(mpb.nep_php)} → HGAB3 ${billion(mpb.third_php)}: an increase of ${billion(papDelta(mpb))}, or ${percent(papDelta(mpb),mpb.nep_php)}. Access roads and bridges also increase by ${billion(papDelta(access))}.`,
   prompt:'Which buildings account for the increase? Who requested them, what services will they provide, and who will fund staffing and maintenance? Check completion projects against previous appropriations.',href:compare({q:mpb.label})},
  {id:'caloocan',label:'House reading records',title:`${number(added.comparison_rows)} third-reading additions total ${amount(added.amount_php)}`,
   evidence:`The added records are ${[...new Set(added.top.map(r=>r.title.includes('Caloocan')?'in Caloocan':r.region))].join(', ')}. Operations rise by ${amount(data.reading.delta_php)}, while the full agency total is unchanged.`,
   prompt:'Who sponsored the amendment? Why were these projects introduced at this stage, and what Support to Operations or right-of-way work was deferred?',href:compare({change:'third_only'})},
  {id:'flood-priorities',label:'Printed PAP controls',title:'Flood allocations shift toward drainage and away from major river basins',
   evidence:`Structures and drainage: ${billion(drain.nep_php)} → ${billion(drain.third_php)}. Major river basins and principal rivers: ${billion(river.nep_php)} → ${billion(river.third_php)}. These are the non-FAP categories.`,
   prompt:'Do the changes follow flood-risk assessments and basin plans? Are local drainage projects supported by adequate downstream capacity? Check foreign-assisted flood projects separately.',href:compare({program:'Flood Management Program'})},
  {id:'house-only',label:'Validated matching',title:`${billion(data.changes.insertions.amount_php)} in House allocations have no attached NEP record and no plausible counterpart`,
   evidence:`${number(data.changes.insertions.records)} third-reading allocation records are validated insertion candidates: ${number(data.insertion_split.no_suggestion.comparison_rows)} with no NEP suggestion (${billion(data.insertion_split.no_suggestion.amount_php)}). A further ${number(data.insertion_split.unresolved.comparison_rows)} resemble NEP projects yet stay unpaired (${billion(data.insertion_split.unresolved.amount_php)}); they are held out of the columns and the change reconciliation until verified. Unmatched titles do not establish new insertions.`,
   prompt:'Start with the largest allocations. Check printed NEP pages, alternative titles, changed locations and grouped allocations, then request amendment justifications for confirmed additions.',href:compare({flag:'house_only'})},
  {id:'groupings',label:'Provisional grouping · HGAB2',title:`${billion(group?.leftover_amount_php??0)} in unmatched allocations share corridors or places with matched projects`,
   evidence:group?`${number(group.leftover_house_rows)} unmatched second-reading allocations occur across ${number(group.exhausted_groups)} groups whose NEP counterparts are already attached elsewhere.${data.laoag?` Laoag includes ${number(data.laoag.records)} unmatched building allocations worth ${amount(data.laoag.amount_php)}.`:''}`:'Grouping evidence is unavailable in this build.',
   prompt:'Are these separate facilities, expanded scopes, phased projects or overlapping packages? Obtain coordinates, designs and procurement packages before alleging project splitting.',href:'#analysis?view=roadgroups'},
  {id:'regional-gains',label:'Source distributions · excludes FAP',title:`Three regions account for ${percent(regionGain,nonFapGain)} of the increase outside foreign-assisted projects`,
   evidence:`${regionTop.map(r=>`${regionName(r.label)}: +${billion(r.delta_php)}`).join('; ')}. Combined increase: ${billion(regionGain)}. Each source retains its own recorded regional assignment.`,
   prompt:'Which districts and project categories drive these gains? Compare allocations with population, infrastructure deficits, disaster exposure and implementation capacity. Map engineering districts to congressional districts separately.',href:'#analysis?view=overview&dim=region'},
  {id:'office-capacity',label:'Recorded office assignments',title:`District engineering office allocations increase by ${billion(deo.amount_php-priorDeo.amount_php)}`,
   evidence:`DEO allocations rise ${percent(deo.amount_php-priorDeo.amount_php,priorDeo.amount_php)} to ${billion(deo.amount_php)}. Central Office retains ${billion(central.amount_php)}, or ${percent(central.amount_php,data.sources.third.amount_php)} of House operations.`,
   prompt:'Which offices can deliver the additional workload? Who will procure and implement Central Office allocations, and where are their beneficiaries? Office assignment alone does not establish project location.',href:'#analysis?view=overview&dim=office'},
  {id:'shorter-works',label:'Provisional identity and parsed lengths',title:'Same budget, shorter listed works warrant engineering review',
   evidence:`${number(data.chainage.shorter_same_amount)} chainage candidate pairs have shorter parsed HGAB3 lengths with unchanged amounts, excluding flagged length anomalies.${example?` ${example.title}: ${amount(example.amount_php)} in both sources, ${number(example.nep_length_m)}m → ${number(example.house_length_m)}m.`:''}`,
   prompt:'Does the revised design involve more expensive works, a relocated segment or corrected stationing? Compare drawings and quantities before treating the implied cost increase as overpricing.',href:compare({match:'matched_chainage',...(example?{q:example.id,record:example.id}:{})}),example},
  {id:'rainwater',label:'Repeated office allocations',title:`₱${(data.rainwater.third.amount_php/1e9).toFixed(4)}B for rainwater collectors follows a repeated allocation pattern`,
   evidence:`Unchanged across NEP, HGAB2 and HGAB3: ${data.rainwater.third.bands.map(b=>`${number(b.records)} allocations of ${amount(b.amount_php)}`).join('; ')}. These are office-level allocations, not a count of individual collector systems.`,
   prompt:'How were the standard amounts set? Request the sites, number of systems, storage capacities, beneficiaries and unit-cost assumptions for each office. Do allocations reflect water scarcity, demand and available maintenance funding?',href:compare({q:'Rainwater Collector System'})},
 ];
}

export default function Highlights({route}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[details,setDetails]=useState(null),[detailError,setDetailError]=useState(''),[hashes,setHashes]=useState(null);
 useEffect(()=>{const controller=new AbortController();loadData('comparison_overview_2027.json',controller.signal).then(payload=>{
  if(!payload.highlights)throw new Error('Highlights are unavailable. Rebuild the comparison data.');
  setData(payload.highlights);
  setHashes(payload.input_sha256);
 }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 const selected=route.params.get('story');
 const story=data?stories(data).find(item=>item.id===selected):null;
 useEffect(()=>{
  if(!story||details||!hashes)return;
  const controller=new AbortController();setDetailError('');
  loadData('highlights_details_2027.json',controller.signal).then(payload=>{
   if(JSON.stringify(payload.input_sha256)!==JSON.stringify(hashes))throw new Error('The evidence and summary versions differ. Refresh the page to load the current data.');
   setDetails(hydrateHighlightDetails(payload));
  }).catch(e=>{if(e.name!=='AbortError')setDetailError(e.message);});
  return()=>controller.abort();
 },[story?.id,details,hashes]);
 function closeModal(){const params=Object.fromEntries(route.params);delete params.story;window.location.hash=routeHref('highlights',params);}
 if(error)return <p role="alert">{error}</p>;
 if(!data)return <p role="status">Loading highlights…</p>;
 return <div className="headline-analysis highlights-workspace">
  <section className="hero">
   <p className="eyebrow">DPWH · FY2027</p>
   <h1>Highlights</h1>
   <p>Ten media angles and investigative prompts, grounded in the retained budget records.</p>
   <div className="hero-actions"><ShareLink/></div>
   <p className="muted">These are budget proposals, not enacted spending. Printed controls and source distributions describe recorded amounts; project identities remain provisional. {number(data.provenance.reviewed_pairs)} cross-document pairs are manually certified. The tables compare operations; the first headline also uses full agency new appropriations.</p>
  </section>
  <CoverageTable data={data}/><ChangesTable data={data}/>
  <section aria-labelledby="story-heading"><h2 id="story-heading">Ten story angles</h2><p className="muted">Ranked by news value and strength of the retained evidence. Open a highlight for its figures, relevant records, and source references.</p>
   <ol className="highlights-stories">{stories(data).map(story=><li id={`highlight-${story.id}`} key={story.id} className={selected===story.id?'highlight-selected':''}>
    <article><p className="eyebrow">{story.label}</p><h3>{story.title}</h3><p>{story.evidence}</p><div className="highlight-prompt"><strong>Investigate</strong><p>{story.prompt}</p></div>
     <div className="highlight-links"><button className="highlight-open" aria-haspopup="dialog" onClick={()=>{window.location.hash=routeHref('highlights',{story:story.id});}}>Explore this highlight →</button><a href={routeHref('highlights',{story:story.id})}>Link to this highlight</a>
      {story.example&&[['nep',story.example.nep_page,'NEP'],['house-third',story.example.house_page,'HGAB3']].map(([key,page,label])=>{
       const ref=sourceReference(key,page,story.example.title);return <PdfSourceLink key={key} source={ref}>{label} PDF p.{page}</PdfSourceLink>;
      })}
     </div>
    </article>
   </li>)}</ol>
  </section>
  {story&&<Suspense fallback={<LoadingModal eyebrow={story.label} title={story.title} note="Opening highlight evidence…" onClose={closeModal}/>}><HighlightModal key={story.id} story={story} summary={data} payload={details} error={detailError} onClose={closeModal}/></Suspense>}
 </div>;
}
