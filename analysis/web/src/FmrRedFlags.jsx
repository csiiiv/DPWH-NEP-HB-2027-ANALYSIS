import React, {useEffect, useMemo, useRef} from 'react';
import SortableTable from './SortableTable.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {money} from './fmrModel.js';
import {buildFmrRedFlags, RED_FLAG_RULES, RED_FLAG_MEASUREMENT_NOTE} from './fmrRedFlags.js';

const format = value => value == null ? '—' : value.toLocaleString('en-PH', {maximumFractionDigits:2});
const fields = [['rf_short_m','shortMeters','Short section below (m)',1],['rf_long_km','longKm','Long section above (km)',1],
  ['rf_cost_multiple','costMultiple','Minimum peer-median multiple',1],['rf_increase_pct','increasePercent','Candidate increase at least (%)',0]];
const ruleLabels = Object.fromEntries(RED_FLAG_RULES.map(rule => [rule.id, rule.label]));

function Evidence({row, stage, onClose, onPdf, mapParams}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className="fmr-dialog fmr-redflag-dialog" aria-label="Red-flag evidence" onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{row.project.title}</h2><button onClick={onClose}>Close review</button></div>
    <p>{stage.label} · {row.id} · {money(row.project.amount_php)}</p>
    <p className="fmr-muted">{RED_FLAG_MEASUREMENT_NOTE}</p>
    <dl className="fmr-redflag-metrics">
      <dt>Summed endpoint spans</dt><dd>{format(row.meters)} m</dd>
      <dt>Shortest / longest section</dt><dd>{format(row.shortestMeters)} / {format(row.longestMeters)} m</dd>
      <dt>Allocation per endpoint meter</dt><dd>{row.proxyPhpPerMeter == null ? 'Unavailable: incomplete, repeated, zero-length or unresolved geometry' : `${money(row.proxyPhpPerMeter)} / m`}</dd>
      <dt>Peer baseline</dt><dd>{row.benchmark ? `${row.benchmark.scope} · ${row.benchmark.count} eligible projects · median ${money(row.benchmark.median)} / m` : 'Fewer than 20 eligible projects: no rate-outlier flag assigned'}</dd>
    </dl>
    <ul className="fmr-redflag-findings">{row.flags.map(flag => <li key={flag.id}>
      <strong>{ruleLabels[flag.id]}</strong><p>{flag.detail}</p>
      {flag.peerIds && <div className="fmr-redflag-links">{flag.peerIds.map(id => <a key={id} href={routeHref(stage.key,{node:id})}>{id} → source</a>)}</div>}
      {flag.pairId && <a href={routeHref('compare',{view:'projects',pair:flag.pairId})}>Inspect both candidate sources →</a>}
    </li>)}</ul>
    <div className="fmr-redflag-links"><a href={routeHref('map',{...mapParams,project:row.id,focus:'red_flag'})}>View on map</a><a href={routeHref(stage.key,{node:row.id})}>Open source tree →</a>
      <button onClick={() => onPdf(row.project.source)}>Open source PDF p. {row.project.source.pdf_page}</button></div>
  </dialog>;
}

