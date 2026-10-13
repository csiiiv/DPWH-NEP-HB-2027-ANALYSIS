// DOH HFEP workspace: per-document source verification for the FY2027 Health
// Facilities Enhancement Program annexes. Both stages are presented side by
// side with title-matched review pairs, never merged: the House annex covers
// LGU-side capital outlays while the NEP annex covers all capital outlays,
// so pairs are evidence pointers, not identity claims (see the payload's
// matching_note). The skeleton mirrors FmrApp.jsx.
import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
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
} from './hfepModel.js';
import './Fmr.css';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const DATA_URL = 'other-analysis/data/hfep_workbench.json';

const routeParams = params => Object.fromEntries(params);
function navigate(route, patch) {
  const next = {...routeParams(route.params), ...patch};
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
    <a key={key} href={routeHref(route.key, {...routeParams(route.params), view: key, page: '1', sort: '', dir: '', node: null})}
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
// A NEP facility's source_pdf points at the OCR JSON; the human PDF is the
// stage's preview document. House rows already carry the real PDF path.
function pdfPathFor(stage, source) {
  const path = source.source_pdf;
  return path.endsWith('.json') ? stage.preview_pdf : path;
}
function previewSource(stage, node) {
  return {url: siteUrl(pdfPathFor(stage, node.source)), document: pdfPathFor(stage, node.source).split('/').pop(),
    title: node.label.length > 80 ? `${node.label.slice(0, 77)}…` : node.label, page: node.source.pdf_page};
}
function SourceButton({stage, source, onPdf, label}) {
  return <button className="fmr-source-button" onClick={() => onPdf(source)}>
    {label || `PDF p. ${source.pdf_page}`}<small>Printed p. {source.printed_page}</small></button>;
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
function Filters({route, index, review = false}) {
  const params = routeParams(route.params);
  const facilities = index.stage.facilities;
  const options = useMemo(() => provenanceOptions(facilities), [index]);
  const provinces = useMemo(() => [...new Set(facilities.map(f => facilityScope(index, f).province).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', {numeric: true})), [index]);
  const categories = useMemo(() => index.stage.categories.map(c => [c.label, `${c.label} · ${index.rollup.get(c.id).count} facilities`]), [index]);
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
    {facility && <p className="fmr-muted">{facilityScope(index, facility).category} › {facilityScope(index, facility).subcategory} › {facilityScope(index, facility).region} › {facilityScope(index, facility).province}</p>}
    <nav className="fmr-breadcrumbs" aria-label="Source breadcrumbs">{path.map((step, i) => <React.Fragment key={step.id}>
      {i > 0 && <span className="sep">›</span>}<a href={routeHref(stage.key, {node: step.id, view: 'tree'})}>{step.label}</a>
    </React.Fragment>)}</nav>
    <p><code>{id}</code></p>
    <ArithmeticDl index={index} id={id}/>
    <p><SourceButton stage={stage} source={node.source} onPdf={onPdf} label="Open source page"/></p>
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

function FacilityTable({index, facilities, onSelect, onPdf}) {
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
  return <SortableTable rows={facilities} columns={columns} initialSort={{key: 'title', direction: 'asc'}} ariaLabel="HFEP facilities" pageSize={25}/>;
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

function ScopeTable({rows, onDrill, route}) {
  const sort = routeSort(route, ['label', 'count', 'infrastructure', 'medical_equipment', 'motor_vehicle', 'total', 'median', 'flagged']);
  return <SortableTable rows={rows} sort={sort} onSortChange={update => routeSetSort(route, update, sort)} ariaLabel="HFEP regional allocation" initialSort={{key: 'total', direction: 'desc'}} columns={[
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
// single unmatched row): the House annex records LGU-side rows and the NEP
// annex records all rows, so insertion/deletion candidates reflect grain and
// scope differences between the two annexes, not confirmed legislative edits.
function aggregateBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = key(row);
    if (label == null) continue;
    const entry = groups.get(label) || {id: label, label, rows: 0, amount_php: 0};
    entry.rows++; entry.amount_php += columnAmount(row.amounts_php, 'total') || 0;
    groups.set(label, entry);
  }
  return [...groups.values()].sort((a, b) => b.amount_php - a.amount_php || a.label.localeCompare(b.label));
}
function CrossDocAggregate({title, groups, drillKey, route}) {
  if (!groups.length) return null;
  return <div className="fmr-section"><h3>{title} · {groups.length} groups</h3>
    <SortableTable rows={groups} ariaLabel={title} initialSort={{key: 'amount_php', direction: 'desc'}} columns={[
      {key: 'label', label: 'Group', scope: 'row', render: r => <a href={routeHref('compare', {view: 'pairs', [drillKey]: r.label})}>{r.label}</a>},
      {key: 'rows', label: 'Rows', align: 'num'},
      {key: 'amount_php', label: 'Allocation (PHP)', align: 'num', render: r => <Amount value={r.amount_php} exact/>},
    ]}/></div>;
}
function Insertions({comparison, route, onPdf, data}) {
  const houseStage = data.stages.house;
  const rows = comparison.house_only_rows;
  const total = rows.reduce((s, r) => s + (columnAmount(r.amounts_php, 'total') || 0), 0);
  return <>
    <div className="fmr-stats">
      <Stat label="Insertion candidates" value={rows.length} detail="House rows with no NEP counterpart"/>
      <Stat label="House-only allocation" value={<Amount value={total} exact/>} detail="ranked by amount below"/>
      <Stat label="Matched pairs" value={comparison.rows.length} detail={`of ${comparison.rows.length + rows.length} House rows`}/>
      <Stat label="Rest matches" value={`${Math.round(comparison.rows.length / (comparison.rows.length + rows.length) * 100)}%`} detail="at ≥0.95 title similarity"/>
    </div>
    <p className="fmr-notice">These are review candidates, not confirmed insertions: the House annex records LGU-side rows at its own grain, so an unmatched House row usually means the NEP lists the same money at a different grain (lumped, split, or retitled) — not that the House added a facility. Verify against the NEP annex before claiming an insertion.</p>
    <CrossDocAggregate title="Insertion candidates by region" groups={aggregateBy(rows, r => r.scope?.region)} drillKey="region" route={route}/>
    <section className="fmr-section"><h3>Top insertion candidates</h3>
      <SortableTable rows={[...rows].sort((a, b) => (columnAmount(b.amounts_php, 'total') || 0) - (columnAmount(a.amounts_php, 'total') || 0)).slice(0, 100)
        .map((r, i) => ({...r, id: r.id, rank: i + 1}))} ariaLabel="Top insertion candidates" initialSort={{key: 'rank', direction: 'asc'}} pageSize={25} columns={[
        {key: 'rank', label: '#', value: r => r.rank},
        {key: 'title', label: 'House facility', scope: 'row', render: r => <a href={routeHref('house', {node: r.id, view: 'tree'})}>{r.title}</a>},
        {key: 'region', label: 'Region', value: r => r.scope?.region, render: r => r.scope?.region},
        {key: 'province', label: 'Province', value: r => r.scope?.province, render: r => r.scope?.province},
        {key: 'amount', label: 'House amount (PHP)', align: 'num', value: r => columnAmount(r.amounts_php, 'total'), render: r => <Amount value={columnAmount(r.amounts_php, 'total')} exact/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <SourceButton stage={houseStage} source={r.source} onPdf={onPdf}/>},
        {key: 'review', label: 'Review', sortable: false, render: r => <a href={routeHref('nep', {q: r.title.slice(0, 40)})}>Search NEP annex</a>},
      ]}/></section>
  </>;
}
function Deletions({comparison, route, onPdf, data}) {
  const nepStage = data.stages.nep;
  const rows = comparison.nep_only_rows;
  const total = rows.reduce((s, r) => s + (columnAmount(r.amounts_php, 'total') || 0), 0);
  return <>
    <div className="fmr-stats">
      <Stat label="Deletion candidates" value={rows.length} detail="NEP rows with no House counterpart"/>
      <Stat label="NEP-only allocation" value={<Amount value={total} exact/>} detail="includes national-side items"/>
      <Stat label="Matched pairs" value={comparison.rows.length} detail={`of ${comparison.rows.length + rows.length} NEP rows`}/>
      <Stat label="Rest matches" value={`${Math.round(comparison.rows.length / (comparison.rows.length + rows.length) * 100)}%`} detail="at ≥0.95 title similarity"/>
    </div>
    <p className="fmr-notice">These are review candidates, not confirmed deletions: the NEP annex covers national and LGU capital outlays while the House annex covers LGU-side rows only, so most NEP-only rows are national-side items (hospitals, centers, central-office programs) that cannot appear in the House annex by scope. Verify the scope labels before claiming a deletion.</p>
    <CrossDocAggregate title="Deletion candidates by region" groups={aggregateBy(rows, r => r.scope?.region)} drillKey="region" route={route}/>
    <section className="fmr-section"><h3>Top deletion candidates</h3>
      <SortableTable rows={[...rows].sort((a, b) => (columnAmount(b.amounts_php, 'total') || 0) - (columnAmount(a.amounts_php, 'total') || 0)).slice(0, 100)
        .map((r, i) => ({...r, rank: i + 1}))} ariaLabel="Top deletion candidates" initialSort={{key: 'rank', direction: 'asc'}} pageSize={25} columns={[
        {key: 'rank', label: '#', value: r => r.rank},
        {key: 'title', label: 'NEP facility', scope: 'row', render: r => <a href={routeHref('nep', {node: r.id, view: 'tree'})}>{r.title}</a>},
        {key: 'region', label: 'Region', value: r => r.scope?.region, render: r => r.scope?.region},
        {key: 'province', label: 'Province', value: r => r.scope?.province, render: r => r.scope?.province},
        {key: 'amount', label: 'NEP amount (PHP)', align: 'num', value: r => columnAmount(r.amounts_php, 'total'), render: r => <Amount value={columnAmount(r.amounts_php, 'total')} exact/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <SourceButton stage={nepStage} source={r.source} onPdf={onPdf}/>},
        {key: 'review', label: 'Review', sortable: false, render: r => <a href={routeHref('house', {q: r.title.slice(0, 40)})}>Search House annex</a>},
      ]}/></section>
  </>;
}
function Adjustments({comparison, route, onPdf, data}) {
  const changed = comparison.rows.filter(r => r.changed);
  const columnNet = Object.fromEntries(FUND_COLUMNS.map(c => [c, changed.reduce((s, r) => s + (r.columns[c].difference ?? 0), 0)]));
  return <>
    <div className="fmr-stats">
      <Stat label="Adjusted pairs" value={changed.length} detail={`of ${comparison.rows.length} matched pairs`}/>
      <Stat label="Net total movement" value={<Amount value={columnNet.total} signed exact/>} detail="NEP → House on matched rows"/>
      <Stat label="Columns reallocated" value={FUND_COLUMNS.filter(c => c !== 'total' && columnNet[c] !== 0).length} detail="infra / med equip / motor veh"/>
      <Stat label="Unchanged pairs" value={comparison.rows.length - changed.length} detail="identical amounts in both annexes"/>
    </div>
    <p className="fmr-notice">These pairs carry different per-column amounts in the two annexes under a ≥0.95 title match. This is cross-document reallocation, not a House reading change: identity is proposed by title similarity and is not certified. The NEP − House delta on each pair is shown per funding column; the House reallocated money between infrastructure, medical equipment, and motor vehicles on LGU rows.</p>
    <section className="fmr-section"><h3>Net movement by funding column</h3>
      <SortableTable rows={FUND_COLUMNS.map(c => ({column: c, net: columnNet[c],
        changed_rows: changed.filter(r => r.columns[c].difference != null && r.columns[c].difference !== 0).length}))} ariaLabel="Net movement by funding column" columns={[
        {key: 'column', label: 'Funding column', scope: 'row', render: r => COLUMN_LABELS[r.column]},
        {key: 'net', label: 'Net movement (PHP)', align: 'num', render: r => <Amount value={r.net} signed exact/>},
        {key: 'changed_rows', label: 'Pairs changed', align: 'num'},
      ]}/></section>
    <section className="fmr-section"><h3>Adjusted pairs</h3>
      <SortableTable rows={changed.map(r => ({...r, total_delta: r.columns.total.difference ?? 0}))} ariaLabel="Adjusted pairs" initialSort={{key: 'total_delta', direction: 'desc'}} pageSize={25} columns={[
        {key: 'title', label: 'Facility pair', scope: 'row', render: r => <a href={routeHref('house', {node: r.house.id, view: 'tree'})}>{r.house.title}</a>},
        {key: 'region', label: 'Region', value: r => r.house_scope?.region, render: r => r.house_scope?.region},
        {key: 'infra', label: 'Δ Infra', align: 'num', value: r => r.columns.infrastructure.difference ?? 0, render: r => <Amount value={r.columns.infrastructure.difference} signed/>},
        {key: 'med', label: 'Δ Med equip', align: 'num', value: r => r.columns.medical_equipment.difference ?? 0, render: r => <Amount value={r.columns.medical_equipment.difference} signed/>},
        {key: 'veh', label: 'Δ Motor veh', align: 'num', value: r => r.columns.motor_vehicle.difference ?? 0, render: r => <Amount value={r.columns.motor_vehicle.difference} signed/>},
        {key: 'total_delta', label: 'Δ Total', align: 'num', render: r => <Amount value={r.total_delta} signed exact/>},
        {key: 'source', label: 'Source', sortable: false, render: r => <>
          <SourceButton stage={data.stages.house} source={r.house.source} onPdf={onPdf} label={`House p. ${r.house.source.pdf_page}`}/>
          <SourceButton stage={data.stages.nep} source={r.nep.source} onPdf={onPdf} label={`NEP p. ${r.nep.source.pdf_page}`}/></>},
        {key: 'review', label: 'Review', sortable: false, render: r => <a href={routeHref('compare', {view: 'pairs', q: r.house.title.slice(0, 40)})}>Compare pair</a>},
      ]}/></section>
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
  const regions = useMemo(() => scopeRows(index, 'region'), [index]);
  const recordKey = params.records;
  let records = facilities, recordLabel = 'Filtered facilities';
  if (recordKey?.startsWith('region:')) {records = facilities.filter(f => facilityScope(index, f).region === recordKey.slice(7)); recordLabel = `Region ${recordKey.slice(7)}`;}
  if (recordKey?.startsWith('band:')) {const band = HFEP_BANDS[Number(recordKey.slice(5))]; records = band ? facilities.filter(f => {const v = columnAmount(f.amounts_php, 'total'); return v != null && v >= band[0] && v < band[1];}) : []; recordLabel = band?.[2] || 'Unknown band';}
  if (recordKey?.startsWith('amount:')) {const amount = Number(recordKey.slice(7)); records = facilities.filter(f => columnAmount(f.amounts_php, 'total') === amount); recordLabel = money(amount);}
  if (recordKey === 'all') {records = facilities;}
  const drill = next => navigate(route, {records: next});
  const crossDocViews = ['insertions', 'deletions', 'adjustments'];
  const questions = {overview: 'How are HFEP capital outlays distributed across regions and categories?',
    insertions: 'Which House rows have no NEP counterpart at line-item grain?',
    deletions: 'Which NEP rows have no House counterpart at line-item grain?',
    adjustments: 'Which matched pairs changed amounts between the annexes?',
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
        <p className="fmr-muted">Region labels aggregate facilities across subcategory blocks; printed region controls appear in the source trees at their own grain.</p>
        <ScopeTable rows={regions.filter(r => !params.region || r.label === params.region)} route={route}
          onDrill={label => drill(`region:${label}`)}/></section>
    </> : view === 'categories' ? <>
      <section className="fmr-section"><h3>Category controls</h3>
        <SortableTable rows={stage.categories} ariaLabel="HFEP category controls" initialSort={{key: 'label', direction: 'asc'}} columns={[
          {key: 'label', label: 'Category', scope: 'row', render: c => <a href={routeHref(stage.key, {node: c.id, view: 'tree'})}>{c.label}</a>},
          {key: 'infra', label: 'Infra (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'infrastructure'), render: c => <Amount value={columnAmount(c.amounts_php, 'infrastructure')}/>},
          {key: 'med', label: 'Med equip (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'medical_equipment'), render: c => <Amount value={columnAmount(c.amounts_php, 'medical_equipment')}/>},
          {key: 'veh', label: 'Motor veh (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'motor_vehicle'), render: c => <Amount value={columnAmount(c.amounts_php, 'motor_vehicle')}/>},
          {key: 'total', label: 'Total (PHP)', align: 'num', value: c => columnAmount(c.amounts_php, 'total'), render: c => <Amount value={columnAmount(c.amounts_php, 'total')} exact/>},
          {key: 'facilities', label: 'Facilities', align: 'num', value: c => index.rollup.get(c.id).count},
        ]}/></section>
      <section className="fmr-section"><h3>Subcategory populations</h3>
        <SortableTable rows={stage.subcategories} ariaLabel="HFEP subcategory populations" pageSize={25} initialSort={{key: 'label', direction: 'asc'}} columns={[
          {key: 'label', label: 'Subcategory', scope: 'row', render: s => <a href={routeHref(stage.key, {node: s.id, view: 'tree'})}>{s.label}</a>},
          {key: 'count', label: 'Facilities', align: 'num', value: s => index.rollup.get(s.id).count},
          {key: 'total', label: 'Total (PHP)', align: 'num', value: s => index.rollup.get(s.id).amounts_php.total, render: s => <Amount value={index.rollup.get(s.id).amounts_php.total}/>},
        ]}/></section>
    </> : view === 'stats' ? <>
      <p className="fmr-notice">These are descriptive patterns in recorded allocations. Repeated amounts and rounding do not establish procurement, implementation, or pricing.</p>
      <section className="fmr-section"><h3>Allocation bands</h3><SortableTable rows={bandRows(facilities)} ariaLabel="HFEP allocation bands" columns={[
        {key: 'label', label: 'Allocation band', scope: 'row', render: r => <button className="fmr-text-button" onClick={() => drill(`band:${r.id.slice(5)}`)}>{r.label} → records</button>},
        {key: 'facilities', label: 'Facilities', align: 'num'},
        {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => <Amount value={r.total_php} exact/>},
        {key: 'share', label: 'Allocation share', align: 'num', value: r => stats.total ? r.total_php / stats.total : 0, render: r => `${stats.total ? (r.total_php / stats.total * 100).toFixed(1) : '0.0'}%`},
      ]}/></section>
      <section className="fmr-section"><h3>Rounding pattern</h3><SortableTable rows={roundingLadder(facilities)} ariaLabel="HFEP rounding ladder" initialSort={{key: 'step', direction: 'desc'}} columns={[
        {key: 'label', label: 'Coarsest matching granularity', scope: 'row'},
        {key: 'facilities', label: 'Facilities', align: 'num'},
        {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => <Amount value={r.total_php}/>},
        {key: 'share', label: 'Facility share', align: 'num', render: r => `${(r.share * 100).toFixed(1)}%`},
      ]}/></section>
      <section className="fmr-section"><h3>Repeated exact allocations</h3><p className="fmr-muted">Amounts appearing on at least five facilities.</p>
        <SortableTable rows={repeatedAmounts(facilities)} ariaLabel="HFEP repeated amounts" initialSort={{key: 'total_php', direction: 'desc'}} columns={[
          {key: 'amount_php', label: 'Exact amount (PHP)', align: 'num', render: r => <button className="fmr-text-button" onClick={() => drill(`amount:${r.amount_php}`)}>{money(r.amount_php)} → records</button>},
          {key: 'facilities', label: 'Facilities', align: 'num'},
          {key: 'total_php', label: 'Combined (PHP)', align: 'num', render: r => <Amount value={r.total_php}/>},
        ]}/></section>
    </> : view === 'review' ? <section className="fmr-section"><h3>Extraction findings</h3>
      <p className="fmr-muted">Flags are pre-acceptance suspicions recorded during extraction; interpretation rules document how ambiguous printed cells were read. Neither alters a printed value, and none of these findings affect control arithmetic.</p>
      <SortableTable rows={reviewCategories(facilities)} ariaLabel="HFEP extraction findings" columns={[
        {key: 'label', label: 'Finding', scope: 'row'},
        {key: 'count', label: 'Facilities', align: 'num'},
      ]}/></section> : <p>Unknown view. <a href={routeHref('analysis', {}, undefined)}>Open Overview</a>.</p>}
    {stageKey === 'house' && <ReadingNote/>}
    {recordKey && <Dialog label="Analysis source records" onClose={() => navigate(route, {records: null})}>
      <div className="fmr-dialog-heading"><h2>{stage.label} · {recordLabel}</h2><button onClick={() => navigate(route, {records: null})}>Close records</button></div>
      <div className="fmr-result-bar"><span>{records.length} facilities · <Amount value={columnSum(records, 'total')} exact/></span>
        <button onClick={() => download(`hfep-${stage.key}-records.csv`, facilityCsv(records, index))}>Export filtered CSV</button></div>
      <FacilityTable index={index} facilities={records} onSelect={id => {window.location.hash = routeHref(stage.key, {node: id, view: 'tree'});}} onPdf={onPdf}/>
    </Dialog>}
  </>;
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
  // Sortable pairs table: sort key + direction ride in the route so shared
  // links reproduce the exact view (DPWH comparison table pattern).
  const sortKeys = ['title', 'region', 'house', 'nep', 'delta', 'match'];
  const sortKey = sortKeys.includes(params.sort) ? params.sort : 'title';
  const sortDir = params.dir === 'desc' ? 'desc' : 'asc';
  const sortValue = {title: r => r.house.title, region: r => r.house_scope?.region, house: r => r.columns.total.house,
    nep: r => r.columns.total.nep, delta: r => r.columns.total.difference ?? 0, match: r => r.similarity};
  const sortedRows = useMemo(() => sortRows(rows, sortValue[sortKey], {key: sortKey, direction: sortDir}), [rows, sortKey, sortDir]);
  const setSort = key => navigate(route, {sort: key === 'title' ? null : key, dir: key === sortKey && sortDir === 'asc' ? 'desc' : null, page: null});
  const sortHeader = (name, key) => <th scope="col" aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="sort-header" aria-label={`Sort by ${name}`} onClick={() => setSort(key)}>{name}
      <span className="sort-indicator" aria-hidden="true">{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span></button></th>;
  const [panel, setPanel] = useState('table');
  useEffect(() => {setPanel(inlineSource ? 'pdf' : 'table');}, [inlineSource?.url, inlineSource?.page]);
  const hasFilters = Boolean(filters.q || filters.changed || filters.region);
  const stageCards = [
    ['House GAB · Volume I-B', comparison.column_totals.total?.house_php ?? 0, `${data.stages.house.facilities.length} facilities · LGU-side capital outlays`],
    ['DBM NEP · Volume II-A', comparison.column_totals.total?.nep_php ?? 0, `${data.stages.nep.facilities.length} facilities · all capital outlays`],
    ['NEP − House', comparison.column_totals.total?.difference_php ?? 0, 'national-side share + per-row reallocation'],
    ['Matched pairs changed', comparison.changed.length ? comparison.rows.filter(r => r.changed).reduce((s, r) => s + (r.columns.total.difference ?? 0), 0) : 0, `${comparison.rows.filter(r => r.changed).length} of ${comparison.rows.length} pairs reallocated across columns`],
  ];
  return <>
    <section className="hero hero-compact">
      <p className="eyebrow">DOH HFEP · FY2027</p>
      <h1>Compare budget stages</h1>
      <p>Per-column control reconciliation and reviewable line-item pairs across the House Volume I-B annex (LGU-side capital outlays) and the NEP Volume II-A annex (all capital outlays). Pairs are title-similarity suggestions and never certify identity.</p>
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
      {[['columns', 'Column reconciliation'], ['pairs', 'Line-item pairs']].map(([key, name]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => navigate(route, {view: key === 'columns' ? null : key, page: null})}>{name}</button>)}
    </nav>
    <p className="comparison-scope">Amounts in PHP · Difference = NEP − House · Pairs require ≥0.95 title similarity within the same region and province.
      {tab === 'pairs' && ' Select a row title to jump to its source tree evidence.'}</p>
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
              <option value="">All pairs</option><option value="changed">Amounts changed</option><option value="same">Amounts identical</option>
            </select></label>}
        </div>
        {hasFilters && <div className="active-filters" aria-label="Active filters">
          {[['query', params.q], ['region', params.region], ['pair status', params.changed]].filter(([, v]) => v).map(([key, v]) =>
            <button key={key} aria-label={`Remove ${key} filter`} onClick={() => changeFilters(route, {[key === 'query' ? 'q' : key === 'pair status' ? 'changed' : key]: null})}>{key === 'pair status' && v === 'changed' ? 'Amounts changed' : key === 'pair status' && v === 'same' ? 'Amounts identical' : v} ×</button>)}
          <button onClick={() => changeFilters(route, {q: null, region: null, changed: null})}>Clear filters</button>
        </div>}
        {params.changed === 'changed' && <p className="muted">Reallocation review: these pairs carry different amounts in the two annexes. Differences are printed values from each document; neither side is corrected.</p>}
        {tab === 'pairs' && <div className="mobile-sort">
          <label>Sort pairs<select aria-label="Sort pairs" value={sortKey} onChange={e => setSort(e.target.value)}>
            {[['title', 'Facility pair'], ['house', 'House GAB'], ['nep', 'DBM NEP'], ['delta', 'NEP − House'], ['region', 'Region'], ['match', 'Match']].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select></label>
          <button onClick={() => navigate(route, {dir: sortDir === 'asc' ? 'desc' : null, page: null})}>{sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
        </div>}
        <div className="results-toolbar">
          <p className="result-count" aria-live="polite">{tab === 'columns' ? `${FUND_COLUMNS.length} funding columns` : `${rows.length.toLocaleString()} of ${comparison.rows.length.toLocaleString()} pairs`}{rows.filter(r => r.changed).length ? ` · ${rows.filter(r => r.changed).length} with amount changes` : ''}</p>
          <ShareLink/>
          {tab === 'pairs' && <button disabled={!rows.length} onClick={() => download('hfep-comparison-pairs.csv', comparisonCsv(rows))}>Export CSV</button>}
        </div>
        {tab === 'columns' ? <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Column reconciliation"><table>
            <thead><tr><th scope="col">Funding column</th><th scope="col">House GAB</th><th scope="col">DBM NEP</th><th scope="col">NEP − House</th><th scope="col">Matched-pair movement</th></tr></thead>
            <tbody>{FUND_COLUMNS.map(column => {
              const t = comparison.column_totals[column];
              const changedRows = comparison.rows.filter(r => r.changed);
              const net = changedRows.reduce((s, r) => s + (r.columns[column].difference ?? 0), 0);
              return <tr key={column}><th scope="row">{COLUMN_LABELS[column]}</th>
                <td className="num" data-label="House GAB">{money(t?.house_php)}</td>
                <td className="num" data-label="DBM NEP">{money(t?.nep_php)}</td>
                <td className={`num ${t?.difference_php > 0 ? 'up' : t?.difference_php < 0 ? 'down' : ''}`} data-label="NEP − House">{money(t?.difference_php)}</td>
                <td className={`num ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`} data-label="Matched-pair movement">{net === 0 ? '—' : money(net)}</td>
              </tr>;})}
            </tbody></table></div>
          <p className="muted">The NEP − House gap mixes the national-side share with per-row reallocation on matched LGU rows. The movement column isolates what changed on the {comparison.rows.length} matched pairs; the remainder of the gap is scope, not change.</p>
        </> : <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Matched line-item pairs"><table>
            <thead><tr>{sortHeader('Facility pair', 'title')}{sortHeader('House GAB', 'house')}{sortHeader('DBM NEP', 'nep')}{sortHeader('NEP − House', 'delta')}{sortHeader('Region', 'region')}{sortHeader('Match', 'match')}<th scope="col">Source evidence</th></tr></thead>
            <tbody>{sortedRows.slice((page - 1) * 50, page * 50).map(r =>
              <tr key={r.id}>
                <th scope="row">
                  <button className="project-record-title" onClick={() => {window.location.hash = routeHref('house', {node: r.house.id, view: 'tree'});}}>{r.house.title}</button>
                  <small>{r.house_scope.region} · {r.house_scope.province}</small>
                  <small>NEP: {r.nep.title}</small>
                  {r.changed && <small className="normalized-match-badge">Amounts differ between annexes</small>}
                </th>
                <MoneyCell value={r.columns.total.house} caption="House GAB"/>
                <MoneyCell value={r.columns.total.nep} caption="DBM NEP" prior={r.columns.total.house}/>
                <td className={`num ${r.columns.total.difference > 0 ? 'up' : r.columns.total.difference < 0 ? 'down' : ''}`} data-label="NEP − House">
                  {r.columns.total.difference == null ? '—' : r.columns.total.difference === 0 ? 'same' : `${r.columns.total.difference > 0 ? '+' : ''}${money(r.columns.total.difference)}`}</td>
                <td data-label="Region">{r.house_scope.region}</td>
                <td className="num" data-label="Match">{r.similarity < 1
                  ? <span className="diff-tag diff-tag-identity" title={`Title similarity ${Math.round(r.similarity * 100)}% — verify before treating as one facility`}>match {Math.round(r.similarity * 100)}%</span>
                  : <span title="Identical normalized title in the same region and province">100%</span>}</td>
                <td data-label="Source evidence">
                  <button className="source-link" aria-pressed={false} onClick={() => onPdf(r.house.source)}>House p.{r.house.source.pdf_page}</button>
                  <button className="source-link" aria-pressed={false} onClick={() => onPdf(r.nep.source)}>NEP p.{r.nep.source.pdf_page}</button>
                </td>
              </tr>)}
            </tbody></table></div>
          {!rows.length && <p>No pairs match these filters.</p>}
          <div className="pager">
            <button disabled={page === 1} onClick={() => changeFilters(route, {page: page > 2 ? String(page - 1) : null})}>Previous</button>
            <span>{rows.length ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, rows.length)}` : '0'} / {rows.length.toLocaleString()}</span>
            <button disabled={page * 50 >= rows.length} onClick={() => changeFilters(route, {page: String(page + 1)})}>Next</button>
          </div>
          <p className="muted">Pairs are suggestions: verify the two printed rows before treating them as one facility. Pairs never alter either document's ledger; House-only and NEP-only rows stay unmatched rather than zero.</p>
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

function MoneyCell({value, caption, prior}) {
  const delta = prior != null && value != null ? value - prior : null;
  return <td className="num" data-label={caption} title={value == null ? 'No amount recorded' : `${value.toLocaleString('en-PH')} PHP`}>
    <strong>{money(value)}</strong>
    {delta != null && delta !== 0 && <small className={`delta ${delta > 0 ? 'up' : 'down'}`}>Δ {delta > 0 ? '+' : ''}{money(delta)}</small>}
  </td>;
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
      <p>Two annexes, two populations: the House Volume I-B annex lists LGU-side capital outlays while the DBM NEP Volume II-A annex covers all HFEP capital outlays. This workbench presents each document's own controls and evidence, plus a <strong>review-only comparison</strong>: per-column reconciliation and title-matched pairs that are suggestions to verify, never merged rows.</p>
      <div className="hero-actions"><a className="primary" href={routeHref('nep', {view: 'tree'})}>Open NEP source tree</a>
        <a className="secondary" href={routeHref('house', {view: 'tree'})}>Open House source tree</a>
        <a className="secondary" href={routeHref('compare')}>Compare stages</a>
        <a className="secondary" href={routeHref('analysis')}>Explore analysis</a><ShareLink/></div>
    </section>
    <div className="fmr-stats">
      <Stat label="House GAB annex control" value={<Amount value={columnAmount(house.annex_control, 'total')} exact/>} detail={`${house.facilities.length} LGU facilities · ${house.audit_summary.internal_control_checks} balanced controls`}/>
      <Stat label="DBM NEP annex control" value={<Amount value={columnAmount(nep.annex_control, 'total')} exact/>} detail={`${nep.facilities.length} facilities (national + LGU) · ${nep.audit_summary.internal_control_checks} balanced controls`}/>
      <Stat label="NEP facility ledger" value={<Amount value={columnAmount(nep.facility_ledger, 'total')} exact/>} detail="₱140,000 below the printed control — documented Metro Manila omission"/>
      <Stat label="Cross-stage comparison" value="Review only" detail="Column reconciliation + 0.95-confidence title pairs"/>
    </div>
    <ReadingNote/>
    <h2>Workbench directory</h2>
    <ul className="home-directory">
      <li><a href={routeHref('nep')}><strong>DBM NEP →</strong><span>Executive proposal annex: all HFEP capital outlays with per-column controls and OCR provenance.</span></a></li>
      <li><a href={routeHref('house')}><strong>House GAB →</strong><span>Volume I-B annex: LGU-side capital outlays from the House bill.</span></a></li>
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

function Highlights({data, indexes, route, onPdf}) {
  const nep = data.stages.nep, house = data.stages.house;
  const nepIndex = indexes.nep;
  const cards = [
    {id: 'nep-defect', title: 'A ₱140,000 ghost in the NEP controls', body: 'The published NEP Metro Manila block omits one ₱140,000 medical-equipment row that its controls still count. The facility ledger lands ₱140,000 below the printed grand total on medical equipment and total.',
      prompt: 'Follow the documented overhang from the Metro Manila province control up to the annex title row.',
      href: routeHref('nep', {node: 'nep_hfep:p2:r47', view: 'tree'}), stage: 'nep'},
    {id: 'lgu-split', title: 'Two annexes, two populations', body: `The House annex carries ${house.facilities.length} LGU facilities (₱${(columnAmount(house.annex_control, 'total') / 1e9).toFixed(2)}B); the NEP annex carries ${nep.facilities.length} facilities (₱${(columnAmount(nep.annex_control, 'total') / 1e9).toFixed(2)}B) covering national and LGU capital outlays. Compare stages offers column reconciliation and reviewable title-matched pairs — the ledgers themselves are never merged.`,
      prompt: 'How much of the gap is national-side share, and how much is per-row reallocation?',
      href: routeHref('compare')},
    {id: 'house-balance', title: 'House controls reconcile to the peso', body: `All ${house.audit_summary.internal_control_checks} internal controls reconcile recursively on all four funding columns, and the flat facility ledger independently reproduces the grand total.`,
      prompt: 'Inspect any control: printed amounts equal facility sums on every column.',
      href: routeHref('house', {view: 'tree'})},
    {id: 'ocr-flags', title: 'OCR findings stay open, not corrected', body: 'Nine NEP facilities carry extraction flags or interpretation rules — OCR-suspect labels, verified odd amounts, dash fragments read as empty cells. Printed values were never altered.',
      prompt: 'Review each finding and its raw printed cell.',
      href: routeHref('nep', {view: 'review'}), stage: 'nep'},
    {id: 'agency-check', title: 'The annex is the capital-outlay component', body: 'Both annex totals match the capital-outlay component of the wider agency HFEP allocation (₱10,088,832,000 House I-A; ₱14,539,832,000 NEP II-A). The MOOE in those rows is outside these annexes.',
      prompt: 'Compare the agency row with the annex control.',
      href: routeHref('nep', {view: 'tree'})},
  ];
  const story = cards.find(c => c.id === route.params.get('story'));
  return <>
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Findings</p><h1>Highlights</h1>
      <p>Findings from the HFEP annexes with their printed evidence.</p></div><ShareLink/></div>
    <h2>Findings to investigate</h2>
    <div className="fmr-highlight-grid">{cards.map((c, i) => <article key={c.id} className="fmr-highlight">
      <p className="fmr-eyebrow">{String(i + 1).padStart(2, '0')} · {c.stage ? 'Extraction evidence' : 'Printed controls'}</p>
      <h3>{c.title}</h3><p>{c.body}</p><p className="fmr-story-prompt">{c.prompt}</p>
      <a href={routeHref('highlights', {story: c.id})}>Explore evidence →</a></article>)}</div>
    {story && <Dialog label={`Highlight evidence: ${story.title}`} className="fmr-story-dialog" onClose={() => navigate(route, {story: null})}>
      <div className="fmr-dialog-heading"><h2>{story.title}</h2><button onClick={() => navigate(route, {story: null})}>Close evidence</button></div>
      <div className="fmr-dialog-body">
        <div className="fmr-story-facts"><h3>Evidence</h3><dl>
          <div><dt>Finding</dt><dd>{story.body}</dd></div>
          <div><dt>Investigation question</dt><dd>{story.prompt}</dd></div>
        </dl></div>
        <div className="fmr-story-actions"><a className="secondary" href={story.href}>Continue in the workbench</a><ShareLink/></div>
        {story.id === 'nep-defect' && <div className="fmr-arithmetic">
          <h3>Documented overhang chain ({nep.printed_defects[0].documented_defect})</h3>
          <SortableTable rows={nep.printed_defects} ariaLabel="Documented NEP printed defects" pageSize={10} columns={[
            {key: 'label', label: 'Control', scope: 'row', render: d => <a href={routeHref('nep', {node: d.node_id, view: 'tree'})}>{d.label}</a>},
            {key: 'column', label: 'Column', render: d => COLUMN_LABELS[d.column]},
            {key: 'printed_php', label: 'Printed (PHP)', align: 'num', render: d => money(d.printed_php)},
            {key: 'facility_sum_php', label: 'Facility sum (PHP)', align: 'num', render: d => money(d.facility_sum_php)},
            {key: 'difference_php', label: 'Difference (PHP)', align: 'num', render: d => money(d.difference_php)},
          ]}/>
        </div>}
        {story.id === 'agency-check' && <div className="fmr-source-audits">{[data.stages.nep, data.stages.house].map(stage =>
          <AgencyCheck key={stage.key} check={stage.agency_check} stage={stage} onPdf={onPdf}/>)}</div>}
        {story.id === 'ocr-flags' && <FacilityTable index={indexes.nep} facilities={indexes.nep.stage.facilities.filter(f => (f.flags || []).length > 0)}
          onSelect={id => {window.location.hash = routeHref('nep', {node: id, view: 'tree'});}} onPdf={onPdf}/>}
      </div>
    </Dialog>}
    {route.params.get('story') && !story && <p role="alert">Finding not found. <button onClick={() => navigate(route, {story: null})}>Clear story selection</button></p>}
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
  // The pdf param carries the stage key; the page number rides along. The
  // resolver maps key → preview document, so deep links stay short and the
  // OCR-JSON→PDF indirection lives in one place (pdfPathFor).
  const onPdf = source => {
    const pdfStage = [data?.stages.house, data?.stages.nep].find(s => s && pdfPathFor(s, source) === s.preview_pdf);
    navigate(route, {pdf: pdfStage?.key || null, pdfPage: source.pdf_page});
  };
  const pdfKey = route.params.get('pdf'), pageNumber = Number(route.params.get('pdfPage'));
  const pdfStage = data && [data.stages.house, data.stages.nep].find(s => pdfKey === s.key);
  const source = pdfStage && Number.isInteger(pageNumber) && pageNumber > 0
    ? {url: siteUrl(pdfStage.preview_pdf), document: pdfStage.preview_pdf.split('/').pop(), title: `${pdfStage.label} · source page`, page: pageNumber} : null;
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
