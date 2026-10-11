import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import {sourceReference} from './data.js';
import {regionName,officeName} from './regionNames.js';
import ShareLink from './ShareLink.jsx';
import {PdfSourceLink} from './PdfSourceModal.jsx';
import {openModalDialog} from './modalLifecycle.js';

const n=value=>value.toLocaleString('en-PH');
const pct=(value,base)=>base?`${(100*value/base).toFixed(1)}%`:'—';
const money=value=><span title={value==null?'Unavailable':`${n(value)} PHP`}>{amount(value)}</span>;
const signed=value=><span className={value>0?'up':value<0?'down':''}>{value>0?'+':''}{money(value)}</span>;
const php=(key,label)=>({key,label:`${label} (PHP)`,render:row=>money(row[key])});
const delta={key:'delta_php',label:'Change (PHP)',render:row=>signed(row.delta_php)};
const label={key:'label',label:'Category',render:row=>row.label};
const compare=id=>routeHref('compare',{view:'projects',region_match:'ignore',q:id,record:id});
const pap=(summary,prefix)=>summary.paps.find(row=>row.label.startsWith(prefix));

function PdfLink({kind,page,label}){
 const ref=sourceReference(kind,page);
 return <PdfSourceLink source={ref}>{label??`${kind==='nep'?'NEP':kind==='house-second'?'HGAB2':'HGAB3'} p.${page}`}</PdfSourceLink>;
}
function Sources({record,allStages=false}){
 return <span className="hi-source-links">{[['nep','nep'],...(allStages?[['second','house-second']]:[]),['third','house-third']].flatMap(([side,kind])=>{
  const value=record[side];
  const pages=new Set(value?.pdf_pages??(value?.pdf_page?[value.pdf_page]:(value?.records??[]).flatMap(r=>r.pdf_pages??(r.pdf_page?[r.pdf_page]:[]))));
  return [...pages].map(page=><PdfLink key={`${kind}-${page}`} kind={kind} page={page}/>);
 })}<a href={compare(record.id)}>Full comparison →</a></span>;
}
function download(rows,columns,id){
 const quote=value=>{let text=String(value??'');if(typeof value==='string'&&/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const csv=[columns.map(c=>c.label),...rows.map(row=>columns.map(c=>c.value?c.value(row):row[c.key]))].map(row=>row.map(quote).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=`dpwh-highlight-${id}.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function EvidenceTable({id,title,rows,columns,sortKey='delta_php',sortDirection='desc',search=false,description}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[sort,setSort]=useState({key:sortKey,direction:sortDirection});
 const filtered=useMemo(()=>{
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const result=rows.filter(row=>!terms.length||terms.every(term=>JSON.stringify(row).toLowerCase().includes(term)));
  const column=columns.find(c=>c.key===sort.key),value=row=>column?.value?column.value(row):row[sort.key];
  return result.sort((a,b)=>{
   const x=value(a),y=value(b),sign=sort.direction==='asc'?1:-1;
   if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
   return sign*(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}));
  });
 },[rows,columns,query,sort]);
 const current=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1)),visible=filtered.slice(current*25,current*25+25);
 return <section className="hi-panel">
  <div className="hi-panel-heading"><h3 id={`hi-table-${id}`}>{title}</h3><button onClick={()=>download(filtered,columns,id)} disabled={!filtered.length}>Export CSV</button></div>
  {description&&<p className="muted">{description}</p>}
  {search&&<label className="hi-search">Search these records<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Project, region, office or source ID"/></label>}
  <div className="hi-table-scroll" role="region" aria-label={title} tabIndex={0}>
   <table><thead><tr>{columns.map(c=><th key={c.key} scope="col" aria-sort={sort.key===c.key?(sort.direction==='asc'?'ascending':'descending'):'none'}>
    <button onClick={()=>{setSort({key:c.key,direction:sort.key===c.key&&sort.direction==='desc'?'asc':'desc'});setPage(0);}}>{c.label}{sort.key===c.key?(sort.direction==='asc'?' ▲':' ▼'):''}</button>
   </th>)}</tr></thead><tbody>{visible.map((row,i)=><tr key={row.id??row.label??i}>{columns.map((c,j)=>{
    const Tag=j===0?'th':'td';return <Tag key={c.key} scope={j===0?'row':undefined}>{c.render?c.render(row):(c.value?c.value(row):row[c.key])??'—'}</Tag>;
   })}</tr>)}</tbody></table>
   {!filtered.length&&<p>No records match this selection.</p>}
  </div>
  <div className="hi-pagination"><span>{filtered.length?`${n(current*25+1)}–${n(Math.min(current*25+25,filtered.length))}`:'0'} of {n(filtered.length)} rows{query&&` · ${n(rows.length)} before search`}</span>
   {filtered.length>25&&<div><button disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><button disabled={(current+1)*25>=filtered.length} onClick={()=>setPage(current+1)}>Next</button></div>}
  </div>
 </section>;
}
function ComparisonTable({id,title,rows,labelColumn=label,second=false,description}){
 return <EvidenceTable id={id} title={title} rows={rows} search={rows.length>25} description={description}
  columns={[labelColumn,php('nep_php','NEP'),...(second?[php('second_php','HGAB2')]:[]),php('third_php','HGAB3'),delta]}/>;
}
function RecordsTable({id,title,rows,reading=false,allStages=false}){
 const columns=[{key:'title',label:'Project / allocation',render:row=><span className="hi-record-title">{row.title}<small>{row.third?.region??row.nep?.region} · {officeName(row.third?.office??row.nep?.office)||'See member assignments'} · {row.suggestions?'Unresolved suggestions':row.nep&&row.third?'Candidate pair':row.third?'House-only candidate':'NEP-only candidate'}</small></span>},
  ...(reading?[{key:'second_php',label:'HGAB2 (PHP)',value:r=>r.second?.amount_php,render:r=>money(r.second?.amount_php)}]:[{key:'nep_php',label:'NEP (PHP)',value:r=>r.nep?.amount_php,render:r=>money(r.nep?.amount_php)}]),
  ...(allStages?[{key:'second_php',label:'HGAB2 (PHP)',value:r=>r.second?.amount_php,render:r=>money(r.second?.amount_php)}]:[]),
  {key:'third_php',label:'HGAB3 (PHP)',value:r=>r.third?.amount_php,render:r=>money(r.third?.amount_php)},
  {key:'delta_php',label:reading?'HGAB3 − HGAB2 (PHP)':'HGAB3 − NEP (PHP)',value:r=>reading?(r.third?.amount_php??0)-(r.second?.amount_php??0):r.third&&r.nep?r.third.amount_php-r.nep.amount_php:null,
   render:r=>reading?signed((r.third?.amount_php??0)-(r.second?.amount_php??0)):r.third&&r.nep?signed(r.third.amount_php-r.nep.amount_php):'Unpaired'},
  {key:'source',label:'Source evidence',value:r=>r.id,render:r=><Sources record={r} allStages={allStages}/>},
 ];
 return <EvidenceTable id={id} title={title} rows={rows} columns={columns} search sortKey={reading?'third_php':id==='fap-records'?'delta_php':'third_php'} sortDirection={id==='fap-records'?'asc':'desc'} description="All matching comparison rows are retained. Grouped rows contain multiple source allocations; source links and Full comparison retain member evidence."/>;
}
function ControlSources(){
 return <p className="hi-control-sources">Printed controls: <PdfLink kind="nep" page={8}/><PdfLink kind="house-tree" page={9} label="HGAB2 I-B p.9"/><PdfLink kind="house-third-controls" page={9} label="HGAB3 I-B p.9"/></p>;
}
function Hero({story,summary}){
 const fap=pap(summary,'Foreign-assisted'),mpb=pap(summary,'BIP - Multi-Purpose'),drain=pap(summary,'Construction/ Maintenance of Flood'),river=pap(summary,'Construction/ Rehabilitation of Flood');
 const cssp=summary.paps.filter(p=>p.program==='Convergence and Special Support Program').reduce((s,p)=>s+p.third_php-p.nep_php,0);
 const top=summary.regions.filter(r=>r.delta_php>0).slice(0,3).reduce((s,r)=>s+r.delta_php,0);
 const nonFap=summary.sources.third.amount_php-fap.third_php-summary.sources.nep.amount_php+fap.nep_php;
 const deo=summary.offices.third['District engineering offices (DEOs)'],prior=summary.offices.nep['District engineering offices (DEOs)'];
 const group=summary.grouping,example=summary.chainage.example;
 const metric=(label,value,note)=>({label,value,note});
 const content={
  'funding-shift':{kicker:'A small net change, large changes in composition',metrics:[metric('Agency increase',amount(summary.agency.house_php-summary.agency.nep_php),'New appropriations · NEP → HGAB3'),metric('Foreign-assisted reduction',amount(fap.nep_php-fap.third_php),'Printed FAP allocation'),metric('Convergence increase',amount(cssp),'Non-FAP program allocation')]},
  'multi-purpose':{kicker:'Where the additional building allocations appear',metrics:[metric('HGAB3 buildings',amount(mpb.third_php),'Multi-purpose facilities PAP'),metric('Additional funding',amount(mpb.third_php-mpb.nep_php),'Compared with the NEP'),metric('Increase',pct(mpb.third_php-mpb.nep_php,mpb.nep_php),'Printed controls, same PAP')]},
  caloocan:{kicker:'Follow the amendment between the two House readings',metrics:[metric('Added allocations',n(summary.reading.added.comparison_rows),'Third-reading-only comparison records'),metric('New allocations',amount(summary.reading.added.amount_php),'Added between the two House readings'),metric('Agency total change',amount(summary.reading.agency_delta_php),'HGAB2 → HGAB3 · offset within the budget')]},
  'flood-priorities':{kicker:'Two flood categories move in opposite directions',metrics:[metric('Drainage increase',amount(drain.third_php-drain.nep_php),'Non-FAP structures and drainage'),metric('River-basin reduction',amount(river.nep_php-river.third_php),'Non-FAP major river basins'),metric('River-basin HGAB3',amount(river.third_php),'Compare the foreign-assisted category below')]},
  'house-only':{kicker:'A validated review queue for allocations with no attached NEP counterpart',metrics:[metric('Validated insertion candidates',n(summary.changes.insertions.records),'Grouped allocation members; ambiguous rows held out'),metric('HGAB3 amount',amount(summary.changes.insertions.amount_php),'Full allocations, not amount differences'),metric('Held as unresolved',n(summary.unresolved_insertions),'Plausible NEP suggestions; excluded until verified')]},
  groupings:{kicker:'Examine the remaining allocations within the same corridor or place',metrics:[metric('Unmatched allocations',n(group?.leftover_house_rows??0),'HGAB2 source, not third-reading additions'),metric('Unmatched amount',amount(group?.leftover_amount_php),'Within exhausted-supply groups'),metric('Corridors / place groups',n(group?.exhausted_groups??0),'Grouping context, not certified project splits')]},
  'regional-gains':{kicker:'Compare regional gains within a consistent funding scope',metrics:[metric('Top three gains',amount(top),'Recorded regional assignments'),metric('Share of net increase',pct(top,nonFap),'Excludes foreign-assisted projects'),metric('All-region net increase',amount(nonFap),'NEP → HGAB3 outside FAP')]},
  'office-capacity':{kicker:'Follow the increase to the recorded implementing offices',metrics:[metric('Additional DEO allocations',amount(deo.amount_php-prior.amount_php),'NEP → HGAB3'),metric('DEO increase',pct(deo.amount_php-prior.amount_php,prior.amount_php),'All operations allocations'),metric('Central Office share',pct(summary.offices.third['Central Office'].amount_php,summary.sources.third.amount_php),'Office assignment does not locate beneficiaries')]},
  'shorter-works':{kicker:'Scope changes can be hidden behind unchanged amounts',metrics:[metric('Shorter candidate pairs',n(summary.chainage.shorter_same_amount),'Unchanged allocations; flagged lengths excluded'),metric('Example allocation',amount(example?.amount_php),'Panitan Bypass in the current snapshot'),metric('Example listed length',example?`${n(example.nep_length_m)}m → ${n(example.house_length_m)}m`:'—','NEP → HGAB3 · parsed station spans')]},
  rainwater:{kicker:'Follow the repeated amounts to the sites and systems they fund',metrics:[metric('Rainwater allocation',`₱${(summary.rainwater.third.amount_php/1e9).toFixed(4)}B`,'Unchanged across all three stages'),metric('Office allocation records',n(summary.rainwater.third.records),'Not a count of collector systems'),metric('Most common amount',amount(summary.rainwater.third.bands[0]?.amount_php),`${n(summary.rainwater.third.bands[0]?.records??0)} office allocations at this amount`)]},
 }[story.id];
 return <section className="hi-hero" data-theme={story.id} aria-label="Highlight key figures"><p>{content.kicker}</p><div className="hi-hero-metrics">{content.metrics.map(item=><article key={item.label}><h3>{item.label}</h3><strong>{item.value}</strong><span>{item.note}</span></article>)}</div></section>;
}

function FundingShift({detail,rows}){
 return <><ComparisonTable id="funding-controls" title="Agency change and operations reconciliation" rows={detail.controls} second description="Administration and support plus operations reproduce new appropriations. Automatic appropriations are excluded."/><ControlSources/>
  <ComparisonTable id="funding-programs" title="Program composition across stages" rows={detail.programs} second description="FAP is an exclusive category here, so foreign-assisted allocations are counted once."/>
  <RecordsTable id="fap-records" title="Foreign-assisted project candidates" rows={rows}/></>;
}
function Buildings({detail,rows}){
 return <><ComparisonTable id="building-regions" title="Multi-purpose buildings by recorded region" rows={detail.regions} labelColumn={{...label,label:'Region',render:r=>regionName(r.label)}}/>
  <ComparisonTable id="building-offices" title="Multi-purpose buildings by recorded office" rows={detail.offices} labelColumn={{...label,label:'Office',render:r=>officeName(r.label)}}/>
  <RecordsTable id="building-records" title="Multi-purpose building allocation records" rows={rows}/></>;
}
function Caloocan({detail,rows}){
 return <><EvidenceTable id="reading-controls" title="Where the reading amendment balances" rows={detail.controls} columns={[label,php('second_php','HGAB2'),php('third_php','HGAB3'),delta]}/><ControlSources/>
  <EvidenceTable id="reading-paps" title="PAPs changed between House readings" rows={detail.paps} columns={[{key:'label',label:'PAP'},php('second_php','HGAB2'),php('third_php','HGAB3'),delta]}/>
  <RecordsTable id="caloocan-records" title="The third-reading additions" rows={rows} reading/></>;
}
function FloodPriorities({detail,rows}){
 return <><ComparisonTable id="flood-controls" title="Flood funding categories, including FAP" rows={detail.paps} description="Foreign-assisted flood allocations are shown separately. They are included in the full flood-program total."/>
  <ComparisonTable id="flood-regions" title="Flood allocations by recorded region" rows={detail.regions} description="Includes FAP: Central Office/NCR assignments should not be treated as beneficiary geography." labelColumn={{...label,label:'Region',render:r=>regionName(r.label)}}/>
  <RecordsTable id="flood-records" title="Flood-program comparison records" rows={rows}/></>;
}
function HouseOnly({detail,rows}){
 const columns=[label,{key:'third_records',label:'HGAB3 allocation records'},php('third_php','HGAB3 allocations')];
 return <><EvidenceTable id="house-only-programs" title="House-only allocations by program" rows={detail.programs} columns={columns} sortKey="third_php"/>
  <EvidenceTable id="house-only-regions" title="House-only allocations by region" rows={detail.regions} columns={[{...label,label:'Region',render:r=>regionName(r.label)},...columns.slice(1)]} sortKey="third_php"/>
  <RecordsTable id="house-only-records" title="Unmatched HGAB3 records and unresolved suggestions" rows={rows}/></>;
}
function DetailDialog({title,label,kicker,theme,metrics,onClose,children}){
 const dialog=useRef(null),titleId=useId();
 useEffect(()=>openModalDialog(dialog.current),[]);
 return createPortal(<dialog ref={dialog} className="analytics-dialog highlight-dialog hi-detail-dialog" aria-labelledby={titleId}
  onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onClick={e=>{
   if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();
   if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom){e.stopPropagation();onClose();}
  }}>
  <header className="hi-dialog-header"><div><p className="eyebrow">{label}</p><h2 id={titleId}>{title}</h2></div><button autoFocus onClick={onClose} aria-label="Close detail">Back to highlight</button></header>
  <div className="hi-dialog-content"><section className="hi-hero" data-theme={theme} aria-label="Detail key figures"><p>{kicker}</p>
   <div className="hi-hero-metrics">{metrics.map(metric=><article key={metric.label}><h3>{metric.label}</h3><strong>{metric.value}</strong><span>{metric.note}</span></article>)}</div>
  </section>{children}</div>
 </dialog>,document.body);
}
function Groupings({detail}){
 const [selected,setSelected]=useState(null);
 const group=detail.groups.find(g=>g.id===selected);
 return <><EvidenceTable id="grouping-shells" title="Corridors and place groups with unmatched HGAB2 allocations" rows={detail.groups} search sortKey="leftover_amount_php" columns={[
  {key:'title',label:'Corridor / place',render:r=><button className="hi-drill" onClick={()=>setSelected(r.id)} aria-haspopup="dialog">{r.title}<span className="hi-drill-hint">View members ↗</span></button>},
  {key:'region',label:'Region',render:r=>regionName(r.region)},{key:'leftover_house_rows',label:'Unmatched allocations'},php('leftover_amount_php','Unmatched HGAB2'),php('nep_amount_php','NEP group'),php('house_amount_php','HGAB2 group')
 ]} description="Open a corridor or place to inspect its allocations in a detail modal. A shared shell can describe different works; amounts and common locations do not establish identity."/>
 {group&&<DetailDialog key={group.id} title={`Group members: ${group.title}`} label="Corridor / place allocations · HGAB2" theme="groupings" kicker={`${regionName(group.region)} · ${n(group.leftover_house_rows)} unmatched HGAB2 allocations`} onClose={()=>setSelected(null)} metrics={[
  {label:'NEP group',value:money(group.nep_amount_php),note:'Recorded NEP allocations in this group'},
  {label:'HGAB2 group',value:money(group.house_amount_php),note:'Second-reading group total'},
  {label:'Unmatched HGAB2',value:money(group.leftover_amount_php),note:'Candidate allocations to investigate'},
 ]}>
 <EvidenceTable id="grouping-members" title="Allocation members" rows={group.members} search sortKey="amount_php" description={`${group.paired_rows} attached candidate pairs; ${group.leftover_house_rows} unmatched HGAB2 allocations. Shared locations and amounts do not certify project identity.`} columns={[
  {key:'title',label:'Allocation / project',render:r=><span className="hi-record-title">{r.title}<small>{r.attached?'Attached candidate pair':r.store==='nep_rows'?'NEP-only candidate':'Unmatched HGAB2 candidate'}</small></span>},php('amount_php','Recorded allocation'),php('nep_amount_php','Attached NEP'),
  {key:'source',label:'Source evidence',value:r=>r.pdf_page,render:r=><span className="hi-source-links"><PdfLink kind={r.store==='nep_rows'?'nep':'house-second'} page={r.pdf_page}/>{r.comparison_id&&<a href={compare(r.comparison_id)}>Full comparison →</a>}</span>}
 ]}/></DetailDialog>}</>;
}
function Regions({detail}){
 const [selected,setSelected]=useState(null);
 const region=detail.regions.find(r=>r.label===selected);
 return <><EvidenceTable id="regional-gains" title="Regional allocations outside FAP" rows={detail.regions} columns={[
  {...label,label:'Region',render:r=><button className="hi-drill" aria-haspopup="dialog" onClick={()=>setSelected(r.label)}>{regionName(r.label)}<span className="hi-drill-hint">View PAP breakdown ↗</span></button>},php('nep_php','NEP'),php('third_php','HGAB3'),delta,
  {key:'share',label:'Increase (%)',value:r=>r.nep_php?100*r.delta_php/r.nep_php:null,render:r=>pct(r.delta_php,r.nep_php)}
 ]} description="Open a region to see its PAP breakdown in a detail modal. Each source uses its own assignment; FAP is excluded from both sides."/>
  {region&&<DetailDialog key={selected} title={`PAP changes: ${regionName(selected)}`} label="Regional gains · PAP breakdown" theme="regional-gains" kicker="Regional allocations outside foreign-assisted projects" onClose={()=>setSelected(null)} metrics={[
   {label:'NEP allocation',value:money(region.nep_php),note:'Recorded regional assignment'},
   {label:'HGAB3 allocation',value:money(region.third_php),note:'Third-reading regional assignment'},
   {label:'Change',value:<>{region.delta_php>0?'+':''}{money(region.delta_php)}</>,note:`${pct(region.delta_php,region.nep_php)} versus NEP`},
  ]}>
   <ComparisonTable id="regional-paps" title="PAP allocation changes" rows={detail.regional_paps[selected]??[]} description="Each stage retains its own recorded region. FAP is excluded from both stages; these are budget allocations, not implemented spending."/>
  </DetailDialog>}</>;
}
function Offices({detail}){
 return <><ComparisonTable id="office-kinds" title="Central Office, DEOs and other office categories" rows={detail.kinds} description="All operations allocations, including FAP. This describes recorded office assignments, not final procurement responsibility or beneficiary location."/>
  <ComparisonTable id="deo-offices" title="District engineering office allocations" rows={detail.offices} labelColumn={{...label,label:'District engineering office',render:r=>officeName(r.label)}}/></>;
}
function ShorterWorks({detail}){
 const example=detail.rows.find(r=>r.title.includes('Panitan'))??detail.rows[0];
 return <>{example&&<section className="hi-panel hi-worked-example"><h3>Worked example: {example.title}</h3><div><p><strong>NEP</strong><span>{example.nep_spans}</span><span>{n(example.nep_length_m)} metres · {money(example.nep_per_km)} / km</span><PdfLink kind="nep" page={example.nep_page}/></p>
  <p><strong>HGAB3</strong><span>{example.house_spans}</span><span>{n(example.house_length_m)} metres · {money(example.house_per_km)} / km</span><PdfLink kind="house-third" page={example.house_page}/></p></div>
  <p className="muted">Same recorded allocation: {money(example.amount_php)}. Allocation divided by listed length is a screening ratio; drawings, quantities and work type are required to assess engineering costs.</p></section>}
  <EvidenceTable id="shorter-records" title="Unchanged-amount candidates with shorter listed coverage" rows={detail.rows} search sortKey="length_delta_pct" sortDirection="asc" columns={[
   {key:'title',label:'Project / allocation',render:r=><span className="hi-record-title">{r.title}<small>NEP: {r.nep_spans}<br/>HGAB3: {r.house_spans}</small></span>},php('amount_php','Same allocation'),{key:'nep_length_m',label:'NEP metres'},{key:'house_length_m',label:'HGAB3 metres'},
   {key:'length_delta_pct',label:'Length change (%)',render:r=>`${r.length_delta_pct.toFixed(1)}%`},php('nep_per_km','NEP per km'),php('house_per_km','HGAB3 per km'),
   {key:'source',label:'Source evidence',value:r=>r.id,render:r=><span className="hi-source-links"><PdfLink kind="nep" page={r.nep_page}/><PdfLink kind="house-third" page={r.house_page}/><a href={compare(r.id)}>Full comparison →</a></span>}
  ]} description="Only attached chainage candidates with equal NEP/HGAB3 amounts and usable unflagged lengths. Repaired or absurd spans are excluded. Re-segmentation or changed works may explain the difference."/></>;
}
function Rainwater({detail,rows}){
 return <><ComparisonTable id="rainwater-controls" title="Rainwater Collector System across budget stages" rows={detail.controls} second description="The printed PAP control is unchanged. Office-level allocations below reproduce the control; they do not identify the individual systems to be built."/>
  <p className="hi-control-sources">Printed PAP: <PdfLink kind="nep" page={detail.controls[0]?.nep_page}/><PdfLink kind="house-second" page={detail.controls[0]?.second_pages?.[0]}/><PdfLink kind="house-third" page={detail.controls[0]?.third_pages?.[0]}/></p>
  <EvidenceTable id="rainwater-bands" title="Repeated rainwater allocation amounts" rows={detail.bands} sortKey="third_records" columns={[
   php('amount_php','Amount per office allocation'),{key:'nep_records',label:'NEP records'},{key:'second_records',label:'HGAB2 records'},{key:'third_records',label:'HGAB3 records'},php('third_php','HGAB3 total in band')
  ]} description="Repeated amounts are a screening lead. They may reflect standard packages; obtain the site list, capacity specifications and cost assumptions before assessing adequacy."/>
  <ComparisonTable id="rainwater-regions" title="Rainwater allocations by recorded region" rows={detail.regions} labelColumn={{...label,label:'Region',render:r=>regionName(r.label)}}/>
  <RecordsTable id="rainwater-records" title="All rainwater office allocation records" rows={rows} allStages/>
 </>;
}
const bodies={'funding-shift':FundingShift,'multi-purpose':Buildings,caloocan:Caloocan,'flood-priorities':FloodPriorities,'house-only':HouseOnly,groupings:Groupings,'regional-gains':Regions,'office-capacity':Offices,'shorter-works':ShorterWorks,rainwater:Rainwater};

export default function HighlightModal({story,summary,payload,error,onClose}){
 const dialog=useRef(null);
 useEffect(()=>openModalDialog(dialog.current),[]);
 const detail=payload?.stories[story.id],Body=bodies[story.id];
 const rows=useMemo(()=>detail?.record_ids?.map(index=>payload.records[index])??[],[detail,payload]);
 return <dialog ref={dialog} className="analytics-dialog highlight-dialog" aria-labelledby="highlight-dialog-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
  if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();
 }}>
  <header className="hi-dialog-header"><div><p className="eyebrow">{story.label}</p><h2 id="highlight-dialog-title">{story.title}</h2></div><button autoFocus onClick={onClose} aria-label="Close highlight">Close</button></header>
  <div className="hi-dialog-content"><Hero story={story} summary={summary}/>
   <div className="hi-dialog-actions"><ShareLink/><a href={story.href}>Open full workbench evidence →</a></div>
   <p className="hi-basis">{story.evidence}</p>
   {error?<p role="alert">{error}</p>:!detail?<p role="status">Loading relevant evidence…</p>:<Body detail={detail} rows={rows}/>}
   <section className="hi-panel highlight-prompt"><h3>Investigative questions</h3><p>{story.prompt}</p></section>
   <p className="muted">Budget proposals only. Cross-document project matches remain provisional. PDF file pages are one-based. Counts refer to source allocations or comparison rows as labeled; parent controls and funding components are not additional projects.</p>
  </div>
 </dialog>;
}