export default function FmrRedFlags({data, stage, projects, route, onChange, onPdf, onExportCSV, onExportJSON}) {
  const params = Object.fromEntries(route.params);
  const analysis = useMemo(() => buildFmrRedFlags(data, stage.key, {
    shortMeters:params.rf_short_m,longKm:params.rf_long_km,costMultiple:params.rf_cost_multiple,increasePercent:params.rf_increase_pct,
  }), [data,stage.key,params.rf_short_m,params.rf_long_km,params.rf_cost_multiple,params.rf_increase_pct]);
  const mapParams = Object.fromEntries(fields.map(([param,key]) => [param,analysis.config[key]]));
  const visibleIds = new Set(projects.map(p => p.id));
  const assessed = analysis.rows.filter(row => visibleIds.has(row.id));
  const flagged = assessed.filter(row => row.flagCount > 0);
  const rows = flagged.filter(row => !params.rf_rule || row.flags.some(flag => flag.id === params.rf_rule));
  const selected = analysis.rows.find(row => row.id === params.rf_project);
  const change = patch => onChange({...patch,page:null,rf_project:null});
  const page = Math.max(1, Number(params.page) || 1);
  const sortKey = ['flagCount','amount_php','meters','proxyPhpPerMeter','peerMultiple'].includes(params.rf_sort) ? params.rf_sort : 'flagCount';
  const sort = {key:sortKey,direction:params.rf_dir === 'asc' ? 'asc' : 'desc'};
  const csvRows = rows.map(row => [stage.key,row.id,row.project.title,row.project.region,row.project.amount_php,row.meters,
    row.shortestMeters,row.longestMeters,row.proxyPhpPerMeter,row.benchmark?.scope,row.benchmark?.count,row.benchmark?.median,
    row.benchmark?.threshold,row.peerMultiple,row.flags.map(f => f.id).join(';'),row.flags.map(f => f.detail).join(' | '),
    row.project.source.source_pdf,row.project.source.pdf_page,row.project.source.printed_page]);
  return <section className="fmr-redflags" aria-label="FMR red-flag review">
    <p className="fmr-notice">{RED_FLAG_MEASUREMENT_NOTE} Review endpoint geometry before interpreting an unusually high proxy. Scope, width, terrain, bridges and measured road length need separate evidence.</p>
    <div className="fmr-filters fmr-redflag-controls">
      {fields.map(([param,key,label,min]) => <label key={param}>{label}<input type="number" min={min} step="any"
        aria-label={label} value={params[param] ?? analysis.config[key]} onChange={e => change({[param]:e.target.value})}/></label>)}
      <button onClick={() => change(Object.fromEntries(fields.map(([param]) => [param,null])))}>Reset review thresholds</button>
    </div>
    <details className="fmr-method"><summary>How these review flags are calculated</summary>
      <p>Short and long screens inspect individual sections; the proxy divides the project allocation once by the sum of all complete section spans. Missing, zero-length, repeated or unresolved geometry is excluded from rate calculations.</p>
      <p>Rate baselines use the full selected budget source, independent of search and region filters. A regional cohort needs at least 20 eligible projects; otherwise the whole source is used, also with a minimum of 20. High proxies must exceed both {analysis.config.costMultiple}× the median and Q3 + 3×IQR. These are peer outliers, not engineering price limits.</p>
      <p>Repeated coordinates are screened within one source document; expected repetitions between NEP and House are excluded. Province disagreement uses PSGC versus the parsed title locality. Candidate allocation increases still require identity and scope verification.</p>
      <ul>{RED_FLAG_RULES.map(rule => <li key={rule.id}><strong>{rule.label}:</strong> {rule.description}</li>)}</ul>
    </details>
    <div className="fmr-stats">
      <div className="fmr-stat"><span>Flagged source projects</span><strong>{flagged.length.toLocaleString()}</strong><small>of {assessed.length.toLocaleString()} matching projects</small></div>
      <div className="fmr-stat"><span>Allocation on flagged projects</span><strong>{money(flagged.reduce((sum,row) => sum+row.project.amount_php,0))}</strong><small>Each project counted once; categories overlap</small></div>
      <div className="fmr-stat"><span>Eligible proxy denominators</span><strong>{assessed.filter(r => r.proxyPhpPerMeter != null).length.toLocaleString()}</strong><small>Complete, positive, resolved geometry</small></div>
      <div className="fmr-stat"><span>Excluded proxy denominators</span><strong>{assessed.filter(r => r.proxyPhpPerMeter == null).length.toLocaleString()}</strong><small>No partial or invented lengths</small></div>
    </div>
    <div className="fmr-filters"><label>Review flag<select aria-label="Review flag" value={params.rf_rule || ''} onChange={e => change({rf_rule:e.target.value})}>
      <option value="">All review flags · {flagged.length}</option>{RED_FLAG_RULES.map(rule => <option key={rule.id} value={rule.id}>{rule.label} · {flagged.filter(r => r.flags.some(f => f.id === rule.id)).length}</option>)}
    </select></label></div>
    <div className="fmr-result-bar"><span>{rows.length.toLocaleString()} review projects · {stage.label}</span>
      <button onClick={() => onExportCSV('fmr-red-flags-filtered.csv', ['stage','source_id','title','region','allocation_php','summed_endpoint_m','shortest_section_m','longest_section_m',
        'allocation_per_endpoint_m_proxy','peer_scope','peer_count','peer_median_proxy','peer_threshold_proxy','peer_multiple','flag_ids','flag_explanations','source_pdf','pdf_page','printed_page'],csvRows)}>Export review CSV</button>
      <button onClick={() => onExportJSON('fmr-red-flags-filtered.json',{stage:stage.key,document:stage.label,measurement_note:analysis.measurementNote,
        config:analysis.config,benchmark_population:'Full selected source, independent of display filters',rows})}>Export review JSON</button>
    </div>
    <SortableTable rows={rows} ariaLabel="FMR red-flag projects" pageSize={25} page={page} onPageChange={page => onChange({page})}
      sort={sort} onSortChange={next => {const updated=typeof next === 'function' ? next(sort) : next;change({rf_sort:updated.key,rf_dir:updated.direction});}}
      empty="No projects match these review flags and filters." columns={[
        {key:'title',label:'Project',sortable:false,render:row => <button className="fmr-text-button" onClick={() => onChange({rf_project:row.id})}>{row.project.title}<small>{row.project.region} · {row.id}</small></button>},
        {key:'flagCount',label:'Review flags',value:row => row.flagCount,render:row => <div className="fmr-redflag-tags">{row.flags.map(flag => <span key={flag.id} title={flag.detail}>{ruleLabels[flag.id]}</span>)}</div>},
        {key:'amount_php',label:'Allocation (PHP)',align:'num',value:row => row.project.amount_php,render:row => money(row.project.amount_php)},
        {key:'meters',label:'Summed endpoint spans (m)',align:'num',render:row => <>{format(row.meters)}<small>Min {format(row.shortestMeters)} · max {format(row.longestMeters)} m</small></>},
        {key:'proxyPhpPerMeter',label:'Allocation / endpoint m (proxy)',align:'num',render:row => row.proxyPhpPerMeter == null ? '—' : money(row.proxyPhpPerMeter)},
        {key:'peerMultiple',label:'Peer-median multiple',align:'num',render:row => row.peerMultiple == null ? '—' : <>{format(row.peerMultiple)}×<small>{row.benchmark.scope} · n={row.benchmark.count}</small></>},
        {key:'evidence',label:'Evidence',sortable:false,render:row => <div className="fmr-redflag-links"><a href={routeHref('map',{...mapParams,project:row.id,focus:'red_flag'})}>View on map</a><button onClick={() => onChange({rf_project:row.id})}>Review details</button><button onClick={() => onPdf(row.project.source)}>PDF p. {row.project.source.pdf_page}</button></div>},
      ]}/>
    {selected && <Evidence mapParams={mapParams} row={selected} stage={stage} onClose={() => onChange({rf_project:null})} onPdf={onPdf}/>}
    {params.rf_project && !selected && <p role="alert">This review record is unavailable in the selected source. <button onClick={() => onChange({rf_project:null})}>Clear review selection</button></p>}
  </section>;
}
