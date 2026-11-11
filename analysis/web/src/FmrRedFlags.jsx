import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {CoordinateProvenance} from './FmrProvenance.jsx';
import SortableTable from './SortableTable.jsx';
import {FlagTag, FlagExplainerDialog} from './FmrRedFlagExplainer.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {siteUrl} from './data.js';
import DaChangeExplanationDialog from './DaChangeExplanationDialog.jsx';
import DaFindingsSummaryDialog from './DaFindingsSummaryDialog.jsx';
import {DA_CHANGE_TYPES, DA_CHANGE_CAVEAT, buildDaDraftChangeLog, annotateDaDeltaRows, summarizeDaDeltaChanges, summarizeHouseDaFindings} from './fmrDaCoherence.js';
import {money, flagLabel} from './fmrModel.js';
import {buildFmrRedFlags, buildHouseDaRedFlagDelta, collapseIdenticalFmrReviews, sharedCoordinateEvidence, summarizeFmrReviews, RED_FLAG_RULES, RED_FLAG_DELTA_STATUSES, RED_FLAG_MEASUREMENT_NOTE, RED_FLAG_TIERS, sortFlagsByTier, tierCounts, tierDeltaCounts} from './fmrRedFlags.js';

const FmrSegmentModal = lazy(() => import('./FmrSegmentModal.jsx'));

const format = value => value == null ? '—' : value.toLocaleString('en-PH', {maximumFractionDigits:2});
const fields = [['rf_short_m','shortMeters','Short section below (m)',1],['rf_long_km','longKm','Long section above (km)',1],
  ['rf_cost_multiple','costMultiple','Minimum peer-median multiple',1],['rf_increase_pct','increasePercent','Candidate increase at least (%)',0]];
const ruleLabels = Object.fromEntries(RED_FLAG_RULES.map(rule => [rule.id, rule.label]));

/** Build the same FmrSegmentModal record shape used by single-source red flags. */
function deltaMapRecord(row, data) {
  const fmrProjects = {};
  const house = row.house_id && data.stages.house?.projects.find(project => project.id === row.house_id);
  const da = row.da_id && data.stages.da?.projects.find(project => project.id === row.da_id);
  const pair = (data.comparison || []).find(entry => entry.id === row.id);
  const nep = pair?.nep_id && data.stages.nep?.projects.find(project => project.id === pair.nep_id);
  if (house) fmrProjects.house = house;
  if (da) fmrProjects.da = da;
  if (nep) fmrProjects.nep = nep;
  if (!Object.keys(fmrProjects).length) return null;
  const status = house && (da || nep) ? 'paired' : `${da ? 'da' : house ? 'house' : 'nep'}_only`;
  return {id:row.id, title:row.title || house?.title || da?.title || nep?.title || 'FMR project', status, fmrProjects};
}

