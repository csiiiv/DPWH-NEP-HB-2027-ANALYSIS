// DOH HFEP workspace: per-document source verification for the FY2027 Health
// Facilities Enhancement Program annexes. Both stages are presented side by
// side with title-matched review pairs, never merged. Both annexes include
// national and LGU capital outlays, with different category allocations,
// so pairs are evidence pointers, not identity claims (see the payload's
// matching_note). The skeleton mirrors FmrApp.jsx.
import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import AnalysisValue from './AnalysisValue.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';
import {siteUrl} from './data.js';
import {money, compactMoney, csvText, sortRows, medianNumber} from './fmrModel.js';
import {
  COLUMN_LABELS, FUND_COLUMNS, READING_IDENTICAL_PAGES, readingNote,
  buildStageIndex, nodeOf, nodePath, facilityOf, facilityScope, controlArithmetic, scopeRows,
  facilityStats, facilityStatus, statusLabels, flagLabel, FLAG_INFO, lineageLabel, LINEAGE_INFO,
  normalizationLabel, NORMALIZATION_INFO, filterFacilities, provenanceOptions, reviewCategories,
  matchesReviewCategory, bandRows, roundingLadder, repeatedAmounts, facilityCsv,
  HFEP_BANDS, columnAmount, columnSum, isInterpreted,
  comparisonIndex, filterComparisons, comparisonCsv, hfepTabs,
  COMPONENT_COLUMNS, lineItemRecords, filterRecords, recordAggregates, RECORD_EVENT_LABELS, recordsCsv,
} from './hfepModel.js';
import './Fmr.css';
import {hfepCategoryMovements, hfepColumnReconciliation, hfepControlEvidence, hfepHighlights} from './hfepHighlights.js';
import {HighlightAction, HighlightSummary} from './AnnexHighlightEvidence.jsx';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const DATA_URL = 'other-analysis/data/hfep_workbench.json';

