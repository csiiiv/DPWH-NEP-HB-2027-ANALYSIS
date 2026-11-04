import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {CoordinateProvenance} from './FmrProvenance.jsx';
import SortableTable from './SortableTable.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {money, flagLabel} from './fmrModel.js';
import {buildFmrRedFlags, collapseIdenticalFmrReviews, sharedCoordinateEvidence, RED_FLAG_RULES, RED_FLAG_MEASUREMENT_NOTE} from './fmrRedFlags.js';

const FmrSegmentModal = lazy(() => import('./FmrSegmentModal.jsx'));

const format = value => value == null ? '—' : value.toLocaleString('en-PH', {maximumFractionDigits:2});
const fields = [['rf_short_m','shortMeters','Short section below (m)',1],['rf_long_km','longKm','Long section above (km)',1],
  ['rf_cost_multiple','costMultiple','Minimum peer-median multiple',1],['rf_increase_pct','increasePercent','Candidate increase at least (%)',0]];
const ruleLabels = Object.fromEntries(RED_FLAG_RULES.map(rule => [rule.id, rule.label]));


function SharedCoordinatesTable({data,row,onPdf}) {
  const records=sharedCoordinateEvidence(data,row);
  return <div style={{overflowX:'auto'}}>
    <p className="fmr-muted">Original coordinates in {data.stages[row.stageKey].label}. Matching sections are labelled Shared; reversed endpoint order also matches. Coordinates are [longitude, latitude], without rounding.</p>
    <table className="fmr-provenance-table">
      <caption>Current project and projects sharing section coordinates</caption>
      <thead><tr><th scope="col">Record</th><th scope="col">Project title</th><th scope="col">Section coordinates [lon, lat]</th><th scope="col">PDF evidence</th></tr></thead>
      <tbody>{records.map(({project,current,segments})=><tr key={project.id}>
        <th scope="row">{current ? 'Current project' : 'Shared-coordinate project'}<br/><code>{project.id}</code></th>
        <td>{project.title}<br/>{money(project.amount_php)}</td>
        <td>{segments.map((segment,index)=><div key={segment.id || index} style={{marginBottom:8}}>
          <strong>{segment.section_label || `Section ${index+1}`}{segment.shared ? ' · Shared' : ' · Other section'}</strong>
          {(segment.coordinates || []).map((pair,i)=><div key={i}><code>{i===0 ? 'Start' : i===segment.coordinates.length-1 ? 'End' : `Point ${i+1}`}: [{pair.map(value=>value == null ? 'Unavailable' : String(value)).join(', ')}]</code></div>)}
          {!segment.coordinates?.length && <span>Coordinates unavailable</span>}
        </div>)}</td>
        <td><button type="button" className="fmr-redflag-pdf" onClick={()=>onPdf(project.source)}>{project.source.source_pdf} · PDF p. {project.source.pdf_page}</button>
          <small>Printed page: {project.source.printed_page ?? 'Unavailable'}</small>
          <a href={routeHref(row.stageKey,{node:project.id})}>Source record →</a></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Evidence({row:entry, data, onClose, onPdf, onMap}) {
  const [sourceId,setSourceId] = useState(entry.id);
  const row = entry.members?.find(member=>member.id===sourceId) || entry;
  const stage = data.stages[row.stageKey];
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className="fmr-dialog fmr-redflag-dialog" aria-label="Red-flag evidence" onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{row.project.title}</h2><button onClick={onClose}>Close review</button></div>
    {entry.members?.length > 1 && <label>Evidence source<select value={sourceId} onChange={e=>setSourceId(e.target.value)}>
      {entry.members.map(member=><option key={member.id} value={member.id}>{data.stages[member.stageKey].label} · {member.id}</option>)}
    </select></label>}
    <p>{stage.label} · {row.id} · {money(row.project.amount_php)} · <strong>{row.reviewStatus}</strong></p>
    <p className="fmr-muted">{RED_FLAG_MEASUREMENT_NOTE}</p>
    <p className="fmr-notice">Source findings and metrics use original retained coordinates. Accepted corrected results are assessed separately; a correction does not remove a source-document finding.</p>
    <dl className="fmr-redflag-metrics">
      <dt>Summed endpoint spans</dt><dd>{format(row.meters)} m</dd>
      <dt>Shortest / longest section</dt><dd>{format(row.shortestMeters)} / {format(row.longestMeters)} m</dd>
      <dt>Allocation per endpoint meter</dt><dd>{row.proxyPhpPerMeter == null ? 'Unavailable: incomplete, repeated, zero-length or unresolved geometry' : `${money(row.proxyPhpPerMeter)} / m`}</dd>
      <dt>Peer baseline</dt><dd>{row.benchmark ? `${row.benchmark.scope} · ${row.benchmark.count} eligible projects · median ${money(row.benchmark.median)} / m` : 'Fewer than 20 eligible projects: no rate-outlier flag assigned'}</dd>
    </dl>
    {row.hasCorrection && <section className="fmr-provenance" aria-label="Accepted corrected results">
      <h3>Accepted corrected results</h3>
      <p>Summed endpoint spans: <strong>{format(row.corrected.meters)} m</strong> · shortest / longest section: {format(row.corrected.shortestMeters)} / {format(row.corrected.longestMeters)} m</p>
      <p>Allocation per endpoint meter: {row.corrected.proxyPhpPerMeter == null ? 'Unavailable' : money(row.corrected.proxyPhpPerMeter)} · remaining analytical findings: {row.openFlags.length}</p>
      {row.openFlags.length > 0 && <ul>{row.openFlags.map(flag => <li key={flag.id}><strong>{ruleLabels[flag.id]}</strong> · {flag.detail}</li>)}</ul>}
    </section>}
    {row.hasCorrection && <section className="fmr-provenance" aria-label="Correction history">
      <h3>Corrected coordinates · retained for reference</h3>
      <p>Accepted corrections are retained below alongside the original source text. Source-document findings remain listed even after a correction resolves them.</p>
      {row.correction.rules.length > 0 && <p>Accepted corrections: {row.correction.rules.map(flagLabel).join('; ')}</p>}
      {row.correction.clearedFlags.length > 0 && <p>Earlier findings: {row.correction.clearedFlags.map(flagLabel).join('; ')}</p>}
      {row.correction.textCorrected && <p>The reviewed transcription differs from the original extraction.</p>}
    </section>}
    <section aria-label="Coordinates used for review" className="fmr-provenance">
      <h3>Coordinates used for review</h3>
      <p className="fmr-muted">The original retained section coordinates below are the values used by the source red-flag calculation. Longitude and latitude are labelled explicitly; values are shown without display rounding.</p>
      {(row.originalProject.segments || []).length > 0 ? <div style={{overflowX:'auto'}}>
        <table className="fmr-provenance-table">
          <caption>Section coordinates and endpoint spans</caption>
          <thead><tr><th scope="col">Section</th><th scope="col">Point</th><th scope="col">Longitude</th><th scope="col">Latitude</th><th scope="col">Endpoint span (m)</th></tr></thead>
          <tbody>{row.originalProject.segments.flatMap((segment,index) => {
            const coordinates = segment.coordinates || [];
            const label = segment.section_label || `Section ${segment.segment_index ?? index+1}`;
            const distance = Number.isFinite(segment.straight_line_distance_km) ? format(segment.straight_line_distance_km*1000) : 'Unavailable';
            return coordinates.length ? coordinates.map((point,i) => <tr key={`${segment.id || index}:${i}`}>
              <th scope="row">{label}</th>
              <td>{coordinates.length === 1 ? 'Only point' : i === 0 ? 'Start' : i === coordinates.length-1 ? 'End' : `Point ${i+1}`}</td>
              <td><code>{point?.[0] == null ? 'Unavailable' : String(point[0])}</code></td>
              <td><code>{point?.[1] == null ? 'Unavailable' : String(point[1])}</code></td>
              <td>{distance}</td>
            </tr>) : [<tr key={segment.id || index}><th scope="row">{label}</th><td colSpan={3}>No complete coordinate pair retained</td><td>{distance}</td></tr>];
          })}</tbody>
        </table>
      </div> : <p>No section coordinates are available. Retained individual points, where present, are listed below.</p>}
    </section>
    <div style={{overflowX:'auto',overflowWrap:'anywhere'}}>
      <CoordinateProvenance project={row.project}/>
    </div>
    <ul className="fmr-redflag-findings">{row.flags.map(flag => <li key={flag.id}>
      <strong>{ruleLabels[flag.id]}</strong> <span className={`fmr-badge ${flag.resolution === 'Open' ? 'review' : 'balanced'}`}>{flag.resolution}</span><p>{flag.detail}</p>
      {flag.id === 'shared_geometry' && <SharedCoordinatesTable data={data} row={row} onPdf={onPdf}/>}
      {flag.peerIds && flag.id !== 'shared_geometry' && <div className="fmr-redflag-links">{flag.peerIds.map(id => <a key={id} href={routeHref(stage.key,{node:id})}>{id} → source</a>)}</div>}
      {flag.pairId && <a href={routeHref('compare',{view:'projects',pair:flag.pairId})}>Inspect both candidate sources →</a>}
    </li>)}</ul>
    <div className="fmr-redflag-links"><button type="button" onClick={() => onMap(row)}>View on map</button><a href={routeHref(stage.key,{node:row.id})}>Open source tree →</a>
      <button onClick={() => onPdf(row.project.source)} className="fmr-redflag-pdf">Open {row.project.source.source_pdf} · p. {row.project.source.pdf_page}</button></div>
  </dialog>;
}

export default function FmrRedFlags({data, stage, projects, route, onChange, onPdf, onExportCSV, onExportJSON}) {
  const params = Object.fromEntries(route.params);
  const analysis = useMemo(() => buildFmrRedFlags(data, 'all', {
    shortMeters:params.rf_short_m,longKm:params.rf_long_km,costMultiple:params.rf_cost_multiple,increasePercent:params.rf_increase_pct,
  }), [data,stage.key,params.rf_short_m,params.rf_long_km,params.rf_cost_multiple,params.rf_increase_pct]);
  const [mapRow, setMapRow] = useState(null);
  const onMap = row => setMapRow(row);
  const mapRecord = mapRow && {id:mapRow.id,title:mapRow.project.title,
    status:`${mapRow.stageKey}_only`,fmrProjects:Object.fromEntries((mapRow.members || [mapRow]).map(member=>[member.stageKey,member.project]))};
  const visibleIds = new Set(projects.map(p => p.id));
  const assessed = analysis.rows.filter(row => visibleIds.has(row.id));
  const flagged = assessed.filter(row => row.flagCount > 0);
  const corrected = assessed.filter(row => row.hasCorrection);
  const resolved = assessed.filter(row => row.resolvedFlags.length > 0);
  const open = assessed.filter(row => row.openFlags.length > 0);
  const reviewRows = assessed.filter(row => row.flagCount > 0 || row.hasCorrection);
  const rows = reviewRows.filter(row => !params.rf_rule || (params.rf_rule === 'corrected'
    ? row.hasCorrection : row.flags.some(flag => flag.id === params.rf_rule)));
  const visibleReviewIds = new Set(rows.map(row=>row.id));
  const groupedRows = collapseIdenticalFmrReviews(analysis.rows,data.comparison)
    .filter(row=>row.members.some(member=>visibleReviewIds.has(member.id)));
  const displayRows = groupedRows.filter(row=>!params.rf_source || row.budgetSource===params.rf_source);
  const exportRows = displayRows.flatMap(row=>row.members);
  const selected = collapseIdenticalFmrReviews(analysis.rows,data.comparison).find(row => row.members.some(member=>member.id===params.rf_project));
  const change = patch => onChange({...patch,page:null,rf_project:null});
  const page = Math.max(1, Number(params.page) || 1);
  const sortKey = ['flagCount','amount_php','meters','proxyPhpPerMeter','peerMultiple'].includes(params.rf_sort) ? params.rf_sort : 'flagCount';
  const sort = {key:sortKey,direction:params.rf_dir === 'asc' ? 'asc' : 'desc'};
  const csvRows = exportRows.map(row => [row.stageKey,row.id,row.project.title,row.project.region,row.project.amount_php,row.meters,
    row.shortestMeters,row.longestMeters,row.proxyPhpPerMeter,row.benchmark?.scope,row.benchmark?.count,row.benchmark?.median,
    row.benchmark?.threshold,row.peerMultiple,row.flags.map(f => f.id).join(';'),row.flags.map(f => f.detail).join(' | '),
    row.project.source.source_pdf,row.project.source.pdf_page,row.project.source.printed_page,row.reviewStatus,row.correction.rules.join(';'),row.correction.clearedFlags.join(';'),row.correction.textCorrected,row.corrected.meters,row.corrected.proxyPhpPerMeter,row.resolvedFlags.map(f=>f.id).join(';'),row.openFlags.map(f=>f.id).join(';')]);
  return <section className="fmr-redflags" aria-label="FMR red-flag review">
    <p className="fmr-notice">{RED_FLAG_MEASUREMENT_NOTE} Review endpoint geometry before interpreting an unusually high proxy. Scope, width, terrain, bridges and measured road length need separate evidence.</p>
    <div className="fmr-filters fmr-redflag-controls">
      {fields.map(([param,key,label,min]) => <label key={param}>{label}<input type="number" min={min} step="any"
        aria-label={label} value={params[param] ?? analysis.config[key]} onChange={e => change({[param]:e.target.value})}/></label>)}
      <button onClick={() => change(Object.fromEntries(fields.map(([param]) => [param,null])))}>Reset review thresholds</button>
    </div>
    <details className="fmr-method"><summary>How these review flags are calculated</summary>
      <p>Short and long screens inspect individual sections; the proxy divides the project allocation once by the sum of all complete section spans. Missing, zero-length, repeated or unresolved geometry is excluded from rate calculations.</p>
      <p>Rate baselines are calculated separately for each full budget source, independent of search and region filters. A regional cohort needs at least 20 eligible projects; otherwise the whole source is used, also with a minimum of 20. High proxies must exceed both {analysis.config.costMultiple}× the median and Q3 + 3×IQR. These are peer outliers, not engineering price limits.</p>
      <p>Repeated coordinates are screened within one source document; expected repetitions between NEP and House are excluded. Province disagreement uses PSGC versus the parsed title locality. Candidate allocation increases still require identity and scope verification.</p>
      <ul>{RED_FLAG_RULES.map(rule => <li key={rule.id}><strong>{rule.label}:</strong> {rule.description}</li>)}</ul>
    </details>
    <div className="fmr-stats">
      <div className="fmr-stat"><span>Records with original source flags</span><strong>{flagged.length.toLocaleString()}</strong><small>of {assessed.length.toLocaleString()} matching source records</small></div>
      <div className="fmr-stat"><span>Allocation on flagged projects</span><strong>{money(flagged.reduce((sum,row) => sum+row.project.amount_php,0))}</strong><small>Original source flags; each source record counted once; budget versions remain separate</small></div>
      <div className="fmr-stat"><span>Eligible proxy denominators</span><strong>{assessed.filter(r => r.proxyPhpPerMeter != null).length.toLocaleString()}</strong><small>Complete, positive, resolved geometry</small></div>
      <div className="fmr-stat"><span>Excluded proxy denominators</span><strong>{assessed.filter(r => r.proxyPhpPerMeter == null).length.toLocaleString()}</strong><small>No partial or invented lengths</small></div>
    </div>
    <p className="fmr-notice">{corrected.length.toLocaleString()} source records have correction history and remain available here for reference. Original source findings remain counted after correction. {resolved.length} records have findings resolved by correction; {open.length} have analytical findings on accepted coordinates.</p>
    <div className="fmr-filters"><label>Budget source coverage<select aria-label="Budget source coverage" value={params.rf_source || ''} onChange={e=>change({rf_source:e.target.value})}>
      <option value="">All source coverage</option>
      <option value="nep">NEP ONLY · {groupedRows.filter(row=>row.budgetSource==='nep').length}</option>
      <option value="house">HGAB ONLY · {groupedRows.filter(row=>row.budgetSource==='house').length}</option>
      <option value="both">NEP+HGAB · {groupedRows.filter(row=>row.budgetSource==='both').length}</option>
    </select></label></div>
    <p className="fmr-muted">Source coverage describes this exact record version. NEP ONLY or HGAB ONLY can have a counterpart with different content. Summary cards count source records; the table collapses identical versions.</p>
    <div className="fmr-filters"><label>Review flag<select aria-label="Review flag" value={params.rf_rule || ''} onChange={e => change({rf_rule:e.target.value})}>
      <option value="">Source findings and correction history · {reviewRows.length}</option><option value="corrected">Corrected records · {corrected.length}</option>{RED_FLAG_RULES.map(rule => <option key={rule.id} value={rule.id}>{rule.label} · {flagged.filter(r => r.flags.some(f => f.id === rule.id)).length}</option>)}
    </select></label></div>
    <div className="fmr-result-bar"><span>{displayRows.length.toLocaleString()} entries · {exportRows.length.toLocaleString()} source records · {stage.label}</span>
      <button onClick={() => onExportCSV('fmr-red-flags-filtered.csv', ['stage','source_id','title','region','allocation_php','summed_endpoint_m','shortest_section_m','longest_section_m',
        'allocation_per_endpoint_m_proxy','peer_scope','peer_count','peer_median_proxy','peer_threshold_proxy','peer_multiple','flag_ids','flag_explanations','source_pdf','pdf_page','printed_page','review_status','accepted_corrections','earlier_findings','transcription_corrected','corrected_endpoint_m','corrected_allocation_per_endpoint_m','resolved_source_flag_ids','accepted_open_flag_ids'],csvRows)}>Export review CSV</button>
      <button onClick={() => onExportJSON('fmr-red-flags-filtered.json',{stage:stage.key,document:stage.label,measurement_note:analysis.measurementNote,
        config:analysis.config,coordinate_basis:analysis.coordinateBasis,benchmark_population:'Original full selected source; corrected baselines assessed separately',rows:displayRows})}>Export review JSON</button>
    </div>
    <SortableTable tableId="red-flags-records" rows={displayRows} ariaLabel="FMR red-flag projects" pageSize={25} page={page} onPageChange={page => onChange({page})}
      sort={sort} onSortChange={next => {const updated=typeof next === 'function' ? next(sort) : next;change({rf_sort:updated.key,rf_dir:updated.direction});}}
      empty="No projects match these review flags and filters." columns={[
        {key:'source',label:'Budget source',sortable:false,render:row => row.budgetSourceLabel},
        {key:'title',label:'Project',sortable:false,render:row => <button className="fmr-text-button" onClick={() => onChange({rf_project:row.id})}>{row.project.title}<small>{row.project.region} · {row.members.map(member=>member.id).join(' · ')}</small></button>},
        {key:'reviewStatus',label:'Review status',sortable:false,render:row => <span className={`fmr-badge ${row.flagCount ? 'review' : 'balanced'}`}>{row.reviewStatus}</span>},
        {key:'flagCount',label:'Review flags',value:row => row.flagCount,render:row => <div className="fmr-redflag-tags">{row.flags.map(flag => <span key={flag.id} title={`${flag.detail} · ${flag.resolution}`}>{ruleLabels[flag.id]}{flag.resolution !== 'Open' && ' · resolved'}</span>)}</div>},
        {key:'amount_php',label:'Allocation (PHP)',align:'num',value:row => row.project.amount_php,render:row => money(row.project.amount_php)},
        {key:'meters',label:'Summed endpoint spans (m)',align:'num',render:row => <>{format(row.meters)}<small>Min {format(row.shortestMeters)} · max {format(row.longestMeters)} m</small></>},
        {key:'proxyPhpPerMeter',label:'Allocation / endpoint m (proxy)',align:'num',render:row => row.proxyPhpPerMeter == null ? '—' : money(row.proxyPhpPerMeter)},
        {key:'peerMultiple',label:'Peer-median multiple',align:'num',render:row => row.members.map(member=><div key={member.id}>{data.stages[member.stageKey].label}: {member.peerMultiple == null ? '—' : `${format(member.peerMultiple)}×`}<small>{member.benchmark?.scope} · n={member.benchmark?.count ?? 0}</small></div>)},
        {key:'evidence',label:'Evidence',sortable:false,render:row => <div className="fmr-redflag-links"><button type="button" onClick={() => onMap(row)}>View on map</button><button onClick={() => onChange({rf_project:row.id})}>Review details</button>{row.members.map(member=><button key={member.id} onClick={() => onPdf(member.project.source)} className="fmr-redflag-pdf">{data.stages[member.stageKey].label} · {member.project.source.source_pdf} · p. {member.project.source.pdf_page}</button>)}</div>},
      ]}/>
    {selected && <Evidence key={selected.id} onMap={onMap} row={selected} data={data} onClose={() => onChange({rf_project:null})} onPdf={onPdf}/>}
    {mapRecord && <Suspense fallback={<p role="status">Loading project map…</p>}>
      <FmrSegmentModal key={mapRecord.id} record={mapRecord} onClose={() => setMapRow(null)}/>
    </Suspense>}
    {params.rf_project && !selected && <p role="alert">This review record is unavailable in the selected source. <button onClick={() => onChange({rf_project:null})}>Clear review selection</button></p>}
  </section>;
}