function HouseDaDelta({data, route, onChange, onExportCSV, onExportJSON, onExplain, onMap, tierMode}) {
  const params = Object.fromEntries(route.params);
  const delta = useMemo(() => buildHouseDaRedFlagDelta(data, {
    shortMeters:params.rf_short_m,longKm:params.rf_long_km,costMultiple:params.rf_cost_multiple,increasePercent:params.rf_increase_pct,
  }), [data,params.rf_short_m,params.rf_long_km,params.rf_cost_multiple,params.rf_increase_pct]);
  const [draft,setDraft] = useState(null);
  const [draftError,setDraftError] = useState('');
  const [selectedStory,setSelectedStory] = useState(null);
  const [showSummary,setShowSummary] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(siteUrl('other-analysis/data/da_fmr_draft.json'),{signal:controller.signal})
      .then(r=>{if(!r.ok) throw Error('DA working draft unavailable ('+r.status+')');return r.json();})
      .then(value=>setDraft(value))
      .catch(err=>{if(err.name !== 'AbortError') setDraftError(err.message);});
    return ()=>controller.abort();
  },[]);
  const draftLog = useMemo(() => draft ? buildDaDraftChangeLog(draft,data) : null, [draft,data]);
  const annotated = useMemo(() => annotateDaDeltaRows(delta.rows,data,draftLog),[delta.rows,data,draftLog]);
  const changeCounts = summarizeDaDeltaChanges(annotated);
  const changeTypeFilter = params.rf_change_type || '';
  const change = patch => onChange({...patch,page:null,rf_project:null});
  const status = params.rf_delta_status || '';
  const rule = params.rf_rule || '';
  let rows = annotated;
  if (status) rows = rows.filter(row => row.status === status);
  if (changeTypeFilter) rows = rows.filter(row => row.changeType === changeTypeFilter);
  if (rule) rows = rows.filter(row =>
    row.house_flags.includes(rule) || row.da_flags.includes(rule)
    || row.cleared_flags.includes(rule) || row.new_flags.includes(rule));
  const page = Math.max(1, Number(params.page) || 1);
  const sortKey = ['house_flag_count','da_flag_count','house_php','da_php','title'].includes(params.rf_sort) ? params.rf_sort : 'house_flag_count';
  const sort = {key:sortKey,direction:params.rf_dir === 'asc' ? 'asc' : 'desc'};
  const tag = (ids, tone='', context=null) => !ids.length ? <span className="fmr-muted">—</span>
    : <div className={`fmr-redflag-tags ${tone}`}>{(tierMode ? sortFlagsByTier(ids) : ids).map(id => <FlagTag key={id} id={id} label={ruleLabels[id]} tierMode={tierMode} onExplain={() => onExplain({id,row:context})}/>)}</div>;
  const tierChanges = tierMode ? tierDeltaCounts(rows) : null;
  const findingsSummary = useMemo(() => summarizeHouseDaFindings(rows), [rows]);
  const summaryFilterNote = (status || changeTypeFilter || rule)
    ? `Summary matches the current filters (${rows.length.toLocaleString()} of ${annotated.length.toLocaleString()} flagged House→DA rows).`
    : null;
  return <>
    <p className="fmr-notice">House GAB remains the printed source of truth. This view reapplies the same red-flag screens to the DA Nov 5 working draft and diffs linked rows. Thresholds stay interactive and match the single-source Red flags view.</p>
    <p className="fmr-notice">{DA_CHANGE_CAVEAT} The change-type summary below describes only the <strong>flagged House→DA delta subset</strong>, not all 704 DA original rows. Legacy flag-lifecycle statuses remain available separately.</p>
    <div className="fmr-redflag-change-bar" role="group" aria-label="DA change types in flagged delta">
      {Object.entries(DA_CHANGE_TYPES).map(([id,meta]) => <button key={id} type="button" className={changeTypeFilter===id ? 'active' : ''}
        aria-pressed={changeTypeFilter===id} onClick={() => change({rf_change_type:changeTypeFilter===id ? null : id})}>
        <strong>{(changeCounts[id] || 0).toLocaleString()}</strong><span>{meta.label}</span>
      </button>)}
    </div>
    {changeTypeFilter && <p role="status">Showing {DA_CHANGE_TYPES[changeTypeFilter]?.label || changeTypeFilter} in flagged records.
      <button type="button" onClick={()=>change({rf_change_type:null})}>Clear DA change filter</button></p>}
    {draftError && <p role="alert">Full DA working-draft change context is unavailable: {draftError}. Existing source comparisons and flags remain accessible.</p>}
    {!draftLog && !draftError && <p role="status">Loading DA working-draft change context…</p>}
    {draftLog && <details className="fmr-method fmr-da-source-log">
      <summary>Full DA working-draft register: {draftLog.totalEvents.toLocaleString()} change/retention events from {draftLog.sourceRows.toLocaleString()} source rows ({draftLog.originalCount.toLocaleString()} originals)</summary>
      <p>Separate population: the complete retained DA working draft, not just the flagged House→DA subset. Adjacent replacements are provisional in-sheet pairings; events include retained originals. No amount is summed across budget stages.</p>
      <div className="fmr-redflag-change-bar" aria-label="Full DA draft change types">{Object.entries(DA_CHANGE_TYPES).map(([id,meta]) =>
        <div key={id}><strong>{(draftLog.counts[id]||0).toLocaleString()}</strong><span>{meta.label}</span></div>)}</div>
      <SortableTable tableId="da-source-change-register" ariaLabel="DA working draft change register" rows={draftLog.rows} pageSize={25}
        columns={[
          {key:'control_no',label:'DA control',render:row=><button type="button" className="fmr-text-button" onClick={()=>setSelectedStory(row)}>{row.control_no}<small>Excel r.{row.excel_rows.join(', ')}</small></button>},
          {key:'title',label:'Source project / proposed title'},
          {key:'changeTypeLabel',label:'Change description'},
          {key:'daRemarkSnippet',label:'DA remark',render:row=>row.daRemarkSnippet || 'No local remark'},
          {key:'inspect',label:'Review',sortable:false,render:row=><button type="button" onClick={()=>setSelectedStory(row)}>View DA explanation</button>},
        ]}/>
    </details>}
    <details className="fmr-method"><summary>Flag lifecycle buckets (existing comparison statuses)</summary>
    <div className="fmr-stats">
      {Object.entries(RED_FLAG_DELTA_STATUSES).map(([key, label]) => (
        <button key={key} className={`fmr-stat fmr-text-button ${status === key ? 'active' : ''}`} onClick={() => change({rf_delta_status: status === key ? null : key})}>
          <span>{label}</span><strong>{(delta.counts[key] || 0).toLocaleString()}</strong>
          <small>{status === key ? 'Clear filter' : 'Filter this bucket'}</small>
        </button>
      ))}
    </div></details>
    <div className="fmr-redflag-status-help" role="group" aria-label="Delta status explanations">
      {Object.entries(RED_FLAG_DELTA_STATUSES).map(([id,label]) => <button type="button" key={id} aria-haspopup="dialog" onClick={() => onExplain({statusId:id})}>Explain: {label}</button>)}
    </div>
    {tierMode && <div className="fmr-redflag-tier-stats" aria-label="House to DA tier changes">{Object.entries(tierChanges).map(([kind, counts]) =>
      <div key={kind}><strong>{kind === 'new' ? 'New under DA' : kind === 'cleared' ? 'Cleared under DA' : 'Persisted'}</strong>
        {Object.entries(counts).map(([tier, count]) => <span key={tier}>{RED_FLAG_TIERS[tier].label}: {count.findings} findings ({count.entries} rows)</span>)}</div>)}</div>}
    <div className="fmr-filters"><label>Review flag<select aria-label="Review flag" value={rule} onChange={e => change({rf_rule:e.target.value})}>
      <option value="">All review flags · {delta.rows.length}</option>
      {RED_FLAG_RULES.map(item => <option key={item.id} value={item.id}>{item.label} · {delta.rows.filter(r => r.house_flags.includes(item.id) || r.da_flags.includes(item.id)).length}</option>)}
    </select></label></div>
    <div className="fmr-result-bar"><span>{rows.length.toLocaleString()} House→DA red-flag rows</span>
      <button type="button" aria-haspopup="dialog" onClick={() => setShowSummary(true)}>View findings summary</button>
      <button onClick={() => onExportCSV('fmr-house-da-red-flag-delta.csv',
        ['status','comparison_or_row_id','region','title','house_id','da_id','da_control_no','da_excel_rows','house_php','da_php','house_flags','da_flags','cleared_flags','persisted_flags','new_flags','da_disposition'],
        rows.map(r => [r.status,r.id,r.region_key,r.title,r.house_id,r.da_id,r.control_no,(r.excel_rows||[]).join(';'),r.house_php,r.da_php,
          r.house_flags.join(';'),r.da_flags.join(';'),r.cleared_flags.join(';'),r.persisted_flags.join(';'),r.new_flags.join(';'),r.disposition]))}>Export delta CSV</button>
      <button onClick={() => onExportJSON('fmr-house-da-red-flag-delta.json',{measurement_note:delta.measurementNote,config:delta.config,counts:delta.counts,rows})}>Export delta JSON</button>
    </div>
    <SortableTable tableId="red-flags-house-da-delta" rows={rows} ariaLabel="House to DA red-flag changes" pageSize={25} page={page} onPageChange={page => onChange({page})}
      sort={sort} onSortChange={next => {const updated=typeof next === 'function' ? next(sort) : next;change({rf_sort:updated.key,rf_dir:updated.direction});}}
      empty="No House→DA red-flag changes match these filters." columns={[
        {key:'title',label:'Project',sortable:true,render:row => <div>{row.title}<small>{row.region_key} · {RED_FLAG_DELTA_STATUSES[row.status]}{row.control_no ? ` · ${row.control_no}` : ''}{row.excel_rows?.length ? ` · Excel r.${row.excel_rows.join(', r.')}` : ''}</small></div>},
        {key:'status',label:'DA change story',render:row => <div className="fmr-da-story-cell">
          <strong>{row.changeTypeLabel}</strong>
          <small>{row.narrative}</small>
          {row.daRemarkSnippet && <small>DA remark: {row.daRemarkSnippet}</small>}
          <small>Flag lifecycle: {RED_FLAG_DELTA_STATUSES[row.status]}</small>
          <button type="button" onClick={()=>setSelectedStory(row)}>View DA explanation</button>
        </div>},
        {key:'house_flag_count',label:'House flags',align:'num',render:row => <>{row.house_flag_count}{tag(row.house_flags, '', row)}</>},
        {key:'da_flag_count',label:'DA flags',align:'num',render:row => <>{row.da_flag_count}{tag(row.da_flags, '', row)}</>},
        {key:'cleared',label:'Cleared',sortable:false,render:row => tag(row.cleared_flags, 'fmr-up', row)},
        {key:'new',label:'New on DA',sortable:false,render:row => tag(row.new_flags, 'fmr-down', row)},
        {key:'house_php',label:'House (PHP)',align:'num',render:row => money(row.house_php)},
        {key:'da_php',label:'DA (PHP)',align:'num',render:row => money(row.da_php)},
        {key:'links',label:'Links',sortable:false,render:row => <div className="fmr-redflag-links">
          {onMap && (row.house_id || row.da_id) && <button type="button" onClick={() => onMap(row)}>View on map</button>}
          {row.house_id && <a href={routeHref('house',{node:row.house_id})}>House tree</a>}
          {row.id.startsWith('pair:') || row.id.startsWith('house_only:') || row.id.startsWith('nep_only:')
            ? <a href={routeHref('compare',{view:'projects',pair:row.id})}>Compare row</a>
            : row.da_id && <a href={routeHref('compare',{view:'projects',da:'flagged',q:row.control_no || row.da_id})}>Compare / DA</a>}
        </div>},
      ]}/>
    {selectedStory && <DaChangeExplanationDialog row={selectedStory} onClose={()=>setSelectedStory(null)} onMap={onMap}/>}
    {showSummary && <DaFindingsSummaryDialog summary={findingsSummary} filteredNote={summaryFilterNote} onClose={()=>setShowSummary(false)}/>}
  </>;
}


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