const routeParams = params => Object.fromEntries(params);
function navigate(route, patch) {
  // Merge onto the *current* URL state, not the React route prop: rapid
  // successive interactions (dialog close → clear filters → select) can
  // outpace hashchange processing, and a stale route would resurrect
  // params an earlier write already cleared.
  const current = Object.fromEntries(readRoute().params);
  const next = {...current, ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = routeHref(route.key, next);
}
function download(name, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function jsonDownload(name, value) {
  download(name, JSON.stringify(value, null, 2), 'application/json');
}
export function Stat({label, value, detail}) {
  return <div className="fmr-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function Amount({value, exact = false, title}) {
  return <span title={title ?? money(value)}>{exact ? money(value) : compactMoney(value)}</span>;
}
function ViewTabs({route, views, defaultView}) {
  const selected = route.params.get('view') || defaultView;
  return <nav className="view-tabs fmr-view-tabs" aria-label="Workspace views">{views.map(([key, label]) =>
    <a key={key} href={routeHref(route.key, {...routeParams(route.params), view: key, page: '1', sort: '', dir: '', node: null, ...(route.key === 'analysis' ? {table:null,records:null,group:null,pair:null,dim:null,event:null,column:null,pdf:null,pdfPage:null,category:null,subcategory:null,status:null,flag:null,lineage:null,minAmount:null,maxAmount:null} : {})})}
      aria-current={selected === key ? 'page' : undefined}>{label}</a>)}</nav>;
}
function Dialog({label, onClose, children, className = ''}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label}
    onCancel={e => {e.preventDefault(); onClose();}}>{children}</dialog>;
}
function ReadingNote() {
  return <details className="fmr-method fmr-reading"><summary>House 2nd ↔ 3rd reading: HFEP annex text identical</summary>
    <p>{readingNote}</p></details>;
}
// A NEP facility's source_pdf may still point at the OCR JSON; the human PDF is
// the stage preview (Volume II-A). House rows already carry Volume I-B.
function pdfPathFor(stage, source) {
  const path = source?.source_pdf || '';
  return path.endsWith('.json') ? stage.preview_pdf : path;
}
// Resolve which annex PDF a source row belongs to. Never ask every stage's
// pdfPathFor for a JSON source — that maps JSON → each stage's preview and
// falsely matches House first.
function resolvePdfStage(data, source, preferredKey) {
  if (!data || !source) return null;
  if (preferredKey && data.stages[preferredKey]) return data.stages[preferredKey];
  const path = source.source_pdf || '';
  const row = source.row_id || '';
  if (row.startsWith('nep_hfep:') || /HFEP\.pdf|VOLUME-2A|nep_hfep/i.test(path)) return data.stages.nep;
  if (row.startsWith('ib:') || /HB_BUDGET|VOL IB|hgab/i.test(path)) return data.stages.house;
  for (const stage of [data.stages.nep, data.stages.house])
    if (path === stage.preview_pdf) return stage;
  return null;
}
function previewSource(stage, node) {
  return {url: siteUrl(pdfPathFor(stage, node.source)), document: pdfPathFor(stage, node.source).split('/').pop(),
    title: node.label.length > 80 ? `${node.label.slice(0, 77)}…` : node.label, page: node.source.pdf_page};
}
function volumeLabel(stage) {
  return stage.key === 'nep' ? 'Vol II-A' : stage.key === 'house' ? 'Vol I-B' : 'PDF';
}
function SourceButton({stage, source, onPdf, label}) {
  return <button className="fmr-source-button" onClick={() => onPdf(source, stage?.key)}>
    {label || `${volumeLabel(stage)} p. ${source.pdf_page}`}{source.printed_page != null && <small>Printed p. {source.printed_page}</small>}</button>;
}
function PdfPane({source, onClose}) {
  const ref = useRef(null);
  return <aside ref={ref} id="hfep-inline-pdf" className="fmr-workspace-pdf" aria-label="Inline source PDF">
    <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
      <PdfPreview source={source} onClose={onClose} closeLabel="Clear page selection" downloadOriginal autoFocusClose={false}/>
    </Suspense>
  </aside>;
}

const FILTER_KEYS = ['q', 'category', 'subcategory', 'region', 'status', 'flag', 'lineage', 'minAmount', 'maxAmount', 'province'];
const FILTER_LABELS = {q: 'Search', category: 'Category', subcategory: 'Subcategory', region: 'Region', status: 'Facility status',
  flag: 'Extraction flag', lineage: 'Interpretation rule', minAmount: 'Min total', maxAmount: 'Max total', province: 'Province'};
const STATUS_OPTIONS = [['flagged', 'Flagged'], ['interpreted', 'Interpreted'], ['clean', 'Clean']];
function changeFilters(route, patch) {navigate(route, {...patch, page: null});}
function Filters({route, index, review = false, categoryIds}) {
  const params = routeParams(route.params);
  const facilities = index.stage.facilities;
  const options = useMemo(() => provenanceOptions(facilities), [index]);
  const provinces = useMemo(() => [...new Set(facilities.map(f => facilityScope(index, f).province).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', {numeric: true})), [index]);
  const categories = useMemo(() => index.stage.categories.filter(c => !categoryIds || categoryIds.includes(c.id))
    .map(c => [c.label, `${c.label} · ${index.rollup.get(c.id).count} facilities`]), [index, categoryIds]);
  const subcategories = useMemo(() => index.stage.subcategories.map(s => s.label), [index]);
  const regions = useMemo(() => scopeRows(index, 'region').map(r => [r.label, `${r.label} · ${r.count} facilities`]), [index]);
  const clear = () => changeFilters(route, Object.fromEntries(FILTER_KEYS.map(k => [k, null])));
  const select = (key, label, list, empty = `All ${label.toLowerCase()}`) =>
    <label>{label}<select aria-label={label} value={params[key] || ''} onChange={e => changeFilters(route, {[key]: e.target.value})}>
      <option value="">{empty}</option>{list.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <><div className="fmr-filters">
    <label>Search<input data-hfep-search type="search" placeholder="Title, hierarchy, flag or ID"
      value={params.q || ''} onChange={e => changeFilters(route, {q: e.target.value})}/></label>
    {select('category', 'Category', categories)}
    {select('region', 'Region', regions)}
    {select('province', 'Province', provinces.map(p => [p, p]))}
    {select('status', 'Facility status', STATUS_OPTIONS)}
    <button onClick={clear}>Clear filters</button>
  </div>
  <details className="fmr-method" open={FILTER_KEYS.slice(1).some(k => params[k] && k !== 'status')}>
    <summary>Scope and provenance filters</summary>
    <div className="fmr-filters">
      {select('subcategory', 'Subcategory', subcategories.map(s => [s, s]))}
      <label>Min total (PHP)<input type="number" min="0" step="1000" value={params.minAmount || ''}
        onChange={e => changeFilters(route, {minAmount: e.target.value})}/></label>
      <label>Max total (PHP)<input type="number" min="0" step="1000" value={params.maxAmount || ''}
        onChange={e => changeFilters(route, {maxAmount: e.target.value})}/></label>
      {select('flag', 'Extraction flag', options.flags.map(([id, count]) => [id, `${flagLabel(id)} · ${count}`]))}
      {select('lineage', 'Interpretation rule', options.rules.map(([id, count]) => [id, `${lineageLabel(id)} · ${count}`]))}
    </div>
    <p className="fmr-muted">Flags are extraction-time suspicions; interpretation rules record how ambiguous cells were read. Neither changes a printed value.</p>
  </details>
  <div className="fmr-chips" aria-label="Active filters">{FILTER_KEYS.filter(k => params[k]).map(k => {
    const value = k === 'status' ? statusLabels[params[k]] || params[k]
      : k === 'flag' ? flagLabel(params[k]) : k === 'lineage' ? lineageLabel(params[k]) : params[k];
    return <span className="fmr-chip" key={k}>{FILTER_LABELS[k] || k}: {value}
      <button aria-label={`Remove ${FILTER_LABELS[k] || k} filter`} onClick={() => changeFilters(route, {[k]: null})}>×</button></span>;
  })}</div></>;
}

function FlagBadges({facility}) {
  if (!(facility.flags || []).length) return null;
  return <span className="fmr-badge review" title={(facility.flags || []).map(x => typeof x === 'string' ? flagLabel(x) : `${flagLabel(x.flag)}${x.note ? ` — ${x.note}` : ''}`).join('\n')}>
    {(facility.flags || []).map(x => typeof x === 'string' ? flagLabel(x) : flagLabel(x.flag)).join(' · ')}</span>;
}

// The source tree: root › category › subcategory › region › province › facility.
// Controls always show printed amounts; filters dim missing branches rather
// than recompute controls.
function SourceTree({index, facilities, selected, onSelect}) {
  const [expanded, setExpanded] = useState(() => new Set([index.stage.root.id]));
  const stage = index.stage;
  const visible = useMemo(() => new Set(facilities.map(f => f.id)), [facilities]);
  const visibleAncestors = useMemo(() => {
    const ids = new Set();
      for (const id of visible) for (let node = index.byId.get(id); node; node = index.byId.get(node.parent)) ids.add(node.id);
    return ids;
  }, [visible, index]);
  useEffect(() => {
    // Keep the selected node and its ancestors open: drilling down a branch
    // should reveal the next level, not hide it behind manual expanders.
    if (!selected) return;
    const chain = [selected];
    for (let node = index.byId.get(selected); node?.parent; node = index.byId.get(node.parent)) chain.push(node.parent);
    setExpanded(current => new Set([...current, ...chain]));
  }, [selected, index]);
  const toggle = (id, open) => setExpanded(current => {const next = new Set(current); open ? next.add(id) : next.delete(id); return next;});
  const row = (node, depth) => {
    const rollup = index.rollup.get(node.id);
    const open = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const countShown = node.children.filter(c => visibleAncestors.has(c)).length;
    return <li key={node.id} className={selected === node.id ? 'selected' : ''} style={{'--depth': depth}}>
      <div className="fmr-tree-row">
        {hasChildren && <button aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`} aria-expanded={open}
          onClick={() => toggle(node.id, !open)}>{open ? '−' : '+'}</button>}
        <button className="fmr-text-button" data-node={node.id} onClick={() => onSelect(node.id)}>
          {node.label}
          {hasChildren && <small>{node.kind === 'province' || node.kind === 'region'
            ? `${rollup.count} facilities` : `${countShown} of ${node.children.length} branches`}</small>}
        </button>
        <strong><Amount value={columnAmount(node.amounts_php, 'total')}/></strong>
      </div>
      {open && hasChildren && <ul>{node.children.map(child => row(index.byId.get(child), depth + 1))}</ul>}
    </li>;
  };
  const root = index.byId.get(stage.root.id);
  return <section className="fmr-tree" aria-label={`${stage.label} source tree`}>
    <div className={`fmr-tree-root ${selected === stage.root.id ? 'selected' : ''}`}>
      <button className="fmr-text-button" data-node={stage.root.id} onClick={() => onSelect(stage.root.id)}>{root.label}</button>
      <strong><Amount value={columnAmount(root.amounts_php, 'total')}/></strong>
      <small>Program › category › subcategory › region › province › facility · {facilities.length} of {stage.facilities.length} facilities shown</small>
      <div className="fmr-tree-controls">
        <button onClick={() => setExpanded(new Set([stage.root.id, ...index.stage.categories.map(c => c.id)]))}>Expand categories</button>
        <button onClick={() => setExpanded(new Set([stage.root.id]))}>Collapse to program</button>
      </div>
    </div>
    <ul>{root.children.map(child => row(index.byId.get(child), 0))}</ul>
    {!facilities.length && <p>No facilities match these filters.</p>}
    <p className="fmr-muted">Controls keep their full printed amounts under filtering; hidden branches do not reduce them.</p>
  </section>;
}

function ArithmeticDl({index, id}) {
  const arithmetic = controlArithmetic(index, id);
  if (!arithmetic) return null;
  return <dl className="fmr-arithmetic">
    {arithmetic.columns.map(({column, printed, child_sum, facility_sum, difference, facilities, status, defect}) =>
      <React.Fragment key={column}>
        <dt>{COLUMN_LABELS[column]}</dt>
        <dd>{money(printed)}
          {status === 'balanced' && difference === 0 && printed > 0 && <small> balanced · facilities {money(facility_sum)}</small>}
          {status === 'balanced' && printed === 0 && <small> no allocation printed</small>}
          {status === 'documented' && <small className="fmr-badge review" title={`Documented defect ${defect}`}>
            {' '}documented difference {money(difference)}</small>}</dd>
      </React.Fragment>)}
    <dt>Facilities under control</dt><dd>{arithmetic.facilities}</dd>
  </dl>;
}

function ProvenancePanel({facility}) {
  const flags = facility.flags || [], lineage = facility.amount_lineage || [], norms = facility.normalizations || [];
  if (!flags.length && !lineage.length && !norms.length) return null;
  return <div className="fmr-provenance">
    <h3>Provenance</h3>
    {flags.length > 0 && <div className="fmr-flag-list"><strong>Extraction flags</strong>
      <ul>{flags.map((x, i) => <li key={i}><span className="fmr-badge review">{typeof x === 'string' ? flagLabel(x) : flagLabel(x.flag)}</span>
        {typeof x === 'object' && x.note && <small> — {x.note}</small>}
        {typeof x === 'object' && x.id && <small> <code>{x.id}</code></small>}
        <p className="fmr-muted">{FLAG_INFO[typeof x === 'string' ? x : x.flag]?.why}</p></li>)}</ul></div>}
    {norms.length > 0 && <div className="fmr-flag-list"><strong>Label normalizations</strong>
      <ul>{norms.map((n, i) => <li key={i}><span className="fmr-badge interpreted">{normalizationLabel(typeof n === 'string' ? n : n.type)}</span>
        {typeof n === 'object' && n.from != null && <small> “{String(n.from).slice(0, 40)}” → “{String(n.to).slice(0, 40)}”</small>}
        <p className="fmr-muted">{NORMALIZATION_INFO[typeof n === 'string' ? n : n.type]?.why}</p></li>)}</ul></div>}
    {lineage.length > 0 && <div className="fmr-flag-list"><strong>Amount lineage</strong>
      <ul>{lineage.map((step, i) => <li key={i}><code>{COLUMN_LABELS[step.column] || step.column}</code> ·
        <span className="fmr-badge interpreted">{lineageLabel(step.rule)}</span>
        {step.raw != null && <small> raw “{String(step.raw).slice(0, 20)}”</small>}
        {step.interpreted != null && <small> → “{String(step.interpreted).slice(0, 20)}”</small>}
        <p className="fmr-muted">{LINEAGE_INFO[step.rule]?.why}</p></li>)}</ul></div>}
  </div>;
}

function RawAmounts({facility}) {
  const raw = facility.amounts_raw || {};
  const printed = Object.keys(raw).filter(k => raw[k] != null && String(raw[k]) !== String(facility.amounts_php?.[k] ?? ''));
  if (!printed.length) return null;
  return <div className="fmr-method"><h3>Printed amount text</h3>
    <table className="fmr-psgc-table"><caption className="sr-only">Printed amount cells</caption>
      <thead><tr><th scope="col">Column</th><th scope="col">Printed cell</th><th scope="col">Read as</th></tr></thead>
      <tbody>{printed.map(k => <tr key={k}><td>{COLUMN_LABELS[k] || k}</td><td><code>{raw[k]}</code></td>
        <td>{facility.amounts_php?.[k] == null ? '—' : money(facility.amounts_php[k])}</td></tr>)}</tbody>
    </table></div>;
}

function Evidence({index, id, onPdf}) {
  const stage = index.stage;
  const node = nodeOf(index, id);
  const facility = facilityOf(index, id);
  if (!node) return <p role="alert">Source ID not found. <button onClick={() => onSelectRoot(index)}>Select the program control</button></p>;
  const path = nodePath(index, id);
  return <section className="fmr-evidence" aria-label="Selected source evidence">
    <p className="fmr-eyebrow">{facility ? 'Facility evidence' : node.kind === 'grand_total' ? 'Annex grand total' : 'Printed control'}</p>
    <h2>{node.label}</h2>
    <p className="fmr-evidence-amount"><Amount value={columnAmount(node.amounts_php, 'total')} exact/></p>
    {facility && <p className="fmr-muted">{[facilityScope(index, facility).category, facilityScope(index, facility).subcategory,
      facilityScope(index, facility).region, facilityScope(index, facility).province].filter(Boolean).join(' › ')}</p>}
    <nav className="fmr-breadcrumbs" aria-label="Source breadcrumbs">{path.map((step, i) => <React.Fragment key={step.id}>
      {i > 0 && <span className="sep">›</span>}<a href={routeHref(stage.key, {node: step.id, view: 'tree'})}>{step.label}</a>
    </React.Fragment>)}</nav>
    <p><code>{id}</code></p>
    <ArithmeticDl index={index} id={id}/>
    <p><SourceButton stage={stage} source={node.source} onPdf={onPdf}
      label={`${volumeLabel(stage)} p. ${node.source.pdf_page}`}/></p>
    {facility && <>
      <table className="fmr-psgc-table"><caption className="sr-only">Funding columns</caption>
        <thead><tr><th scope="col">Column</th><th scope="col">Amount</th></tr></thead>
        <tbody>{FUND_COLUMNS.map(column => <tr key={column}><td>{COLUMN_LABELS[column]}</td>
          <td>{columnAmount(facility.amounts_php, column) == null ? '—' : money(columnAmount(facility.amounts_php, column))}</td></tr>)}</tbody>
      </table>
      <FlagBadges facility={facility}/>
      <ProvenancePanel facility={facility}/>
      <RawAmounts facility={facility}/>
    </>}
  </section>;
}
function onSelectRoot(index) {window.location.hash = routeHref(index.stage.key, {node: index.stage.root.id, view: 'tree'});}

function FacilityTable({index, facilities, onSelect, onPdf, tableId, initialSort = {key: 'title', direction: 'asc'}}) {
  const columns = [
    {key: 'title', label: 'Facility', render: f => <button className="fmr-text-button" onClick={() => onSelect(f.id)}>{f.title}</button>},
    {key: 'region', label: 'Region', value: f => facilityScope(index, f).region},
    {key: 'province', label: 'Province', value: f => facilityScope(index, f).province},
    {key: 'infrastructure', label: 'Infra', align: 'num', value: f => columnAmount(f.amounts_php, 'infrastructure'),
      render: f => <Amount value={columnAmount(f.amounts_php, 'infrastructure')}/>},
    {key: 'medical_equipment', label: 'Med equip', align: 'num', value: f => columnAmount(f.amounts_php, 'medical_equipment'),
      render: f => <Amount value={columnAmount(f.amounts_php, 'medical_equipment')}/>},
    {key: 'motor_vehicle', label: 'Motor veh', align: 'num', value: f => columnAmount(f.amounts_php, 'motor_vehicle'),
      render: f => <Amount value={columnAmount(f.amounts_php, 'motor_vehicle')}/>},
    {key: 'total', label: 'Total (PHP)', align: 'num', value: f => columnAmount(f.amounts_php, 'total'),
      render: f => <Amount value={columnAmount(f.amounts_php, 'total')}/>},
    {key: 'status', label: 'Status', value: f => facilityStatus(f), render: f => (f.flags || []).length ? <FlagBadges facility={f}/>
      : isInterpreted(f) ? <span className="fmr-badge interpreted">{statusLabels.interpreted}</span>
      : <span className="fmr-badge balanced">{statusLabels.clean}</span>},
    {key: 'source', label: 'Source', value: f => f.source.pdf_page, render: f => <SourceButton stage={index.stage} source={f.source} onPdf={onPdf}/>},
  ];
  return <SortableTable tableId={tableId} rows={facilities} columns={columns} initialSort={initialSort} ariaLabel="HFEP facilities" pageSize={25}/>;
}

function SourceWorkspace({index, route, onPdf, inlineSource}) {
  const stage = index.stage, view = route.params.get('view') || 'tree', filters = routeParams(route.params);
  const facilities = useMemo(() => filterFacilities(stage.facilities, filters),
    [stage, filters.q, filters.category, filters.subcategory, filters.region, filters.province, filters.status, filters.flag, filters.lineage, filters.minAmount, filters.maxAmount]);
  const nodeId = filters.node || stage.root.id;
  const node = nodeOf(index, nodeId);
  const selectedSource = useMemo(() => node ? previewSource(stage, node) : null, [stage, nodeId]);
  const [panel, setPanel] = useState(filters.node ? 'evidence' : 'tree');
  const pdfRef = useRef(null), previousView = useRef(view);
  useEffect(() => {setPanel(previousView.current !== view && view !== 'tree' ? 'tree' : filters.node ? 'evidence' : 'tree');previousView.current = view;}, [view, nodeId]);
  const selectPdf = source => {onPdf(source); if (window.matchMedia('(max-width:1050px)').matches) pdfRef.current?.scrollIntoView({block: 'start'});};
  useEffect(() => {const focusSearch = e => {if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {e.preventDefault(); document.querySelector('[data-hfep-search]')?.focus();}};window.addEventListener('keydown', focusSearch);return () => window.removeEventListener('keydown', focusSearch);}, []);
  const queue = view === 'review' ? facilities.filter(f => matchesReviewCategory(f, filters.category_level || filters.flag)) : [];
  const resetWorkspace = () => {navigate(route, {view: 'tree', node: null, pdf: null, pdfPage: null, ...Object.fromEntries(FILTER_KEYS.map(k => [k, null]))});};
  const categories = useMemo(() => reviewCategories(facilities), [facilities]);
  return <>
    <div className="fmr-page-title"><div>
      <p className="fmr-eyebrow">FY2027 · Source verification · {stage.legislative_stage === 'executive_proposal' ? 'Executive proposal' : 'House bill'}</p>
      <h1>{stage.label}</h1>
      <p>{stage.scope}.</p>
    </div><ShareLink/></div>
    {stage.key === 'house' && <ReadingNote/>}
    <div className="fmr-stats">
      <Stat label="Printed annex control" value={<Amount value={columnAmount(stage.annex_control, 'total')} exact/>}
        detail={`${stage.audit_summary.internal_control_checks} balanced control checks`}/>
      <Stat label="Facility ledger" value={<Amount value={columnAmount(stage.facility_ledger, 'total')} exact/>}
        detail={`${stage.facilities.length} facilities · every facility once`}/>
      <Stat label="Funding columns" value="4" detail="Infrastructure · medical equipment · motor vehicle · total"/>
      <Stat label="Extraction findings" value={(stage.printed_defects || []).length ? `${stage.printed_defects.length} documented` : 'None documented'}
        detail={stage.key === 'nep' ? '₱140,000 Metro Manila medical-equipment overhang' : 'All controls reconcile to the peso'}/>
    </div>
    <ViewTabs route={route} defaultView="tree" views={[['tree', 'Source tree'], ['facilities', 'Facilities'], ['review', 'Extraction review']]}/>
    <Filters route={route} index={index} review={view === 'review'}/>
    {view === 'review' && <><div className="fmr-chips" aria-label="Review categories">
      <button aria-pressed={!filters.review_category} onClick={() => changeFilters(route, {review_category: null})}>All findings · {facilities.filter(f => (f.flags || []).length || (f.amount_lineage || []).length || (f.normalizations || []).length).length}</button>
      {categories.map(c => <button key={c.id} aria-pressed={filters.review_category === c.id}
        onClick={() => changeFilters(route, {review_category: c.id})}>{c.label} · {c.count}</button>)}
    </div><p className="fmr-muted">Categories overlap: a facility can carry both a flag and an interpretation rule. Neither changes a printed amount.</p>
    <div className="fmr-queue-bar"><span>{queue.length} facilities in this review scope</span></div></>}
    <div className="fmr-result-bar">
      <span>{facilities.length.toLocaleString()} matching facilities · <Amount value={columnSum(facilities, 'total')} exact/></span>
      <button onClick={() => download(`hfep-${stage.key}-facilities.csv`, facilityCsv(facilities, index))}>Export filtered CSV</button>
      <a href={siteUrl(stage.preview_pdf)} download>Download source PDF</a>
      <button onClick={resetWorkspace}>Reset workspace</button>
    </div>
    <div className="fmr-mobile-panels">
      <button aria-pressed={panel === 'tree'} onClick={() => setPanel('tree')}>Tree / results</button>
      <button aria-pressed={panel === 'evidence'} onClick={() => setPanel('evidence')}>Selected evidence</button>
      <button onClick={() => pdfRef.current?.scrollIntoView({block: 'start'})}>Show source PDF</button>
    </div>
    {['tree', 'facilities', 'review'].includes(view) ? <div className="fmr-workspace-grid">
      <div className={`fmr-workspace-content mobile-${panel}`}>
        <div className="fmr-source-results">
          {view === 'tree' ? <SourceTree index={index} facilities={facilities} selected={nodeId} onSelect={id => {navigate(route, {node: id, pdf: null, pdfPage: null}); setPanel('evidence');}}/>
            : <FacilityTable index={index} facilities={facilities} onSelect={id => {navigate(route, {node: id, view: 'tree', pdf: null, pdfPage: null});}} onPdf={selectPdf}/>}
        </div>
        <div className="fmr-selected-evidence"><Evidence index={index} id={nodeId} onPdf={selectPdf}/></div>
      </div>
      <div ref={pdfRef}>{(inlineSource || selectedSource) && <PdfPane source={inlineSource || selectedSource} onClose={() => navigate(route, {pdf: null, pdfPage: null})}/>}</div>
    </div> : <p>Unknown view. <a href={routeHref(stage.key)}>Open source tree</a>.</p>}
  </>;
}

function ScopeTable({rows, onDrill, route, tableId}) {
  const sort = routeSort(route, ['label', 'count', 'infrastructure', 'medical_equipment', 'motor_vehicle', 'total', 'median', 'flagged']);
  return <SortableTable tableId={tableId} rows={rows} sort={sort} onSortChange={update => routeSetSort(route, update, sort)} ariaLabel="HFEP regional allocation" initialSort={{key: 'total', direction: 'desc'}} columns={[
    {key: 'label', label: 'Region', scope: 'row', render: r => <button className="fmr-text-button" onClick={() => onDrill(r.label)}>{r.label} → records</button>},
    {key: 'count', label: 'Facilities', align: 'num'},
    {key: 'province_count', label: 'Provinces', align: 'num'},
    {key: 'infrastructure', label: 'Infra (PHP)', align: 'num', render: r => <Amount value={r.infrastructure}/>},
    {key: 'medical_equipment', label: 'Med equip (PHP)', align: 'num', render: r => <Amount value={r.medical_equipment}/>},
    {key: 'motor_vehicle', label: 'Motor veh (PHP)', align: 'num', render: r => <Amount value={r.motor_vehicle}/>},
    {key: 'total', label: 'Total (PHP)', align: 'num', render: r => <Amount value={r.total} exact/>},
    {key: 'median', label: 'Median (PHP)', align: 'num', render: r => <Amount value={r.median}/>},
    {key: 'flagged', label: 'Findings', align: 'num'},
  ]}/>;
}
function routeSort(route, keys, defaultKey = 'total') {
  const requested = route.params.get('sort');
  return requested === 'none' ? null : {key: keys.includes(requested) ? requested : defaultKey, direction: route.params.get('dir') === 'asc' ? 'asc' : 'desc'};
}
function routeSetSort(route, update, sort) {
  const next = typeof update === 'function' ? update(sort) : update;
  navigate(route, {sort: next?.key || 'none', dir: next?.direction || null, page: null});
}

// Cross-document analysis views. A "record" here is a line-item pair (or a
// single unmatched row): both annexes retain national and LGU facilities. The NEP
// annex records all rows, so insertion/deletion candidates reflect grain and
// scope differences between the two annexes, not confirmed legislative edits.
function aggregateBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = key(row);
    if (label == null) continue;
    const entry = groups.get(label) || {id: label, label, rows: 0, amount_php: 0};
    entry.rows++;
    // Facility rows carry amounts_php; line-item records carry a single side value.
    entry.amount_php += row.amounts_php
      ? (columnAmount(row.amounts_php, 'total') || 0)
      : (row.house_value ?? row.nep_value ?? 0);
    groups.set(label, entry);
  }
  return [...groups.values()].sort((a, b) => b.amount_php - a.amount_php || a.label.localeCompare(b.label));
}
function LineItemTable({records, route, onPdf, data, tableId, side, label='HFEP group line-item records'}) {
  const initialSort={key:side ? 'amount' : 'difference',direction:'desc'};
  const sort=routeSort(route,['title','event','amount','house_value','nep_value','difference'],initialSort.key);
  const page=Math.min(Math.max(1,Number(route.params.get('page')) || 1),Math.max(1,Math.ceil(records.length/25)));
  return <SortableTable tableId={tableId} rows={records} ariaLabel={label} sort={sort} onSortChange={update => routeSetSort(route,update,sort)} page={page} onPageChange={update => navigate(route,{page:typeof update === 'function' ? update(page) : update})} initialSort={initialSort} pageSize={25} columns={[
        ...(side ? [{key:'amount',label:`${side === 'house' ? 'House' : 'NEP'} allocation (PHP)`,align:'num',value:r => r[`${side}_value`],render:r => <AnalysisValue value={r[`${side}_value`]}/>}] : []),
        {key: 'title', label: 'Facility record', scope: 'row', render: r => <>{r.title}<small>{r.column_label} · {r.region}{r.province ? ` · ${r.province}` : ''}</small></>},
        {key: 'event', label: 'Event', render: r => RECORD_EVENT_LABELS[r.event]},
        {key: 'house_value', label: 'House (PHP)', align: 'num', render: r => <AnalysisValue value={r.house_value}/>},
        {key: 'nep_value', label: 'NEP (PHP)', align: 'num', render: r => <AnalysisValue value={r.nep_value}/>},
        {key: 'difference', label: 'NEP − House (PHP)', align: 'num', value: r => r.difference, render: r => <AnalysisValue value={r.difference} signed/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <>
          {r.house_source && r.event !== 'added' && <SourceButton stage={data.stages.house} source={r.house_source} onPdf={onPdf} label={`${volumeLabel(data.stages.house)} p. ${r.house_source.pdf_page}`}/>}
          {r.nep_source && r.event !== 'dropped' && <SourceButton stage={data.stages.nep} source={r.nep_source} onPdf={onPdf} label={`${volumeLabel(data.stages.nep)} p. ${r.nep_source.pdf_page}`}/>}</>},
        {key: 'review', label: 'Review', sortable: false, render: r => r.pair_id
          ? <a href={routeHref('compare', {view: 'pairs', q: r.title.slice(0, 40)})}>Compare pair</a>
          : <a href={routeHref(r.side, {q: r.title.slice(0, 40)})}>Search {r.side === 'house' ? 'House' : 'NEP'} annex</a>},
      ]}/>;
}
function RecordGroupDialog({records, route, onPdf, data, dim, side, label}) {
  const group=route.params.get('group');
  const members=records.filter(r => (r[dim] || '(Not printed)') === group);
  const close=() => navigate(route,{group:null,table:null,page:null});
  return <Dialog label="HFEP analysis group records" onClose={close}>
    <div className="fmr-dialog-heading"><h2>{group}</h2><button onClick={close}>Close records</button></div>
    <div className="fmr-chips" aria-label="Record scope"><span className="fmr-chip">Dimension: {dim}</span><span className="fmr-chip">Population: {label}</span>{(side ? ['q','region','column','event'] : []).filter(k => route.params.get(k)).map(k => <span className="fmr-chip" key={k}>{k}: {route.params.get(k)}</span>)}</div>
    {members.length ? <><p>{members.length.toLocaleString('en-PH')} funding-column records · {side ? money(members.reduce((sum,r) => sum+r[`${side}_value`],0)) : 'revised, added and dropped records'}</p>
      <button onClick={() => download('hfep-group-records.csv',recordsCsv(members))}>Export group CSV</button>
      <LineItemTable tableId={`${route.params.get('view')}-group-records`} records={members} route={route} onPdf={onPdf} data={data} side={side}/>
      <p><a href={routeHref('compare',{view:'pairs',region:dim === 'region' ? group : route.params.get('region'),q:route.params.get('q')})}>Continue in Compare stages →</a></p></>
      : <p role="alert">Unknown analysis group or no records in the current scope. Close records and select a group from the table.</p>}
  </Dialog>;
}
function CrossDocAggregate({title, records, route, tableId, onPdf, data, side}) {
  const params=routeParams(route.params), dim=['overall','region','province','category','subcategory','column'].includes(params.dim) ? params.dim : 'region';
  const groups=aggregateBy(records,r => r[dim] || '(Not printed)');
  return <><div className="dimension-chips" role="group" aria-label="Break down by">{[['overall','Overall'],['region','Region'],['province','Province'],['category','Category'],['subcategory','Subcategory'],['column','Funding column']].map(([key,label]) => <button key={key} className={dim===key?'active':''} aria-pressed={dim===key} onClick={() => navigate(route,{dim:key,group:null,table:null,page:null})}>{label}</button>)}</div>
    {dim !== 'overall' && <div className="fmr-section aggregate-table"><h3>{title.replace('by region',`by ${dim}`)} · {groups.length} groups</h3>
      <SortableTable tableId={tableId.replace('region',dim)} rows={groups} ariaLabel={title.replace('by region',`by ${dim}`)} initialSort={{key:'amount_php',direction:'desc'}} empty="No unmatched records in this scope." columns={[
        {key:'label',label:'Group',scope:'row',render:r => <button className="group-open" onClick={() => navigate(route,{group:r.label,page:null,table:null})}>{dim === 'column' ? COLUMN_LABELS[r.label] || r.label : r.label}</button>},
        {key:'rows',label:'Funding-column records',align:'num'},
        {key:'amount_php',label:'Allocation (PHP)',align:'num',render:r => <AnalysisValue value={r.amount_php}/>},
      ]}/></div>}
    {params.group && <RecordGroupDialog records={records} route={route} onPdf={onPdf} data={data} dim={dim} side={side} label={side === 'house' ? 'House-only candidates' : 'NEP-only candidates'}/>}
  </>;
}
function unmatchedRecords(comparison, side) {
  return lineItemRecords(comparison).filter(r => r.event === 'unmatched' && r.side === side);
}
function Insertions({comparison, route, onPdf, data}) {
  const houseStage = data.stages.house;
  const records = filterRecords(unmatchedRecords(comparison, 'house'),routeParams(route.params));
  const facilities = comparison.house_only_rows;
  const total = records.reduce((s, r) => s + (r.house_value || 0), 0);
  return <>
    <div className="fmr-stats">
      <Stat label="Unmatched House records" value={records.length} detail={`${facilities.length} facility rows · one record per printed funding column`}/>
      <Stat label="House-only allocation" value={<Amount value={total} exact/>} detail="sum of unmatched printed component cells"/>
      <Stat label="Matched pairs" value={comparison.rows.length} detail={`of ${comparison.rows.length + facilities.length} House rows`}/>
      <Stat label="Rest matches" value={`${Math.round(comparison.rows.length / (comparison.rows.length + facilities.length) * 100)}%`} detail="at ≥0.95 title similarity"/>
    </div>
    <p className="fmr-notice">These are review candidates at funding-column record grain (infrastructure, medical equipment or motor vehicle on an unmatched House facility), not confirmed insertions. An unmatched House record can reflect a different title, grouping or funding column. Verify against the NEP annex before claiming an insertion.</p>
    <CrossDocAggregate tableId="insertions-by-region" title="Unmatched House records by region" records={records} side="house" route={route} data={data} onPdf={onPdf}/>
    <section className="fmr-section"><h3>Top unmatched House records</h3><button onClick={() => download('hfep-house-unmatched-records.csv',recordsCsv(records))}>Export filtered records CSV</button>
      <SortableTable tableId="insertions-records" rows={[...records].sort((a, b) => (b.house_value || 0) - (a.house_value || 0)).slice(0, 150)
        .map((r, i) => ({...r, rank: i + 1}))} ariaLabel="Top unmatched House records" initialSort={{key: 'rank', direction: 'asc'}} pageSize={25} columns={[
        {key: 'rank', label: '#', value: r => r.rank},
        {key: 'title', label: 'House record', scope: 'row', render: r => <><a href={routeHref('house', {node: r.facility_id, view: 'tree'})}>{r.title}</a><small>{r.column_label}</small></>},
        {key: 'column', label: 'Funding column', value: r => r.column_label},
        {key: 'region', label: 'Region', value: r => r.region, render: r => r.region},
        {key: 'province', label: 'Province', value: r => r.province, render: r => r.province},
        {key: 'amount', label: 'House amount (PHP)', align: 'num', value: r => r.house_value, render: r => <Amount value={r.house_value} exact/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <SourceButton stage={houseStage} source={r.house_source} onPdf={onPdf}/>},
        {key: 'review', label: 'Review', sortable: false, render: r => <a href={routeHref('nep', {q: r.title.slice(0, 40)})}>Search NEP annex</a>},
      ]}/></section>
  </>;
}
function Deletions({comparison, route, onPdf, data}) {
  const nepStage = data.stages.nep;
  const records = filterRecords(unmatchedRecords(comparison, 'nep'),routeParams(route.params));
  const facilities = comparison.nep_only_rows;
  const total = records.reduce((s, r) => s + (r.nep_value || 0), 0);
  return <>
    <div className="fmr-stats">
      <Stat label="Unmatched NEP records" value={records.length} detail={`${facilities.length} facility rows · one record per printed funding column`}/>
      <Stat label="NEP-only allocation" value={<Amount value={total} exact/>} detail="unmatched printed component allocations"/>
      <Stat label="Matched pairs" value={comparison.rows.length} detail={`of ${comparison.rows.length + facilities.length} NEP rows`}/>
      <Stat label="Rest matches" value={`${Math.round(comparison.rows.length / (comparison.rows.length + facilities.length) * 100)}%`} detail="at ≥0.95 title similarity"/>
    </div>
    <p className="fmr-notice">These are review candidates at funding-column record grain, not confirmed deletions. Both annexes list national and LGU facilities. Title changes, split or grouped allocations, and funding-column differences can prevent pairing. Verify the source records before claiming a deletion.</p>
    <CrossDocAggregate tableId="deletions-by-region" title="Unmatched NEP records by region" records={records} side="nep" route={route} data={data} onPdf={onPdf}/>
    <section className="fmr-section"><h3>Top unmatched NEP records</h3><button onClick={() => download('hfep-nep-unmatched-records.csv',recordsCsv(records))}>Export filtered records CSV</button>
      <SortableTable tableId="deletions-records" rows={[...records].sort((a, b) => (b.nep_value || 0) - (a.nep_value || 0)).slice(0, 150)
        .map((r, i) => ({...r, rank: i + 1}))} ariaLabel="Top unmatched NEP records" initialSort={{key: 'rank', direction: 'asc'}} pageSize={25} columns={[
        {key: 'rank', label: '#', value: r => r.rank},
        {key: 'title', label: 'NEP record', scope: 'row', render: r => <><a href={routeHref('nep', {node: r.facility_id, view: 'tree'})}>{r.title}</a><small>{r.column_label}</small></>},
        {key: 'column', label: 'Funding column', value: r => r.column_label},
        {key: 'region', label: 'Region', value: r => r.region, render: r => r.region},
        {key: 'province', label: 'Province', value: r => r.province, render: r => r.province},
        {key: 'amount', label: 'NEP amount (PHP)', align: 'num', value: r => r.nep_value, render: r => <Amount value={r.nep_value} exact/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <SourceButton stage={nepStage} source={r.nep_source} onPdf={onPdf}/>},
        {key: 'review', label: 'Review', sortable: false, render: r => <a href={routeHref('house', {q: r.title.slice(0, 40)})}>Search House annex</a>},
      ]}/></section>
  </>;
}
function Adjustments({comparison, route, onPdf, data}) {
  const records = useMemo(() => lineItemRecords(comparison), [comparison]);
  const aggregates = useMemo(() => recordAggregates(records), [records]);
  const params = routeParams(route.params);
  const filtered = useMemo(() => filterRecords(records, {q: params.q || '', event: params.event || '', column: params.column || ''}),
    [records, params.q, params.event, params.column]);
  const revised = records.filter(r => r.event === 'revised');
  return <>
    <div className="fmr-stats">
      <Stat label="Revised records" value={aggregates.byEvent.revised.count} detail={`net ${money(aggregates.byEvent.revised.net)} · both annexes print differing amounts`}/>
      <Stat label="Added records" value={aggregates.byEvent.added.count} detail={`₱${aggregates.byEvent.added.net.toLocaleString('en-PH')} · NEP prints, House blank`}/>
      <Stat label="Dropped records" value={aggregates.byEvent.dropped.count} detail={`₱${Math.abs(aggregates.byEvent.dropped.net).toLocaleString('en-PH')} · House prints, NEP blank`}/>
      <Stat label="Unchanged records" value={aggregates.byEvent.same.count} detail="printed identically in both annexes"/>
    </div>
    <p className="fmr-notice">A record is one funding-column line item on one facility row (infrastructure, medical equipment or motor vehicle — totals are row controls, not records). A revision means both annexes print that record with different amounts. Money that switches column between the annexes (House infrastructure ↔ NEP medical equipment) is not a revision: it is one dropped and one added record, as in the West Visayas State University Medical Center pair.</p>
    <section className="fmr-section"><h3>Revision bridge on matched pairs</h3>
      <p className="fmr-muted">Basis: NEP minus House, following the record-event ledger. Revised {money(aggregates.bridge.revised_net)} + added {money(aggregates.bridge.added)} − dropped {money(Math.abs(aggregates.bridge.dropped))} = <strong>{money(aggregates.bridge.total_net)}</strong> total-column movement on the {comparison.rows.length} matched pairs. The old total-grain view showed only the right-hand number, mixing revisions with column switches.</p>
    </section>
    <section className="fmr-section"><h3>Revised records by funding column</h3>
      <SortableTable tableId="adjustments-by-column" rows={COMPONENT_COLUMNS.map(c => ({column: c, ...aggregates.byColumn[c]}))} ariaLabel="Revised records by funding column" columns={[
        {key: 'column', label: 'Funding column', scope: 'row', render: r => <button className="group-open" onClick={() => navigate(route,{group:r.column,dim:'column',page:null,table:null})}>{COLUMN_LABELS[r.column]}</button>},
        {key: 'revised', label: 'Revised', align: 'num'},
        {key: 'revised_increased', label: 'Increased · NEP above House (PHP)', align: 'num', render: r => <AnalysisValue value={r.revised_increased} signed/>},
        {key: 'revised_decreased', label: 'Decreased · NEP below House (PHP)', align: 'num', render: r => <AnalysisValue value={r.revised_decreased} signed/>},
        {key: 'revised_net', label: 'Net revision (PHP)', align: 'num', render: r => <AnalysisValue value={r.revised_net} signed/>},
        {key: 'added', label: 'Added', align: 'num'},
        {key: 'dropped', label: 'Dropped', align: 'num'},
      ]}/></section>
    {params.group && <RecordGroupDialog records={records.filter(r => ['revised','added','dropped'].includes(r.event))} route={route} onPdf={onPdf} data={data} dim="column" label="Matched-pair movement records"/>}
    <section className="fmr-section"><h3>Revised line-item records</h3>
      <div className="fmr-result-bar">
        <span>{filtered.length} of {records.length} records</span>
        <label>Event<select aria-label="Record event" value={params.event || ''} onChange={e => changeFilters(route, {event: e.target.value})}>
          <option value="">All events</option>{['revised', 'added', 'dropped', 'same'].map(ev => <option key={ev} value={ev}>{RECORD_EVENT_LABELS[ev]}</option>)}
        </select></label>
        <label>Funding column<select aria-label="Funding column" value={params.column || ''} onChange={e => changeFilters(route, {column: e.target.value})}>
          <option value="">All columns</option>{COMPONENT_COLUMNS.map(c => <option key={c} value={c}>{COLUMN_LABELS[c]}</option>)}
        </select></label>
        <label>Search<input data-hfep-search type="search" placeholder="Facility or region" value={params.q || ''} onChange={e => changeFilters(route, {q: e.target.value})}/></label>
        <button onClick={() => download('hfep-line-item-records.csv', recordsCsv(records))}>Export all records CSV</button><button onClick={() => download('hfep-filtered-line-item-records.csv', recordsCsv(filtered))}>Export filtered CSV</button>
      </div>
      <LineItemTable tableId="adjustments-records" records={filtered} route={route} onPdf={onPdf} data={data} label="Revised line-item records"/></section>
  </>;
}

function Analysis({indexes, route, onPdf, data}) {
  const params = routeParams(route.params);
  const view = params.view || 'overview';
  const stageKey = params.stage === 'house' ? 'house' : 'nep';
  const index = indexes[stageKey], stage = index.stage;
  const comparison = useMemo(() => data ? comparisonIndex(data) : null, [data]);
  const facilities = useMemo(() => filterFacilities(stage.facilities, params),
    [stage, params.q, params.category, params.subcategory, params.region, params.province, params.status, params.flag, params.lineage, params.minAmount, params.maxAmount]);
  const stats = facilityStats(facilities);
  const regions = useMemo(() => scopeRows(index, 'region', facilities), [index, facilities]);
  const recordKey = params.records;
  let records = facilities, recordLabel = 'Filtered facilities';
  if (recordKey?.startsWith('region:')) {records = facilities.filter(f => facilityScope(index, f).region === recordKey.slice(7)); recordLabel = `Region ${recordKey.slice(7)}`;}
  if (recordKey?.startsWith('band:')) {const band = HFEP_BANDS[Number(recordKey.slice(5))]; records = band ? facilities.filter(f => {const v = columnAmount(f.amounts_php, 'total'); return v != null && v >= band[0] && v < band[1];}) : []; recordLabel = band?.[2] || 'Unknown band';}
  if (recordKey?.startsWith('amount:')) {const amount = Number(recordKey.slice(7)); records = facilities.filter(f => columnAmount(f.amounts_php, 'total') === amount); recordLabel = money(amount);}
  if (recordKey === 'all') {records = facilities;}
  const drill = next => navigate(route, {records: next});
  const crossDocViews = ['insertions', 'deletions', 'adjustments'];
  const questions = {overview: 'How are HFEP capital outlays distributed across regions and categories?',
    insertions: 'Which unmatched House funding-column records have no NEP counterpart?',
    deletions: 'Which unmatched NEP funding-column records have no House counterpart?',
    adjustments: 'Which line-item records were revised, added or dropped between the annexes?',
    categories: 'Which facility categories and subcategories does this annex fund?',
    stats: 'Which allocation patterns describe this facility population?',
    review: 'Which extraction findings and interpretation rules remain open?'};
  return <>
    <div className="fmr-page-title"><div>
      <p className="fmr-eyebrow">FY2027 · Analysis · {stage.label}</p>
      <h1>Analysis</h1><p>Choose an analytical question, inspect its population, and follow aggregates into source records.</p>
    </div><div className="hero-actions">{crossDocViews.includes(view)
      ? <span className="hero-source">{view === 'insertions' ? 'House GAB · unmatched source rows' : view === 'deletions' ? 'DBM NEP · unmatched source rows' : 'House GAB ↔ DBM NEP'}</span>
      : <label className="hero-source">Budget source
      <select aria-label="Analysis budget source" value={stageKey} onChange={e => navigate(route, {stage: e.target.value, records: null})}>
        <option value="nep">DBM NEP</option><option value="house">House GAB</option></select></label>}<ShareLink/></div></div>
    <ViewTabs route={route} defaultView="overview" views={[['overview', 'Overview'], ['insertions', 'Insertions'], ['deletions', 'Deletions'], ['adjustments', 'Adjustments'], ['categories', 'Categories'], ['stats', 'Statistics'], ['review', 'Extraction review']]}/>
    <h2 className="fmr-question">{questions[view] || 'Source records'}</h2>
    {!crossDocViews.includes(view) && <Filters route={route} index={index}/>}
    {!crossDocViews.includes(view) && <div className="fmr-stats">
      <Stat label="Filtered capital outlays" value={<Amount value={stats.total} exact/>} detail={`${stats.count} facilities`}/>
      <Stat label="Median allocation" value={<Amount value={stats.median}/>}/>
      <Stat label="Mean allocation" value={<Amount value={stats.mean}/>}/>
      <Stat label="Extraction findings" value={stats.flagged + stats.interpreted} detail={`${stats.flagged} flagged · ${stats.interpreted} interpreted`}/>
    </div>}
    {!crossDocViews.includes(view) && <div className="fmr-result-bar"><span>{stage.label} · {facilities.length} matching facilities</span>
      <button onClick={() => drill('all')}>Inspect source records</button>
      <button onClick={() => download(`hfep-${stage.key}-filtered.csv`, facilityCsv(facilities, index))}>Export filtered CSV</button></div>}
    {view === 'insertions' && comparison ? <Insertions comparison={comparison} route={route} onPdf={onPdf} data={data}/>
    : view === 'deletions' && comparison ? <Deletions comparison={comparison} route={route} onPdf={onPdf} data={data}/>
    : view === 'adjustments' && comparison ? <Adjustments comparison={comparison} route={route} onPdf={onPdf} data={data}/>
    : view === 'overview' ? <>
      <section className="fmr-section"><h3>Regional distribution</h3>
        <p className="fmr-muted">Region labels aggregate the filtered facilities across subcategory blocks; printed region controls appear in the source trees at their own grain. This Overview presents one source at a time. Both schedules retain national and LGU facilities, with different category allocations and provisional title matches. Allocation patterns do not establish implementation or misconduct.</p>
        <ScopeTable tableId="overview-distribution" rows={regions.filter(r => !params.region || r.label === params.region)} route={route}
          onDrill={label => drill(`region:${label}`)}/></section>
    </> : view === 'categories' ? <>
      <section className="fmr-section"><h3>Category controls</h3>
        <SortableTable tableId="categories-controls" rows={stage.categories} ariaLabel="HFEP category controls" initialSort={{key: 'label', direction: 'asc'}} columns={[
          {key: 'label', label: 'Category', scope: 'row', render: c => <a href={routeHref(stage.key, {node: c.id, view: 'tree'})}>{c.label}</a>},
          {key: 'infra', label: 'Infra (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'infrastructure'), render: c => <Amount value={columnAmount(c.amounts_php, 'infrastructure')}/>},
          {key: 'med', label: 'Med equip (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'medical_equipment'), render: c => <Amount value={columnAmount(c.amounts_php, 'medical_equipment')}/>},
          {key: 'veh', label: 'Motor veh (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'motor_vehicle'), render: c => <Amount value={columnAmount(c.amounts_php, 'motor_vehicle')}/>},
          {key: 'total', label: 'Total (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'total'), render: c => <Amount value={columnAmount(c.amounts_php, 'total')} exact/>},
          {key: 'facilities', label: 'Facilities', align: 'num', value: c => index.rollup.get(c.id).count},
        ]}/></section>
      <section className="fmr-section"><h3>Subcategory populations</h3>
        <SortableTable tableId="categories-subcategories" rows={stage.subcategories} ariaLabel="HFEP subcategory populations" pageSize={25} initialSort={{key: 'label', direction: 'asc'}} columns={[
          {key: 'label', label: 'Subcategory', scope: 'row', render: s => <a href={routeHref(stage.key, {node: s.id, view: 'tree'})}>{s.label}</a>},
          {key: 'count', label: 'Facilities', align: 'num', value: s => index.rollup.get(s.id).count},
          {key: 'total', label: 'Total (PHP)', align: 'num', value: s => index.rollup.get(s.id).amounts_php.total, render: s => <Amount value={index.rollup.get(s.id).amounts_php.total}/>},
        ]}/></section>
    </> : view === 'stats' ? <>
      <p className="fmr-notice">These are descriptive patterns in recorded allocations. Repeated amounts and rounding do not establish procurement, implementation, or pricing.</p>
      <section className="fmr-section"><h3>Allocation bands</h3><SortableTable tableId="statistics-bands" rows={bandRows(facilities)} ariaLabel="HFEP allocation bands" columns={[
        {key: 'label', label: 'Allocation band', scope: 'row', render: r => <button className="fmr-text-button" onClick={() => drill(`band:${r.id.slice(5)}`)}>{r.label} → records</button>},
        {key: 'facilities', label: 'Facilities', align: 'num'},
        {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => <Amount value={r.total_php} exact/>},
        {key: 'share', label: 'Allocation share', align: 'num', value: r => stats.total ? r.total_php / stats.total : 0, render: r => `${stats.total ? (r.total_php / stats.total * 100).toFixed(1) : '0.0'}%`},
      ]}/></section>
      <section className="fmr-section"><h3>Rounding pattern</h3><SortableTable tableId="statistics-rounding" rows={roundingLadder(facilities)} ariaLabel="HFEP rounding ladder" initialSort={{key: 'step', direction: 'desc'}} columns={[
        {key: 'label', label: 'Coarsest matching granularity', scope: 'row'},
        {key: 'facilities', label: 'Facilities', align: 'num'},
        {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => <Amount value={r.total_php}/>},
        {key: 'share', label: 'Facility share', align: 'num', render: r => `${(r.share * 100).toFixed(1)}%`},
      ]}/></section>
      <section className="fmr-section"><h3>Repeated exact allocations</h3><p className="fmr-muted">Amounts appearing on at least five facilities.</p>
        <SortableTable tableId="statistics-repeated" rows={repeatedAmounts(facilities)} ariaLabel="HFEP repeated amounts" initialSort={{key: 'total_php', direction: 'desc'}} columns={[
          {key: 'amount_php', label: 'Exact amount (PHP)', align: 'num', render: r => <button className="fmr-text-button" onClick={() => drill(`amount:${r.amount_php}`)}>{money(r.amount_php)} → records</button>},
          {key: 'facilities', label: 'Facilities', align: 'num'},
          {key: 'total_php', label: 'Combined (PHP)', align: 'num', render: r => <Amount value={r.total_php}/>},
        ]}/></section>
    </> : view === 'review' ? <section className="fmr-section"><h3>Extraction findings</h3>
      <p className="fmr-muted">Flags are pre-acceptance suspicions recorded during extraction; interpretation rules document how ambiguous printed cells were read. Neither alters a printed value, and none of these findings affect control arithmetic.</p>
      <SortableTable tableId="review-findings" rows={reviewCategories(facilities)} ariaLabel="HFEP extraction findings" columns={[
        {key: 'label', label: 'Finding', scope: 'row'},
        {key: 'count', label: 'Facilities', align: 'num'},
      ]}/></section> : <p>Unknown view. <a href={routeHref('analysis', {}, undefined)}>Open Overview</a>.</p>}
    {stageKey === 'house' && <ReadingNote/>}
    {recordKey && <Dialog label="Analysis source records" onClose={() => navigate(route, {records: null})}>
      <div className="fmr-dialog-heading"><h2>{stage.label} · {recordLabel}</h2><button onClick={() => navigate(route, {records: null})}>Close records</button></div>
      <div className="fmr-result-bar"><span>{records.length} facilities · <Amount value={columnSum(records, 'total')} exact/></span>
        <button onClick={() => download(`hfep-${stage.key}-records.csv`, facilityCsv(records, index))}>Export filtered CSV</button></div>
      <FacilityTable tableId={`${view}-group-records`} index={index} facilities={records} onSelect={id => {window.location.hash = routeHref(stage.key, {node: id, view: 'tree'});}} onPdf={onPdf}/>
    </Dialog>}
  </>;
}

// Pairs-table delta is House-centric: HGAB − NEP (how the House annex moved
// relative to the NEP). Added (NEP-only) → −NEP; dropped (House-only) → +HGAB.
function hgabDelta(cell) {
  if (!cell || cell.event === 'none') return null;
  if (cell.event === 'revised' || cell.event === 'same')
    return cell.house == null || cell.nep == null ? null : cell.house - cell.nep;
  if (cell.event === 'added') return cell.nep == null ? null : -cell.nep;
  if (cell.event === 'dropped') return cell.house == null ? null : cell.house;
  return null;
}
function formatDelta(value) {
  if (value == null) return '—';
  if (value === 0) return 'same';
  return `${value > 0 ? '+' : ''}${money(value)}`;
}
function DeltaCell({value, caption, group}) {
  return <td className={`num col-${group} ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`} data-label={caption}>{formatDelta(value)}</td>;
}
// Value of one printed funding-column record for within-group / group-extreme sorts.
function recordFieldValue(cell, field) {
  if (!cell || cell.event === 'none') return null;
  if (field === 'nep') return cell.nep;
  if (field === 'house') return cell.house;
  return hgabDelta(cell);
}
// Extreme funding-column value inside a facility pair. Asc sorts by the
// group's lowest record; desc sorts by the group's highest — hierarchy stays
// nested (facility row + its printed records).
function recordExtremes(pair, field) {
  const values = COMPONENT_COLUMNS
    .map(c => recordFieldValue(pair.columns[c], field))
    .filter(v => v != null);
  if (!values.length) return null;
  return {min: Math.min(...values), max: Math.max(...values)};
}
const RECORD_SORT_FIELDS = {record_nep: 'nep', record_hgab: 'house', record_delta: 'delta'};
// Printed records under one facility, ordered by the active record column
// (or natural funding-column order when sorting by facility totals / name).
function printedRecordsForPair(pair, sortKey, sortDir) {
  const printed = COMPONENT_COLUMNS.filter(c => pair.columns[c].event !== 'none');
  const field = RECORD_SORT_FIELDS[sortKey];
  if (!field) return printed;
  return sortRows(printed, column => recordFieldValue(pair.columns[column], field),
    {key: sortKey, direction: sortDir});
}

function Compare({data, indexes, route, onPdf, inlineSource}) {
  const params = routeParams(route.params);
  const tab = params.view || 'columns';
  const comparison = useMemo(() => comparisonIndex(data), [data]);
  const filters = {q: params.q || '', changed: params.changed || '', region: params.region || ''};
  const rows = useMemo(() => filterComparisons(comparison.rows, filters), [comparison, filters.q, filters.changed, filters.region]);
  const regions = useMemo(() => [...new Set(comparison.rows.flatMap(r => [r.house_scope?.region, r.nep_scope?.region]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', {numeric: true})), [comparison]);
  const page = Math.max(1, Number(params.page) || 1);
  // Always keep the nested facility→records hierarchy. Record-column sorts
  // order facility groups by min (asc) or max (desc) of that record field.
  const sortKeys = ['title', 'region', 'total_nep', 'total_hgab', 'total_delta',
    'record_nep', 'record_hgab', 'record_delta', 'match'];
  const sortKey = sortKeys.includes(params.sort) ? params.sort : 'title';
  const sortDir = params.dir === 'desc' ? 'desc' : 'asc';
  const facilitySortValue = {
    title: r => r.house.title, region: r => r.house_scope?.region,
    total_nep: r => r.columns.total.nep, total_hgab: r => r.columns.total.house,
    total_delta: r => hgabDelta(r.columns.total), match: r => r.similarity,
    record_nep: r => {const e = recordExtremes(r, 'nep'); return e ? (sortDir === 'asc' ? e.min : e.max) : null;},
    record_hgab: r => {const e = recordExtremes(r, 'house'); return e ? (sortDir === 'asc' ? e.min : e.max) : null;},
    record_delta: r => {const e = recordExtremes(r, 'delta'); return e ? (sortDir === 'asc' ? e.min : e.max) : null;},
  };
  const sortedFacilityRows = useMemo(
    () => sortRows(rows, facilitySortValue[sortKey] || facilitySortValue.title, {key: sortKey, direction: sortDir}),
    [rows, sortKey, sortDir]);
  const setSort = key => navigate(route, {
    sort: key === 'title' ? null : key,
    dir: key === sortKey && sortDir === 'asc' ? 'desc' : null,
    page: null,
  });
  const sortButton = (name, key, ariaName = name) => <button className="sort-header" aria-label={`Sort by ${ariaName}`} onClick={() => setSort(key)}>{name}
    <span className="sort-indicator" aria-hidden="true">{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span></button>;
  const sortHeader = (name, key, group, ariaName) => <th scope="col" className={group ? `col-${group}` : undefined}
    aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortButton(name, key, ariaName)}</th>;
  const [panel, setPanel] = useState('table');
  useEffect(() => {setPanel(inlineSource ? 'pdf' : 'table');}, [inlineSource?.url, inlineSource?.page]);
  const hasFilters = Boolean(filters.q || filters.changed || filters.region);
  const stageCards = [
    ['House GAB · Volume I-B', comparison.column_totals.total?.house_php ?? 0, `${data.stages.house.facilities.length} facilities · HFEP capital outlays`],
    ['DBM NEP · Volume II-A', comparison.column_totals.total?.nep_php ?? 0, `${data.stages.nep.facilities.length} facilities · all capital outlays`],
    ['NEP − House', comparison.column_totals.total?.difference_php ?? 0, 'printed control difference across retained schedules'],
    ['Matched-pair total movement', comparison.rows.reduce((s, r) => s + (r.columns.total.difference ?? 0), 0),
      `${comparison.changed.length} pairs with revised records · see Analysis › Adjustments for the record-grain bridge`],
  ];
  const pageSize = 50;
  const facilityPage = sortedFacilityRows.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = sortedFacilityRows.length;
  const renderPairIdentity = r => <>
    <button className="project-record-title" onClick={() => {window.location.hash = routeHref('house', {node: r.house.id, view: 'tree'});}}>{r.house.title}</button>
    <small>{r.house_scope.region} · {r.house_scope.province}</small>
    <small>NEP: {r.nep.title}</small>
    {r.changed && <small className="normalized-match-badge">Revised records — same line items, different amounts</small>}
    {!r.changed && r.columns.total.difference != null && r.columns.total.difference !== 0
      && <small className="normalized-match-badge">Totals differ with no revised record — added/dropped line items (column switch)</small>}
  </>;
  const renderMatch = r => r.similarity < 1
    ? <span className="diff-tag diff-tag-identity" title={`Title similarity ${Math.round(r.similarity * 100)}% — verify before treating as one facility`}>match {Math.round(r.similarity * 100)}%</span>
    : <span title="Identical normalized title in the same region and province">100%</span>;
  const renderSources = r => <>
    <button className="source-link" aria-pressed={false} onClick={() => onPdf(r.house.source, 'house')}>House p. {r.house.source.pdf_page}</button>
    <button className="source-link" aria-pressed={false} onClick={() => onPdf(r.nep.source, 'nep')}>NEP p. {r.nep.source.pdf_page}</button>
  </>;
  const emptyGroup = (group, labels) => labels.map(label =>
    <td key={label} className={`num col-${group} col-empty`} data-label={label}>—</td>);
  return <>
    <section className="hero hero-compact">
      <p className="eyebrow">DOH HFEP · FY2027</p>
      <h1>Compare budget stages</h1>
      <p>Per-column control reconciliation and reviewable line-item pairs across the House Volume I-B annex (HFEP capital outlays) and the NEP Volume II-A annex (all capital outlays). Pairs are title-similarity suggestions and never certify identity.</p>
    </section>
    <details className="comparison-context"><summary>Source scopes, matching method and downloads</summary>
      <p className="notice comparison-notice">The annex populations are complementary, not paired. Column totals compare printed controls; line-item pairs are ≥0.95 title-similarity suggestions for human review, never merged rows.</p>
      <p className="muted">{comparison.note}</p>
      <div className="cards stage-totals">
        {stageCards.map(([title, value, note]) => <article key={title}><h3>{title}</h3><strong>{money(value)}</strong><p>{note}</p></article>)}
      </div>
      <p><a href={siteUrl('other-analysis/data/hfep_workbench.json')} download>Download the HFEP workbench dataset (JSON)</a></p>
    </details>
    <nav className="view-tabs" aria-label="Comparison tables">
      {[['columns', 'Column reconciliation'], ['pairs', 'Funding Records']].map(([key, name]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => navigate(route, {view: key === 'columns' ? null : key, page: null})}>{name}</button>)}
    </nav>
    <p className="comparison-scope">Amounts in PHP · Pairs require ≥0.95 title similarity within the same region and province.
      {tab === 'pairs'
        ? ' Facility grand totals and funding-column records are separate column groups. Sorting a record column keeps each facility group intact, orders groups by that group’s lowest (asc) or highest (desc) printed record, and reorders records inside the group the same way. Δ HGAB = House − NEP.'
        : ' Difference = NEP − House on the column-reconciliation tab.'}</p>
    {inlineSource && <div className="workspace-switch" aria-label="Workspace panels">
      <button aria-pressed={panel === 'table'} onClick={() => setPanel('table')}>Table</button>
      <button aria-pressed={panel === 'pdf'} onClick={() => setPanel('pdf')}>PDF source</button>
    </div>}
    <div className={`comparison-workspace ${inlineSource ? 'has-source' : ''} ${panel}-active`}>
      <section className="comparison-table" aria-label="Comparison table">
        <div className="filters">
          <label>Search<input type="search" value={params.q || ''} onChange={e => changeFilters(route, {q: e.target.value})}
            placeholder="Facility, region, province"/></label>
          <label>Region<select aria-label="Region" value={params.region || ''} onChange={e => changeFilters(route, {region: e.target.value})}>
            <option value="">All</option>
            {params.region && !regions.includes(params.region) && <option value={params.region}>Unavailable: {params.region}</option>}
            {regions.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
          {tab === 'pairs' && <label>Pair status
            <select aria-label="Pair status" value={params.changed || ''} onChange={e => changeFilters(route, {changed: e.target.value})}>
              <option value="">All pairs</option><option value="changed">With revised records</option><option value="same">Without revised records</option>
            </select></label>}
        </div>
        {hasFilters && <div className="active-filters" aria-label="Active filters">
          {[['query', params.q], ['region', params.region], ['pair status', params.changed]].filter(([, v]) => v).map(([key, v]) =>
            <button key={key} aria-label={`Remove ${key} filter`} onClick={() => changeFilters(route, {[key === 'query' ? 'q' : key === 'pair status' ? 'changed' : key]: null})}>{key === 'pair status' && v === 'changed' ? 'With revised records' : key === 'pair status' && v === 'same' ? 'Without revised records' : v} ×</button>)}
          <button onClick={() => changeFilters(route, {q: null, region: null, changed: null})}>Clear filters</button>
        </div>}
        {params.changed === 'changed' && <p className="muted">Revision review: these pairs carry at least one funding-column record printed in both annexes with different amounts. Totals that differ without a revised record are column switches, shown separately in Analysis › Adjustments.</p>}
        {tab === 'pairs' && <div className="mobile-sort">
          <label>Sort pairs<select aria-label="Sort pairs" value={sortKey} onChange={e => setSort(e.target.value)}>
            {[['title', 'Facility pair'], ['total_nep', 'Facility NEP'], ['total_hgab', 'Facility HGAB'], ['total_delta', 'Facility Δ HGAB'],
              ['record_nep', 'Record NEP (group min/max)'], ['record_hgab', 'Record HGAB (group min/max)'],
              ['record_delta', 'Record Δ HGAB (group min/max)'], ['region', 'Region'], ['match', 'Match']]
              .map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select></label>
          <button onClick={() => navigate(route, {dir: sortDir === 'asc' ? 'desc' : null, page: null})}>{sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
        </div>}
        <div className="results-toolbar">
          <p className="result-count" aria-live="polite">{tab === 'columns'
            ? `${FUND_COLUMNS.length} funding columns`
            : `${rows.length.toLocaleString()} of ${comparison.rows.length.toLocaleString()} pairs`}
            {tab === 'pairs' && rows.filter(r => r.changed).length ? ` · ${rows.filter(r => r.changed).length} with revised records` : ''}</p>
          <ShareLink/>
          {tab === 'pairs' && <button disabled={!rows.length} onClick={() => download('hfep-comparison-pairs.csv', comparisonCsv(rows))}>Export CSV</button>}
        </div>
        {tab === 'columns' ? <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Column reconciliation"><table>
            <thead><tr><th scope="col">Funding column</th><th scope="col">House GAB</th><th scope="col">DBM NEP</th><th scope="col">NEP − House</th><th scope="col">Matched-pair movement</th></tr></thead>
            <tbody>{FUND_COLUMNS.map(column => {
              const t = comparison.column_totals[column];
              const net = comparison.rows.reduce((s, r) => {
                const cell = r.columns[column];
                if (cell.difference != null) return s + cell.difference;
                if (cell.event === 'added') return s + cell.nep;
                if (cell.event === 'dropped') return s - cell.house;
                return s;
              }, 0);
              return <tr key={column}><th scope="row">{COLUMN_LABELS[column]}</th>
                <td className="num" data-label="House GAB">{money(t?.house_php)}</td>
                <td className="num" data-label="DBM NEP">{money(t?.nep_php)}</td>
                <td className={`num ${t?.difference_php > 0 ? 'up' : t?.difference_php < 0 ? 'down' : ''}`} data-label="NEP − House">{money(t?.difference_php)}</td>
                <td className={`num ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`} data-label="Matched-pair movement">{net === 0 ? '—' : money(net)}</td>
              </tr>;})}
            </tbody></table></div>
          <p className="muted">The NEP − House gap combines unmatched allocations and movement on provisional facility pairs. The movement column decomposes what changed on the {comparison.rows.length} matched pairs at record grain — revised cells plus added records minus dropped records; blank cells never count as zero. Analysis › Adjustments carries the full bridge.</p>
        </> : <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Funding records"><table className="hfep-pairs-table">
            <thead>
              <tr className="pair-group-row">
                <th scope="col" rowSpan={2} className="col-name"
                  aria-sort={sortKey === 'title' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortButton('Facility pair names', 'title')}</th>
                <th scope="colgroup" colSpan={3} className="col-totals">Facility grand totals</th>
                <th scope="colgroup" colSpan={3} className="col-records">Funding-column records</th>
                <th scope="col" rowSpan={2}
                  aria-sort={sortKey === 'region' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortButton('Region', 'region')}</th>
                <th scope="col" rowSpan={2}
                  aria-sort={sortKey === 'match' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortButton('Match', 'match')}</th>
                <th scope="col" rowSpan={2}>Source evidence</th>
              </tr>
              <tr className="pair-subhead-row">
                {sortHeader('NEP', 'total_nep', 'totals', 'Facility NEP')}
                {sortHeader('HGAB', 'total_hgab', 'totals', 'Facility HGAB')}
                {sortHeader('Δ HGAB', 'total_delta', 'totals', 'Facility Δ HGAB')}
                {sortHeader('NEP', 'record_nep', 'records', 'Record NEP')}
                {sortHeader('HGAB', 'record_hgab', 'records', 'Record HGAB')}
                {sortHeader('Δ HGAB', 'record_delta', 'records', 'Record Δ HGAB')}
              </tr>
            </thead>
            <tbody>
              {facilityPage.map(r => {
                const printedRecords = printedRecordsForPair(r, sortKey, sortDir);
                const totalDelta = hgabDelta(r.columns.total);
                return <React.Fragment key={r.id}>
                  <tr className="pair-facility-row">
                    <th scope="row" className="col-name">{renderPairIdentity(r)}
                      <small>{printedRecords.length} printed funding-column record{printedRecords.length === 1 ? '' : 's'}</small></th>
                    <td className="num col-totals" data-label="Facility NEP">{money(r.columns.total.nep)}</td>
                    <td className="num col-totals" data-label="Facility HGAB">{money(r.columns.total.house)}</td>
                    <DeltaCell value={totalDelta} caption="Facility Δ HGAB" group="totals"/>
                    {emptyGroup('records', ['Record NEP', 'Record HGAB', 'Record Δ HGAB'])}
                    <td data-label="Region">{r.house_scope.region}</td>
                    <td className="num" data-label="Match">{renderMatch(r)}</td>
                    <td data-label="Source evidence">{renderSources(r)}</td>
                  </tr>
                  {printedRecords.map(column => {
                    const cell = r.columns[column];
                    return <tr key={`${r.id}|${column}`} className={`pair-record-row event-${cell.event}`}>
                      <th scope="row" className="col-name">
                        <span className="pair-record-label">{COLUMN_LABELS[column]}</span>
                        <small className="normalized-match-badge">{RECORD_EVENT_LABELS[cell.event]}</small>
                      </th>
                      {emptyGroup('totals', ['Facility NEP', 'Facility HGAB', 'Facility Δ HGAB'])}
                      <td className="num col-records" data-label="Record NEP">{cell.nep == null ? '—' : money(cell.nep)}</td>
                      <td className="num col-records" data-label="Record HGAB">{cell.house == null ? '—' : money(cell.house)}</td>
                      <DeltaCell value={hgabDelta(cell)} caption="Record Δ HGAB" group="records"/>
                      <td data-label="Region">{r.house_scope.region}</td>
                      <td data-label="Match"/>
                      <td data-label="Source evidence"/>
                    </tr>;
                  })}
                </React.Fragment>;
              })}
            </tbody>
          </table></div>
          {!rows.length && <p>No pairs match these filters.</p>}
          <div className="pager">
            <button disabled={page === 1} onClick={() => changeFilters(route, {page: page > 2 ? String(page - 1) : null})}>Previous</button>
            <span>{pageCount ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, pageCount)}` : '0'} / {pageCount.toLocaleString()} pairs</span>
            <button disabled={page * pageSize >= pageCount} onClick={() => changeFilters(route, {page: String(page + 1)})}>Next</button>
          </div>
          <p className="muted">Facility grand totals are row controls (sum of printed funding-column records). Funding-column records are the granular infra / med-equip / motor-vehicle cells. Sorting a record column keeps each facility group intact, orders groups by that group’s lowest (asc) or highest (desc) printed record, and reorders the records inside each group the same way. Δ HGAB = House − NEP.</p>
        </>}
      </section>
      {inlineSource && <aside className="source-pane" aria-label="PDF source pane">
        <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
          <PdfPreview source={inlineSource} onClose={() => navigate(route, {pdf: null, pdfPage: null})}/>
        </Suspense>
      </aside>}
    </div>
  </>;
}

function AgencyCheck({check, stage, onPdf}) {
  return <section className="fmr-panel" aria-label="Agency capital-outlay control">
    <h3>Agency capital-outlay control</h3>
    <p>The Volume {stage.key === 'house' ? 'I-A' : 'II-A'} agency row shows the wider HFEP allocation: MOOE plus this annex's capital outlays. The annex total must match only the capital-outlay component.</p>
    <dl className="fmr-arithmetic">
      <dt>Agency MOOE</dt><dd>{money(check.mooe_php)} <small>outside this annex</small></dd>
      <dt>Agency capital outlay</dt><dd>{money(check.capital_outlay_php)}</dd>
      <dt>Agency total</dt><dd>{money(check.total_php)}</dd>
      <dt>Annex vs agency capital outlay</dt>
      <dd>{money(check.annex_capital_outlay_php ?? columnAmount(stage.annex_control, 'total'))}
        <small> difference {money(check.annex_vs_agency_capital_outlay_difference_php ?? (columnAmount(stage.annex_control, 'total') - check.capital_outlay_php))} · {check.passed ? 'matches' : 'needs review'}</small></dd>
    </dl>
    {check.source && <p><SourceButton stage={stage} source={check.source} onPdf={onPdf} label={`Agency row · PDF p. ${check.source.pdf_page}`}/></p>}
  </section>;
}

function Home({data, indexes}) {
  const house = data.stages.house, nep = data.stages.nep;
  return <>
    <section className="hero">
      <p className="fmr-eyebrow">FY2027 · Health Facilities Enhancement Program</p>
      <h1>Follow the HFEP capital outlays</h1>
      <p>Two retained HFEP schedules: both the House Volume I-B and DBM NEP Volume II-A annexes list national and LGU facilities, with different category allocations. This workbench presents each document's own controls and evidence, plus a <strong>review-only comparison</strong>: per-column reconciliation and title-matched pairs that are suggestions to verify, never merged rows.</p>
      <div className="hero-actions"><a className="primary" href={routeHref('nep', {view: 'tree'})}>Open NEP source tree</a>
        <a className="secondary" href={routeHref('house', {view: 'tree'})}>Open House source tree</a>
        <a className="secondary" href={routeHref('compare')}>Compare stages</a>
        <a className="secondary" href={routeHref('analysis')}>Explore analysis</a><ShareLink/></div>
    </section>
    <div className="fmr-stats">
      <Stat label="House GAB annex control" value={<Amount value={columnAmount(house.annex_control, 'total')} exact/>} detail={`${house.facilities.length} facilities · ${house.audit_summary.internal_control_checks} balanced controls`}/>
      <Stat label="DBM NEP annex control" value={<Amount value={columnAmount(nep.annex_control, 'total')} exact/>} detail={`${nep.facilities.length} facilities (national + LGU) · ${nep.audit_summary.internal_control_checks} balanced controls`}/>
      <Stat label="NEP facility ledger" value={<Amount value={columnAmount(nep.facility_ledger, 'total')} exact/>} detail="₱140,000 below the printed control — documented Metro Manila omission"/>
      <Stat label="Cross-stage comparison" value="Review only" detail="Column reconciliation + 0.95-confidence title pairs"/>
    </div>
    <ReadingNote/>
    <h2>Workbench directory</h2>
    <ul className="home-directory">
      <li><a href={routeHref('nep')}><strong>DBM NEP →</strong><span>Executive proposal annex: all HFEP capital outlays with per-column controls and OCR provenance.</span></a></li>
      <li><a href={routeHref('house')}><strong>House GAB →</strong><span>Volume I-B annex: HFEP capital outlays from the House bill.</span></a></li>
      <li><a href={routeHref('analysis')}><strong>Analysis →</strong><span>Regional, category and allocation-pattern views per stage.</span></a></li>
      <li><a href={routeHref('highlights')}><strong>Highlights →</strong><span>Key findings with their supporting records.</span></a></li>
    </ul>
    <h2>Source verification</h2>
    <div className="fmr-source-audits">
      {[nep, house].map(stage => <section className="fmr-panel" key={stage.key}>
        <h3>{stage.label}</h3>
        <p>{stage.audit_summary.internal_control_checks} balanced control checks · {stage.facilities.length} facilities.</p>
        <p><strong>{(stage.printed_defects || []).length ? `${stage.printed_defects.length} documented printed-defect cells` : 'No printed defects documented'}</strong></p>
        <p>{stage.document}.</p>
        <a href={routeHref(stage.key, {view: 'tree'})}>Open source tree →</a>
      </section>)}
    </div>
    <p className="fmr-notice">Coverage: HFEP capital-outlay detail annexes only. MOOE (₱67,173,000 in the agency row) and other DOH programs are out of scope. Facility identity has not been matched to any external registry; IDs are source-artifact-local.</p>
  </>;
}

function HighlightFundingColumns({data, onPdf}) {
  const rows = hfepColumnReconciliation(data);
  return <section><h3>Printed funding columns and retained facility sums</h3>
    <p>Change = House − NEP. The total row summarizes the three component columns; the NEP residual remains separate from the printed budget change.</p>
    <div className="fmr-result-bar"><button onClick={()=>download('hfep-highlight-funding-columns.csv',csvText(
      ['column','nep_php','house_php','house_minus_nep_php','nep_facility_sum_php','house_facility_sum_php','nep_residual_php','house_residual_php','nep_source_pdf','nep_pdf_page','house_source_pdf','house_pdf_page'],
      rows.map(r=>[r.id,r.nep_php,r.house_php,r.delta_php,r.nep_ledger_php,r.house_ledger_php,r.nep_residual_php,r.house_residual_php,
        ...['nep','house'].flatMap(side=>[pdfPathFor(data.stages[side],data.stages[side].root.source),data.stages[side].root.source.pdf_page])])))}>Export funding columns CSV</button>
      {['nep','house'].map(side=><SourceButton key={side} stage={data.stages[side]} source={data.stages[side].root.source} onPdf={onPdf} label={`${side==='nep'?'NEP':'House'} annex control`}/>)}</div>
    <SortableTable rows={rows} ariaLabel="HFEP highlight funding columns" columns={[
      {key:'label',label:'Funding column',scope:'row'},
      {key:'nep_php',label:'NEP printed (PHP)',align:'num',render:r=>money(r.nep_php)},
      {key:'house_php',label:'House printed (PHP)',align:'num',render:r=>money(r.house_php)},
      {key:'delta_php',label:'House − NEP (PHP)',align:'num',render:r=><AnalysisValue value={r.delta_php} signed/>},
      {key:'nep_ledger_php',label:'NEP facility sum (PHP)',align:'num',render:r=>money(r.nep_ledger_php)},
      {key:'nep_residual_php',label:'NEP control overhang (PHP)',align:'num',render:r=>money(r.nep_residual_php)},
      {key:'house_residual_php',label:'House control overhang (PHP)',align:'num',render:r=>money(r.house_residual_php)},
    ]}/></section>;
}
function HighlightCategoryMovements({data, onPdf, rows = hfepCategoryMovements(data), label = 'HFEP highlight category movements', heading = 'Movements in printed facility categories', note}) {
  return <section><h3>{heading}</h3>
    <p>{note || 'Printed category numbers align the controls; original labels remain separate. An absent category contributes zero to the change bridge and displays as unavailable in its source column. This does not pair individual facilities.'}</p>
    <button onClick={()=>download('hfep-highlight-category-movements.csv',csvText(
      ['category_number','nep_label','house_label','nep_php','house_php','house_minus_nep_php','nep_source_pdf','nep_pdf_page','house_source_pdf','house_pdf_page'],
      rows.map(r=>[r.id,r.nep?.label,r.house?.label,r.nep_php,r.house_php,r.delta_php,
        ...['nep','house'].flatMap(side=>[r[side] ? pdfPathFor(data.stages[side],r[side].source) : null,r[side]?.source.pdf_page])])))}>Export category movements CSV</button>
    <SortableTable rows={rows} ariaLabel={label} initialSort={{key:'delta_php',direction:'asc'}} columns={[
      {key:'label',label:'Category',scope:'row',render:r=><>{r.label}{r.nep && r.nep.label!==r.label && <small>NEP: {r.nep.label}</small>}</>},
      {key:'nep_php',label:'NEP (PHP)',align:'num',render:r=>money(r.nep_php)},
      {key:'house_php',label:'House (PHP)',align:'num',render:r=>money(r.house_php)},
      {key:'delta_php',label:'House − NEP (PHP)',align:'num',render:r=><AnalysisValue value={r.delta_php} signed/>},
      {key:'source',label:'Printed evidence',sortable:false,render:r=><>{['nep','house'].map(side=>r[side] && <SourceButton key={side} stage={data.stages[side]} source={r[side].source} onPdf={onPdf} label={`${side==='nep'?'NEP':'House'} category control`}/>)}</>},
    ]}/></section>;
}
function HighlightHouseControls({index, route, onPdf}) {
  const controls=useMemo(()=>hfepControlEvidence(index),[index]);
  const p=routeParams(route.params), terms=(p.q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered=controls.filter(c=>terms.every(term=>`${c.label} ${c.id} ${c.kind}`.toLowerCase().includes(term)));
  const selected=filtered.find(c=>c.id===p.evidenceNode) || filtered[0];
  return <section><h3>Internal printed-control reconciliation</h3>
    <p>Blank component cells remain blank in the export and contribute zero to the arithmetic.</p>
    <label className="annex-source-select">Search controls<input type="search" aria-label="Search controls" value={p.q || ''} onChange={e=>navigate(route,{q:e.target.value,evidenceNode:null})}/></label>
    <div className="fmr-result-bar"><span>{filtered.length} of {controls.length} internal controls · four funding columns per control</span>
      <button onClick={()=>download('hfep-highlight-house-controls.csv',csvText(
        ['control_id','label','kind','column','printed_php','facility_sum_php','difference_php','source_pdf','pdf_page'],
        filtered.flatMap(c=>c.columns.map(column=>[c.id,c.label,c.kind,column.column,column.printed,column.facility_sum,column.difference,pdfPathFor(index.stage,c.source),c.source.pdf_page]))))}>Export controls CSV</button></div>
    {selected && <div className="annex-selection"><label className="annex-source-select">Select printed control<select aria-label="House highlight control" value={selected.id} onChange={e=>navigate(route,{evidenceNode:e.target.value})}>
      {filtered.map(c=><option key={c.id} value={c.id}>{c.kind} · {c.label}</option>)}</select></label><Evidence index={index} id={selected.id} onPdf={onPdf}/></div>}
    <SortableTable rows={filtered} ariaLabel="HFEP House control reconciliation" pageSize={25} columns={[
      {key:'label',label:'Printed control',scope:'row',render:c=><button className="fmr-text-button" onClick={()=>navigate(route,{evidenceNode:c.id})}>{c.label}<small>{c.id}</small></button>},
      {key:'kind',label:'Level'}, {key:'facilities',label:'Facility rows',align:'num'},
      {key:'printed_php',label:'Printed total (PHP)',align:'num',render:c=>money(c.printed_php)},
      {key:'facility_sum_php',label:'Facility sum (PHP)',align:'num',render:c=>money(c.facility_sum_php)},
      {key:'max_difference_php',label:'Largest four-column gap (PHP)',align:'num',render:c=>money(c.max_difference_php)},
      {key:'source',label:'Printed evidence',sortable:false,render:c=><SourceButton stage={index.stage} source={c.source} onPdf={onPdf}/>},
    ]}/></section>;
}
function HighlightProgramScope({data, onPdf}) {
  return <details className="fmr-method"><summary>Scope note: annex capital outlays and operating expenses</summary>
    <p>Each annex details the capital-outlay component of HFEP. The wider program row adds {money(data.stages.house.agency_check.mooe_php)} in Maintenance and Other Operating Expenses (MOOE), unchanged between NEP and House.</p>
    <button onClick={()=>download('hfep-highlight-program-scope.csv',csvText(
      ['stage','annex_capital_outlay_php','agency_capital_outlay_php','mooe_php','wider_hfep_program_php','annex_minus_agency_co_php','source_pdf','pdf_page'],
      ['nep','house'].map(side=>{const stage=data.stages[side],check=stage.agency_check;return [side,columnAmount(stage.annex_control,'total'),check.capital_outlay_php,check.mooe_php,check.total_php,
        columnAmount(stage.annex_control,'total')-check.capital_outlay_php,check.source.source_pdf,check.source.pdf_page];})))}>Export program scope CSV</button>
    <div className="fmr-source-audits">{[data.stages.nep, data.stages.house].map(stage =>
      <div key={stage.key}><h3>{stage.label}</h3><AgencyCheck check={stage.agency_check} stage={stage} onPdf={onPdf}/><SourceButton stage={stage} source={stage.root.source} onPdf={onPdf} label={`${stage.key==='nep'?'NEP':'House'} annex control`}/></div>)}</div>
  </details>;
}
function HighlightHospitalPriorities({data, indexes, route, onPdf, story}) {
  const p = routeParams(route.params), side = p.evidenceStage === 'house' ? 'house' : 'nep', index = indexes[side];
  const facilities = filterFacilities(story.hospitals.projects[side], p).sort((a,b)=>
    (columnAmount(b.amounts_php,'total') || 0) - (columnAmount(a.amounts_php,'total') || 0) || a.id.localeCompare(b.id));
  const selected = facilities.find(f => f.id === p.evidenceNode) || facilities[0];
  return <><HighlightCategoryMovements data={data} onPdf={onPdf} rows={story.hospitals.categories}
    label="HFEP hospital category movements" heading="DOH and LGU hospital capital-outlay allocations"
    note="Compare the printed NEP and House allocations for DOH and LGU hospitals. Open each category’s source page, then inspect the facility records below."/>
    <section aria-label="Supporting hospital allocations"><h3>Which facilities carry these allocations?</h3>
      <p>Review the original DOH and LGU hospital allocations in each source, largest first. Comparing these populations requires further facility counterpart review; the schedules alone do not explain service consequences.</p>
      <label className="annex-source-select">Hospital allocation source<select aria-label="Hospital allocation source" value={side}
        onChange={e=>navigate(route,{...Object.fromEntries(FILTER_KEYS.map(key=>[key,null])), evidenceStage:e.target.value,evidenceNode:null})}>
        <option value="nep">DBM NEP</option><option value="house">House GAB</option></select></label>
      <Filters route={route} index={index} categoryIds={story.hospitals.categories.map(row=>row[side].id)}/>
      <div className="fmr-result-bar"><span>{facilities.length} supporting {side==='nep'?'NEP':'House'} hospital rows · {money(columnSum(facilities,'total'))}</span>
        <button onClick={()=>download(`hfep-${side}-hospital-allocations.csv`,facilityCsv(facilities,index))}>Export hospital allocations CSV</button></div>
      {selected && <div className="annex-selection"><label className="annex-source-select">Select hospital allocation<select aria-label="Hospital highlight facility" value={selected.id} onChange={e=>navigate(route,{evidenceNode:e.target.value})}>
        {facilities.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label><Evidence index={index} id={selected.id} onPdf={onPdf}/></div>}
      <FacilityTable tableId={`highlight-hospitals-${side}`} index={index} facilities={facilities} onSelect={id=>navigate(route,{evidenceNode:id})}
        onPdf={onPdf} initialSort={{key:'total',direction:'desc'}}/>
    </section></>;
}
function Highlights({data, indexes, route, onPdf}) {
  const nep = data.stages.nep;
  const cards = useMemo(()=>hfepHighlights(data),[data]);
  const story = cards.find(c => c.id === route.params.get('story') || c.aliases?.includes(route.params.get('story')));
  const p=routeParams(route.params), index=indexes.nep;
  const review=story?.projects ? filterFacilities(story.projects,p) : [];
  const selected=review.find(f=>f.id===p.evidenceNode) || review[0];
  const reset={evidenceNode:null,evidenceStage:null,sort:null,dir:null,page:null,table:null,...Object.fromEntries(FILTER_KEYS.map(k=>[k,null]))};
  const close=()=>navigate(route,{...reset,story:null});
  return <>
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Findings</p><h1>Highlights</h1>
      <p>Findings from the HFEP annexes with their printed evidence.</p></div><ShareLink/></div>
    <h2>Findings to investigate</h2>
    <div className="fmr-highlight-grid">{cards.map((c, i) => <article key={c.id} className="fmr-highlight">
      <p className="fmr-eyebrow">{String(i + 1).padStart(2, '0')} · {c.kind}</p>
      <h3>{c.title}</h3><p>{c.body}</p><p className="fmr-story-prompt">{c.prompt}</p>
      <HighlightAction card={c} onOpen={()=>navigate(route,{...reset,story:c.id})}/></article>)}</div>
    {story && <Dialog key={story.id} label={`Highlight evidence: ${story.title}`} className="fmr-story-dialog annex-highlight-dialog" onClose={close}>
      <div className="fmr-dialog-heading"><h2>{story.title}</h2><button onClick={close}>Close evidence</button></div>
      <div className="fmr-dialog-body">
        <HighlightSummary card={story}/>
        <div className="fmr-story-actions"><a className="secondary" href={routeHref(story.href,story.params)}>Continue in the workbench</a><ShareLink/>
          {['nep','house'].map(side=><a key={side} href={siteUrl(data.stages[side].preview_pdf)} download>Download {data.stages[side].label} PDF</a>)}</div>
        {story.id === 'nep-defect' && <section>
          <h3>Documented overhang chain ({nep.printed_defects[0].documented_defect})</h3>
          <button onClick={()=>download('hfep-highlight-control-overhang.csv',csvText(
            ['control_id','label','column','printed_php','facility_sum_php','difference_php','documented_defect','source_pdf','pdf_page'],
            nep.printed_defects.map(d=>[d.node_id,d.label,d.column,d.printed_php,d.facility_sum_php,d.difference_php,d.documented_defect,
              pdfPathFor(nep,nodeOf(indexes.nep,d.node_id).source),nodeOf(indexes.nep,d.node_id).source.pdf_page])))}>Export overhang chain CSV</button>
          <SortableTable rows={nep.printed_defects} ariaLabel="Documented NEP printed defects" pageSize={10} columns={[
            {key: 'label', label: 'Control', scope: 'row', render: d => <a href={routeHref('nep', {node: d.node_id, view: 'tree'})}>{d.label}</a>},
            {key: 'column', label: 'Column', render: d => COLUMN_LABELS[d.column]},
            {key: 'printed_php', label: 'Printed (PHP)', align: 'num', render: d => money(d.printed_php)},
            {key: 'facility_sum_php', label: 'Facility sum (PHP)', align: 'num', render: d => money(d.facility_sum_php)},
            {key: 'difference_php', label: 'Difference (PHP)', align: 'num', render: d => money(d.difference_php)},
            {key: 'source', label: 'Printed evidence', sortable: false, render: d => <SourceButton stage={nep} source={nodeOf(indexes.nep,d.node_id).source} onPdf={onPdf}/>},
          ]}/>
          <Evidence index={indexes.nep} id="nep_hfep:p2:r47" onPdf={onPdf}/>
        </section>}
        {story.id === 'lgu-split' && <><HighlightFundingColumns data={data} onPdf={onPdf}/><HighlightCategoryMovements data={data} onPdf={onPdf}/><HighlightProgramScope data={data} onPdf={onPdf}/></>}
        {story.id === 'house-balance' && <HighlightHouseControls index={indexes.house} route={route} onPdf={onPdf}/>}
        {story.id === 'hospital-priorities' && <HighlightHospitalPriorities data={data} indexes={indexes} route={route} onPdf={onPdf} story={story}/>}
        {story.id === 'ocr-flags' && <section><Filters route={route} index={index} review/>
          <div className="fmr-result-bar"><span>{review.length} supporting NEP facility rows · {money(columnSum(review,'total'))}</span>
            <button onClick={()=>download('hfep-highlight-extraction-notes.csv',facilityCsv(review,index))}>Export filtered CSV</button></div>
          {selected && <div className="annex-selection"><label className="annex-source-select">Select reviewed facility<select aria-label="HFEP highlight facility" value={selected.id} onChange={e=>navigate(route,{evidenceNode:e.target.value})}>
            {review.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label><Evidence index={index} id={selected.id} onPdf={onPdf}/></div>}
          <FacilityTable tableId="highlight-extraction-facilities" index={index} facilities={review} onSelect={id=>navigate(route,{evidenceNode:id})} onPdf={onPdf}/></section>}
      </div>
    </Dialog>}
    {route.params.get('story') && !story && <p role="alert">Finding not found. <button onClick={close}>Clear story selection</button></p>}
  </>;
}

export default function HfepApp({initialData = null} = {}) {
  const [route, setRoute] = useState(() => readRoute());
  const [data, setData] = useState(initialData);
  const [error, setError] = useState('');
  useEffect(() => {const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update);}, []);
  useEffect(() => {if (initialData) return; const controller = new AbortController();
    fetch(siteUrl(DATA_URL), {signal: controller.signal}).then(r => {if (!r.ok) throw Error(`Data request failed (${r.status})`); return r.json();})
      .then(d => {if (d.schema_version !== 1) throw Error('Unsupported HFEP dataset'); setData(d);})
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);});
    return () => controller.abort();}, []);
  const titleFor = key => hfepTabs.find(t => t[0] === key)?.[1] || 'Unknown page';
  useEffect(() => {document.title = `${titleFor(route.key)} · DOH HFEP FY2027`;}, [route.key]);
  const indexes = useMemo(() => data ? {house: buildStageIndex(data.stages.house), nep: buildStageIndex(data.stages.nep)} : null, [data]);
  // The pdf param carries the stage key; the page number rides along. Prefer an
  // explicit stage key from the click site; otherwise resolve from row id /
  // source path (JSON OCR artifacts must not match every stage's preview).
  const onPdf = (source, stageKey) => {
    const pdfStage = resolvePdfStage(data, source, stageKey);
    const agencyPdf = pdfStage?.agency_check?.source?.source_pdf;
    const key = agencyPdf && source.source_pdf === agencyPdf && agencyPdf !== pdfStage.preview_pdf
      ? `${pdfStage.key}-agency` : pdfStage?.key;
    navigate(route, {pdf: key || null, pdfPage: source.pdf_page});
  };
  const pdfKey = route.params.get('pdf'), pageNumber = Number(route.params.get('pdfPage'));
  const pdfStage = data && [data.stages.house, data.stages.nep].find(s => pdfKey === s.key || pdfKey === `${s.key}-agency`);
  const pdfDocument = pdfStage && (pdfKey.endsWith('-agency') ? pdfStage.agency_check.source.source_pdf : pdfStage.preview_pdf);
  const source = pdfStage && Number.isInteger(pageNumber) && pageNumber > 0
    ? {url: siteUrl(pdfDocument), document: pdfDocument.split('/').pop(), title: `${pdfStage.label} · source page`, page: pageNumber} : null;
  const inlineSource = source && ['house', 'nep', 'compare'].includes(route.key) ? source : null;
  const mainRef = useRef(null);
  return <><a className="fmr-skip" href="#hfep-content" onClick={e => {e.preventDefault(); document.getElementById('hfep-content')?.focus();}}>Skip to content</a>
    <WorkbenchHeader route={route.key} workspace="hfep"/>
    <main id="hfep-content" tabIndex={-1} className="shell fmr-main">
      {error ? <div role="alert"><h1>HFEP data could not load</h1><p>{error}</p><p>Build the HFEP dataset, then reload this page.</p>
        <button onClick={() => window.location.reload()}>Reload</button></div>
        : !data || !indexes ? <p role="status">Loading HFEP sources…</p>
        : route.key === 'house' || route.key === 'nep' ? <SourceWorkspace key={route.key} index={indexes[route.key]} route={route} onPdf={onPdf} inlineSource={inlineSource}/>
        : route.key === 'analysis' ? <Analysis indexes={indexes} route={route} onPdf={onPdf} data={data}/>
        : route.key === 'compare' ? <Compare data={data} indexes={indexes} route={route} onPdf={onPdf} inlineSource={inlineSource}/>
        : route.key === 'highlights' ? <Highlights data={data} indexes={indexes} route={route} onPdf={onPdf}/>
        : route.key === 'home' ? <Home data={data} indexes={indexes}/>
        : <><h1>Page not found</h1><a href={routeHref('home', {}, 'hfep')}>Open HFEP Home</a></>}
      {source && !inlineSource && <Dialog label="HFEP PDF source" className="fmr-pdf-dialog" onClose={() => navigate(route, {pdf: null, pdfPage: null})}>
        <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
          <PdfPreview source={source} onClose={() => navigate(route, {pdf: null, pdfPage: null})} closeLabel="Close PDF" downloadOriginal/>
        </Suspense></Dialog>}
      {pdfKey && data && !source && <p role="alert">Unknown PDF source or invalid page. <button onClick={() => navigate(route, {pdf: null, pdfPage: null})}>Clear PDF selection</button></p>}
    </main>
    <footer className="shell fmr-footer"><span>FY2027 HFEP · DOH capital-outlay annexes</span>
      <a href={siteUrl('analysis-hfep/README.md')}>Source documentation</a>
      <a href={siteUrl('analysis-hfep/NEP_HFEP_EXTRACTION.md')}>NEP extraction method</a>
      <a href={siteUrl('analysis-hfep/HFEP_EXTRACTION.md')}>House extraction method</a></footer>
  </>;
}
