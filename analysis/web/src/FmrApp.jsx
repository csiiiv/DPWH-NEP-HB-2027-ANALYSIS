import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';import {siteUrl} from './data.js';
import {allocationStats, bandRows, compactMoney, comparisonRows, comparisonExportRows, comparisonFilterLabels, csvText,
  filterComparisons, filterProjects, fmrTabs, methodLabels, money, overviewRegionRows, pctChange, projectLengthKm,
  readingNote, roundingLadder, signedMoney, signedPct, sortRows, statusLabels, repeatedAmounts, AMOUNT_BANDS,
  candidateAggregates, formatKm, regionAllocationRows, sourcePath, sourceNode, sourceArithmetic, coordinateCategories,
  flagLabel, hadCoordinateInterpretation, provenanceOptionLists} from './fmrModel.js';
import {CoordinateBadge, CoordinateProvenance, FlagList} from './FmrProvenance.jsx';
import FmrRedFlags from './FmrRedFlags.jsx';
import './Fmr.css';
const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const FmrMap = lazy(() => import('./FmrMap.jsx'));

const routeParams = params => Object.fromEntries(params);
function navigate(route, patch) {
  const next = {...routeParams(route.params), ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = routeHref(route.key, next);
}
function download(name, headers, rows) {
  const url = URL.createObjectURL(new Blob([csvText(headers, rows)], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProjects(projects, stage) {
  download(`fmr-${stage}-filtered.csv`,
    ['source_id','region','title','amount_php','coordinate_status','segment_count','original_review_flags','normalization_rules','review_flags','coordinates_raw','source_pdf','pdf_page','printed_page'],
    projects.map(p => [p.id,p.region,p.title,p.amount_php,p.status,p.segment_count,
      (p.original_review_flags || []).join(';'),(p.normalization_rules || []).join(';'),(p.review_flags || []).join(';'),
      p.coordinates_raw,p.source.source_pdf,p.source.pdf_page,p.source.printed_page]));
}
export function Stat({label, value, detail}) {
  return <div className="fmr-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function Hero({title, children, actions, compact = false}) {
  return <section className={`hero${compact ? ' hero-compact' : ''}`}>
    <p className="fmr-eyebrow">FY2027 · Farm-to-market roads</p><h1>{title}</h1>{children}
    <div className="hero-actions">{actions}<ShareLink/></div>
  </section>;
}
function ReadingNote() {return <details className="fmr-method fmr-reading"><summary>House 2nd ↔ 3rd reading: FMR annex text identical</summary><p>{readingNote}</p><a href={siteUrl('other-analysis/FMR_HOUSE_PRINTED_TOTALS_COMPARISON.md')}>Read the bounded annex comparison</a></details>;}
function Amount({value, signed = false, exact = false}) {
  return <span title={signed ? signedMoney(value) : money(value)} className={signed ? value > 0 ? 'fmr-up' : value < 0 ? 'fmr-down' : '' : ''}>
    {exact ? money(value) : `${signed && value > 0 ? '+' : ''}${compactMoney(value)}`}</span>;
}
function PdfPane({source, onClose}) {
  const ref = useRef(null);
  return <aside ref={ref} id="fmr-inline-pdf" className="fmr-workspace-pdf" aria-label="Inline source PDF">
    <Suspense fallback={<p role="status">Loading PDF viewer…</p>}><PdfPreview source={source} onClose={onClose} closeLabel="Clear page selection" downloadOriginal autoFocusClose={false}/></Suspense>
  </aside>;
}
function previewSource(source, title) {
  return {url:siteUrl(source.source_pdf),document:source.source_pdf.split('/').pop(),title,page:source.pdf_page};
}
function jsonDownload(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
function Pagination({page, count, total, onPage, label}) {
  return <nav className="fmr-pagination" aria-label={`${label} pages`}><button disabled={page === 1} onClick={() => onPage(page-1)}>Previous</button>
    <span aria-live="polite">Page {page} of {count} · {total.toLocaleString()} rows</span><button disabled={page === count} onClick={() => onPage(page+1)}>Next</button></nav>;
}

function Dialog({label, onClose, children, className = ''}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>{children}</dialog>;
}
function SourceButton({source, onPdf, label}) {
  return <button className="fmr-source-button" onClick={() => onPdf(source)}>{label || `PDF p. ${source.pdf_page}`}<small>Printed p. {source.printed_page}</small></button>;
}
const FILTER_KEYS = ['q','region','status','direction','method','coordinate','coord_side','extraction','rule','review_flag','text_basis','category','amount','minAmount','maxAmount'];
// Chips and selects share one label source so a filter always reads the same way.
const FILTER_LABELS = {q:'Search', region:'Region', status:'Status', direction:'Amount direction', method:'Match method',
  coordinate:'Coordinate status', coord_side:'Source side', extraction:'Extraction flag', rule:'Interpretation rule',
  review_flag:'Remaining review flag', text_basis:'Coordinate text basis', category:'Category', amount:'Amount',
  minAmount:'Min total', maxAmount:'Max total'};
const COORDINATE_OPTIONS = [['normalized','Normalized'],['needs_review','Needs review'],['interpreted','Interpreted / flagged'],['multi','Multiple segments']];
const COORD_SIDE_OPTIONS = [['nep','NEP side'],['house','House side'],['both','Both sides']];
function changeFilters(route, patch) {navigate(route,{...patch,page:null});}
function Filters({route, regions, coordinate = false, comparison = false, review = false, fixedStatus, provenance}) {
  const params = routeParams(route.params);
  const clear = () => changeFilters(route, Object.fromEntries(FILTER_KEYS.map(k => [k,null])));
  const select = (key,label,options) => options?.length ? <label>{label}<select aria-label={label} value={params[key] || ''} onChange={e => changeFilters(route,{[key]:e.target.value})}>
    <option value="">All {label.toLowerCase()}</option>{options.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label> : null;
  const provenanceFilters = Boolean(provenance) && (comparison || coordinate);
  const labels = {
    status:{...comparisonFilterLabels,...Object.fromEntries(COORDINATE_OPTIONS)},
    direction:{increased:'Increased',decreased:'Decreased',unchanged:'Unchanged'},
    method:methodLabels,
    coordinate:Object.fromEntries(COORDINATE_OPTIONS),
    coord_side:Object.fromEntries(COORD_SIDE_OPTIONS),
    extraction:Object.fromEntries(provenance?.extraction || []),
    rule:Object.fromEntries(provenance?.rules || []),
    review_flag:Object.fromEntries(provenance?.review || []),
    text_basis:Object.fromEntries(provenance?.text_basis || []),
  };
  return <><div className="fmr-filters">
    <label>Search<input data-fmr-search type="search" placeholder="Title, place, source ID or flag" value={params.q || ''} onChange={e => changeFilters(route,{q:e.target.value})}/></label>
    {select('region','Region',regions.map(r => [r.key || r.id,r.label]))}
    {comparison && !fixedStatus ? select('status','Candidate status',Object.entries(comparisonFilterLabels).filter(([k]) => !['increased','decreased','unchanged'].includes(k))) : coordinate && !review && select('status','Coordinates',COORDINATE_OPTIONS)}
    {comparison && select('coordinate','Coordinate status',COORDINATE_OPTIONS)}
    <button onClick={clear}>Clear filters</button>
  </div>
  {provenanceFilters && <details className="fmr-method" open={FILTER_KEYS.some(k => ['direction','method','coord_side','extraction','rule','review_flag','text_basis'].includes(k) && params[k])}><summary>Provenance and advanced filters</summary><div className="fmr-filters">
    {comparison && (!fixedStatus || fixedStatus === 'changed') && select('direction','Amount direction',[['increased','Increased pairs'],['decreased','Decreased pairs'],['unchanged','Unchanged pairs']])}
    {comparison && select('method','Match method',Object.entries(methodLabels))}
    {comparison && select('coord_side','Source side',COORD_SIDE_OPTIONS)}
    {select('extraction','Extraction flag',provenance.extraction)}
    {select('rule','Interpretation rule',provenance.rules)}
    {select('review_flag','Remaining review flag',provenance.review)}
    {select('text_basis','Coordinate text basis',provenance.text_basis)}
  </div><p className="fmr-muted">{comparison
    ? 'Provenance filters match the selected source side (default: either side). Candidate identity and coordinate interpretation are separate checks.'
    : 'Extraction flags are pre-normalizer findings. Interpretation rules record how values were read. Remaining flags are still open after normalize.'}</p></details>}
  <div className="fmr-chips" aria-label="Active filters">{FILTER_KEYS.filter(k => params[k]).map(k => {
    const value = k === 'region' ? regions.find(r => (r.key || r.id) === params[k])?.label || params[k] : labels[k]?.[params[k]] || params[k].replaceAll('_',' ');
    return <span className="fmr-chip" key={k}>{FILTER_LABELS[k] || k}: {value}<button aria-label={`Remove ${FILTER_LABELS[k] || k} filter`} onClick={() => changeFilters(route,{[k]:null})}>×</button></span>;
  })}</div></>;
}
function ViewTabs({route, views, defaultView}) {
  const selected=route.params.get('view') || defaultView;
  return <nav className="view-tabs fmr-view-tabs" aria-label="Workspace views">{views.map(([key,label]) => <a key={key} href={routeHref(route.key,{...routeParams(route.params),view:key,page:'1',sort:'',dir:'',...(route.key === 'analysis' ? {status:'',category:'',records:'',rf_project:''} : key === 'review' ? {status:''} : {})})} aria-current={selected === key ? 'page' : undefined}>{label}</a>)}</nav>;
}
// PSGC: every project carries whole-corpus reverse-geocodes (PSA 2023) plus
// optional authored repair candidates on needs_review rows.
const psgcVerdictLabels = {
  AGREE: 'Matches title locality', PARTIAL: 'Province matches only', DISAGREE: 'Different locality', NO_MATCH: 'Outside PSGC coverage',
  ALL_POINTS_AGREE: 'All points match title', MIXED: 'Mixed point verdicts', AGREE_MUNI_BRGY_DIFFERS: 'Town matches; barangay differs',
  PARTIAL_PROVINCE_ONLY: 'Province only', NO_POINTS: 'No geocodable points',
};
function PsgcPanel({project}) {
  const points = project?.psgc;
  if (!points?.length && !project?.location_agreement) return null;
  const repairs = (points || []).filter(p => p.kind === 'candidate_repair');
  const printed = (points || []).filter(p => p.kind !== 'candidate_repair');
  const locality = project.title_locality;
  const localityLabel = locality
    ? [locality.municipality, locality.province].filter(Boolean).join(', ') + (locality.barangays?.length ? ` · ${locality.barangays.join(' / ')}` : locality.barangay ? ` · ${locality.barangay}` : '')
    : null;
  return <div className="fmr-psgc">
    <h3>PSGC administrative location</h3>
    <p className="fmr-muted">Printed endpoints reverse-geocoded against PSA 2023 PSGC shapefiles and compared with the locality parsed from the title. This is a review screen, not a certified site survey.</p>
    {project.location_agreement && <p><span className={`fmr-badge ${project.location_agreement === 'ALL_POINTS_AGREE' ? 'balanced' : 'review'}`}>{psgcVerdictLabels[project.location_agreement] || project.location_agreement.replaceAll('_', ' ')}</span>
      {localityLabel && <span className="fmr-muted"> · Title locality: {localityLabel}</span>}</p>}
    <table className="fmr-psgc-table"><caption className="sr-only">PSGC point verdicts</caption>
      <thead><tr><th scope="col">Point</th><th scope="col">Coordinates [lon, lat]</th><th scope="col">PSGC location</th><th scope="col">Verdict</th></tr></thead>
      <tbody>{printed.map(p => <tr key={p.point_id}><td>{p.point_id.split(':').slice(-1)[0]}{p.role ? ` · ${p.role}` : ''}</td>
        <td><code>{p.coordinates ? p.coordinates.join(', ') : '—'}</code></td>
        <td>{p.where || p.note || '—'}</td>
        <td><span className={`fmr-badge ${p.verdict === 'AGREE' ? 'balanced' : 'review'}`}>{psgcVerdictLabels[p.verdict] || p.verdict}</span></td></tr>)}
        {repairs.map(p => <tr key={`${p.point_id}-repair`} className="fmr-psgc-repair"><td>{p.point_id.split(':').slice(-1)[0]} · repair</td>
        <td><code>{p.coordinates.join(', ')}</code></td>
        <td>{p.where || '—'}</td>
        <td><span className={`fmr-badge ${p.verdict === 'AGREE' ? 'balanced' : 'review'}`}>{p.verdict === 'AGREE' ? 'Repair matches title' : psgcVerdictLabels[p.verdict]}</span></td></tr>)}
      </tbody></table>
    {repairs.length > 0 && <p className="fmr-muted">Repairs are authored hypotheses tied to this printed point; they are proposals, not accepted corrections.</p>}
  </div>;
}
function ProjectTable({projects, onSelect, onPdf, exact = false, label = 'FMR projects'}) {
  const columns = [
    {key:'title', label:'Project', render:p => <button className="fmr-text-button" onClick={() => onSelect(p.id)}>{p.title}</button>},
    {key:'region', label:'Region'},
    {key:'amount_php', label:'Allocation (PHP)', align:'num', render:p => <Amount value={p.amount_php} exact={exact}/>},
    {key:'status', label:'Coordinates', render:p => <CoordinateBadge project={p}/>},
    {key:'map', label:'Map', sortable:false, render:p => <a href={routeHref('map',{project:p.id})}>View on map</a>},
    {key:'source', label:'Source', value:p => p.source.pdf_page, render:p => <SourceButton source={p.source} onPdf={onPdf}/>},
  ];
  return <SortableTable rows={projects} columns={columns} initialSort={{key:'title',direction:'asc'}} ariaLabel={label} pageSize={25}/>;
}
// Compact metadata panel shown inside a dialog when a finding needs evidence context.
function FactPanel({facts}) {
  if (!facts.length) return null;
  return <div className="fmr-story-facts"><h3>Evidence</h3><dl>{facts.map((f,i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl></div>;
}

function Evidence({stage, node, project, onPdf}) {
  const checks = stage.control_checks.filter(c => c.annex_node_id === node.id);
  const arithmetic = sourceArithmetic(stage,node.id);
  return <section className="fmr-evidence" aria-label="Selected source evidence">
    <p className="fmr-eyebrow">{project ? 'Project evidence' : 'Printed control'}</p>
    <h2>{node.label}</h2><p className="fmr-evidence-amount">{money(node.printed_amount_php)}</p>
    <Breadcrumbs stage={stage} nodeId={node.id}/><code>{node.id}</code>
    {arithmetic && <dl className="fmr-arithmetic"><dt>Retained amount</dt><dd>{money(arithmetic.printed)}</dd><dt>Immediate child sum</dt><dd>{money(arithmetic.child_sum)}</dd><dt>Terminal project sum</dt><dd>{money(arithmetic.leaf_sum)}</dd><dt>Printed − child sum</dt><dd>{money(arithmetic.difference)}</dd><dt>Terminal projects</dt><dd>{arithmetic.leaf_count}</dd><dt>Arithmetic</dt><dd>{arithmetic.difference == null ? 'Project leaf' : arithmetic.difference === 0 ? 'Balanced' : 'Needs review'}</dd></dl>}
    <p><SourceButton source={node.source} onPdf={onPdf} label="Open source page"/></p>
    {project ? <>
      <a href={routeHref('map',{project:project.id})}>View on map</a>
      <CoordinateBadge project={project}/>
      <p>{project.segment_count} segment(s) · {project.point_count} point(s). The allocation belongs to this project once.</p>
      {project.review_flags.length > 0 && <div className="fmr-notice"><strong>Coordinate review remains open</strong><FlagList flags={project.review_flags} empty=""/></div>}
      <CoordinateProvenance project={project}/>
      <h3>Normalized segments</h3><p className="fmr-muted">Pairs are [longitude, latitude]. The source does not state a datum. Distances are straight-line endpoint checks.</p>
      {project.segments.map(s => <div className="fmr-segment" key={s.id}><strong>Segment {s.segment_index} · {s.section_label || 'unlabelled'}</strong>
        {(s.normalization_rules?.length > 0 || s.review_flags?.length > 0) && <small className="fmr-segment-meta">
          {s.normalization_rules?.length ? `Rules: ${s.normalization_rules.map(flagLabel).join('; ')}` : ''}
          {s.normalization_rules?.length && s.review_flags?.length ? ' · ' : ''}
          {s.review_flags?.length ? `Open: ${s.review_flags.map(flagLabel).join('; ')}` : ''}
        </small>}
        <pre>{JSON.stringify(s.coordinates)}</pre>
        <small>{s.straight_line_distance_km == null ? 'Distance unavailable' : `${formatKm(s.straight_line_distance_km)} between endpoints`}</small></div>)}
      <PsgcPanel project={project}/>
      {project.image_review && <div><h3>Rendered NEP evidence</h3><p>{project.image_review.note}</p><p>{project.image_review.finding?.replaceAll('_',' ')}</p>
        {project.image_review.rendered_evidence && <a href={siteUrl(`other-analysis/${project.image_review.rendered_evidence.path}`)} target="_blank" rel="noreferrer"><img className="fmr-review-image" src={siteUrl(`other-analysis/${project.image_review.rendered_evidence.path}`)} alt={`Reviewed source cell for ${project.title}`}/></a>}
      </div>}
    </> : <><p>Parent and child amounts describe the same money. Arithmetic above uses the full source branch, independently of active filters.</p>
      <h3>Independent control evidence</h3>{checks.map((c,i) => <p key={i}>{c.label}: {money(c.total_php)} · {c.passed ? 'Matches' : 'Needs review'} <SourceButton source={c.source} onPdf={onPdf}/></p>)}</>}
  </section>;
}
function SourceTree({stage, projects, selected, onSelect, exact}) {
  const [expanded, setExpanded] = useState(new Set());
  const treeRef = useRef(null);
  const keyboardSelect = id => {
    onSelect(id);
    requestAnimationFrame(() => [...(treeRef.current?.querySelectorAll('[data-node]') || [])].find(button => button.dataset.node === id)?.focus());
  };
  const projectIndex = useMemo(() => new Map(stage.projects.map(p => [p.id,p])), [stage]);
  const visibleIds = useMemo(() => new Set(projects.map(p => p.id)), [projects]);
  const selectedRegion = stage.regions.find(r => r.id === selected || r.project_ids.includes(selected));
  useEffect(() => {
    if (projects.length !== stage.projects.length) setExpanded(new Set(stage.regions.filter(r => r.project_ids.some(id => visibleIds.has(id))).map(r => r.id)));
  }, [projects,stage,visibleIds]);
  return <section ref={treeRef} className="fmr-tree" aria-label={`${stage.label} source tree`} onKeyDown={e => {
    if (!['ArrowRight','ArrowLeft','Enter'].includes(e.key) || !e.target.matches('.fmr-text-button')) return;
    const id=e.target.dataset.node, branch=stage.regions.find(r => r.id === id || r.project_ids.includes(id));
    e.preventDefault();
    if (e.key === 'ArrowLeft') {if (id === branch?.id) setExpanded(current => {const next=new Set(current);next.delete(branch.id);return next;});keyboardSelect(id === branch?.id ? stage.root.id : branch?.id || stage.root.id);}
    else if (e.key === 'ArrowRight') {if (branch) setExpanded(current => new Set([...current,branch.id]));if (id === stage.root.id) keyboardSelect(stage.regions.find(r => r.project_ids.some(x => visibleIds.has(x)))?.id || id);else if (id === branch?.id) keyboardSelect(branch.project_ids.find(x => visibleIds.has(x)) || id);}
    else keyboardSelect(id);
  }}>
    <div className={`fmr-tree-root ${selected === stage.root.id ? 'selected' : ''}`}>
      <button className="fmr-text-button" data-node={stage.root.id} onClick={() => onSelect(stage.root.id)}>{stage.root.label}</button><strong><Amount value={stage.root.printed_amount_php} exact={exact}/></strong>
      <small>Printed program → region → project · {projects.length} of {stage.projects.length} projects shown</small>
    </div>
    <div className="fmr-tree-controls"><button onClick={() => setExpanded(new Set(stage.regions.map(r => r.id)))}>Expand all regions</button><button onClick={() => {setExpanded(new Set()); onSelect(stage.root.id);}}>Collapse all regions</button></div>
    {stage.regions.map(region => {
      const children = region.project_ids.filter(id => visibleIds.has(id));
      if (!children.length) return null;
      const open = expanded.has(region.id) || selectedRegion?.id === region.id;
      return <div key={region.id} className="fmr-tree-region">
        <div className={`fmr-tree-row ${selected === region.id ? 'selected' : ''}`}>
          <button aria-label={`${open ? 'Collapse' : 'Expand'} ${region.label}`} aria-expanded={open} onClick={() => {
            setExpanded(current => {const next = new Set(current); if (open) next.delete(region.id); else next.add(region.id); return next;});
            if (open && selectedRegion?.id === region.id) onSelect(stage.root.id);
          }}>{open ? '−' : '+'}</button>
          <button className="fmr-text-button" data-node={region.id} onClick={() => onSelect(region.id)}>{region.label}<small>{children.length} of {region.project_ids.length} projects</small></button>
          <strong><Amount value={region.amount_php} exact={exact}/></strong>
        </div>
        {open && <ul>{children.map(id => {const p = projectIndex.get(id); return <li key={id} className={selected === id ? 'selected' : ''}>
          <button className="fmr-text-button" data-node={id} onClick={() => onSelect(id)}>{p.title}<small>{p.id} · {p.status === 'needs_review' ? 'Coordinate review' : `${p.segment_count} segment(s)`}</small></button><span><Amount value={p.amount_php} exact={exact}/></span>
        </li>;})}</ul>}
      </div>;
    })}
    {!projects.length && <p>No projects match these filters.</p>}
    <p className="fmr-muted">Control amounts stay at their full printed values when filtering. The filtered project total is shown above.</p>
  </section>;
}

function Breadcrumbs({stage, nodeId}) {
  return <nav className="fmr-breadcrumbs" aria-label="Source breadcrumbs">{sourcePath(stage,nodeId).map((node,i) => <React.Fragment key={node.id}>
    {i > 0 && <span className="sep">›</span>}<a href={routeHref(stage.key,{node:node.id,view:'tree'})}>{node.label}</a>
  </React.Fragment>)}</nav>;
}
function SourceWorkspace({data, route, onPdf, inlineSource}) {
  const stage=data.stages[route.key], view=route.params.get('view') || 'tree', filters=routeParams(route.params);
  const projects=useMemo(() => filterProjects(stage.projects,{...filters,status:view === 'review' ? 'needs_review' : filters.status}),
    [stage,filters.q,filters.region,filters.status,filters.category,filters.extraction,filters.rule,filters.review_flag,filters.text_basis,view]);
  const provenance=useMemo(() => provenanceOptionLists(stage.projects),[stage]);
  const nodeId=filters.node || stage.root.id, node=sourceNode(stage,nodeId), project=stage.projects.find(p => p.id === nodeId);
  const selectedSource=useMemo(() => node ? previewSource(node.source,stage.label) : null,[stage,nodeId]);
  const [exact,setExact]=useState(false), [panel,setPanel]=useState(filters.node ? 'evidence' : 'tree');
  const pdfRef=useRef(null),previousView=useRef(view);
  useEffect(() => {setPanel(previousView.current !== view && view !== 'tree' ? 'tree' : filters.node ? 'evidence' : 'tree');previousView.current=view;},[view,nodeId]);
  const onSelect=id => {navigate(route,{node:id,pdf:null,pdfPage:null});setPanel('evidence');};
  const scoped=filterProjects(stage.projects,{region:filters.region,status:'needs_review'}), queue=projects.filter(p => p.status === 'needs_review');
  const queueIndex=queue.findIndex(p => p.id === nodeId);
  const selectPdf=source => {onPdf(source); if(window.matchMedia('(max-width:1050px)').matches) pdfRef.current?.scrollIntoView({block:'start'});};
  useEffect(() => {const focusSearch=e => {if(e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();document.querySelector('[data-fmr-search]')?.focus();}};window.addEventListener('keydown',focusSearch);return () => window.removeEventListener('keydown',focusSearch);},[]);
  const resetWorkspace=() => {navigate(route,{view:'tree',node:null,pdf:null,pdfPage:null,...Object.fromEntries(FILTER_KEYS.map(k => [k,null]))});setPanel('tree');};
  return <>
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Source verification</p><h1>{stage.label}</h1><p>{stage.key === 'house' ? 'House FMR annex · supplied Volume I-B copy.' : 'Executive proposal · standalone FMR schedule, checked against NEP Volume I.'}</p></div><ShareLink/></div>
    {stage.key === 'house' && <ReadingNote/>}
    <div className="fmr-stats"><Stat label="Printed FMR allocation" value={<Amount value={stage.root.printed_amount_php}/>}/><Stat label="Source projects" value={stage.projects.length.toLocaleString()} detail={`${stage.regions.length} regions`}/><Stat label="Coordinate review" value={stage.summary.projects_needing_review} detail={`${stage.summary.multi_segment_projects} multi-segment projects`}/><Stat label="Balanced controls" value={`${stage.audit_summary.internal_control_checks} / ${stage.audit_summary.internal_control_checks}`} detail={`${stage.control_checks.length} independent checks pass`}/></div>
    <ViewTabs route={route} defaultView="tree" views={[["tree","Source tree"],["projects","Projects"],["review","Coordinate review"]]}/>
    <Filters route={route} regions={stage.regions} coordinate review={view === 'review'} provenance={provenance}/>
    {view === 'review' && <><div className="fmr-chips" aria-label="Coordinate review categories"><button aria-pressed={!filters.category} onClick={() => changeFilters(route,{category:null})}>All findings · {scoped.length}</button>{coordinateCategories(scoped).map(c => <button key={c.id} aria-pressed={filters.category === c.id} onClick={() => changeFilters(route,{category:c.id})}>{c.label} · {c.count}</button>)}</div><p className="fmr-muted">Categories overlap. Multiple segments alone are excluded from the review queue. Select a region to scope this queue.</p>
    <div className="fmr-queue-bar"><span>{queue.length ? `${queueIndex < 0 ? 'No item selected' : `Finding ${queueIndex+1} of ${queue.length}`} · ${queue.length} flagged projects` : 'No findings in this scope'}</span><button disabled={!queue.length} onClick={() => onSelect(queue[(queueIndex < 0 ? queue.length-1 : queueIndex-1+queue.length)%queue.length]?.id)}>Previous finding</button><button disabled={!queue.length} onClick={() => onSelect(queue[(queueIndex+1)%queue.length]?.id)}>Next finding</button></div><p className="fmr-muted">Next check: open evidence and read the provenance trail — pre-normalizer flags, interpretation rules applied, remaining flags, and each point’s source fragment → [lon, lat].</p></>}
    <div className="fmr-result-bar"><span>{projects.length.toLocaleString()} matching projects · <Amount value={allocationStats(projects).total}/></span><label><input type="checkbox" checked={exact} onChange={e => setExact(e.target.checked)}/> Exact PHP</label><button onClick={() => exportProjects(projects,stage.key)}>Export filtered CSV</button><a href={siteUrl(stage.metadata.source_pdf)} download>Download source PDF</a><button onClick={resetWorkspace}>Reset workspace</button></div>
    <div className="fmr-mobile-panels"><button aria-pressed={panel === 'tree'} onClick={() => setPanel('tree')}>Tree / results</button><button aria-pressed={panel === 'evidence'} onClick={() => setPanel('evidence')}>Selected evidence</button><button onClick={() => pdfRef.current?.scrollIntoView({block:'start'})}>Show source PDF</button></div>
    {['tree','projects','review'].includes(view) ? <div className="fmr-workspace-grid">
      <div className={`fmr-workspace-content mobile-${panel}`}><div className="fmr-source-results">{view === 'tree' ? <SourceTree stage={stage} projects={projects} selected={nodeId} onSelect={onSelect} exact={exact}/> : <ProjectTable projects={projects} onSelect={onSelect} onPdf={selectPdf} exact={exact}/>}</div>
        <div className="fmr-selected-evidence">{node ? <Evidence stage={stage} node={node} project={project} onPdf={selectPdf}/> : <p role="alert">Source ID not found. <button onClick={() => onSelect(stage.root.id)}>Select program control</button></p>}</div></div>
      <div ref={pdfRef}>{(inlineSource || selectedSource) && <PdfPane source={inlineSource || selectedSource} onClose={() => navigate(route,{pdf:null,pdfPage:null})}/>}</div>
    </div> : <p>Unknown view. <a href={routeHref(stage.key)}>Open source tree</a>.</p>}
  </>;
}

const COMPARISON_COLUMNS = [
  ['title','Project'],['region_key','Region'],['status','Candidate status'],['nep_php','NEP amount'],['house_php','House amount'],['delta_php','Paired difference'],['percent','Paired % change'],
];
function comparisonValue(row,key) {return key === 'percent' ? pctChange(row.house_php,row.nep_php) : row[key];}
function routeSort(route,keys,defaultKey='delta_php') {
  const requested=route.params.get('sort');
  return requested === 'none' ? null : {key:keys.includes(requested) ? requested : defaultKey,direction:route.params.get('dir') === 'asc' ? 'asc' : 'desc'};
}
function exportComparison(rows,format) {
  if(format === 'json') return jsonDownload('fmr-comparison-filtered.json',{scope:'Provisional project candidates; missing counterparts are null',rows:comparisonExportRows(rows)});
  download('fmr-comparison-filtered.csv',[
    'candidate_id','candidate_status','method','region',
    'nep_id','nep_title','nep_php','nep_coordinate_status','nep_original_review_flags','nep_normalization_rules','nep_review_flags','nep_text_basis','nep_source_pdf','nep_pdf_page','nep_printed_page',
    'house_id','house_title','house_php','house_coordinate_status','house_original_review_flags','house_normalization_rules','house_review_flags','house_text_basis','house_source_pdf','house_pdf_page','house_printed_page',
    'paired_delta_php','paired_percent_change'],
    rows.map(r => [
      r.id,r.status,r.method,r.region_key,
      r.nep_id,r.nep?.title,r.nep_php,r.nep?.status,(r.nep?.original_review_flags || []).join(';'),(r.nep?.normalization_rules || []).join(';'),(r.nep?.review_flags || []).join(';'),r.nep?.coordinate_text_basis || '',
      r.nep?.source.source_pdf,r.nep?.source.pdf_page,r.nep?.source.printed_page,
      r.house_id,r.house?.title,r.house_php,r.house?.status,(r.house?.original_review_flags || []).join(';'),(r.house?.normalization_rules || []).join(';'),(r.house?.review_flags || []).join(';'),r.house?.coordinate_text_basis || '',
      r.house?.source.source_pdf,r.house?.source.pdf_page,r.house?.source.printed_page,
      r.delta_php,pctChange(r.house_php,r.nep_php)]));
}
function ComparisonResults({rows, route, onPdf}) {
  const sort=routeSort(route,COMPARISON_COLUMNS.map(([k]) => k)), size=50;
  const sorted=sortRows(rows,r => comparisonValue(r,sort?.key),sort);
  const count=Math.max(1,Math.ceil(rows.length/size)), page=Math.min(Math.max(1,Math.floor(Number(route.params.get('page')) || 1)),count);
  const paged=sorted.slice((page-1)*size,page*size);
  const setSort=update => {const next=typeof update === 'function' ? update(sort) : update;navigate(route,{sort:next?.key || 'none',dir:next?.direction || null,page:null});};
  const setPage=update => navigate(route,{page:typeof update === 'function' ? update(page) : update});
  const amount=(r,stage) => <div className="fmr-amount-stack"><Amount value={r[`${stage}_php`]}/>{r[stage] && <SourceButton source={r[stage].source} onPdf={onPdf} label={`${stage === 'house' ? 'House' : 'NEP'} PDF p. ${r[stage].source.pdf_page}`}/>}</div>;
  return <>
    <div className="fmr-result-bar"><span>{rows.length.toLocaleString()} candidate / source-only rows</span><button onClick={() => exportComparison(rows,'csv')}>Export filtered CSV</button><button onClick={() => exportComparison(rows,'json')}>Export filtered JSON</button></div>
    <div className="fmr-mobile-sort"><label>Sort by<select aria-label="Sort by" value={sort?.key || 'none'} onChange={e => setSort(e.target.value === 'none' ? null : {key:e.target.value,direction:sort?.direction || 'desc'})}><option value="none">Source order</option>{COMPARISON_COLUMNS.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label><button onClick={() => setSort({key:sort?.key || 'delta_php',direction:sort?.direction === 'asc' ? 'desc' : 'asc'})}>{sort?.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button></div>
    <div className="fmr-mobile-table"><div className="fmr-table-desktop"><SortableTable rows={rows} sort={sort} onSortChange={setSort} page={page} onPageChange={setPage} pageSize={size} ariaLabel="FMR project candidates" columns={[
      {key:'title',label:'Project',render:r => <button className="fmr-text-button" onClick={() => navigate(route,{pair:r.id})}>{r.title}<small>{r.nep_id || 'No NEP counterpart'} · {r.house_id || 'No House counterpart'}</small></button>},
      {key:'map',label:'Map',sortable:false,render:r => <a href={routeHref('map',{pair:r.id})}>View on map</a>},
      {key:'region_key',label:'Region'}, {key:'status',label:'Status / method',render:r => <>{statusLabels[r.status]}<small>{methodLabels[r.method] || (r.ambiguous_title ? 'Repeated title; no unique counterpart' : 'No unique counterpart')}</small></>},
      {key:'nep_php',label:'NEP (PHP)',align:'num',render:r => amount(r,'nep')},
      {key:'house_php',label:'House (PHP)',align:'num',render:r => amount(r,'house')},
      {key:'delta_php',label:'Paired difference',align:'num',render:r => <Amount value={r.delta_php} signed/>},
      {key:'percent',label:'Paired % change',align:'num',value:r => pctChange(r.house_php,r.nep_php),render:r => signedPct(pctChange(r.house_php,r.nep_php))},
    ]}/></div>
    <div className="fmr-cards">{paged.map(r => <article key={r.id} className="fmr-card"><div className="fmr-card-head"><button className="fmr-text-button" onClick={() => navigate(route,{pair:r.id})}>{r.title}</button><span className="fmr-badge">{statusLabels[r.status]}</span></div>
      <p>{r.region_key} · {methodLabels[r.method] || 'No unique counterpart'}</p><dl><dt>NEP allocation</dt><dd><Amount value={r.nep_php}/></dd><dt>House allocation</dt><dd><Amount value={r.house_php}/></dd><dt>Paired difference</dt><dd><Amount value={r.delta_php} signed/></dd><dt>Paired % change</dt><dd>{signedPct(pctChange(r.house_php,r.nep_php))}</dd></dl>
      <div className="fmr-card-actions">{['nep','house'].map(stage => r[stage] && <React.Fragment key={stage}><SourceButton source={r[stage].source} onPdf={onPdf} label={`${stage === 'house' ? 'House' : 'NEP'} source`}/><a href={routeHref(stage,{node:r[stage].id})}>{stage === 'house' ? 'House' : 'NEP'} tree</a></React.Fragment>)}<a href={routeHref('map',{pair:r.id})}>View on map</a><button onClick={() => navigate(route,{pair:r.id})}>Open pair evidence</button></div>
    </article>)}{!paged.length && <p>No candidate rows match these filters.</p>}<Pagination page={page} count={count} total={rows.length} onPage={setPage} label="FMR project candidates"/></div></div>
  </>;
}
function RegionalTable({regions, onPdf, route}) {
  const rows=overviewRegionRows(regions), sort=route ? routeSort(route,['label','nep_php','house_php','delta_php','pct_alloc','nep_count','house_count','delta_projects']) : undefined;
  return <SortableTable rows={rows} sort={sort} onSortChange={route ? update => {const next=typeof update === 'function' ? update(sort) : update;navigate(route,{sort:next?.key || 'none',dir:next?.direction || null,page:null});} : undefined} ariaLabel="FMR regional stage comparison" initialSort={{key:'delta_php',direction:'desc'}} columns={[
    {key:'label',label:'Region',scope:'row',render:r => <a href={routeHref('compare',{view:'projects',region:r.id})}>{r.label}</a>},
    {key:'nep_count',label:'NEP',band:'records',bandLabel:'Source project counts',align:'num'},
    {key:'house_count',label:'House',band:'records',bandLabel:'Source project counts',align:'num'},
    {key:'delta_projects',label:'Difference',band:'records',bandLabel:'Source project counts',align:'num'},
    {key:'nep_php',label:'NEP (PHP)',divider:true,band:'allocations',bandLabel:'FMR allocations',align:'num',render:r => <div className="fmr-amount-stack"><Amount value={r.nep_php}/><SourceButton source={r.nep_source} onPdf={onPdf}/></div>},
    {key:'house_php',label:'House (PHP)',band:'allocations',bandLabel:'FMR allocations',align:'num',render:r => <div className="fmr-amount-stack"><Amount value={r.house_php}/><SourceButton source={r.house_source} onPdf={onPdf}/></div>},
    {key:'delta_php',label:'Difference',band:'allocations',bandLabel:'FMR allocations',align:'num',render:r => <Amount value={r.delta_php} signed/>},
    {key:'pct_alloc',label:'% change',band:'allocations',bandLabel:'FMR allocations',align:'num',render:r => signedPct(r.pct_alloc)},
  ]}/>;
}
function FilteredAnalytics({rows}) {
  const a=candidateAggregates(rows), nep=rows.reduce((s,r) => s+(r.nep_php || 0),0), house=rows.reduce((s,r) => s+(r.house_php || 0),0);
  return <details className="fmr-method"><summary>Show analytics · all {rows.length.toLocaleString()} filtered rows</summary>
    <div className="fmr-stats"><Stat label="NEP filtered allocation" value={<Amount value={nep}/>} detail={`${rows.filter(r => r.nep).length} source projects`}/><Stat label="House filtered allocation" value={<Amount value={house}/>} detail={`${rows.filter(r => r.house).length} source projects`}/><Stat label="Increased / decreased pairs" value={`${a.increased.count} / ${a.decreased.count}`} detail={`${compactMoney(a.increased.amount)} gains · ${compactMoney(a.decreased.amount)} reductions`}/><Stat label="Unchanged pairs" value={a.unchanged} detail={`${a.counts.house_only} House only · ${a.counts.nep_only} NEP only`}/></div>
    <p>Funding bridge: paired changes <Amount value={a.paired_delta_php} signed/> + House-only <Amount value={a.house_only_php}/> − NEP-only <Amount value={a.nep_only_php}/> = <Amount value={a.net_delta_php} signed/>.</p>
    <p>{rows.filter(r => [r.nep,r.house].some(p => p?.status === 'needs_review')).length} rows contain open coordinate review findings.
      {' '}{rows.filter(r => [r.nep,r.house].some(hadCoordinateInterpretation)).length} rows have extraction flags or interpretation rules on at least one side.</p>
  </details>;
}
function Compare({data, route, onPdf, inlineSource}) {
  const view=route.params.get('view') || 'regions', filters=routeParams(route.params);
  const [panel,setPanel]=useState('results');
  useEffect(() => {if(!inlineSource)setPanel('results');else if(window.matchMedia('(max-width:1050px)').matches)setPanel('pdf');},[inlineSource?.url,inlineSource?.page]);
  const allRows=useMemo(() => comparisonRows(data),[data]);
  const provenance=useMemo(() => provenanceOptionLists(allRows.flatMap(r => [r.nep, r.house].filter(Boolean))),[allRows]);
  const rows=useMemo(() => filterComparisons(allRows,filters),
    [allRows,filters.q,filters.region,filters.status,filters.direction,filters.method,filters.coordinate,filters.coord_side,filters.extraction,filters.rule,filters.review_flag,filters.text_basis]);
  const regions=data.regions.filter(r => (!filters.region || r.id === filters.region) && (!filters.q || `${r.label} ${r.id}`.toLowerCase().includes(filters.q.toLowerCase())));
  return <>
    <Hero title="Compare stages" compact><p>NEP → House GAB. Compare printed regional controls or investigate provisional project pairings.</p></Hero>
    <details className="fmr-method"><summary>Source scope, controls and downloads</summary><p>{data.matching_note}</p><ReadingNote/><p>Parent controls and project amounts represent the same money. Missing counterparts stay unavailable rather than zero.</p><div className="fmr-stats"><Stat label="Allocation difference" value={<Amount value={data.comparison_summary.delta_php} signed/>}/><Stat label="Candidate pairs" value={data.comparison_summary.counts.paired}/><Stat label="House only" value={data.comparison_summary.counts.house_only}/><Stat label="NEP only" value={data.comparison_summary.counts.nep_only}/></div></details>
    <ViewTabs route={route} defaultView="regions" views={[["regions","Regional controls"],["projects","Project candidates"]]}/>
    <Filters route={route} regions={data.regions} comparison={view === 'projects'} provenance={view === 'projects' ? provenance : null}/>
    {inlineSource && <div className="fmr-mobile-panels"><button aria-pressed={panel === 'results'} onClick={() => setPanel('results')}>Results</button><button aria-pressed={panel === 'pdf'} onClick={() => setPanel('pdf')}>Source PDF</button></div>}
    <div className={`${inlineSource ? 'fmr-workspace-grid ' : ''}fmr-comparison-workspace panel-${panel}`}><div className="fmr-comparison-results">
      {view === 'regions' ? <><div className="fmr-result-bar"><span>{regions.length} regional controls</span><button onClick={() => download('fmr-regional-controls.csv',['region','nep_projects','house_projects','nep_php','house_php','delta_php'],regions.map(r => [r.label,r.nep_count,r.house_count,r.nep_php,r.house_php,r.delta_php]))}>Export filtered CSV</button><button onClick={() => jsonDownload('fmr-regional-controls.json',regions)}>Export filtered JSON</button></div><RegionalTable regions={regions} onPdf={onPdf} route={route}/></> : view === 'projects' ? <><FilteredAnalytics rows={rows}/><ComparisonResults rows={rows} route={route} onPdf={onPdf}/></> : <p>Unknown comparison view. <a href={routeHref('compare')}>Open regional controls</a>.</p>}
    </div>{inlineSource && <PdfPane source={inlineSource} onClose={() => navigate(route,{pdf:null,pdfPage:null})}/>}</div>
  </>;
}
function PairEvidence({data, route, onPdf}) {
  const rows=useMemo(() => comparisonRows(data),[data]), id=route.params.get('pair'), selected=rows.find(r => r.id === id);
  if(!id) return null;
  if(!selected) return <p role="alert">Candidate ID not found. <button onClick={() => navigate(route,{pair:null})}>Clear selection</button></p>;
  return <Dialog label="Candidate pair evidence" onClose={() => navigate(route,{pair:null})}><div className="fmr-dialog-heading"><h2>{statusLabels[selected.status]}</h2><button onClick={() => navigate(route,{pair:null})}>Close candidate</button></div><p>{methodLabels[selected.method] || 'No unique counterpart established'} · Provisional project identity</p><p><a href={routeHref('map',{pair:selected.id})}>View on map</a></p><div className="fmr-pair-evidence">{['nep','house'].map(key => <div key={key}><h3>{data.stages[key].label}</h3>{selected[key] ? <><a href={routeHref(key,{node:selected[key].id})}>Open in source tree</a><Evidence stage={data.stages[key]} node={sourceNode(data.stages[key],selected[key].id)} project={selected[key]} onPdf={onPdf}/></> : <p>No unique source counterpart established.</p>}</div>)}</div></Dialog>;
}
function Home({data}) {
  const n=data.stages.nep,h=data.stages.house,agg=candidateAggregates(comparisonRows(data));
  const buckets=[['increased','Increased pairs',agg.increased.count,agg.increased.amount,'Candidate allocation gains'],['decreased','Decreased pairs',agg.decreased.count,agg.decreased.amount,'Candidate allocation reductions'],['house_only','House-only candidates',agg.counts.house_only,agg.house_only_php,'Unmatched House allocations'],['nep_only','NEP-only candidates',agg.counts.nep_only,agg.nep_only_php,'Unmatched NEP allocations']];
  return <>
    <Hero title="Follow the FMR budget" actions={<><a className="primary" href={routeHref('compare',{view:'projects'})}>Compare project candidates</a><a className="secondary" href={routeHref('analysis')}>Explore analysis</a><a className="secondary" href="#home">Open the DPWH workspace</a></>}><p>Follow FY2027 farm-to-market road allocations from the NEP proposal to the House FMR annex, with source trees and printed evidence for each project.</p></Hero>
    <div className="fmr-stats"><Stat label="DBM NEP" value={<Amount value={n.root.printed_amount_php}/>} detail={`${n.projects.length} source projects · ${n.regions.length} regions`}/><Stat label="House GAB" value={<Amount value={h.root.printed_amount_php}/>} detail={`${h.projects.length} source projects · ${h.regions.length} regions`}/><Stat label="Allocation difference" value={<Amount value={agg.net_delta_php} signed/>} detail={`${signedPct(pctChange(h.root.printed_amount_php,n.root.printed_amount_php))} over NEP`}/><Stat label="Project count difference" value={`+${h.projects.length-n.projects.length}`} detail="Source row count; candidate additions remain provisional"/></div>
    <h2>Choose a candidate population</h2><div className="fmr-stats candidate-cards">{buckets.map(([status,label,count,value,detail]) => <a key={status} className="fmr-candidate" href={routeHref('compare',{view:'projects',status})}><Stat label={label} value={`${count} ${count === 1 ? 'row' : 'rows'}`} detail={detail}/><strong><Amount value={value}/></strong><span>Inspect filtered records →</span></a>)}</div>
    <h2>Workbench directory</h2><ul className="home-directory">{[['house','House GAB','Review the printed program, region and project hierarchy.'],['nep','DBM NEP','Inspect the executive proposal and remaining coordinate findings.'],['compare','Compare stages','Compare controls and investigate project counterpart candidates.'],['map','Map','See every normalized segment on a national map.'],['highlights','Highlights','Read findings and open their supporting records.'],['analysis','Analysis','Explore regional allocations, adjustments and descriptive statistics.']].map(([key,title,body]) => <li key={key}><a href={routeHref(key)}><strong>{title} →</strong><span>{body}</span></a></li>)}</ul>
    <h2>Source verification</h2><div className="fmr-source-audits">{[n,h].map(stage => <section className="fmr-panel" key={stage.key}><h3>{stage.label}</h3><p>{stage.audit_summary.internal_control_checks} balanced annex controls · {stage.control_checks.length} independent checks pass.</p><p><strong>{stage.summary.projects_needing_review} remaining coordinate findings</strong> · {stage.summary.multi_segment_projects} multi-segment projects.</p><a href={routeHref(stage.key,{view:'review'})}>Review flagged source projects →</a></section>)}</div><ReadingNote/>
    <p className="fmr-notice">Coverage: DA locally funded FMR annex only. Each project allocation is counted once. Parent controls, office echoes and coordinate segments add no further funding.</p>
  </>;
}

function CoverageTables({data}) {
  const rows=comparisonRows(data), a=candidateAggregates(rows);
  const changes=[
    {id:'increased',label:'Paired increases',count:a.increased.count,php:a.increased.amount,status:'increased'},
    {id:'decreased',label:'Paired reductions',count:a.decreased.count,php:-a.decreased.amount,status:'decreased'},
    {id:'house_only',label:'House-only allocations',count:a.counts.house_only,php:a.house_only_php,status:'house_only'},
    {id:'nep_only',label:'NEP-only allocations',count:a.counts.nep_only,php:-a.nep_only_php,status:'nep_only'},
    {id:'unchanged',label:'Unchanged candidate pairs',count:a.unchanged,php:0,status:'unchanged'},
  ];
  return <><section className="fmr-section"><h2>Budget coverage by stage</h2><p className="fmr-muted">DA locally funded FMR annex. House 3rd-reading coverage uses the supplied 2nd-reading annex whose extracted text is identical across all 60 FMR pages.</p>
    <SortableTable rows={['nep','house'].map(key => ({id:key,stage:data.stages[key],label:key === 'house' ? 'House GAB · 3rd reading represented' : 'DBM NEP'}))} ariaLabel="FMR budget coverage by stage" initialSort={{key:'id',direction:'desc'}} columns={[
      {key:'label',label:'Budget stage',scope:'row',render:r => <a href={routeHref(r.id)}>{r.label}</a>},
      {key:'projects',label:'Source projects',align:'num',value:r => r.stage.projects.length},
      {key:'amount',label:'FMR allocation (PHP)',align:'num',value:r => r.stage.root.printed_amount_php,render:r => <Amount value={r.stage.root.printed_amount_php}/>},
      {key:'regions',label:'Regions',align:'num',value:r => r.stage.regions.length},
      {key:'controls',label:'Balanced controls',align:'num',value:r => r.stage.audit_summary.internal_control_checks},
      {key:'review',label:'Coordinate review',align:'num',value:r => r.stage.summary.projects_needing_review},
    ]}/></section>
    <section className="fmr-section"><h2>HGAB 3rd vs. NEP: candidate changes</h2><p className="fmr-muted">Counts describe comparison rows. Funding effects reconcile the independent stage totals; unmatched rows remain candidate observations.</p>
    <SortableTable rows={changes} ariaLabel="FMR candidate funding changes" initialSort={{key:'php',direction:'desc'}} columns={[
      {key:'label',label:'Candidate population',scope:'row',render:r => <a href={routeHref('compare',{view:'projects',status:r.status})}>{r.label}</a>},
      {key:'count',label:'Comparison rows',align:'num'},
      {key:'php',label:'Funding effect (PHP)',align:'num',render:r => <Amount value={r.php} signed/>},
    ]}/><p className="fmr-funding-bridge">Net funding change: <Amount value={a.paired_delta_php} signed/> paired + <Amount value={a.house_only_php}/> House only − <Amount value={a.nep_only_php}/> NEP only = <strong><Amount value={a.net_delta_php} signed/></strong>.</p></section></>;
}
function Highlights({data, route, onPdf}) {
  const summary=data.comparison_summary, largest=[...data.regions].sort((a,b) => b.delta_php-a.delta_php)[0], allRows=useMemo(() => comparisonRows(data),[data]);
  const cards=[
    {id:'control-increase',title:'FMR allocation increases',value:<Amount value={summary.delta_php} signed/>,body:'Difference between the two printed program controls.',prompt:'Which regional gains and reductions reconcile the increase?',href:routeHref('compare'),regions:data.regions},
    {id:'regional-increase',title:'Largest regional increase',value:<Amount value={largest.delta_php} signed/>,body:largest.label,prompt:'Which project candidates account for this regional movement?',href:routeHref('compare',{view:'projects',region:largest.id}),regions:[largest]},
    {id:'amount-changes',title:'Candidate amount changes',value:summary.changed_pairs,body:'One-to-one candidate pairs with different allocations.',prompt:'Do the titles and source pages support each candidate pairing?',href:routeHref('compare',{view:'projects',status:'changed'}),rows:filterComparisons(allRows,{status:'changed'})},
    {id:'house-only',title:'Unmatched House rows',value:summary.counts.house_only,body:'Source-only observations; project additions remain provisional.',prompt:'Which unmatched allocations need further counterpart review?',href:routeHref('compare',{view:'projects',status:'house_only'}),rows:filterComparisons(allRows,{status:'house_only'})},
    ...['nep','house'].map(stage => ({id:`${stage}-coordinates`,title:`${stage === 'nep' ? 'NEP' : 'House'} coordinate review`,value:data.stages[stage].summary.projects_needing_review,body:'Remaining source findings after coordinate interpretation.',prompt:'What does the printed coordinate cell say, and which reasons remain open?',href:routeHref(stage,{view:'review'}),stage,projects:data.stages[stage].projects.filter(p => p.status === 'needs_review')})),
    ...['nep','house'].map(stage => ({id:`${stage}-segments`,title:`${stage === 'nep' ? 'NEP' : 'House'} multiple segments`,value:data.stages[stage].summary.multi_segment_projects,body:'One project allocation can cover several coordinate segments.',prompt:'How are the segments represented without duplicating funding?',href:routeHref(stage,{view:'projects',status:'multi'}),stage,projects:data.stages[stage].projects.filter(p => p.segment_count > 1)})),
  ];
  const story=cards.find(c => c.id === route.params.get('story')), params=routeParams(route.params);
  const supportingProjects=story?.projects ? filterProjects(story.projects,params) : [], supportingRows=story?.rows ? filterComparisons(story.rows,params) : [];
  const supportingRegions=story?.regions?.filter(r => (!params.region || r.id === params.region) && (!params.q || r.label.toLowerCase().includes(params.q.toLowerCase()))) || [];
  const close=() => navigate(route,{story:null,sort:null,dir:null,page:null,...Object.fromEntries(FILTER_KEYS.map(k => [k,null]))});
  return <><Hero title="Highlights"><p>Follow the budget totals into candidate records and the printed pages behind each finding.</p></Hero><ReadingNote/><CoverageTables data={data}/>
    <h2>Findings to investigate</h2><div className="fmr-highlight-grid">{cards.map((c,i) => <article key={c.id} className="fmr-highlight"><p className="fmr-eyebrow">{String(i+1).padStart(2,'0')} · {c.regions ? 'Printed controls' : c.rows ? 'Candidate matching' : 'Coordinate evidence'}</p><h3>{c.title}</h3><strong>{c.value}</strong><p>{c.body}</p><p className="fmr-story-prompt">{c.prompt}</p><a href={routeHref('highlights',{story:c.id})}>Explore evidence →</a></article>)}</div>
    {story && <Dialog label={`Highlight evidence: ${story.title}`} className="fmr-story-dialog" onClose={close}><div className="fmr-dialog-heading"><h2>{story.title}</h2><button onClick={close}>Close evidence</button></div><div className="fmr-dialog-body">
      <FactPanel facts={[{label:'Key finding',value:story.value},{label:'Basis',value:story.body},{label:'Investigation question',value:story.prompt}]}/>
      <div className="fmr-story-actions"><a className="secondary" href={story.href}>Continue in the workbench</a><ShareLink/>{story.stage && <a href={siteUrl(data.stages[story.stage].metadata.source_pdf)} download>Download source PDF</a>}{story.regions && ['nep','house'].map(stage => <a key={stage} href={siteUrl(data.stages[stage].metadata.source_pdf)} download>Download {data.stages[stage].label} PDF</a>)}</div>
      <Filters route={route} regions={story.stage ? data.stages[story.stage].regions : data.regions} comparison={Boolean(story.rows)} coordinate={Boolean(story.projects)}
        provenance={provenanceOptionLists(story.projects || (story.rows || []).flatMap(r => [r.nep, r.house].filter(Boolean)))}/>
      {story.projects && <><div className="fmr-result-bar"><span>{supportingProjects.length} supporting source projects · <Amount value={allocationStats(supportingProjects).total}/></span><button onClick={() => exportProjects(supportingProjects,story.stage)}>Export filtered CSV</button></div><ProjectTable projects={supportingProjects} onSelect={id => {window.location.hash=routeHref(story.stage,{node:id});}} onPdf={onPdf}/></>}
      {story.rows && <><FilteredAnalytics rows={supportingRows}/><ComparisonResults rows={supportingRows} route={route} onPdf={onPdf}/></>}
      {story.regions && <><div className="fmr-result-bar"><span>{supportingRegions.length} supporting regional controls</span><button onClick={() => download('fmr-highlight-controls.csv',['region','nep_php','house_php','difference_php'],supportingRegions.map(r => [r.label,r.nep_php,r.house_php,r.delta_php]))}>Export filtered CSV</button></div><RegionalTable regions={supportingRegions} onPdf={onPdf}/></>}
    </div></Dialog>}
    {params.story && !story && <p role="alert">Finding not found. <button onClick={close}>Clear story selection</button></p>}
  </>;
}
const analysisViews=[['overview','Overview'],['red_flags','Red flags'],['house_candidates','House-only candidates'],['nep_candidates','NEP-only candidates'],['adjustments','Adjustments'],['coordinates','Coordinates'],['stats','Allocation statistics']];
const analysisQuestions={overview:'How are FMR allocations distributed across regions?',red_flags:'Which source projects warrant closer geometry, allocation and locality review?',house_candidates:'Which allocations have no unique NEP counterpart?',nep_candidates:'Which allocations have no unique House counterpart?',adjustments:'Which candidate pairs changed allocation?',coordinates:'Which coordinate interpretations still need review?',stats:'Which allocation patterns describe this source population?'};
function Analysis({data, route, onPdf}) {
  const params=routeParams(route.params), aliases={insertions:'house_candidates',deletions:'nep_candidates',statistics:'stats',chainage:'coordinates'};
  const view=aliases[params.view] || params.view || 'overview';
  const key=view === 'house_candidates' ? 'house' : view === 'nep_candidates' ? 'nep' : params.stage === 'house' ? 'house' : 'nep', stage=data.stages[key];
  const projects=useMemo(() => filterProjects(stage.projects,params),
    [stage,params.q,params.region,params.status,params.category,params.extraction,params.rule,params.review_flag,params.text_basis,params.amount,params.minAmount,params.maxAmount]);
  const stats=allocationStats(projects), regional=regionAllocationRows(projects,stage.regions);
  const allRows=useMemo(() => comparisonRows(data),[data]);
  const candidateStatus=view === 'house_candidates' ? 'house_only' : view === 'nep_candidates' ? 'nep_only' : 'changed';
  const candidateRows=useMemo(() => filterComparisons(allRows,{...params,status:candidateStatus}),
    [allRows,candidateStatus,params.q,params.region,params.direction,params.method,params.coordinate,params.coord_side,params.extraction,params.rule,params.review_flag,params.text_basis]);
  const candidateView=['house_candidates','nep_candidates','adjustments'].includes(view);
  const provenance=useMemo(() => provenanceOptionLists(candidateView
    ? allRows.flatMap(r => [r.nep, r.house].filter(Boolean))
    : stage.projects),[candidateView,allRows,stage]);
  const bands=bandRows(projects,'amount_php',AMOUNT_BANDS), repeats=repeatedAmounts(projects);
  const recordKey=params.records;
  let records=projects, recordLabel='Filtered source projects';
  if(recordKey?.startsWith('region:')) {const region=recordKey.slice(7);records=projects.filter(p => p.region_key === region);recordLabel=stage.regions.find(r => r.key === region)?.label || region;}
  if(recordKey?.startsWith('band:')) {const band=AMOUNT_BANDS[Number(recordKey.slice(5))];records=band ? projects.filter(p => p.amount_php >= band[0] && p.amount_php < band[1]) : [];recordLabel=band?.[2] || 'Unknown amount band';}
  if(recordKey?.startsWith('amount:')) {const amount=Number(recordKey.slice(7));records=projects.filter(p => p.amount_php === amount);recordLabel=money(amount);}
  const distributionMax=Math.max(1,...regional.map(r => r.total));
  const drill=records => navigate(route,{records});
  const measured=projects.filter(p => p.status === 'normalized' && p.segments.every(s => Number.isFinite(s.straight_line_distance_km)) && projectLengthKm(p) > 0).map(p => ({...p,distance:projectLengthKm(p)}));
  return <>
    <Hero title="Analysis" actions={candidateView
      ? <span className="hero-source">{view === 'house_candidates' ? 'House GAB · unmatched source rows' : view === 'nep_candidates' ? 'DBM NEP · unmatched source rows' : 'House GAB ↔ DBM NEP'}</span>
      : <label className="hero-source">Budget source<select value={key} onChange={e => navigate(route,{stage:e.target.value,records:null,category:null,page:null,rf_project:null})}><option value="nep">DBM NEP</option><option value="house">House GAB</option></select></label>}><p>Choose an analytical question, inspect its population, and follow aggregates into source records.</p></Hero>
    <ViewTabs route={route} defaultView="overview" views={analysisViews}/><h2 className="fmr-question">{analysisQuestions[view] || 'Source records'}</h2>
    <Filters route={route} regions={candidateView ? data.regions : stage.regions} coordinate={!candidateView} comparison={candidateView} fixedStatus={candidateView ? candidateStatus : undefined} provenance={provenance}/>
    {candidateView ? <><p className="fmr-muted">{candidateStatus === 'changed' ? 'Changed candidate pairs; source amounts and paired differences remain distinct.' : `Unmatched ${stage.label} source rows are candidates, not certified ${key === 'house' ? 'insertions' : 'deletions'}.`}</p>
      <FilteredAnalytics rows={candidateRows}/><section className="fmr-section"><h3>Regional candidate ranking</h3><SortableTable rows={data.regions.map(r => {const group=candidateRows.filter(p => p.region_key === r.id);return {id:r.id,label:r.label,count:group.length,total:group.reduce((s,p) => s+(candidateStatus === 'changed' ? p.delta_php : p[`${key}_php`]),0)};}).filter(r => r.count)} ariaLabel="FMR candidate regional ranking" initialSort={{key:'total',direction:'desc'}} columns={[
        {key:'label',label:'Region',scope:'row',render:r => <button className="fmr-text-button" onClick={() => changeFilters(route,{region:r.id})}>{r.label}</button>},{key:'count',label:'Candidate rows',align:'num'},
        {key:'total',label:candidateStatus === 'changed' ? 'Net paired difference (PHP)' : 'Unmatched allocation (PHP)',align:'num',render:r => <Amount value={r.total} signed={candidateStatus === 'changed'}/>},
      ]}/></section><ComparisonResults rows={candidateRows} route={route} onPdf={onPdf}/></> : <>
      <div className="fmr-stats"><Stat label="Filtered allocation" value={<Amount value={stats.total}/>} detail={`${stats.count} source projects`}/><Stat label="Median allocation" value={<Amount value={stats.median}/>}/><Stat label="Mean allocation" value={<Amount value={stats.mean == null ? null : Math.round(stats.mean)}/>} detail="Rounded to nearest peso"/><Stat label="Coordinate review" value={stats.review} detail={`${stats.multi} multi-segment projects`}/></div>
      <div className="fmr-result-bar"><span>{stage.label} · {projects.length} matching source projects</span>{view !== 'red_flags' && <><button onClick={() => exportProjects(projects,key)}>Export filtered CSV</button><button onClick={() => drill('all')}>Inspect source records</button></>}</div>
      {view === 'red_flags' ? <FmrRedFlags data={data} stage={stage} projects={projects} route={route} onChange={patch => navigate(route,patch)} onPdf={onPdf} onExportCSV={download} onExportJSON={jsonDownload}/> : view === 'overview' ? <>
        <section className="fmr-section"><h3>Regional stage comparison</h3><RegionalTable regions={data.regions.filter(r => !params.region || r.id === params.region)} onPdf={onPdf}/><p className="fmr-muted">Printed regional controls retain their full amounts. The selected-source distribution below uses every active project filter.</p></section>
        <section className="fmr-section"><h3>{stage.label}: filtered allocation distribution</h3><div className="fmr-distribution">{regional.map(r => <button key={r.key} onClick={() => drill(`region:${r.key}`)}><span>{r.label}</span><span className="fmr-bar-track"><span style={{width:`${r.total/distributionMax*100}%`}}/></span><strong><Amount value={r.total}/></strong><small>{r.count} projects · {stats.total ? (r.total/stats.total*100).toFixed(1) : '0.0'}%</small></button>)}</div>
        <SortableTable rows={regional} ariaLabel="FMR allocation overview" initialSort={{key:'total',direction:'desc'}} columns={[
          {key:'label',label:'Region',scope:'row',render:r => <button className="fmr-text-button" onClick={() => drill(`region:${r.key}`)}>{r.label} → records</button>},
          {key:'count',label:'Projects',align:'num'},{key:'total',label:'Allocation (PHP)',align:'num',render:r => <Amount value={r.total}/>},
          {key:'median',label:'Median (PHP)',align:'num',render:r => <Amount value={r.median}/>},{key:'min',label:'Smallest (PHP)',align:'num',render:r => <Amount value={r.min}/>},{key:'max',label:'Largest (PHP)',align:'num',render:r => <Amount value={r.max}/>},
          {key:'review',label:'Coordinate findings',align:'num'},
        ]}/></section>
      </> : view === 'stats' ? <>
        <p className="fmr-notice">These are descriptive patterns in recorded allocations. Repeated amounts and rounding do not establish pricing, implementation, or misconduct.</p>
        <section className="fmr-section"><h3>Allocation bands</h3><SortableTable rows={bands} ariaLabel="FMR allocation bands" columns={[
          {key:'label',label:'Allocation band',scope:'row',render:r => <button className="fmr-text-button" onClick={() => drill(`band:${r.id.slice(5)}`)}>{r.label} → records</button>},
          {key:'projects',label:'Source projects',align:'num'},{key:'total_php',label:'Allocation (PHP)',align:'num',render:r => <Amount value={r.total_php}/>},
          {key:'share',label:'Allocation share',align:'num',value:r => stats.total ? r.total_php/stats.total : 0,render:r => `${stats.total ? (r.total_php/stats.total*100).toFixed(1) : '0.0'}%`},
        ]}/></section>
        <section className="fmr-section"><h3>Rounding pattern</h3><SortableTable rows={roundingLadder(projects)} ariaLabel="Rounding ladder" initialSort={{key:'step',direction:'desc'}} columns={[
          {key:'label',label:'Coarsest matching granularity',scope:'row'},{key:'projects',label:'Source projects',align:'num'},{key:'total_php',label:'Allocation (PHP)',align:'num',render:r => <Amount value={r.total_php}/>},{key:'share',label:'Project share',align:'num',render:r => `${(r.share*100).toFixed(1)}%`},
        ]}/></section>
        <section className="fmr-section"><h3>Repeated exact allocations</h3><p className="fmr-muted">Amounts appearing on at least five source projects.</p><SortableTable rows={repeats} ariaLabel="Repeated amounts" initialSort={{key:'total_php',direction:'desc'}} columns={[
          {key:'amount_php',label:'Exact amount (PHP)',align:'num',render:r => <button className="fmr-text-button" onClick={() => drill(`amount:${r.amount_php}`)}>{money(r.amount_php)} → records</button>},{key:'projects',label:'Source projects',align:'num'},{key:'total_php',label:'Combined allocation (PHP)',align:'num',render:r => <Amount value={r.total_php}/>},
        ]}/></section>
        <section className="fmr-section"><h3>Largest allocations</h3><p>{stats.total ? (sortRows(projects,p => p.amount_php,{key:'amount_php',direction:'desc'}).slice(0,10).reduce((s,p) => s+p.amount_php,0)/stats.total*100).toFixed(1) : '0.0'}% of this population’s allocation is in its ten largest source projects.</p><ProjectTable projects={sortRows(projects,p => p.amount_php,{key:'amount_php',direction:'desc'}).slice(0,10)} onSelect={id => {window.location.hash=routeHref(key,{node:id});}} onPdf={onPdf}/></section>
      </> : view === 'coordinates' ? <>
        <section className="fmr-section"><h3>Coordinate population</h3><div className="fmr-stats"><Stat label="Normalized projects" value={projects.length-stats.review}/><Stat label="Flagged projects" value={stats.review}/><Stat label="Segments" value={projects.reduce((s,p) => s+p.segment_count,0)}/><Stat label="Points" value={projects.reduce((s,p) => s+p.point_count,0)}/></div><p>{stage.summary.original_flagged_projects_resolved ?? stage.summary.original_83_flagged_projects_resolved} originally flagged projects resolved by interpretation across the full stage; {stage.summary.image_reviewed_projects || 0} projects received rendered-cell review.</p>
        <div className="fmr-chips">{coordinateCategories(projects).map(c => <a className="secondary" key={c.id} href={routeHref(key,{view:'review',region:params.region || '',category:c.id})}>{c.label} · {c.count}</a>)}</div><a href={routeHref(key,{view:'review',region:params.region || ''})}>Open scoped coordinate review queue →</a></section>
        <p className="fmr-notice">Coordinates yield straight-line endpoint distances, not road chainage or constructed road length. No construction cost/km is calculated. Flagged coordinate interpretations are excluded from the distance diagnostics; point-only or missing endpoint pairs remain unavailable. The source does not state a datum.</p>
        <section className="fmr-section"><h3>Endpoint distance diagnostics</h3><p>{measured.length} normalized projects have measurable endpoint pairs; {projects.length-measured.length} projects are excluded. Multiple segments are summed per project solely for this diagnostic.</p><SortableTable rows={measured} ariaLabel="Endpoint distance diagnostics" pageSize={25} initialSort={{key:'distance',direction:'desc'}} columns={[
          {key:'title',label:'Project',render:p => <a href={routeHref(key,{node:p.id})}>{p.title}</a>},{key:'distance',label:'Summed endpoint distance',align:'num',render:p => formatKm(p.distance)},{key:'segment_count',label:'Segments',align:'num'},
          {key:'amount_php',label:'Project allocation (PHP)',align:'num',render:p => <Amount value={p.amount_php}/>},{key:'map',label:'Map',sortable:false,render:p => <a href={routeHref('map',{project:p.id})}>View on map</a>},{key:'source',label:'Source',value:p => p.source.pdf_page,render:p => <SourceButton source={p.source} onPdf={onPdf}/>},
        ]}/></section>
      </> : view === 'projects' ? <ProjectTable projects={projects} onSelect={id => {window.location.hash=routeHref(key,{node:id});}} onPdf={onPdf}/> : <p>Unknown view. <a href={routeHref('analysis')}>Open Overview</a>.</p>}
    </>}
    <ReadingNote/>
    {recordKey && <Dialog label="Analysis source records" onClose={() => navigate(route,{records:null})}><div className="fmr-dialog-heading"><h2>{stage.label} · {recordLabel}</h2><button onClick={() => navigate(route,{records:null})}>Close records</button></div><div className="fmr-result-bar"><span>{records.length} source projects · <Amount value={allocationStats(records).total}/></span><button onClick={() => exportProjects(records,key)}>Export filtered CSV</button><a href={routeHref('compare',{view:'projects',region:recordKey.startsWith('region:') ? recordKey.slice(7) : params.region || '',q:params.q || ''})}>Continue in Compare</a></div><ProjectTable projects={records} onSelect={id => {window.location.hash=routeHref(key,{node:id});}} onPdf={onPdf}/></Dialog>}
  </>;
}

export default function FmrApp({initialData = null} = {}) {
  const [route,setRoute] = useState(() => readRoute()), [data,setData] = useState(initialData), [error,setError] = useState('');
  useEffect(() => {const update = () => setRoute(readRoute()); window.addEventListener('hashchange',update); return () => window.removeEventListener('hashchange',update);}, []);
  useEffect(() => {if(initialData) return; const controller = new AbortController(); fetch(siteUrl('other-analysis/data/fmr_workbench.json'),{signal:controller.signal}).then(r => {if(!r.ok) throw Error(`Data request failed (${r.status})`); return r.json();}).then(d => {if(d.schema_version !== 1) throw Error('Unsupported FMR dataset'); setData(d);}).catch(e => {if(e.name !== 'AbortError') setError(e.message);}); return () => controller.abort();}, []);
  useEffect(() => {document.title = `${fmrTabs.find(t => t[0] === route.key)?.[1] || 'Unknown page'} · DA FMR FY2027`;}, [route.key]);
  const onPdf = source => navigate(route,{pdf:source.source_pdf,pdfPage:source.pdf_page});
  const pdfPath = route.params.get('pdf'), pageNumber = Number(route.params.get('pdfPage'));
  const pdfStage = data && Object.values(data.stages).find(s => [s.metadata.source_pdf,s.metadata.cross_volume_source_pdf].includes(pdfPath));
  const source = pdfStage && Number.isInteger(pageNumber) && pageNumber > 0 ? {url:siteUrl(pdfPath),document:pdfPath,title:`${pdfStage.label}${pdfStage.key === 'house' ? ' · supplied copy' : ''}`,page:pageNumber} : null;
  const inlineSource = source && !route.params.get('pair') && ['house','nep','compare'].includes(route.key) ? source : null;
  return <><a className="fmr-skip" href="#fmr-content" onClick={e => {e.preventDefault();document.getElementById('fmr-content')?.focus();}}>Skip to content</a><WorkbenchHeader route={route.key} workspace="fmr"/><main id="fmr-content" tabIndex={-1} className="shell fmr-main">
    {error ? <div role="alert"><h1>FMR data could not load</h1><p>{error}</p><p>Build the FMR dataset, then reload this page.</p><button onClick={() => window.location.reload()}>Reload</button></div> : !data ? <p role="status">Loading FMR sources…</p> :
      route.key === 'house' || route.key === 'nep' ? <SourceWorkspace key={route.key} data={data} route={route} onPdf={onPdf} inlineSource={inlineSource}/> :
      route.key === 'compare' ? <Compare data={data} route={route} onPdf={onPdf} inlineSource={inlineSource}/> :
      route.key === 'map' ? <Suspense fallback={<p role="status">Loading map…</p>}><FmrMap data={data} route={route}/></Suspense> :
      route.key === 'home' ? <Home data={data}/> :
      route.key === 'highlights' ? <Highlights data={data} route={route} onPdf={onPdf}/> :
      route.key === 'analysis' ? <Analysis data={data} route={route} onPdf={onPdf}/> :
      <><h1>Page not found</h1><a href={routeHref('home')}>Open FMR Home</a></>}
    {data && route.key !== 'map' && <PairEvidence data={data} route={route} onPdf={onPdf}/> }
    {source && !inlineSource && <Dialog label="FMR PDF source" className="fmr-pdf-dialog" onClose={() => navigate(route,{pdf:null,pdfPage:null})}><Suspense fallback={<p role="status">Loading PDF viewer…</p>}><PdfPreview source={source} onClose={() => navigate(route,{pdf:null,pdfPage:null})} closeLabel="Close PDF" downloadOriginal/></Suspense></Dialog>}
    {pdfPath && data && !source && <p role="alert">Unknown PDF source or invalid page. <button onClick={() => navigate(route,{pdf:null,pdfPage:null})}>Clear PDF selection</button></p>}
  </main><footer className="shell fmr-footer"><span>FY2027 FMR · DA locally funded annex</span><a href={siteUrl('other-analysis/README.md')}>Source documentation</a><a href={siteUrl('other-analysis/NEP_FMR_COORDINATE_REVIEW_FLAGS.md')}>NEP coordinate review</a><a href={siteUrl('other-analysis/FMR_COORDINATE_REVIEW_FLAGS.md')}>House coordinate review</a></footer></>;
}