function Evidence({row:entry, data, onClose, onPdf, onMap, onExplain, tierMode}) {
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
      <FlagTag id={flag.id} label={ruleLabels[flag.id]} tierMode={tierMode} onExplain={() => onExplain({id:flag.id,row})}/> <span className={`fmr-badge ${flag.resolution === 'Open' ? 'review' : 'balanced'}`}>{flag.resolution}</span><p>{flag.detail}</p>
      {flag.id === 'shared_geometry' && <SharedCoordinatesTable data={data} row={row} onPdf={onPdf}/>}
      {flag.peerIds && flag.id !== 'shared_geometry' && <div className="fmr-redflag-links">{flag.peerIds.map(id => <a key={id} href={routeHref(stage.key,{node:id})}>{id} → source</a>)}</div>}
      {flag.pairId && <a href={routeHref('compare',{view:'projects',pair:flag.pairId})}>Inspect both candidate sources →</a>}
    </li>)}</ul>
    <div className="fmr-redflag-links"><button type="button" onClick={() => onMap(row)}>View on map</button>
      {stage.key === 'da'
        ? <a href={routeHref('compare',{view:'projects',da:'flagged',q:row.project.control_no || row.id})}>Open in Compare →</a>
        : <a href={routeHref(stage.key,{node:row.id})}>Open source tree →</a>}
      {row.project.source?.source_pdf && <button onClick={() => onPdf(row.project.source)} className="fmr-redflag-pdf">Open {row.project.source.source_pdf} · p. {row.project.source.pdf_page}</button>}
      {stage.key === 'da' && row.project.source?.excel_row != null && <span className="fmr-muted">Excel row {row.project.source.excel_row}</span>}
    </div>
  </dialog>;
}

export default function FmrRedFlags({data, stage, projects, route, onChange, onPdf, onExportCSV, onExportJSON}) {
  const params = Object.fromEntries(route.params);
  const mode = params.rf_mode === 'house_da_delta' && data.stages.da ? 'house_da_delta' : 'stage';
  const analysisKey = stage.key === 'da' ? 'da' : 'all';
  const analysis = useMemo(() => buildFmrRedFlags(data, analysisKey, {
    shortMeters:params.rf_short_m,longKm:params.rf_long_km,costMultiple:params.rf_cost_multiple,increasePercent:params.rf_increase_pct,
  }), [data,analysisKey,params.rf_short_m,params.rf_long_km,params.rf_cost_multiple,params.rf_increase_pct]);
  const [mapRecord, setMapRecord] = useState(null);
  const [explainSelection, setExplainSelection] = useState(null);
  const tierMode = params.rf_tiers === 'on';
  const onMap = row => {
    if (row?.project) {
      setMapRecord({id:row.id,title:row.project.title,
        status:`${row.stageKey}_only`,fmrProjects:Object.fromEntries((row.members || [row]).map(member=>[member.stageKey,member.project]))});
      return;
    }
    setMapRecord(deltaMapRecord(row, data));
  };
  const visibleIds = new Set(projects.map(p => p.id));
  const allGroups = collapseIdenticalFmrReviews(analysis.rows,data.comparison);
  const assessed = allGroups.filter(group=>group.members.some(member=>visibleIds.has(member.id))
    && (!params.rf_source || group.budgetSource===params.rf_source));
  const reviewRows = assessed.filter(group=>group.flagCount>0 || group.members.some(r=>r.hasCorrection));
  const groupedRows = allGroups.filter(group=>group.members.some(member=>visibleIds.has(member.id))
    && (group.flagCount>0 || group.members.some(r=>r.hasCorrection)));
  const ruleRows = reviewRows.filter(group=>!params.rf_rule || (params.rf_rule==='corrected'
    ? group.members.some(r=>r.hasCorrection) : group.flags.some(flag=>flag.id===params.rf_rule)));
  const overlapSummary = summarizeFmrReviews(ruleRows);
  const displayRows = ruleRows.filter(group=>!params.rf_count || (params.rf_count==='3plus'
    ? group.flagCount>=3 : group.flagCount===Number(params.rf_count)));
  const summary = summarizeFmrReviews(displayRows);
  const exportRows = displayRows.flatMap(group=>group.members.map((row,index)=>({
    ...row,entryId:group.id,countedAllocation:index===0 && group.flagCount>0 ? group.project.amount_php : 0})));
  const selected = allGroups.find(group=>group.members.some(member=>member.id===params.rf_project));
  const change = patch => onChange({...patch,page:null,rf_project:null});
  const page = Math.max(1, Number(params.page) || 1);
  const sortKey = ['flagCount','amount_php','meters','proxyPhpPerMeter','peerMultiple'].includes(params.rf_sort) ? params.rf_sort : 'flagCount';
  const sort = {key:sortKey,direction:params.rf_dir === 'asc' ? 'asc' : 'desc'};
  const csvRows = exportRows.map(row => [row.stageKey,row.id,row.project.title,row.project.region,row.project.amount_php,row.meters,
    row.shortestMeters,row.longestMeters,row.proxyPhpPerMeter,row.benchmark?.scope,row.benchmark?.count,row.benchmark?.median,
    row.benchmark?.threshold,row.peerMultiple,row.flags.map(f => f.id).join(';'),row.flags.map(f => f.detail).join(' | '),
    row.project.source.source_pdf,row.project.source.pdf_page,row.project.source.printed_page,row.reviewStatus,row.correction.rules.join(';'),row.correction.clearedFlags.join(';'),row.correction.textCorrected,row.corrected.meters,row.corrected.proxyPhpPerMeter,row.resolvedFlags.map(f=>f.id).join(';'),row.openFlags.map(f=>f.id).join(';'),row.entryId,row.countedAllocation]);
  return <section className="fmr-redflags" aria-label="FMR red-flag review">
    <p className="fmr-notice">{RED_FLAG_MEASUREMENT_NOTE} Review endpoint geometry before interpreting an unusually high proxy. Scope, width, terrain, bridges and measured road length need separate evidence.</p>
    <div className="fmr-filters fmr-redflag-controls">
      {fields.map(([param,key,label,min]) => <label key={param}>{label}<input type="number" min={min} step="any"
        aria-label={label} value={params[param] ?? analysis.config[key]} onChange={e => change({[param]:e.target.value})}/></label>)}
      <button onClick={() => change(Object.fromEntries([...fields.map(([param]) => [param,null]), ['rf_delta_status',null]]))}>Reset review thresholds</button>
      <button type="button" aria-pressed={tierMode} onClick={() => onChange({rf_tiers:tierMode ? null : 'on'})}>{tierMode ? 'Hide flag tiers' : 'Show flag tiers'}</button>
    </div>
    {tierMode && <div className="fmr-redflag-tier-legend" role="group" aria-label="FMR evidence tiers">
      {Object.entries(RED_FLAG_TIERS).map(([tier, meta]) => <div key={tier} className={`fmr-tier fmr-tier-${tier}`}><strong>{meta.label}</strong><span>{meta.short}</span></div>)}
      <p>Evidence classes, not severity rankings. A project can belong to multiple classes.</p>
    </div>}
    {data.stages.da && <div className="fmr-filters" role="group" aria-label="Red-flag assessment mode">
      <button className={mode === 'stage' ? 'active' : ''} aria-pressed={mode === 'stage'} onClick={() => change({rf_mode:null,rf_delta_status:null})}>Single source · {stage.label}</button>
      <button className={mode === 'house_da_delta' ? 'active' : ''} aria-pressed={mode === 'house_da_delta'} onClick={() => change({rf_mode:'house_da_delta',stage:'da'})}>House → DA changes</button>
    </div>}
    {mode === 'house_da_delta' ? <HouseDaDelta data={data} route={route} onChange={onChange} onExportCSV={onExportCSV} onExportJSON={onExportJSON} onExplain={setExplainSelection} onMap={onMap} tierMode={tierMode}/> : <>
    <details className="fmr-method"><summary>How these review flags are calculated</summary>
      <p>Short and long screens inspect individual sections; the proxy divides the project allocation once by the sum of all complete section spans. Missing, zero-length, repeated or unresolved geometry is excluded from rate calculations.</p>
      <p>Rate baselines are calculated separately for each full budget source, independent of search and region filters. A regional cohort needs at least 20 eligible projects; otherwise the whole source is used, also with a minimum of 20. High proxies must exceed both {analysis.config.costMultiple}× the median and Q3 + 3×IQR. These are peer outliers, not engineering price limits.</p>
      <p>Repeated coordinates are screened within one source document; expected repetitions between NEP and House are excluded. Province disagreement uses PSGC versus the parsed title locality. Candidate allocation increases still require identity and scope verification.</p>
      <ul>{RED_FLAG_RULES.map(rule => <li key={rule.id}><button type="button" aria-haspopup="dialog" className="fmr-text-button" onClick={() => setExplainSelection({id:rule.id})}>{rule.label}</button>: {rule.description}</li>)}</ul>
    </details>
    <div className="fmr-stats">
      <div className="fmr-stat"><span>Flagged entries (overlap removed)</span><strong>{summary.flaggedEntries.toLocaleString()}</strong><small>of {assessed.length.toLocaleString()} matching distinct record versions</small></div>
      <div className="fmr-stat"><span>Allocation on flagged projects</span><strong>{money(summary.flaggedAllocation)}</strong><small>Identical NEP+HGAB entries counted once; differing versions remain separate</small></div>
      <div className="fmr-stat"><span>Eligible proxy denominators</span><strong>{assessed.filter(g => g.members.every(r=>r.proxyPhpPerMeter != null)).length.toLocaleString()}</strong><small>Complete, positive, resolved geometry</small></div>
      <div className="fmr-stat"><span>Excluded proxy denominators</span><strong>{assessed.filter(g => g.members.some(r=>r.proxyPhpPerMeter == null)).length.toLocaleString()}</strong><small>No partial or invented lengths</small></div>
    </div>
    <section className="fmr-provenance" aria-label="Flag overlap">
      <h3>Flag overlap: entries versus findings</h3>
      <p>Each matched, identical entry is counted once. Multiple flags describe that same entry and are not additional projects. A higher flag count does not establish greater severity.</p>
      <p><strong>{overlapSummary.flaggedEntries.toLocaleString()} flagged entries</strong> carry <strong>{overlapSummary.findings.toLocaleString()} distinct findings</strong> in the selected source coverage and review category.</p>
      {tierMode && <div className="fmr-redflag-tier-stats" aria-label="Selected tier composition">{Object.entries(tierCounts(ruleRows)).map(([tier, counts]) =>
        <div key={tier}><strong>{RED_FLAG_TIERS[tier].label}</strong><span>{counts.findings} findings · {counts.entries} entries</span></div>)}</div>}
      <div style={{overflowX:'auto'}}><table className="fmr-provenance-table">
        <caption>Entries grouped by number of distinct flag categories</caption>
        <thead><tr><th scope="col">Flags per entry</th><th scope="col">Entries</th><th scope="col">Share of flagged entries</th><th scope="col">Inspect</th></tr></thead>
        <tbody>{[['1','One flag'],['2','Two flags'],['3plus','Three or more flags']].map(([key,label])=><tr key={key}>
          <th scope="row">{label}</th><td>{overlapSummary.flagMultiplicity[key].toLocaleString()}</td>
          <td>{overlapSummary.flaggedEntries ? format(overlapSummary.flagMultiplicity[key]/overlapSummary.flaggedEntries*100) : '0'}%</td>
          <td><button type="button" aria-pressed={params.rf_count===key} onClick={()=>change({rf_count:params.rf_count===key ? null : key})}>Show entries</button></td>
        </tr>)}</tbody>
      </table></div>
      {params.rf_count && <p role="status">Showing {params.rf_count==='3plus' ? 'three or more' : params.rf_count} flags per entry. <button type="button" onClick={()=>change({rf_count:null})}>Show all flag counts</button></p>}
      <p className="fmr-muted">Category totals overlap and should not be added as a project count. NEP and HGAB source evidence remains available within each entry.</p>
    </section>
    <p className="fmr-notice">{summary.correctedEntries.toLocaleString()} entries have correction history and remain available here for reference. Original source findings remain counted after correction. {summary.resolvedEntries} entries have findings resolved by correction; {summary.openEntries} have analytical findings on accepted coordinates.</p>
    <div className="fmr-filters"><label>Budget source coverage<select aria-label="Budget source coverage" value={params.rf_source || ''} onChange={e=>change({rf_source:e.target.value})}>
      <option value="">All source coverage</option>
      <option value="nep">NEP ONLY · {groupedRows.filter(row=>row.budgetSource==='nep').length}</option>
      <option value="house">HGAB ONLY · {groupedRows.filter(row=>row.budgetSource==='house').length}</option>
      <option value="both">NEP+HGAB · {groupedRows.filter(row=>row.budgetSource==='both').length}</option>
    </select></label></div>
    <p className="fmr-muted">Source coverage describes this exact record version. NEP ONLY or HGAB ONLY can have a counterpart with different content. Headline counts and amounts count identical matched versions once. Different versions remain separate; the combined amount is a review exposure measure, not a single-stage budget total.</p>
    <div className="fmr-filters"><label>Review flag<select aria-label="Review flag" value={params.rf_rule || ''} onChange={e => change({rf_rule:e.target.value})}>
      <option value="">Source findings and correction history · {reviewRows.length}</option><option value="corrected">Corrected records · {reviewRows.filter(g=>g.members.some(r=>r.hasCorrection)).length}</option>{RED_FLAG_RULES.map(rule => <option key={rule.id} value={rule.id}>{rule.label} · {reviewRows.filter(r => r.flags.some(f => f.id === rule.id)).length}</option>)}
    </select></label></div>
    <div className="fmr-result-bar"><span>{summary.entries.toLocaleString()} entries · {summary.sourceRecords.toLocaleString()} underlying source records · {summary.findings.toLocaleString()} distinct findings · {stage.label}</span>
      <button onClick={() => onExportCSV('fmr-red-flags-filtered.csv', ['stage','source_id','title','region','allocation_php','summed_endpoint_m','shortest_section_m','longest_section_m',
        'allocation_per_endpoint_m_proxy','peer_scope','peer_count','peer_median_proxy','peer_threshold_proxy','peer_multiple','flag_ids','flag_explanations','source_pdf','pdf_page','printed_page','review_status','accepted_corrections','earlier_findings','transcription_corrected','corrected_endpoint_m','corrected_allocation_per_endpoint_m','resolved_source_flag_ids','accepted_open_flag_ids','entry_id','counted_flagged_allocation_php'],csvRows)}>Export review CSV</button>
      <button onClick={() => onExportJSON('fmr-red-flags-filtered.json',{stage:stage.key,document:stage.label,measurement_note:analysis.measurementNote,
        summary,counting_basis:'Identical matched NEP/HGAB record versions counted once; differing versions remain separate',config:analysis.config,coordinate_basis:analysis.coordinateBasis,benchmark_population:'Original full selected source; corrected baselines assessed separately',rows:displayRows})}>Export review JSON</button>
    </div>
    <SortableTable tableId="red-flags-records" rows={displayRows} ariaLabel="FMR red-flag projects" pageSize={25} page={page} onPageChange={page => onChange({page})}
      sort={sort} onSortChange={next => {const updated=typeof next === 'function' ? next(sort) : next;change({rf_sort:updated.key,rf_dir:updated.direction});}}
      empty="No projects match these review flags and filters." columns={[
        {key:'source',label:'Budget source',sortable:false,render:row => row.budgetSourceLabel},
        {key:'title',label:'Project',sortable:false,render:row => <button className="fmr-text-button" onClick={() => onChange({rf_project:row.id})}>{row.project.title}<small>{row.project.region} · {row.members.map(member=>member.id).join(' · ')}</small></button>},
        {key:'reviewStatus',label:'Review status',sortable:false,render:row => <span className={`fmr-badge ${row.flagCount ? 'review' : 'balanced'}`}>{row.reviewStatus}</span>},
        {key:'flagCount',label:'Review flags',value:row => row.flagCount,render:row => <div className="fmr-redflag-tags">{(tierMode ? sortFlagsByTier(row.flags) : row.flags).map(flag => <FlagTag key={flag.id} id={flag.id} label={ruleLabels[flag.id]} tierMode={tierMode} resolution={flag.resolution} onExplain={() => setExplainSelection({id:flag.id,row})}/>)}</div>},
        {key:'amount_php',label:'Allocation (PHP)',align:'num',value:row => row.project.amount_php,render:row => money(row.project.amount_php)},
        {key:'meters',label:'Summed endpoint spans (m)',align:'num',render:row => <>{format(row.meters)}<small>Min {format(row.shortestMeters)} · max {format(row.longestMeters)} m</small></>},
        {key:'proxyPhpPerMeter',label:'Allocation / endpoint m (proxy)',align:'num',render:row => row.proxyPhpPerMeter == null ? '—' : money(row.proxyPhpPerMeter)},
        {key:'peerMultiple',label:'Peer-median multiple',align:'num',render:row => row.members.map(member=><div key={member.id}>{data.stages[member.stageKey].label}: {member.peerMultiple == null ? '—' : `${format(member.peerMultiple)}×`}<small>{member.benchmark?.scope} · n={member.benchmark?.count ?? 0}</small></div>)},
        {key:'evidence',label:'Evidence',sortable:false,render:row => <div className="fmr-redflag-links"><button type="button" onClick={() => onMap(row)}>View on map</button><button onClick={() => onChange({rf_project:row.id})}>Review details</button>{row.members.map(member=><button key={member.id} onClick={() => onPdf(member.project.source)} className="fmr-redflag-pdf">{data.stages[member.stageKey].label} · {member.project.source.source_pdf} · p. {member.project.source.pdf_page}</button>)}</div>},
      ]}/>
    {selected && <Evidence key={selected.id} onMap={onMap} row={selected} data={data} onClose={() => onChange({rf_project:null})} onPdf={onPdf} onExplain={setExplainSelection} tierMode={tierMode}/>}
    {params.rf_project && !selected && <p role="alert">This review record is unavailable in the selected source. <button onClick={() => onChange({rf_project:null})}>Clear review selection</button></p>}
    </>}
    {mapRecord && <Suspense fallback={<p role="status">Loading project map…</p>}>
      <FmrSegmentModal key={mapRecord.id} record={mapRecord} onClose={() => setMapRecord(null)}/>
    </Suspense>}
    {explainSelection && <FlagExplainerDialog selection={explainSelection} config={analysis.config} onClose={() => setExplainSelection(null)}/>}
  </section>;
}
