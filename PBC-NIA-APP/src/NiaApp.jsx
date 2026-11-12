import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import AnalysisValue from './AnalysisValue.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';
import {siteUrl} from './data.js';
import {aiMonitoringBasis, aiMonitoringInsertions, aiMonitoringLabels, aiMonitoringProjects, aiMonitoringReconciliation, allocationRowsByDim, concentration, concentrationRows, dimensionGroups, fundingGroups, fundingSummary, highlightsCards, phpPerMOutlierProjects, phpPerMRowsByDim, phpPerMStats, phpPerMStripDomain, preferredChainageTitle, share} from './niaAnalysis.js';
import {PhpPerMScatterPlot, PhpPerMStrip, PhpPerMStripAxis, phpPerMScatterPoints} from './niaPhpPerMStrip.jsx';
import {allocationStats, analysisCandidateRows, bandRows, candidateAggregates, candidateGroupRows, candidateResolution, comparisonFilterLabels, comparisonRows,
  csvText, filterComparisons, filterProjects, flagLabels, money, signedMoney, signedPct, pctChange, niaTabs,
  repeatedAmounts, roundingLadder, rowsForMethod, sourceArithmetic, sourceNode, sourcePath,
  stageLabels, statusLabels, subprogramAllocationRows, overviewComparisonRows, overviewGroupRows,
  matchingMethodLabels, normalizeMatchingMethod, variantMarkLabels, REVIEW_CATEGORIES,
  senateStatusLabels, senateProjects, filterSenateProjects, senateStats, senateComparisonIndex,
  SENATE_DIMENSIONS, RECONCILIATION_CLASSES, categoryReconciliationRows,
  senateGapRows, senateReconciliationRows, senateUnfundedRows, gapReasonLabels,
  formatSenateCoordinates, formatSenateChainage, senateChainageLengthM,
  projectGroupId, groupLabel as dimensionGroupLabel} from './niaModel.js';
import {formatLengthKm} from './chainageDisplay.js';
import {
  consolidatedByStageId, formatConsolidatedChainage, preferredMapFocus,
} from './niaConsolidatedMap.js';
import {downloadChainageExport} from './niaChainageExport.js';
import ExportModal from './ExportModal.jsx';
import './Fmr.css';
import './Nia.css';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const NiaMap = lazy(() => import('./NiaMap.jsx'));
const href = (key, params = {}) => routeHref(key, params, 'nia');
const paramsOf = route => Object.fromEntries(route.params);
function navigate(route, patch) {
  // Merge onto the *current* URL state, not the React route prop: rapid
  // successive interactions (dialog close → clear filters → select) can
  // outpace hashchange processing, and a stale route would resurrect
  // params an earlier write already cleared.
  const current = readRoute();
  const next = {...Object.fromEntries(current.params), ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = href(route.key, next);
}
function filterChange(route, patch) {navigate(route, {...patch, page: null});}
function download(name, value, json = false) {
  const url = URL.createObjectURL(new Blob([json ? JSON.stringify(value, null, 2) : value],
    {type: json ? 'application/json' : 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProjects(projects, stage, aiMonitoring = false) {
  const keys = ['source_id', 'subprogram', 'title', 'amount_php', 'extraction_flags', 'source_pdf', 'pdf_page', 'printed_page'];
  if (aiMonitoring) keys.push('ai_monitoring_basis');
  download(`nia-${stage}-${aiMonitoring ? 'ai-monitoring-' : ''}filtered.csv`, csvText(keys, projects.map(p => [p.id, p.subprogram_label, p.title,
    p.amount_php, (p.extraction_flags || []).join(';'), p.source.source_pdf, p.source.pdf_page, p.source.printed_page,
    ...(aiMonitoring ? [aiMonitoringBasis(p)] : [])])));
}
function exportComparisons(rows) {
  const keys = ['candidate_id', 'status', 'strict_status', 'subprogram', 'ambiguous_title', 'variant_mark_kind', 'counterpart_ids', 'delta_php'];
  const sideKeys = ['id', 'title', 'amount_php', 'source_pdf', 'pdf_page', 'printed_page'];
  download('nia-comparison-filtered.csv', csvText([...keys, ...['nep', 'house'].flatMap(s => sideKeys.map(k => `${s}_${k}`))],
    rows.map(r => [r.id, r.status, r.strict_status || '', r.subprogram_key, Boolean(r.ambiguous_title),
      r.variant_mark_kind || '', (r.variant_mark?.counterpart_ids || []).join(';'), r.delta_php,
      ...['nep', 'house'].flatMap(s => {const p = r[s]; return [p?.id, p?.title, p?.amount_php,
        p?.source.source_pdf, p?.source.pdf_page, p?.source.printed_page];})])));
}
function exportControls(rows) {
  const keys = ['key', 'label', 'nep_php', 'house_php', 'delta_php', 'nep_count', 'house_count'];
  const sourceKeys = ['source_pdf', 'pdf_page', 'printed_page'];
  download('nia-subprogram-controls.csv', csvText([...keys, ...['nep', 'house'].flatMap(s => sourceKeys.map(k => `${s}_${k}`))],
    rows.map(r => [...keys.map(k => r[k]), ...['nep', 'house'].flatMap(s => sourceKeys.map(k => r[`${s}_source`][k]))])));
}
function Stat({label, value, detail}) {
  return <div className="fmr-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function Hero({title, children}) {
  return <section className="hero hero-compact"><p className="fmr-eyebrow">FY2027 · NIA irrigation</p><h1>{title}</h1>
    {children}<div className="hero-actions"><ShareLink/></div></section>;
}
function ScopeNote() {
  return <details className="fmr-method"><summary>Scope and evidence limits</summary>
    <p>These are the six detailed Irrigation Program sub-programs. The House annex totals ₱17,999,305,000;
      the whole NIA agency appropriation is ₱45,172,024,000. The agency-only CARP row (₱698,067,000)
      and separately listed major projects are outside the annex ledger.</p>
    <p>The supplied House bill copy’s legislative stage is not independently authenticated. House rows use the
      native text layer; the scanned NEP annex uses embedded OCR, with retained extraction flags and rendered crops.
      Neither stage has received a rendered review of every project. Candidate pairings remain provisional.
      The schedules have no coordinate column.</p>
    <a href={siteUrl('analysis-nia/README.md')}>Read source methodology</a>
  </details>;
}
function Tabs({route, items, param = 'view', defaultKey, reset = {}, ariaLabel}) {
  const current = route.params.get(param) || defaultKey || items[0][0];
  return <nav className="view-tabs fmr-view-tabs" aria-label={ariaLabel || `${param === 'stage' ? 'Source stage' : 'View'} options`}>
    {items.map(([key, label]) => <a key={key} aria-current={current === key ? 'page' : undefined}
      href={href(route.key, {...paramsOf(route), [param]: key, page: '', node: '', pair: '', records: '', ...reset})}>{label}</a>)}
  </nav>;
}
function Filters({route, subprograms, comparison = false, controls = false, status = true, clearButton = true, className = 'fmr-filters'}) {
  const p = paramsOf(route);
  return <div className={className}>
    <label>Search<input type="search" value={p.q || ''} placeholder={controls ? 'Sub-program or program heading' : 'Project title or source ID'}
      onChange={e => filterChange(route, {q: e.target.value})}/></label>
    <label>Sub-program<select aria-label="Sub-program" value={p.subprogram || ''} onChange={e => filterChange(route, {subprogram: e.target.value})}>
      <option value="">All sub-programs</option>{subprograms.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select></label>
    {status && <label>{comparison ? 'Candidate status' : 'Review category'}<select aria-label={comparison ? 'Candidate status' : 'Review category'} value={p.status || ''}
      onChange={e => filterChange(route, {status: e.target.value})}>
      <option value="">All rows</option>{(comparison ? Object.entries(comparisonFilterLabels) : REVIEW_CATEGORIES)
        .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>}
    {clearButton && <button onClick={() => filterChange(route, {q: null, subprogram: null, status: null, minAmount: null, maxAmount: null})}>Clear filters</button>}
  </div>;
}
function Table({route, rows, columns, label, paginate = false, initialSort, responsive = false, tableId}) {
  const defaultSort = initialSort || {key: columns[0].key, direction: 'asc'};
  const requested = route.params.get('sort');
  const sort = requested === 'none' ? null : columns.some(c => c.key === requested && c.sortable !== false)
    ? {key: requested, direction: route.params.get('dir') === 'asc' ? 'asc' : 'desc'} : defaultSort;
  const rawPage = Number(route.params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const changeSort = next => navigate(route, {sort: next?.key || 'none', dir: next?.direction, page: null});
  return <>{responsive && <div className="mobile-sort">
    <label>Sort results<select aria-label="Sort results" value={sort?.key || 'none'} onChange={e => changeSort(e.target.value === 'none' ? null : {key: e.target.value, direction: sort?.direction || 'desc'})}>
      <option value="none">Source order</option>{columns.filter(c => c.sortable !== false).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
    </select></label><button disabled={!sort} onClick={() => changeSort({...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc'})}>{sort?.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
  </div>}<SortableTable tableId={tableId || (route.key === 'analysis' ? label.toLowerCase().replace(/[^a-z0-9]+/g,'-') : undefined)} rows={rows} columns={columns} ariaLabel={label} sort={sort}
    onSortChange={update => {const next = typeof update === 'function' ? update(sort) : update;
      changeSort(next);}}
    pageSize={paginate ? 50 : undefined} page={page}
    onPageChange={update => {const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 50)));
      navigate(route, {page: typeof update === 'function' ? update(current) : update});}}/></>;
}
function SourceButton({source, onPdf, label}) {
  return <button className="fmr-source-button" onClick={() => onPdf(source)}>{label || `PDF p. ${source.pdf_page}`}
    {source.printed_page != null && <small>Printed p. {source.printed_page}</small>}</button>;
}
function Controls({data, route, onPdf, rows: suppliedRows, responsive = false}) {
  const rows = suppliedRows || data.subprogram_controls.filter(s => !route.params.get('subprogram') || s.key === route.params.get('subprogram'));
  return <Table route={route} rows={rows} label="NIA sub-program stage comparison" responsive={responsive} columns={[
    {key: 'label', label: 'Sub-program', scope: 'row', render: s => <><a href={href('compare', {view: 'projects', subprogram: s.key})}>{s.label}</a><small>{s.program_group}</small></>},
    {key: 'nep_php', label: 'NEP (PHP)', align: 'num', render: s => money(s.nep_php)},
    {key: 'house_php', label: 'House (PHP)', align: 'num', render: s => money(s.house_php)},
    {key: 'delta_php', label: 'Difference (PHP)', align: 'num', render: s => signedMoney(s.delta_php)},
    {key: 'nep_count', label: 'NEP projects', align: 'num'}, {key: 'house_count', label: 'House projects', align: 'num'},
    {key: 'source', label: 'Evidence', sortable: false, render: s => <><SourceButton source={s.nep_source} onPdf={onPdf} label="NEP control"/>
      <SourceButton source={s.house_source} onPdf={onPdf} label="House control"/></>},
  ]}/>;
}
function Home({data, route, onPdf}) {
  const nepStats = allocationStats(data.stages.nep.projects), houseStats = allocationStats(data.stages.house.projects);
  return <><Hero title="NIA irrigation budget workbench"><p>Explore both irrigation schedules, compare sub-program controls,
    and follow every project allocation back to its source PDF.</p></Hero>
    <div className="fmr-stats"><Stat label="DBM NEP annex" value={money(nepStats.total)} detail={`${nepStats.count} project rows`}/>
      <Stat label="House GAB annex" value={money(houseStats.total)} detail={`${houseStats.count} project rows`}/>
      <Stat label="Annex difference" value={signedMoney(data.comparison_summary.delta_php)} detail="House minus NEP"/>
      <Stat label="Sub-programs" value={data.subprogram_controls.length} detail="Every printed control reconciles"/></div>
    <div className="fmr-result-bar"><a className="primary" href={href('compare')}>Compare stages →</a>
      <a href={href('map')}>Project map →</a>
      <a href={href('house')}>Explore House source →</a><a href={href('nep')}>Explore NEP source →</a></div>
    <ScopeNote/><section className="fmr-section"><h2>Sub-program controls</h2><Controls data={data} route={route} onPdf={onPdf}/></section>
  </>;
}
function ProjectTable({projects, route, stage, onPdf, onSelect, aiMonitoring = false, tableId}) {
  return <Table tableId={tableId} route={route} rows={projects} label="NIA projects" paginate initialSort={{key: 'amount_php', direction: 'desc'}} columns={[
    {key: 'title', label: 'Project', render: p => onSelect ? <button className="fmr-text-button" onClick={() => onSelect(p.id)}>{p.title}<small>{p.id}</small></button>
      : <a href={href(stage, {node: p.id})}>{p.title}<small className="nia-id">{p.id}</small></a>},
    {key: 'subprogram_label', label: 'Sub-program'},
    ...(aiMonitoring ? [{key: 'ai_monitoring_basis', label: 'Title basis', value: p => aiMonitoringBasis(p), render: p => aiMonitoringLabels[aiMonitoringBasis(p)]}] : []),
    {key: 'amount_php', label: 'Allocation (PHP)', align: 'num', render: p => money(p.amount_php)},
    {key: 'flags', label: 'Review', sortable: false, render: p => <>{(p.extraction_flags || []).map(f => <span className="fmr-badge" key={f}>{flagLabels[f] || f}</span>)}
      {p.repeated_title && <span className="fmr-badge">Repeated title</span>}{p.numeric_title_tokens?.length > 0 && <span className="fmr-badge">Title numbers</span>}</>},
    {key: 'source', label: 'Source', value: p => p.source.pdf_page, render: p => <SourceButton source={p.source} onPdf={onPdf}/>},
  ]}/>;
}
function PdfPane({source, onClose}) {
  return <aside className="fmr-workspace-pdf" aria-label="Inline source PDF"><Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
    <PdfPreview source={{url: siteUrl(source.source_pdf), document: source.source_pdf.split('/').pop(), page: source.pdf_page}}
      downloadOriginal autoFocusClose={false} onClose={onClose} closeLabel="Clear PDF selection"/></Suspense></aside>;
}
function Evidence({stage, id, route, onPdf}) {
  const node = sourceNode(stage, id), arithmetic = sourceArithmetic(stage, id);
  const project = stage.projects.find(p => p.id === id);
  if (!node) return <section role="alert" className="fmr-evidence">Unknown source selection.
    <button onClick={() => navigate(route, {node: null})}>Select annex root</button></section>;
  return <section className="fmr-evidence fmr-selected-evidence" aria-label="Selected source evidence">
    <nav className="fmr-breadcrumbs" aria-label="Source breadcrumbs">{sourcePath(stage, id).map((n, i) => <React.Fragment key={n.id}>
      {i > 0 && <span className="sep">/</span>}{n.id.startsWith('heading:') ? <span>{n.label}</span>
        : <a href={route.key === 'highlights' ? href(stage.key, {node: n.id}) : href(route.key, {...paramsOf(route), node: n.id})}>{n.label}</a>}
    </React.Fragment>)}</nav>
    <span className="fmr-badge">{node.is_root ? 'Derived annex total' : node.is_subprogram ? 'Printed sub-program control' : 'Project leaf'}</span>
    <h2>{node.label}</h2><p className="fmr-evidence-amount">{money(node.amount_php)}</p>
    <SourceButton source={node.source} onPdf={onPdf}/>
    {arithmetic.leaf_count != null && <><dl className="fmr-arithmetic">
      <dt>{node.is_root ? 'Sum of sub-program controls' : 'Printed control'}</dt><dd>{money(arithmetic.printed)}</dd>
      <dt>Project sum</dt><dd>{money(arithmetic.leaf_sum)}</dd><dt>Project rows</dt><dd>{arithmetic.leaf_count}</dd>
      <dt>Difference</dt><dd>{money(arithmetic.difference)}</dd></dl>
      <p className="fmr-badge balanced">{arithmetic.difference === 0 ? 'Balanced' : 'Control discrepancy'}</p></>}
    {project && <><p><code>{project.id}</code></p>
      <h3>Extraction provenance</h3><p>{stage.key === 'house' ? 'Native-layout extraction; no individual rendered-row review recorded.'
        : 'Embedded OCR extraction; flags below describe the retained extraction history.'}</p>
      {project.provenance && <dl className="fmr-arithmetic"><dt>Raw amount token</dt><dd>{project.provenance.amount_raw}</dd>
        <dt>Source y position</dt><dd>{project.provenance.y0}</dd><dt>Owned OCR words</dt><dd>{project.provenance.word_indices?.length ?? '—'}</dd></dl>}
      {(project.flag_details || []).map((f, i) => <div key={i} className="fmr-method"><strong>{flagLabels[f.flag] || f.flag}</strong><p>{f.note}</p>
        {f.evidence_crop && <a href={siteUrl(`analysis-nia/data/evidence_crops/${f.evidence_crop}`)} target="_blank" rel="noreferrer">
          <img className="fmr-review-image" loading="lazy" src={siteUrl(`analysis-nia/data/evidence_crops/${f.evidence_crop}`)} alt={`Retained evidence for ${project.title}`}/></a>}
      </div>)}
      {project.repeated_title && <p>Repeated exact title: {(project.repeated_title_ids || []).map(pid => <a key={pid} className="nia-inline-link" href={href(stage.key, {node: pid})}>{pid}</a>)}.
        These are separate printed rows; title equality does not establish duplicate funding.</p>}
      {project.numeric_title_tokens?.length > 0 && <p>Numbers in title: {project.numeric_title_tokens.join(', ')}. These remain title text and never enter the amount column.</p>}
    </>}
  </section>;
}
function SourceWorkspace({data, route, onPdf}) {
  const stage = data.stages[route.key], p = paramsOf(route), view = p.view || 'tree';
  const id = p.node || stage.root.id, node = sourceNode(stage, id);
  const [expanded, setExpanded] = useState(new Set());
  const projects = filterProjects(stage.projects, p);
  const reviewRows = view === 'review' && !p.status ? projects.filter(x => x.extraction_flags?.length || x.repeated_title || x.numeric_title_tokens?.length) : projects;
  const select = selected => navigate(route, {node: selected});
  const groups = [...new Set(stage.subprograms.map(s => s.group_heading || ''))];
  return <><Hero title={`${stage.label} irrigation schedule`}><p>{stage.description}</p></Hero><ScopeNote/>
    <Tabs route={route} items={[[ 'tree', 'Source tree'], ['projects', 'Projects'], ['review', 'Extraction review']]}/>
    <Filters route={route} subprograms={stage.subprograms}/>
    <div className="fmr-workspace-grid"><div>
      {view === 'tree' ? <section className="fmr-tree" aria-label={`${stage.label} source tree`}>
        <button className="fmr-tree-root fmr-text-button" aria-current={id === stage.root.id ? 'true' : undefined} onClick={() => select(stage.root.id)}>
          {stage.root.label}<small>{money(allocationStats(stage.projects).total)} · derived total · {stage.projects.length} rows</small></button>
        <div className="fmr-tree-controls"><button onClick={() => setExpanded(new Set(stage.subprograms.map(s => s.key)))}>Expand all sub-programs</button>
          <button onClick={() => setExpanded(new Set())}>Collapse all</button></div>
        {groups.map(group => <div key={group}>{group && <h3>{group}</h3>}{stage.subprograms.filter(s => (s.group_heading || '') === group).map(s => {
          const scoped = projects.filter(x => x.subprogram_key === s.key);
          if (p.subprogram && p.subprogram !== s.key) return null;
          return <div key={s.id}><div className="fmr-tree-row"><button aria-expanded={expanded.has(s.key)} aria-label={`Expand ${s.label}`}
            onClick={() => setExpanded(current => {const next = new Set(current); if (next.has(s.key)) next.delete(s.key); else next.add(s.key); return next;})}>{expanded.has(s.key) ? '−' : '+'}</button>
            <button className="fmr-text-button" aria-current={id === s.id ? 'true' : undefined} onClick={() => select(s.id)}>{s.label}
              <small>{scoped.length} matching / {s.project_count} printed project rows · full control {money(s.amount_php)}</small></button></div>
            {expanded.has(s.key) && <ul>{scoped.map(x => <li key={x.id} className={id === x.id ? 'selected' : ''}>
              <button className="fmr-text-button" onClick={() => select(x.id)}>{x.title}<small>{x.id} · PDF p. {x.source.pdf_page}</small></button><span>{money(x.amount_php)}</span></li>)}</ul>}
          </div>;
        })}</div>)}
        {stage.key === 'house' && <p className="fmr-muted">The House annex prints no Restoration heading over its first three sub-programs. That grouping appears in the agency table.</p>}
      </section> : ['projects', 'review'].includes(view) ? <section className="fmr-panel">
        <div className="fmr-result-bar"><span>{reviewRows.length} matching rows · {money(allocationStats(reviewRows).total)}</span>
          <button onClick={() => exportProjects(reviewRows, stage.key)}>Export filtered CSV</button><button onClick={() => download(`nia-${stage.key}-filtered.json`, reviewRows, true)}>Export filtered JSON</button></div>
        {view === 'review' && <p>Extraction flags record past adjudications and recovery rules. Repeated titles and title numbers are review dimensions; categories may overlap.</p>}
        <ProjectTable projects={reviewRows} route={route} stage={stage.key} onPdf={onPdf} onSelect={select}/>
      </section> : <p role="alert">Unknown view. <a href={href(stage.key)}>Open source tree</a>.</p>}
      <Evidence stage={stage} id={id} route={route} onPdf={onPdf}/>
    </div>{node && <PdfPane source={node.source}/>}</div>
  </>;
}
function ComparisonToolbar({rows, total, onCsv, name = 'nia-comparison-filtered', description = 'candidate observations'}) {
  return <div className="results-toolbar"><p className="result-count" aria-live="polite">{rows.length.toLocaleString()}{total != null ? ` of ${total.toLocaleString()}` : ''} {description}</p>
    <ShareLink/><button aria-label="Export filtered CSV" onClick={onCsv}>Export CSV</button>
    <button aria-label="Export filtered JSON" onClick={() => download(`${name}.json`, rows, true)}>Export JSON</button></div>;
}
function ComparisonTable({rows, route, onPdf, total, toolbar = true, initialSort, tableId}) {
  return <>{toolbar && <ComparisonToolbar rows={rows} total={total} onCsv={() => exportComparisons(rows)}/>}
    <Table tableId={tableId} route={route} rows={rows} label="NIA project candidates" paginate responsive initialSort={initialSort || {key: 'house_php', direction: 'desc'}} columns={[
      {key: 'title', label: 'Project', scope: 'row', render: r => <><button className="fmr-text-button" onClick={() => navigate(route, {pair: r.id})}>{r.title}</button>
        <small>{r.subprogram_key}</small><span className="fmr-badge">{statusLabels[r.status]}{r.ambiguous_title && ' · repeated-title ambiguity'}</span>
        {r.variant_mark_kind && r.variant_mark_kind !== 'no_counterpart' && <span className="fmr-badge">{variantMarkLabels[r.variant_mark_kind]}</span>}</>},
      ...['nep', 'house'].map(side => ({key: `${side}_php`, label: `${side === 'nep' ? 'DBM NEP' : 'House GAB'} (PHP)`, align: 'num', render: r => <>
        <strong>{money(r[`${side}_php`])}</strong>{r[side] && <><small className="nia-id">{r[side].id}</small>
          {onPdf && <SourceButton source={r[side].source} onPdf={onPdf}/>}<a className="nia-source-record" href={href(side, {node: r[side].id})}>Source record →</a></>}
      </>})),
      {key: 'delta_php', label: 'House − NEP (PHP)', align: 'num', render: r => r.delta_php == null ? <><span>—</span><small>No paired amount difference</small></>
        : <><strong className={r.delta_php > 0 ? 'up' : r.delta_php < 0 ? 'down' : ''}>{signedMoney(r.delta_php)}</strong>
          <small>{signedPct(pctChange(r.house_php, r.nep_php))}</small></>},
    ]}/></>;
}
function Compare({data, route, rows, onPdf, inlineSource, clearPdf}) {
  const p = paramsOf(route), filtered = filterComparisons(rows, p), agg = candidateAggregates(filtered), view = p.view || 'subprograms';
  const controlRows = data.subprogram_controls.filter(s => (!p.subprogram || s.key === p.subprogram) &&
    (p.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(t => `${s.label} ${s.program_group}`.toLocaleLowerCase().includes(t)));
  const [moreFilters, setMoreFilters] = useState(Boolean(p.status));
  useEffect(() => {if (p.status) setMoreFilters(true);}, [p.status]);
  const panel = p.panel === 'pdf' ? 'pdf' : 'table';
  return <div className="nia-comparison">
    <section className="hero hero-compact"><p className="eyebrow">NIA · FY2027</p><h1>Compare NIA stages</h1>
      <p>Sub-program totals, project records and source PDF evidence across DBM NEP and the supplied House GAB copy.</p></section>
    <details className="comparison-context"><summary>Source scopes, controls and downloads</summary>
      <div className="cards nia-stage-totals">{['nep', 'house'].map(side => <article key={side}><h3>{stageLabels[side]}</h3>
        <strong>{money(allocationStats(data.stages[side].projects).total)}</strong><p>{data.stages[side].projects.length} annex project rows</p>
        <a href={siteUrl(side === 'nep' ? 'analysis-nia/data/nep_nia_dataset.json' : 'analysis-nia/data/hgab_nia_projects.csv')} download>Download retained source ledger</a>
      </article>)}<article><h3>House − NEP</h3><strong className="up">{signedMoney(data.comparison_summary.delta_php)}</strong><p>Six reconciled sub-programs</p></article></div>
      <p className="notice">{data.matching_note}</p><ScopeNote/>
    </details>
    <Tabs route={route} defaultKey="subprograms" items={[['subprograms', 'Sub-program totals'], ['projects', 'Project records']]}
      ariaLabel="Comparison tables" reset={{sort: null, dir: null, status: null, pair: null}}/>
    <p className="comparison-scope">Amounts in PHP · Change = House GAB − DBM NEP. {view === 'projects'
      ? 'Pairings are provisional. Select a project title to inspect both source records.' : 'Full printed sub-program controls are independent of project-title matching.'}</p>
    {inlineSource && <div className="workspace-switch" aria-label="Workspace panels"><button aria-pressed={panel === 'table'} onClick={() => navigate(route, {panel: 'table'})}>Table</button>
      <button aria-pressed={panel === 'pdf'} onClick={() => navigate(route, {panel: 'pdf'})}>PDF source</button></div>}
    <div className={`comparison-workspace nia-comparison-workspace ${inlineSource ? 'has-source' : ''} ${panel}-active`}>
      <section className="comparison-table" aria-label="Comparison table">
        <Filters route={route} subprograms={data.stages.house.subprograms} comparison status={false} clearButton={false} controls={view === 'subprograms'} className="filters"/>
        {view === 'projects' && <><div className="nia-more-filters"><button aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>More filters</button></div>
          <div className={`filters advanced-filters ${moreFilters ? 'open' : ''}`}><label>Candidate status<select aria-label="Candidate status" value={p.status || ''} onChange={e => filterChange(route, {status: e.target.value})}>
            <option value="">All rows</option>{Object.entries(comparisonFilterLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label></div></>}
        {(p.q || p.subprogram || p.status || p.program || p.ranking) && <div className="active-filters" aria-label="Active filters">
          {[['q', 'search'], ['subprogram', 'sub-program'], ...(view === 'projects' ? [['status', 'candidate status'],['program','program group'],['ranking','candidate group']] : [])].filter(([k]) => p[k]).map(([k, name]) => {
            const value = k === 'status' ? comparisonFilterLabels[p[k]] || p[k]
              : k === 'subprogram' ? data.stages.house.subprograms.find(s => s.key === p[k])?.label || p[k] : p[k];
            return <button key={k} aria-label={`Remove ${name} filter`} onClick={() => filterChange(route, {[k]: null})}>{value} ×</button>;
          })}
          <button onClick={() => filterChange(route, {q: null, subprogram: null, status: null,program:null,ranking:null})}>Clear filters</button></div>}
        {view === 'projects' ? <><details className="nia-candidate-summary"><summary>Candidate counts and funding reconciliation</summary>
          <p>{agg.counts.paired} candidate pairs · {agg.counts.house_only} House-only · {agg.counts.nep_only} NEP-only observations.</p>
          <p>Paired difference {signedMoney(agg.paired_delta_php)} + House-only {money(agg.house_only_php)} − NEP-only {money(agg.nep_only_php)} = {signedMoney(agg.net_delta_php)}.</p>
          {data.comparison_summaries?.strict && <p>Matching-method comparison — strict titles: {data.comparison_summaries.strict.counts.paired} pairs, {data.comparison_summaries.strict.counts.house_only} House-only (₱{(data.comparison_summaries.strict.house_only_php / 1e9).toFixed(3)}B), {data.comparison_summaries.strict.counts.nep_only} NEP-only (₱{(data.comparison_summaries.strict.nep_only_php / 1e9).toFixed(3)}B). Corrected AI titles: {data.comparison_summaries.ai_corrected.counts.paired} pairs, {data.comparison_summaries.ai_corrected.counts.house_only} House-only (₱{(data.comparison_summaries.ai_corrected.house_only_php / 1e9).toFixed(3)}B), {data.comparison_summaries.ai_corrected.counts.nep_only} NEP-only (₱{(data.comparison_summaries.ai_corrected.nep_only_php / 1e9).toFixed(3)}B). Both reconcile the same ₱{(agg.net_delta_php / 1e6).toLocaleString('en-PH')}M annex difference.</p>}
        </details><ComparisonTable rows={filtered} total={rows.length} route={route} onPdf={onPdf}/>
          <p className="muted nia-count-explanation">Comparison observations are not unique projects. Unresolved counterparts can appear separately; each source allocation is retained once.</p></>
          : view === 'subprograms' ? <><ComparisonToolbar rows={controlRows} total={data.subprogram_controls.length} onCsv={() => exportControls(controlRows)} name="nia-subprogram-controls" description="sub-program controls"/>
            <Controls data={data} route={route} onPdf={onPdf} rows={controlRows} responsive/></>
          : <p role="alert">Unknown view. <a href={href('compare')}>Open sub-programs</a>.</p>}
      </section>{inlineSource && <PdfPane source={inlineSource} onClose={clearPdf}/>}
    </div>
  </div>;
}
function CoverageTables({data, rows, route, onPdf}) {
  const agg = candidateAggregates(rows);
  const changes = [
    {id: 'increased', label: 'Paired increases', count: agg.increased.count, php: agg.increased.amount, status: 'increased'},
    {id: 'decreased', label: 'Paired reductions', count: agg.decreased.count, php: -agg.decreased.amount, status: 'decreased'},
    {id: 'house_only', label: 'House-only allocations', count: agg.counts.house_only, php: agg.house_only_php, status: 'house_only'},
    {id: 'nep_only', label: 'NEP-only allocations', count: agg.counts.nep_only, php: -agg.nep_only_php, status: 'nep_only'},
    {id: 'unchanged', label: 'Unchanged candidate pairs', count: agg.unchanged, php: 0, status: 'unchanged'},
  ];
  return <><section className="fmr-section nia-highlight-coverage"><h2>Budget coverage by stage</h2>
    <p className="fmr-muted">Six detailed Irrigation Program sub-programs on both stages. The retained House schedule is extracted from the 2nd-reading copy; its annex text is identical to the 3rd-reading printing across all 46 NIA pages, so the figures cover both readings.</p>
    <Table route={route} rows={['nep', 'house'].map(key => ({id: key, stage: data.stages[key], label: stageLabels[key]}))}
      label="NIA budget coverage by stage" initialSort={{key: 'id', direction: 'desc'}} columns={[
      {key: 'label', label: 'Budget stage', scope: 'row', render: r => <a href={href(r.id)}>{r.label}</a>},
      {key: 'projects', label: 'Source rows', align: 'num', value: r => r.stage.projects.length},
      {key: 'amount', label: 'Annex allocation (PHP)', align: 'num', value: r => allocationStats(r.stage.projects).total, render: r => money(allocationStats(r.stage.projects).total)},
      {key: 'controls', label: 'Balanced controls', align: 'num', value: r => r.stage.audit_summary.internal_control_checks ?? data.subprogram_controls.length},
      {key: 'flagged', label: 'Extraction-flagged rows', align: 'num', value: r => r.stage.projects.filter(p => (p.extraction_flags || []).length).length},
    ]}/></section>
    <section className="fmr-section nia-highlight-coverage"><h2>House GAB vs. DBM NEP: candidate changes</h2>
      <p className="fmr-muted">Counts describe comparison observations. Funding effects reconcile the independent stage totals; unmatched rows remain candidate observations, not certified changes.</p>
      <Table route={route} rows={changes} label="NIA candidate funding changes" initialSort={{key: 'php', direction: 'desc'}} columns={[
        {key: 'label', label: 'Candidate population', scope: 'row', render: r => <a href={href('compare', {view: 'projects', status: r.status})}>{r.label}</a>},
        {key: 'count', label: 'Comparison rows', align: 'num'},
        {key: 'php', label: 'Funding effect (PHP)', align: 'num', render: r => <AnalysisValue value={r.php} signed/>},
      ]}/>
      <p className="fmr-funding-bridge">Net funding change: <AnalysisValue value={agg.paired_delta_php} signed/> paired + <AnalysisValue value={agg.house_only_php}/> House only − <AnalysisValue value={agg.nep_only_php}/> NEP only = <strong><AnalysisValue value={agg.net_delta_php} signed/></strong>.</p>
    </section></>;
}
function HighlightMetrics({story}) {
  return <section className="nia-highlight-metrics" aria-label="Highlight key figures">{story.metrics.map(m =>
    <Stat key={m.label} label={m.label} value={m.format === 'signed' ? signedMoney(m.value) : m.format === 'money' ? money(m.value)
      : typeof m.value === 'number' ? m.value.toLocaleString('en-PH') : m.value}/>)}</section>;
}
function HighlightGroups({story, rows, data, route}) {
  const side = story.id === 'deletions' ? 'nep' : 'house';
  const groups = candidateGroupRows(rows, story.id, 'subprogram', data.stages.house.subprograms);
  return <section><h3>Unmatched allocations by sub-program</h3>
    <Table route={route} rows={groups} label="NIA unmatched allocations by sub-program" initialSort={{key: 'amount_php', direction: 'desc'}} columns={[
      {key: 'label', label: 'Sub-program', scope: 'row'}, {key: 'count', label: 'Source rows', align: 'num'},
      {key: 'amount_php', label: `${stageLabels[side]} allocation (PHP)`, align: 'num', render: g => money(g.amount_php)},
    ]}/></section>;
}
function HighlightAiEvidence({story, data, route, onPdf}) {
  const p = paramsOf(route), side = p.evidenceStage === 'house' ? 'house' : 'nep';
  const insertions = p.evidenceStage === 'insertions';
  const projects = aiMonitoringProjects(filterProjects(story.projects[side], {...p, status: ''}), p);
  const candidates = aiMonitoringInsertions(story.rows, {...p, status: ''});
  return <section aria-label="AI monitoring source evidence">
    <h3>Allocations whose titles mention AI monitoring</h3>
    <Tabs route={route} param="evidenceStage" defaultKey="nep" ariaLabel="AI evidence populations"
      items={[[ 'nep', 'NEP AI rows'], ['house', 'House AI rows'], ['insertions', 'Unmatched House AI rows']]}
      reset={{sort: null, dir: null, pair: null}}/>
    <Filters route={route} subprograms={data.stages.house.subprograms} status={false}/>
    <label className="nia-ai-basis">Title basis<select aria-label="AI evidence title basis" value={p.aiBasis || 'all'}
      onChange={e => filterChange(route, {aiBasis: e.target.value})}><option value="all">All AI titles</option>
      {Object.entries(aiMonitoringLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <p>NEP Al/AL/AT OCR variants were checked against rendered pages and read AI; original extracted titles are retained.</p>
    <div className="fmr-result-bar"><span>{insertions ? candidates.length : projects.length} supporting {insertions ? 'House-only candidate' : stageLabels[side]} rows · {money(allocationStats(insertions ? candidates.map(r => r.house) : projects).total)} in whole-project allocations</span>
      <button onClick={() => insertions ? exportComparisons(candidates) : exportProjects(projects, side, true)}>Export filtered CSV</button></div>
    {insertions ? <div className="comparison-table nia-analysis-ledger"><ComparisonTable tableId="highlights-ai-insertions" rows={candidates} route={route} onPdf={onPdf} toolbar={false}/></div>
      : <ProjectTable tableId={`highlights-ai-${side}`} projects={projects} route={route} stage={side} onPdf={onPdf} aiMonitoring/>}
  </section>;
}
function Highlights({data, route, rows, onPdf}) {
  const cards = useMemo(() => highlightsCards(data, rows), [data, rows]);
  const story = cards.find(c => c.id === route.params.get('story'));
  const p = paramsOf(route);
  const filteredControls = story?.controls
    ? story.controls.filter(s => (!p.subprogram || s.key === p.subprogram) &&
        (p.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
          .every(t => `${s.label} ${s.program_group}`.toLocaleLowerCase().includes(t)))
    : [];
  // Control-story search targets printed headings, so its bridge and records
  // follow the selected controls rather than searching unrelated project titles.
  const controlKeys = new Set(filteredControls.map(control => control.key));
  const bridgeRows = story?.controls ? rows.filter(row => controlKeys.has(row.subprogram_key))
    : filterComparisons(story?.rows || rows, {...p, status: ''});
  const filteredRows = story?.rows ? story.controls
    ? story.rows.filter(row => controlKeys.has(row.subprogram_key)) : filterComparisons(story.rows, p) : [];
  const reset = {sort: null, dir: null, page: null, q: null, subprogram: null, status: null, pair: null,
    evidenceStage: null, evidenceProject: null, aiBasis: null, table: null};
  const close = () => navigate(route, {story: null, ...reset});
  return <><Hero title="NIA highlights"><p>Findings bounded to the retained irrigation schedules, each opening its supporting records and printed evidence.</p></Hero><ScopeNote/>
    <CoverageTables data={data} rows={rows} route={route} onPdf={onPdf}/>
    <h2>Findings to investigate</h2>
    <p className="muted">Each finding opens its supporting records and printed evidence. Counts are source rows; candidate status never certifies unsupported insertions or deletions.</p>
    <div className="fmr-highlight-grid">{cards.map((card, i) => <article key={card.id} className="fmr-highlight">
      <p className="fmr-eyebrow">{String(i + 1).padStart(2, '0')} · {card.kind}</p>
      <h3>{card.title}</h3>
      {card.value != null && <strong>{card.signed ? signedMoney(card.value) : card.money ? money(card.value) : typeof card.value === 'number' ? card.value.toLocaleString('en-PH') : card.value}</strong>}
      <p>{card.body}</p>
      <p className="fmr-story-prompt">{card.prompt}</p>
      <div className="highlight-links">
        <button type="button" className="nia-highlight-open" aria-haspopup="dialog" onClick={() => navigate(route, {...reset, story: card.id})}>{card.actionLabel} →</button>
        <a href={card.params ? href(card.href, card.params) : href(card.href)}>Open in workbench →</a>
      </div>
    </article>)}</div>
    {story && <Dialog key={story.id} label={`Highlight evidence: ${story.title}`} title={story.title} closeLabel="Close evidence" className="nia-highlight-dialog fmr-story-dialog" onClose={close}>
      <div className="fmr-dialog-body">
      <HighlightMetrics story={story}/>
      <p className="muted">Key figures cover the full finding. Filters below narrow the supporting records.</p>
      <div className="fmr-story-facts"><h3>What to examine</h3><dl>
        <div><dt>Evidence basis</dt><dd>{story.takeaway}</dd></div>
        <div><dt>Investigation question</dt><dd>{story.prompt}</dd></div>
      </dl></div>
      <p className="nia-evidence-limit">{story.limit}</p>
      <div className="fmr-story-actions">
        <a className="secondary" href={story.params ? href(story.href, story.params) : href(story.href)}>Continue in the workbench</a>
        <ShareLink/>
        {['nep', 'house'].map(side => <a key={side} href={siteUrl(data.stages[side].metadata.source_pdf)} download>Download {stageLabels[side]} PDF</a>)}
      </div>
      {story.controls && <section><h3>Printed sub-program movements</h3>
        <Filters route={route} subprograms={story.controls} status={false} controls/>
        <div className="fmr-result-bar"><span>{filteredControls.length} supporting printed controls</span><button onClick={() => exportControls(filteredControls)}>Export controls CSV</button></div>
        <Controls data={data} route={route} onPdf={onPdf} rows={filteredControls}/></section>}
      {['annex-increase', 'subprogram-shift', 'pairing-coverage'].includes(story.id) && <FundingAnalysis data={data} route={route}
        rows={bridgeRows}/>}
      {story.id === 'ai-monitoring' && <HighlightAiEvidence story={story} data={data} route={route} onPdf={onPdf}/>}
      {story.rows && story.id !== 'ai-monitoring' && <section><h3>Supporting comparison records</h3>
        {!story.controls && <Filters route={route} subprograms={data.stages.house.subprograms} comparison status={false}/>}
        {['insertions', 'deletions'].includes(story.id) && <HighlightGroups story={story} rows={filteredRows} data={data} route={route}/>}
        <div className="fmr-result-bar"><span>{filteredRows.length.toLocaleString()} supporting comparison rows · {signedMoney(candidateAggregates(filteredRows).net_delta_php)} in the funding bridge</span>
          <button onClick={() => exportComparisons(filteredRows)}>Export filtered CSV</button></div>
        <div className="comparison-table nia-analysis-ledger"><ComparisonTable tableId="highlights-records" rows={filteredRows} route={route} onPdf={onPdf} toolbar={false}
          initialSort={story.id === 'deletions' ? {key: 'nep_php', direction: 'desc'} : story.id === 'changed-pairs' ? {key: 'delta_php', direction: 'asc'} : undefined}/></div>
        <p className="muted">Pairings are provisional; unmatched rows remain candidate observations, not certified unsupported insertions or deletions.</p></section>}
      {story.agency && <div className="fmr-source-audits"><section className="fmr-panel"><h3>House agency-table reconciliation</h3>
        <p className="nia-scope-equation">Annex {money(allocationStats(data.stages.house.projects).total)} + agency-only CARP {money(story.agency.find(c => c.agency_only)?.total_php)} = Operations {money(story.agency.find(c => c.label === 'Sub-total, Operations')?.total_php)}.</p>
        <p>Agency controls provide scope context. Development and Operations include the agency-only CARP row. Context-only rows have no annex difference.</p>
        <Table route={route} rows={story.agency.map((c, i) => ({...c, id: i}))} label="NIA agency controls" columns={[
          {key: 'label', label: 'Agency row'},
          {key: 'total_php', label: 'Agency total (PHP)', align: 'num', render: c => money(c.total_php)},
          {key: 'annex_total_php', label: 'Reconciliation basis (PHP)', align: 'num', render: c => money(c.annex_total_php)},
          {key: 'difference_php', label: 'Difference (PHP)', align: 'num', render: c => money(c.difference_php)},
          {key: 'scope_note', label: 'Scope note'},
          {key: 'source', label: 'Evidence', sortable: false, render: c => <SourceButton source={c.source} onPdf={onPdf}/>},
        ]}/></section></div>}
      {story.review && <><section className="fmr-panel"><h3>Rendered evidence for flagged NEP rows</h3>
        <label>Select flagged NEP row<select aria-label="Flagged NEP evidence" value={p.evidenceProject || story.review.flagged[0]?.id || ''}
          onChange={e => navigate(route, {evidenceProject: e.target.value})}>
          {story.review.flagged.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select></label>
        {story.review.flagged.some(project => project.id === (p.evidenceProject || story.review.flagged[0]?.id))
          ? <Evidence stage={data.stages.nep} id={p.evidenceProject || story.review.flagged[0]?.id} route={route} onPdf={onPdf}/>
          : <p role="alert">Select a retained flagged row to inspect its evidence.</p>}
      </section><div className="fmr-pair-evidence">
        {[['NEP extraction-flagged rows', story.review.flagged, 'nep'],
          ['NEP repeated exact titles', story.review.repeatedNep, 'nep'],
          ['House repeated exact titles', story.review.repeatedHouse, 'house']].map(([label, projects, stage]) =>
          <section key={label} className="fmr-panel"><h3>{label}</h3>
            <p>{projects.length} rows · {money(allocationStats(projects).total)}</p>
            <ProjectTable tableId={`highlights-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} projects={projects} route={route} stage={stage} onPdf={onPdf}
              onSelect={label === 'NEP extraction-flagged rows' ? id => navigate(route, {evidenceProject: id}) : undefined}/></section>)}
      </div></>}
      </div>
    </Dialog>}
    {route.params.get('story') && !story && <p role="alert">Finding not found. <button onClick={close}>Clear story selection</button></p>}
  </>;
}
function CandidateAnalysis({data, route, rows, onPdf, view}) {
  const p = paramsOf(route), filtered = analysisCandidateRows(rows, {...p, view});
  const dim = ['overall', 'subprogram', 'program', 'category', 'region'].includes(p.dim) ? p.dim : 'subprogram';
  const groups = candidateGroupRows(filtered, view, dim, data.stages.house.subprograms);
  const adjustment = view === 'adjustments', side = view === 'deletions' ? 'nep' : 'house';
  const resolutionCardLabel = 'Validated / unresolved rows';
  const title = {insertions: 'Unsupported insertion candidates', deletions: 'Deletion candidates', adjustments: 'Paired amount adjustments'}[view];
  const total = filtered.reduce((s, r) => s + (adjustment ? r.delta_php : r[`${side}_php`]), 0);
  const agg = candidateAggregates(filtered);
  const group = p.group && groups.find(g => g.id === p.group);
  const groupedRows = group ? filtered.filter(r => (dim === 'program' ? (r.house || r.nep).program_group : r.subprogram_key) === group.id) : [];
  const initialSort = adjustment ? {key: 'delta_php', direction: p.direction === 'increased' ? 'desc' : 'asc'}
    : {key: `${side}_php`, direction: 'desc'};
  // DPWH-style validated/unresolved split over the filtered candidates.
  const validated = filtered.filter(r => candidateResolution(r) === 'no_counterpart');
  const unresolved = filtered.filter(r => candidateResolution(r) === 'unresolved');
  const validatedTotal = validated.reduce((s, r) => s + r[`${side}_php`], 0);
  const unresolvedTotal = unresolved.reduce((s, r) => s + r[`${side}_php`], 0);
  return <section className="analysis-section nia-candidate-analysis"><h2>{title}</h2>
    <div className="analysis-controls">{adjustment ? <label>Direction<select aria-label="Revision direction" value={p.direction || 'all'}
      onChange={e => filterChange(route, {direction: e.target.value, sort: null, dir: null, group: null})}>
      <option value="all">All amount changes</option><option value="increased">Increased · House above NEP</option><option value="decreased">Reduced · House below NEP</option>
    </select></label> : <label>Candidate group<select aria-label={`Analysis ${view === 'insertions' ? 'unsupported insertion' : 'deletion'} group`} value={p.ranking || 'all'}
      onChange={e => filterChange(route, {ranking: e.target.value, group: null})}>
      <option value="all">All {side === 'house' ? 'House' : 'NEP'}-only candidates</option>
      <option value="validated">Validated · no counterpart found</option><option value="unresolved">Plausible counterpart · unresolved</option>
      <option value="unambiguous">Without repeated-title ambiguity</option><option value="ambiguous">Repeated-title ambiguity</option>
    </select></label>}</div>
    <div className="dimension-chips" role="group" aria-label="Break down by">{[['overall', 'Overall'], ['subprogram', 'Sub-program'], ['category', 'Category'], ['region', 'Region'], ['program', 'Program']].map(([key, label]) =>
      <button key={key} className={dim === key ? 'active' : ''} aria-pressed={dim === key} onClick={() => navigate(route, {dim: key, group: null, page: null})}>{label}</button>)}</div>
    <Filters route={route} subprograms={data.stages.house.subprograms} status={false}/>
    <div className="cards analysis-headlines"><article><h3>{adjustment ? 'Changed candidate pairs' : 'Candidate source rows'}</h3><strong>{filtered.length.toLocaleString()}</strong>
      <p>{adjustment ? 'Both source records attached' : `${stageLabels[side]} · unmatched by unique canonical title`}</p></article>
      <article><h3>{adjustment ? 'Net paired difference' : `${stageLabels[side]} allocation`}</h3><strong className={adjustment ? total > 0 ? 'up' : total < 0 ? 'down' : '' : ''}>{adjustment ? signedMoney(total) : money(total)}</strong>
        <p>{adjustment ? 'House minus NEP · paired amounts only' : 'Exact source allocation · each row retained once'}</p></article>
      <article><h3>{adjustment ? 'Increased / reduced pairs' : resolutionCardLabel}</h3><strong>{adjustment ? `${agg.increased.count} / ${agg.decreased.count}` : `${validated.length} / ${unresolved.length}`}</strong>
        <p>{adjustment ? `Gross increases ${money(agg.increased.amount)} · gross reductions ${money(agg.decreased.amount)}` : `Validated ${money(validatedTotal)} · unresolved ${money(unresolvedTotal)}`}</p></article></div>
    <p className="notice">{adjustment ? 'These are amount differences between provisional House and NEP pairs. NIA has one retained House schedule; this view does not establish changes between House readings.'
      : `${side === 'house' ? 'House rows without a unique NEP counterpart are unsupported insertion candidates' : 'NEP rows without a unique House counterpart are deletion candidates'}. Of these, ${unresolved.length} rows (${money(unresolvedTotal)}) carry a deterministic near-miss mark — a spelling, location or repeated-title variant of a plausible counterpart — and stay unresolved pending review; ${validated.length} rows (${money(validatedTotal)}) have no counterpart at all. Candidate status does not certify ${side === 'house' ? 'an unsupported insertion' : 'a deletion'}.`}</p>
    {dim !== 'overall' && <div className="aggregate-table"><h3>Totals by {dim === 'program' ? 'program' : 'sub-program'}</h3>
      <Table tableId={`${view}-by-${dim}`} route={route} rows={groups} label="NIA candidate group totals" initialSort={{key: 'amount_php', direction: 'desc'}} columns={[
        {key: 'label', label: 'Group', scope: 'row', render: g => <button className="group-open" onClick={() => navigate(route, {group: g.id, page: null})}>{g.label}</button>},
        {key: 'count', label: adjustment ? 'Changed pairs' : 'Source rows', align: 'num'},
        ...(adjustment ? [
          {key:'increased_php',label:'Increased (PHP)',align:'num',render:g => <AnalysisValue value={g.increased_php} signed/>},
          {key:'decreased_php',label:'Decreased (PHP)',align:'num',render:g => <AnalysisValue value={g.decreased_php} signed/>},
        ] : []),
        {key: 'amount_php', label: adjustment ? 'Net paired difference (PHP)' : 'Source allocation (PHP)', align: 'num', value: g => Math.abs(g.amount_php), render: g => <AnalysisValue value={g.amount_php} signed={adjustment}/>},
        {key: 'records', label: 'Supporting records', sortable: false, render: g => <button className="group-open" onClick={() => navigate(route, {group: g.id, page: null})}>Show {g.count} rows</button>},
      ]}/></div>}
    <h3>{adjustment ? 'Changed pairs' : 'Ranked candidate records'}</h3>
    <div className="comparison-table nia-analysis-ledger"><ComparisonTable tableId={`${view}-records`} rows={filtered} route={route} onPdf={onPdf} initialSort={initialSort}/></div>
    <p><a href={href('compare', {view: 'projects', q: p.q || '', subprogram: p.subprogram || '', status: adjustment ? 'changed' : `${side}_only`})}>Continue in Compare stages →</a></p>
    {p.group && <Dialog label="NIA analysis group records" onClose={() => navigate(route, {group: null})}>
      {group ? <><h3>{group.label}</h3><div className="fmr-chips" aria-label="Record scope"><span className="fmr-chip">Dimension: {dim}</span><span className="fmr-chip">Population: {view}</span><span className="fmr-chip">Ranking: {p.ranking || p.direction || 'all'}</span>{['q','subprogram'].filter(k => p[k]).map(k => <span className="fmr-chip" key={k}>{k}: {p[k]}</span>)}</div><p>{group.count} {adjustment ? 'changed pairs' : 'source rows'} · {adjustment ? signedMoney(group.amount_php) : money(group.amount_php)}</p>
        <div className="comparison-table nia-analysis-ledger"><ComparisonTable tableId={`${view}-group-records`} rows={groupedRows} route={route} onPdf={onPdf} initialSort={initialSort}/></div><p><a href={href('compare', {view:'projects',q:p.q,subprogram:dim === 'subprogram' ? group.id : p.subprogram,program:dim === 'program' ? group.id : null,status:adjustment ? p.direction === 'increased' ? 'increased' : p.direction === 'decreased' ? 'decreased' : 'changed' : `${side}_only`,ranking:p.ranking})}>Continue in Compare stages →</a></p></>
        : <p role="alert">Unknown analysis group or no records in the current filter scope.</p>}
    </Dialog>}
  </section>;
}
function FundingAnalysis({data, rows, route}) {
  const summary = fundingSummary(rows), groups = fundingGroups(rows, data.subprogram_controls);
  const coverage = Object.entries(summary.sources).map(([id, source]) => ({id, label: stageLabels[id], ...source}));
  const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  return <><section className="fmr-section"><h2>Funding reconciliation</h2>
    <p>For the filtered observations: paired difference {signedMoney(summary.paired_delta_php)} + House-only {money(summary.house_only_php)} − NEP-only {money(summary.nep_only_php)} = {signedMoney(summary.net_delta_php)}.</p>
    <p>Source-only amounts remain unmatched allocations; they are not confirmed additions or removals.</p>
    <Table route={route} rows={groups} label="NIA funding reconciliation" initialSort={{key: 'delta_php', direction: 'desc'}} columns={[
      {key: 'label', label: 'Sub-program', scope: 'row'},
      {key: 'nep_php', label: 'NEP (PHP)', align: 'num', render: g => money(g.nep_php)},
      {key: 'house_php', label: 'House (PHP)', align: 'num', render: g => money(g.house_php)},
      {key: 'paired_delta_php', label: 'Paired difference (PHP)', align: 'num', render: g => signedMoney(g.paired_delta_php)},
      {key: 'house_only_php', label: 'House-only (PHP)', align: 'num', render: g => money(g.house_only_php)},
      {key: 'nep_only_php', label: 'NEP-only (PHP)', align: 'num', render: g => money(g.nep_only_php)},
      {key: 'delta_php', label: 'Net difference (PHP)', align: 'num', render: g => signedMoney(g.delta_php)},
    ]}/></section>
    <section className="fmr-section"><h2>Pairing coverage</h2>
      <p>Coverage uses the filtered source rows and their allocations. A provisional title pair does not certify project identity.</p>
      <Table route={route} rows={coverage} label="NIA pairing coverage" columns={[
        {key: 'label', label: 'Source', scope: 'row'},
        {key: 'count', label: 'Source rows', align: 'num'},
        {key: 'paired_count', label: 'Paired rows', align: 'num'},
        {key: 'row_share', label: 'Row coverage', align: 'num', render: r => percent(r.row_share)},
        {key: 'total', label: 'Allocation (PHP)', align: 'num', render: r => money(r.total)},
        {key: 'paired_amount_php', label: 'Paired allocation (PHP)', align: 'num', render: r => money(r.paired_amount_php)},
        {key: 'allocation_share', label: 'Allocation coverage', align: 'num', render: r => percent(r.allocation_share)},
      ]}/></section></>;
}
function ConcentrationAnalysis({projects, stage, route, onPdf, dim = 'subprogram'}) {
  const labels = useMemo(
    () => new Map(stage.subprograms.map(s => [s.key, s.label])),
    [stage.subprograms]);
  const groups = useMemo(
    () => dimensionGroups(projects, dim, labels),
    [projects, dim, labels]);
  const overall = concentration(projects);
  const rows = concentrationRows(projects, groups, dim);
  const selected = route.params.get('records');
  const group = selected === 'top10' ? overall : rows.find(g => `top10:${g.id}` === selected);
  const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const dimLabel = dim === 'program' ? 'program' : dim === 'category' ? 'hierarchy category'
    : dim === 'region' ? 'region' : dim === 'overall' ? 'all records' : 'sub-program';
  return <section className="fmr-section"><h2>Largest-project concentration</h2>
    <p>The largest {overall.top.length} filtered source rows account for {money(overall.top_amount_php)} ({percent(overall.top_share)} of the filtered allocation).
      {' '}<button className="group-open" onClick={() => navigate(route, {records: 'top10'})}>Inspect largest rows</button></p>
    <p>Each {dimLabel} below uses its own largest ten rows, or all rows when fewer than ten remain. Concentration describes allocation, not implementation or service area.</p>
    <Table route={route} rows={rows} label="NIA allocation concentration" initialSort={{key: 'top_share', direction: 'desc'}} columns={[
      {key: 'label', label: dim === 'category' ? 'Category' : dim === 'region' ? 'Region' : dim === 'program' ? 'Program' : 'Sub-program', scope: 'row'},
      {key: 'count', label: 'Source rows', align: 'num'},
      {key: 'total', label: 'Allocation (PHP)', align: 'num', render: g => money(g.total)},
      {key: 'top_amount_php', label: 'Largest ten allocation (PHP)', align: 'num', render: g => money(g.top_amount_php)},
      {key: 'top_share', label: 'Allocation share', align: 'num', render: g => percent(g.top_share)},
      {key: 'records', label: 'Supporting records', sortable: false, render: g => <button className="group-open" onClick={() => navigate(route, {records: `top10:${g.id}`})}>Show {g.top.length} rows</button>},
    ]}/>
    {selected?.startsWith('top10') && <Dialog label="NIA concentration records" onClose={() => navigate(route, {records: null})}>
      {group ? <><h3>{group.label || 'Largest filtered source allocations'}</h3>
        <p>{money(group.top_amount_php)} · {percent(group.top_share)} of {money(group.total)}</p>
        <button onClick={() => exportProjects(group.top, stage.key)}>Export largest rows CSV</button>
        <ProjectTable tableId="statistics-group-records" projects={group.top} stage={stage.key} route={route} onPdf={onPdf}/></>
        : <p role="alert">No concentration records in the current filter scope.</p>}
    </Dialog>}
  </section>;
}

function ChainageCostAnalysis({projects, route, dim = 'category', stageKey = 'nep', data, onPdf}) {
  const labels = useMemo(() => {
    const map = new Map();
    for (const p of projects) if (p.subprogram_key) map.set(p.subprogram_key, p.subprogram_label || p.subprogram_key);
    return map;
  }, [projects]);
  const overall = phpPerMStats(projects);
  const rows = phpPerMRowsByDim(projects, dim, labels);
  const stripDomain = useMemo(() => phpPerMStripDomain(rows), [rows]);
  const outliers = useMemo(
    () => phpPerMOutlierProjects(projects, dim, labels),
    [projects, dim, labels]);
  const outlierHigh = outliers.filter(o => o.side === 'high').length;
  const outlierLow = outliers.filter(o => o.side === 'low').length;
  const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const dimLabel = dim === 'program' ? 'program' : dim === 'category' ? 'hierarchy category'
    : dim === 'region' ? 'region' : dim === 'overall' ? 'all records' : 'sub-program';
  const groupLabel = dim === 'category' ? 'Category' : dim === 'region' ? 'Region'
    : dim === 'program' ? 'Program' : dim === 'overall' ? 'Group' : 'Sub-program';
  const openOutlier = outlier => navigate(route, {
    scatter: outlier.group_id, scatterProject: outlier.id,
    records: null, map: null, mapProject: null, page: null,
  });
  const selected = route.params.get('records');
  const exploreId = selected?.startsWith('chainage:') ? selected.slice('chainage:'.length) : null;
  const exploreGroup = exploreId ? rows.find(r => r.id === exploreId) : null;
  const scatterId = route.params.get('scatter');
  const scatterGroup = scatterId ? rows.find(r => r.id === scatterId) : null;
  const scatterProjectId = route.params.get('scatterProject');
  const mapOpen = route.params.get('map') === '1';

  const [consolidated, setConsolidated] = useState(null);
  const [consError, setConsError] = useState('');
  useEffect(() => {
    if (!exploreId && !mapOpen && !scatterId) return undefined;
    if (consolidated) return undefined;
    const controller = new AbortController();
    fetch(siteUrl('analysis-nia/data/nia_consolidated.json'), {signal: controller.signal})
      .then(r => {if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json();})
      .then(payload => {setConsolidated(payload); setConsError('');})
      .catch(err => {if (err.name !== 'AbortError') setConsError(err.message || 'Failed to load locations');});
    return () => controller.abort();
  }, [exploreId, mapOpen, scatterId, consolidated]);

  const consByStage = useMemo(
    () => consolidatedByStageId(consolidated?.projects, stageKey),
    [consolidated, stageKey]);

  const groupProjects = useMemo(() => {
    const id = exploreId || scatterId;
    if (!id) return [];
    return projects
      .filter(p => projectGroupId(p, dim) === id)
      .map(p => {
        const cons = consByStage.get(p.id);
        const focus = cons ? preferredMapFocus(cons) : null;
        const submission = p.submission_label
          || cons?.submission_label
          || null;
        return {
          ...p,
          submission_label: submission,
          ledger_title: p.title,
          display_title: preferredChainageTitle({...p, submission_label: submission}),
          senate_id: p.senate_id || cons?.id || null,
          chainage_spans: cons ? formatConsolidatedChainage(cons) : '',
          location_basis: focus?.label || null,
          has_location: Boolean(focus),
        };
      })
      .sort((a, b) => (b.php_per_m ?? -1) - (a.php_per_m ?? -1)
        || b.amount_php - a.amount_php
        || a.id.localeCompare(b.id));
  }, [projects, exploreId, scatterId, dim, consByStage]);

  const exploreRows = exploreId ? groupProjects : [];
  const scatterProjects = useMemo(() => {
    if (!scatterId) return [];
    return groupProjects.filter(p => Number.isFinite(p.php_per_m) && p.php_per_m > 0);
  }, [scatterId, groupProjects]);
  const scatterPoints = useMemo(() => {
    if (!scatterGroup) return [];
    return phpPerMScatterPoints(scatterProjects, scatterGroup, stripDomain);
  }, [scatterProjects, scatterGroup, stripDomain]);
  const scatterDetail = scatterProjectId
    ? (scatterProjects.find(p => p.id === scatterProjectId)
      || projects.find(p => p.id === scatterProjectId))
    : null;

  const [exportKind, setExportKind] = useState(null); // 'summary' | 'projects' | null
  const openExplore = id => navigate(route, {
    records: `chainage:${id}`, scatter: null, scatterProject: null, map: null, mapProject: null, page: null,
  });
  const closeExplore = () => {setExportKind(null); navigate(route, {records: null, map: null, mapProject: null});};
  const openScatter = id => navigate(route, {
    scatter: id, scatterProject: null, records: null, map: null, mapProject: null, page: null,
  });
  const closeScatter = () => navigate(route, {scatter: null, scatterProject: null});
  const openScatterProject = project => navigate(route, {scatterProject: project.id});
  const closeScatterProject = () => navigate(route, {scatterProject: null});
  const openMap = senateId => navigate(route, {map: '1', mapProject: senateId});
  const closeMap = () => navigate(route, {map: null, mapProject: null});
  const mapProjectId = route.params.get('mapProject');
  const mapProjectLabel = useMemo(() => {
    if (!mapProjectId || !consolidated) return mapProjectId;
    return consolidated.projects?.find(p => p.id === mapProjectId)?.label || mapProjectId;
  }, [mapProjectId, consolidated]);

  const exportRows = exportKind === 'projects' ? exploreRows
    : exportKind === 'outliers' ? outliers
    : rows;
  const exportMeta = {
    kind: exportKind === 'projects' ? 'projects'
      : exportKind === 'outliers' ? 'outliers'
      : 'summary',
    stage: stageKey,
    dim,
    group: exportKind === 'projects' ? (exploreGroup?.label || exploreId) : null,
    note: exportKind === 'outliers'
      ? 'Tukey outliers vs each group’s whiskers. Fence score = IQR units past P25/P75 (mild <3, moderate <5, severe <10, extreme ≥10). × median = rate÷median (high) or median÷rate (low). Screening proxy, not a unit cost.'
      : 'Title-chainage ₱/m is printed allocation ÷ title station length — a screening proxy, not a unit cost.',
  };

  return <section className="fmr-section"><h2>Title-chainage allocation per meter</h2>
    <p>{overall.count.toLocaleString('en-PH')} of {projects.length.toLocaleString('en-PH')} filtered
      rows print a usable title station length. Rates are printed allocation ÷ that length
      ({dimLabel} rollup) — a screening proxy, not a construction unit cost. Point-only stations
      and titles without chainage are excluded from the rate columns.</p>
    <div className="fmr-stats">
      <Stat label="Rows with chainage" value={overall.count.toLocaleString('en-PH')}
        detail={`${percent(projects.length ? overall.count / projects.length : null)} of filtered`}/>
      <Stat label="Median ₱/m" value={overall.median == null ? '—' : money(Math.round(overall.median))}/>
      <Stat label="P25 – P75" value={overall.p25 == null ? '—'
        : `${money(Math.round(overall.p25))} – ${money(Math.round(overall.p75))}`}/>
      <Stat label="Tukey outliers" value={outliers.length.toLocaleString('en-PH')}
        detail={`${outlierHigh} high · ${outlierLow} low · vs ${dimLabel} whiskers`}/>
    </div>
    <div className="fmr-result-bar nia-chainage-toolbar">
      <span>{rows.length.toLocaleString('en-PH')} {dimLabel} groups</span>
      <button type="button" disabled={!rows.length} onClick={() => setExportKind('summary')}>Export…</button>
    </div>
    <div className="nia-ppm-legend">
      <span className="nia-ppm-legend-item" aria-hidden="true"><i className="nia-ppm-swatch is-inlier"/>Inlier</span>
      <span className="nia-ppm-legend-item" aria-hidden="true"><i className="nia-ppm-swatch is-outlier"/>Outlier</span>
      <span className="nia-ppm-legend-item" aria-hidden="true"><i className="nia-ppm-swatch is-median"/>Median</span>
      <span className="nia-ppm-legend-item" aria-hidden="true"><i className="nia-ppm-swatch is-box"/>P25–P75</span>
      <span className="nia-ppm-legend-axis"><PhpPerMStripAxis domain={stripDomain}/></span>
    </div>
    <p className="fmr-muted nia-ppm-note">Each row’s ₱/m strip uses one shared log scale (tick labels ₱1k → ₱10m). Box = interquartile range; whiskers = Tukey fences;
      brown points sit outside the whiskers. Click a strip for a larger interactive scatter — hover a dot for an overview, click a dot for full project detail.</p>
    <Table route={route} rows={rows} label="NIA chainage cost per meter" initialSort={{key: 'with_chainage', direction: 'desc'}} columns={[
      {key: 'label', label: groupLabel, scope: 'row'},
      {key: 'projects', label: 'Source rows', align: 'num'},
      {key: 'with_chainage', label: 'With chainage', align: 'num'},
      {key: 'chainage_share', label: 'Chainage share', align: 'num', render: r => percent(r.chainage_share)},
      {key: 'median', label: '₱/m distribution', sortable: true,
        value: r => r.median, render: r => <PhpPerMStrip row={r} domain={stripDomain}
          onOpen={r.with_chainage ? () => openScatter(r.id) : undefined}/>},
      {key: 'explore', label: 'Projects', sortable: false, render: r =>
        <button type="button" className="group-open" onClick={() => openExplore(r.id)}>Explore projects</button>},
    ]}/>
    <h3 className="nia-ppm-outliers-heading">Tukey outliers by {dimLabel}</h3>
    <p className="fmr-muted nia-ppm-note">Projects whose ₱/m sits outside their own {dimLabel} whiskers (1.5 × IQR) — the same brown dots on the strips.
      Titles prefer the Senate workbook column-V fixed / submission wording when present.
      <strong>Fence score</strong> = IQR units past P25/P75 (triage: mild &lt;3, moderate &lt;5, severe &lt;10, extreme ≥10).
      <strong>× median</strong> = how many times the group median. Sorted by fence score. Open scatter focuses the group and selects the project.</p>
    <div className="fmr-result-bar nia-chainage-toolbar">
      <span>{outliers.length.toLocaleString('en-PH')} outlier{outliers.length === 1 ? '' : 's'}
        {outliers.length ? ` · ${outlierHigh} high · ${outlierLow} low` : ''}
        {outliers.length ? ` · ${outliers.filter(o => o.severity === 'extreme').length} extreme` : ''}</span>
      <button type="button" disabled={!outliers.length} onClick={() => setExportKind('outliers')}>Export…</button>
    </div>
    <Table tableId="chainage-outliers" route={route} rows={outliers} label="NIA chainage Tukey outliers"
      paginate empty="No Tukey outliers in the current filter scope."
      initialSort={{key: 'fence_score', direction: 'desc'}} columns={[
        {key: 'title', label: 'Title (fixed)', scope: 'row',
          title: 'Senate workbook column-V fixed / submission title when present; else annex print title',
          render: r => <button type="button" className="group-open" onClick={() => openOutlier(r)}>{r.title}</button>},
        {key: 'group_label', label: groupLabel},
        {key: 'severity', label: 'Severity',
          render: r => <span className={`nia-ppm-outlier-sev is-${r.severity}`}>{r.severity}</span>},
        {key: 'side', label: 'Side', render: r =>
          <span className={`nia-ppm-outlier-side is-${r.side}`}>{r.side === 'high' ? 'High' : 'Low'}</span>},
        {key: 'fence_score', label: 'Fence score', align: 'num', title: 'IQR units past P25 (low) or P75 (high)',
          render: r => r.fence_score == null ? '—' : `${r.fence_score.toFixed(1)}×IQR`},
        {key: 'median_ratio', label: '× median', align: 'num', title: 'Rate ÷ group median (high) or median ÷ rate (low)',
          render: r => r.median_ratio == null ? '—' : `${r.median_ratio.toFixed(1)}×`},
        {key: 'php_per_m', label: '₱/m', align: 'num', render: r => money(Math.round(r.php_per_m))},
        {key: 'whisker_high', label: 'Group whiskers', align: 'num', sortable: false,
          render: r => `${money(Math.round(r.whisker_low))} – ${money(Math.round(r.whisker_high))}`},
        {key: 'amount_php', label: 'Allocation (PHP)', align: 'num', render: r => money(r.amount_php)},
        {key: 'open', label: 'Scatter', sortable: false, render: r =>
          <button type="button" className="group-open" onClick={() => openOutlier(r)}>Open scatter</button>},
      ]}/>
    {scatterId && <Dialog label="NIA chainage ₱/m scatter" className="nia-ppm-scatter-dialog"
      title={scatterGroup?.label || '₱/m distribution'} onClose={closeScatter}>
      {!scatterGroup ? <p role="alert">Unknown group selection.</p> : <>
        <p>{scatterPoints.length.toLocaleString('en-PH')} projects with title chainage in this {dimLabel}.
          Shared log scale with the table strips. Hover a dot for an overview card; click a dot for full project detail.</p>
        <div className="fmr-stats nia-ppm-scatter-stats">
          <Stat label="Median ₱/m" value={scatterGroup.median == null ? '—' : money(Math.round(scatterGroup.median))}/>
          <Stat label="P25 – P75" value={scatterGroup.p25 == null ? '—'
            : `${money(Math.round(scatterGroup.p25))} – ${money(Math.round(scatterGroup.p75))}`}/>
          <Stat label="Whiskers" value={scatterGroup.whisker_low == null ? '—'
            : `${money(Math.round(scatterGroup.whisker_low))} – ${money(Math.round(scatterGroup.whisker_high))}`}/>
          <Stat label="Max ₱/m" value={scatterGroup.max == null ? '—' : money(Math.round(scatterGroup.max))}/>
        </div>
        <div className="nia-ppm-legend" aria-hidden="true">
          <span className="nia-ppm-legend-item"><i className="nia-ppm-swatch is-inlier"/>Inlier</span>
          <span className="nia-ppm-legend-item"><i className="nia-ppm-swatch is-outlier"/>Outlier</span>
          <span className="nia-ppm-legend-item"><i className="nia-ppm-swatch is-median"/>Median</span>
          <span className="nia-ppm-legend-item"><i className="nia-ppm-swatch is-box"/>P25–P75</span>
        </div>
        <PhpPerMScatterPlot row={scatterGroup} domain={stripDomain} points={scatterPoints}
          selectedId={scatterProjectId} onSelect={openScatterProject}/>
        <div className="nia-ppm-scatter-actions">
          <button type="button" className="group-open" onClick={() => openExplore(scatterId)}>Open project list</button>
        </div>
      </>}
    </Dialog>}
    {scatterDetail && <Dialog label="NIA chainage project detail" className="nia-ppm-project-dialog"
      title="Project detail" onClose={closeScatterProject}>
      <p className="nia-ppm-project-title">{scatterDetail.display_title || preferredChainageTitle(scatterDetail)}</p>
      <dl className="nia-ppm-project-dl">
        <div><dt>Source id</dt><dd><code>{scatterDetail.id}</code></dd></div>
        {scatterDetail.submission_label
          && scatterDetail.ledger_title
          && scatterDetail.submission_label !== scatterDetail.ledger_title
          ? <div><dt>Annex print title</dt><dd>{scatterDetail.ledger_title}</dd></div>
          : null}
        <div><dt>₱ per meter</dt><dd>{scatterDetail.php_per_m == null ? '—'
          : money(Math.round(scatterDetail.php_per_m))}</dd></div>
        <div><dt>Allocation</dt><dd>{money(scatterDetail.amount_php)}</dd></div>
        <div><dt>Title chainage length</dt><dd>{scatterDetail.chainage_length_m == null ? '—'
          : `${scatterDetail.chainage_length_m.toLocaleString('en-PH')} m`
            + (formatLengthKm(scatterDetail.chainage_length_m)
              ? ` (${formatLengthKm(scatterDetail.chainage_length_m)})` : '')}</dd></div>
        <div><dt>Chainages</dt><dd>{scatterDetail.chainage_spans || '—'}</dd></div>
        <div><dt>Sub-program</dt><dd>{scatterDetail.subprogram_label || scatterDetail.subprogram_key || '—'}</dd></div>
        <div><dt>Category</dt><dd>{scatterDetail.category || '—'}</dd></div>
        <div><dt>Region</dt><dd>{scatterDetail.region || '—'}</dd></div>
      </dl>
      <div className="nia-ppm-project-actions">
        {scatterDetail.source && onPdf
          ? <SourceButton source={scatterDetail.source} onPdf={onPdf}/> : null}
        <a className="nia-source-record" href={href(stageKey, {node: scatterDetail.id})}>Open source record →</a>
        {scatterDetail.has_location && scatterDetail.senate_id
          ? <button type="button" className="group-open" onClick={() => openMap(scatterDetail.senate_id)}>View in map</button>
          : null}
      </div>
      <p className="fmr-muted">₱/m is printed allocation ÷ title station length — a screening proxy, not a construction unit cost.</p>
    </Dialog>}
    {exploreId && <Dialog label="NIA chainage category projects" className="nia-chainage-explore-dialog"
      title={exploreGroup?.label || 'Category projects'} onClose={closeExplore}>
      <p>{exploreRows.length.toLocaleString('en-PH')} source rows in this {dimLabel}
        {exploreGroup ? ` · ${exploreGroup.with_chainage.toLocaleString('en-PH')} with title chainage` : ''}.
        View in map opens a location peek on this statistics page (title GPS when present, otherwise PSGC centroid).</p>
      {consError && <p role="alert">Location join unavailable: {consError}</p>}
      <div className="fmr-result-bar nia-chainage-toolbar">
        <span>{exploreRows.length.toLocaleString('en-PH')} projects</span>
        <button type="button" disabled={!exploreRows.length} onClick={() => setExportKind('projects')}>Export…</button>
      </div>
      <Table tableId="chainage-explore-projects" route={route} rows={exploreRows} label="NIA chainage explore projects"
        paginate initialSort={{key: 'php_per_m', direction: 'desc'}} columns={[
          {key: 'display_title', label: 'Title (fixed)', scope: 'row',
            title: 'Senate workbook column-V fixed / submission title when present',
            value: r => r.display_title || preferredChainageTitle(r),
            render: r => r.display_title || preferredChainageTitle(r)},
          {key: 'chainage_spans', label: 'Chainages', render: r => r.chainage_spans || '—'},
          {key: 'chainage_length_m', label: 'Length', align: 'num',
            render: r => r.chainage_length_m == null ? '—'
              : `${r.chainage_length_m.toLocaleString('en-PH')} m${formatLengthKm(r.chainage_length_m) ? ` (${formatLengthKm(r.chainage_length_m)})` : ''}`},
          {key: 'php_per_m', label: '₱/m', align: 'num',
            render: r => r.php_per_m == null ? '—' : money(Math.round(r.php_per_m))},
          {key: 'amount_php', label: 'Allocation (PHP)', align: 'num', render: r => money(r.amount_php)},
          {key: 'map', label: 'Map', sortable: false, render: r => r.has_location && r.senate_id
            ? <button type="button" className="group-open" onClick={() => openMap(r.senate_id)}
              title={r.location_basis || 'View in map'}>View in map</button>
            : <span className="muted">—</span>},
        ]}/>
    </Dialog>}
    {exportKind && exportRows.length > 0 && <ExportModal
      rows={exportRows}
      meta={exportMeta}
      dialogLabel={exportKind === 'projects' ? 'Export these projects'
        : exportKind === 'outliers' ? 'Export Tukey outliers'
        : 'Export chainage rates'}
      intro={<p className="fmr-muted">Downloads all <strong>{exportRows.length.toLocaleString('en-PH')}</strong>
        {exportKind === 'projects'
          ? <> source rows in <strong>{exploreGroup?.label || 'this group'}</strong></>
          : exportKind === 'outliers'
            ? <> Tukey outliers vs each {dimLabel} group’s own whiskers</>
            : <> {dimLabel} rate groups</>}.
        Amounts are Philippine pesos; ₱/m is printed allocation ÷ title chainage length.</p>}
      scopeOptions={exportKind === 'projects' ? [
        ['simple', 'Simple', 'Title, chainages, length, ₱/m, allocation, and map basis.'],
        ['full', 'Full', 'Everything Simple has plus source id, Senate id, hierarchy, location flag, and PDF page citations.'],
      ] : exportKind === 'outliers' ? [
        ['simple', 'Simple', 'Title, group, side, severity, fence score, × median, ₱/m, whiskers, length, allocation.'],
        ['full', 'Full', 'Everything Simple has plus source id, P25/P75/IQR, hierarchy fields, and PDF page citations.'],
      ] : [
        ['simple', 'Simple', 'Group label, source-row counts, chainage share, and median / P25 / P75 / max ₱/m.'],
        ['full', 'Full', 'Everything Simple has plus mean, min, and stable group id.'],
      ]}
      onDownload={downloadChainageExport}
      onClose={() => setExportKind(null)}/>}
    {mapOpen && <Dialog label="NIA project location" className="nia-chainage-map-dialog"
      title={mapProjectLabel || 'Project location'} onClose={closeMap}>
      <p className="fmr-muted">Same map markers as the NIA map tab, limited to this workbook line.
        Title GPS is preferred; otherwise the PSGC centroid. Close to return to the project list.</p>
      <Suspense fallback={<p role="status">Loading map…</p>}>
        <NiaMap data={consolidated ? {...data, consolidated} : data} route={route} embedded="preview"/>
      </Suspense>
      <p className="nia-map-preview-link"><a href={href('map', {project: mapProjectId || undefined})}>Open full map tab →</a></p>
    </Dialog>}
  </section>;
}
function AiMonitoringAnalysis({data, stage, rows, route, onPdf}) {
  const p = paramsOf(route), projects = aiMonitoringProjects(filterProjects(stage.projects, p), p);
  const method = normalizeMatchingMethod(p.match);
  const stats = allocationStats(projects), annexTotal = allocationStats(stage.projects).total;
  const variants = projects.filter(project => aiMonitoringBasis(project) === 'ocr_variant');
  const insertions = aiMonitoringInsertions(rows, {...p, method}), insertionStats = allocationStats(insertions.map(r => r.house));
  const recon = aiMonitoringReconciliation(rows, {method});
  const houseStats = allocationStats(aiMonitoringProjects(filterProjects(data.stages.house.projects, p), p));
  const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '—';
  const markPool = data.ai_monitoring_summaries?.[method]?.unmatched_marks;
  const aiSplit = data.ai_monitoring_summaries?.[method]?.candidate_split;
  const markRows = markPool ? Object.entries(markPool).filter(([, v]) => v.house_only.count || v.nep_only.count)
    .map(([kind, v]) => ({id: kind, label: variantMarkLabels[kind],
      house_count: v.house_only.count, house_php: v.house_only.amount_php,
      nep_count: v.nep_only.count, nep_php: v.nep_only.amount_php})) : [];
  const sourceRows = Object.values(data.stages).map(s => {
    const scoped = aiMonitoringProjects(filterProjects(s.projects, p), p), totals = allocationStats(scoped);
    return {id: s.key, label: s.label, count: totals.count, total_php: totals.total,
      annex_share: share(totals.total, allocationStats(s.projects).total)};
  });
  return <><section className="analysis-section"><h2>AI monitoring systems related allocations</h2>
    <p>Projects whose titles mention AI monitoring or AI satellite-assisted monitoring. Amounts cover the whole irrigation project; the schedules do not itemize the monitoring component.</p>
    <Filters route={route} subprograms={stage.subprograms} clearButton={false}/>
    <div className="analysis-controls"><label>Title basis<select aria-label="AI monitoring title basis" value={p.aiBasis || 'all'}
      onChange={e => filterChange(route, {aiBasis: e.target.value})}>
      <option value="all">All AI monitoring related rows</option>{Object.entries(aiMonitoringLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label><button onClick={() => filterChange(route, {q: null, subprogram: null, status: null, aiBasis: null, minAmount: null, maxAmount: null})}>Clear filters</button></div>
    <div className="fmr-stats"><Stat label="Related project allocation" value={money(stats.total)} detail={`${stats.count} filtered source rows`}/>
      <Stat label="Share of source annex" value={annexTotal ? `${(stats.total / annexTotal * 100).toFixed(1)}%` : '—'} detail="Full annex allocation denominator"/>
      <Stat label="Explicit AI wording" value={projects.length - variants.length} detail="Includes satellite-assisted monitoring"/>
      <Stat label="NEP OCR variants" value={variants.length} detail={money(allocationStats(variants).total)}/></div>
    <details className="fmr-method"><summary>Title inclusion and source evidence</summary>
      <p>Include explicit AI monitoring wording, including satellite-assisted titles. The 59 retained NEP titles with “Al”, “AL” or “AT” before “Monitoring” read “AI” in the rendered annex. They are included and labeled separately; original titles and candidate pairings remain intact.</p>
      <p>Remote monitoring, intermediate monitoring, gauges, sensors and CCTV without AI wording are outside this view. Source links below open the original records and PDF pages.</p>
    </details>
  </section>
  <section className="fmr-section" aria-label="AI monitoring unsupported insertion summary"><h2>House AI monitoring unsupported insertion candidates</h2>
    <div className="analysis-controls"><label>Matching method<select aria-label="AI monitoring matching method" value={method}
      onChange={e => filterChange(route, {match: e.target.value === 'ai_corrected' ? null : e.target.value, records: null})}>
      {method === 'strict' && <option value="strict">{matchingMethodLabels.strict}</option>}
      {method === 'strict' && <option value="ai_corrected">{matchingMethodLabels.ai_corrected}</option>}
      {method === 'ai_corrected' && <option value="ai_corrected">{matchingMethodLabels.ai_corrected}</option>}
      {method === 'ai_corrected' && <option value="strict">{matchingMethodLabels.strict}</option>}
    </select></label></div>
    <p className="nia-method-note">{method === 'ai_corrected'
      ? 'Corrected AI titles: matching keys normalize the verified NEP OCR readings (Al/AL/AT → AI) and treat Monitoring and Monitoring System as the same wording. Stored titles are never rewritten.'
      : 'Strict titles: raw source titles only. OCR readings and wording differences keep rows unmatched, so candidate counts are much larger here.'}
      {' '}House-only AI monitoring rows under the current filters and the selected method, regardless of the selected budget source.</p>
    <div className="fmr-stats"><Stat label="Unsupported insertion candidates" value={insertionStats.count} detail="Unmatched House project rows"/>
      <Stat label="Validated candidates" value={aiSplit ? aiSplit.house_only.no_counterpart.count : insertionStats.count} detail={aiSplit ? `${money(aiSplit.house_only.no_counterpart.amount_php)} · no counterpart found` : 'No counterpart found'}/>
      <Stat label="Unresolved candidates" value={aiSplit ? aiSplit.house_only.unresolved.count : 0} detail={aiSplit ? `${money(aiSplit.house_only.unresolved.amount_php)} · plausible counterpart, held out` : ''}/>
      <Stat label="Share of House AI allocation" value={percent(insertionStats.total, houseStats.total)} detail={`Of ${money(houseStats.total)}`}/></div>
    <p>{insertions.filter(r => r.ambiguous_title).length} candidates have repeated-title ambiguity.{aiSplit ? ` Only ${aiSplit.house_only.no_counterpart.count} of ${insertionStats.count} candidates (${money(aiSplit.house_only.no_counterpart.amount_php)}) have no NEP counterpart at all — the rest carry deterministic near-miss marks and stay unresolved pending review.` : ''}</p>
    <p className="muted">Reading note (full AI population, before filters): candidate allocations are a matching residual, not the source difference. Paired AI titles print identical amounts, so the whole NEP → House movement of {signedMoney(recon.net_delta_php)} (₱{(recon.nep_php / 1e9).toFixed(3)}B → ₱{(recon.house_php / 1e9).toFixed(3)}B) comes from unmatched rows — ₱{(recon.candidate_php / 1e9).toFixed(2)}B House-only against ₱{(recon.nep_only_php / 1e9).toFixed(2)}B NEP-only under {matchingMethodLabels[method]}.{method === 'strict' && recon.twin_count ? ` ${recon.twin_count} of ${recon.candidate_count} candidates (${money(recon.twin_php)}) have an unpaired same-sub-program, same-amount NEP row, which marks a reworded or OCR-variant title rather than a certified new work; the corrected method converts those twins into pairs.` : ''}</p>
    {markRows.length > 0 && <><h3>Unmatched rows by review mark ({matchingMethodLabels[method]})</h3>
      <p className="muted">Deterministic near-miss marks over the selected method's unmatched AI rows. Variant marks require equal amounts and a unique one-to-one counterpart; they are review pointers, never certified pairs.</p>
      <Table route={route} rows={markRows} label="NIA AI unmatched review marks" columns={[
        {key: 'label', label: 'Review mark', scope: 'row'},
        {key: 'house_count', label: 'House-only rows', align: 'num'},
        {key: 'house_php', label: 'House allocation (PHP)', align: 'num', render: r => money(r.house_php)},
        {key: 'nep_count', label: 'NEP-only rows', align: 'num'},
        {key: 'nep_php', label: 'NEP allocation (PHP)', align: 'num', render: r => money(r.nep_php)},
      ]}/></>}
    <button className="group-open" onClick={() => navigate(route, {records: 'ai_insertions', page: null})}>Inspect unsupported insertion candidates</button>
    {p.records === 'ai_insertions' && <Dialog label="NIA AI monitoring unsupported insertion candidates" onClose={() => navigate(route, {records: null})}>
      <p>{insertionStats.count} House-only candidates · {money(insertionStats.total)} in whole project allocations · {matchingMethodLabels[method]}.</p>
      <div className="comparison-table nia-analysis-ledger"><ComparisonTable rows={insertions} route={route} onPdf={onPdf} initialSort={{key: 'house_php', direction: 'desc'}}/></div>
    </Dialog>}
  </section>
  <section className="fmr-section"><h2>AI monitoring related allocations by source</h2>
    <p>Both schedules use the current filters. These are totals of related project allocations in each source.</p>
    <Table route={route} rows={sourceRows} label="NIA AI monitoring source totals" columns={[
      {key: 'label', label: 'Source', scope: 'row'}, {key: 'count', label: 'Projects', align: 'num'},
      {key: 'total_php', label: 'Project allocation (PHP)', align: 'num', render: r => money(r.total_php)},
      {key: 'annex_share', label: 'Share of source annex', align: 'num', render: r => r.annex_share == null ? '—' : `${(r.annex_share * 100).toFixed(1)}%`},
    ]}/></section>
  <section className="fmr-section"><h2>Supporting AI monitoring project records</h2>
    <div className="fmr-result-bar"><span>{stats.count} matching rows · {money(stats.total)}</span>
      <button onClick={() => exportProjects(projects, stage.key, true)}>Export filtered CSV</button></div>
    <ProjectTable projects={projects} route={route} stage={stage.key} onPdf={onPdf} aiMonitoring/>
  </section></>;
}
function OverviewComparison({data, route, rows, onPdf, stage, projects}) {
  const p=paramsOf(route), dim=['overall','subprogram','program','category','region'].includes(p.dim) ? p.dim : 'subprogram';
  const groups=overviewComparisonRows(rows,p,data.stages.house.subprograms,dim);
  const comparisonGroup=p.group?.startsWith('overview:') ? groups.find(g => g.id === p.group.slice(9)) : null;
  const sourceKey=p.records?.startsWith('overview-source:') ? p.records.slice(16) : null;
  const sourceGroup=sourceKey && stage.subprograms.find(s => s.key === sourceKey);
  const sourceRows=sourceGroup ? projects.filter(r => r.subprogram_key === sourceKey) : [];
  const close=() => navigate(route,{group:null,records:null,table:null});
  return <><section className="fmr-section"><h2>NEP → House by {dim === 'program' ? 'program group' : dim === 'overall' ? 'all records' : dim === 'category' ? 'hierarchy category' : dim === 'region' ? 'region' : 'sub-program'}</h2>
    <div className="dimension-chips" role="group" aria-label="Break down by">{[['overall','Overall'],['subprogram','Sub-program'],['category','Category'],['region','Region'],['program','Program']].map(([id,label]) => <button key={id} className={dim===id?'active':''} aria-pressed={dim===id} onClick={() => navigate(route,{dim:id,group:null,records:null,page:null,sort:null,dir:null,table:null})}>{label}</button>)}</div>
    <p className="fmr-notice">{(dim === 'category' || dim === 'region') && 'Category and region levels come from NIA\u2019s Senate hearing workbook, which joins one-to-one to every ledger row; both annex PDFs lack this level. '}This distribution uses project records from the comparison ledger, with the same source filters on both stages. Each side counts under its own printed group. Proposed title matches do not certify identity; allocation patterns do not establish implementation or misconduct.</p>
    <Table tableId={`overview-comparison-${dim}`} route={route} rows={groups} label="NIA stage allocation distribution" initialSort={{key:'delta_php',direction:'desc'}} columns={[
      {key:'label',label:'Group',scope:'row',render:g => <button className="group-open" onClick={() => navigate(route,{group:`overview:${g.id}`,records:null,page:null,table:null})}>{g.label}</button>},
      {key:'nep_count',label:'NEP records',band:'records',bandLabel:'Records',align:'num'},
      {key:'house_count',label:'House records',band:'records',align:'num'},
      {key:'delta_records',label:'Δ records',band:'records',align:'num',render:g => <AnalysisValue value={g.delta_records} signed/>},
      {key:'pct_records',label:'% records',band:'records',align:'num',render:g => <AnalysisValue value={g.pct_records} percent/>},
      {key:'nep_php',label:'NEP allocation (PHP)',band:'allocations',bandLabel:'Allocations',divider:true,align:'num',render:g => <AnalysisValue value={g.nep_php}/>},
      {key:'house_php',label:'House allocation (PHP)',band:'allocations',align:'num',render:g => <AnalysisValue value={g.house_php}/>},
      {key:'delta_php',label:'Δ allocation (PHP)',band:'allocations',align:'num',render:g => <AnalysisValue value={g.delta_php} signed/>},
      {key:'pct_alloc',label:'% allocation',band:'allocations',align:'num',render:g => <AnalysisValue value={g.pct_alloc} percent/>},
    ]}/></section>
    {(p.group?.startsWith('overview:') || sourceKey) && <Dialog label="NIA overview records" onClose={close}>
      <div className="fmr-chips" aria-label="Record scope"><span className="fmr-chip">Dimension: {sourceKey ? 'sub-program' : dim}</span><span className="fmr-chip">Population: {sourceKey ? stageLabels[stage.key] : 'NEP ↔ House source records'}</span>{['q','subprogram','status','minAmount','maxAmount'].filter(k => p[k]).map(k => <span className="fmr-chip" key={k}>{k}: {p[k]}</span>)}</div>
      {sourceGroup ? <><h3>{sourceGroup.label}</h3><p>{sourceRows.length.toLocaleString('en-PH')} printed project records · {money(allocationStats(sourceRows).total)}</p><button onClick={() => exportProjects(sourceRows,stage.key)}>Export group CSV</button><ProjectTable tableId="overview-group-records" projects={sourceRows} stage={stage.key} route={route} onPdf={onPdf}/></>
        : comparisonGroup ? <><h3>{comparisonGroup.label}</h3><p>Only source records counted in this group's filtered distribution appear. Counterparts outside this group are omitted.</p><ComparisonTable tableId="overview-group-records" rows={overviewGroupRows(rows,p,dim,comparisonGroup.id)} route={route} onPdf={onPdf}/></>
        : <p role="alert">Unknown overview group or no records in the current filter scope. Close and choose a group from the table.</p>}
      {(sourceGroup || comparisonGroup) && <p><a href={href('compare',{view:'projects',q:p.q,subprogram:sourceKey || (dim === 'subprogram' ? comparisonGroup.id : p.subprogram),program:dim === 'program' ? comparisonGroup?.id : null})}>Continue in Compare stages →</a></p>}
    </Dialog>}
  </>;
}
function Analysis({data, route, rows, onPdf}) {
  const p = paramsOf(route), stageKey = p.stage === 'house' ? 'house' : 'nep', stage = data.stages[stageKey];
  const projects = filterProjects(stage.projects, p), stats = allocationStats(projects), view = p.view || 'overview';
  // Stats + chainage default to hierarchy category; overview keeps sub-program.
  const statsDim = ['subprogram', 'category', 'region', 'program', 'overall'].includes(p.dim)
    ? p.dim : (view === 'stats' || view === 'chainage' ? 'category' : 'subprogram');
  const subprogramLabels = useMemo(
    () => new Map(stage.subprograms.map(s => [s.key, s.label])),
    [stage.subprograms]);
  const dimAllocation = allocationRowsByDim(projects, statsDim, subprogramLabels);
  const dimMax = Math.max(1, ...dimAllocation.map(s => s.total));
  const subprograms = subprogramAllocationRows(projects, stage.subprograms);
  const max = Math.max(1, ...subprograms.map(s => s.total));
  const views = [['overview', 'Overview'], ['insertions', 'Unsupported insertions'], ['deletions', 'Deletions'], ['adjustments', 'Adjustments'],
    ['stats', 'Statistics'], ['chainage', 'Chainage'], ['ai_monitoring', 'AI monitoring'], ['senate', 'Senate workbook'],
    ['candidates', 'Candidates'], ['controls', 'Agency controls']];
  return <div className="headline-analysis nia-analysis"><section className="hero"><p className="eyebrow">NIA · FY2027</p><h1>NIA allocation analysis</h1>
    <p>Recorded allocations, candidate unsupported insertions and deletions, and paired amount adjustments.</p>
    <div className="hero-actions">    {['overview', 'stats', 'chainage', 'ai_monitoring'].includes(view) ? <label className="hero-source">Budget source<select aria-label="Analysis budget source" value={stageKey}
      onChange={e => navigate(route, {stage: e.target.value, page: null})}>{Object.entries(stageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      : <span className="nia-analysis-basis">{view === 'insertions' ? 'House GAB · unmatched source rows' : view === 'deletions' ? 'DBM NEP · unmatched source rows' : view === 'senate' ? 'NIA Senate workbook · October 10' : view === 'controls' ? 'House agency table' : 'House GAB ↔ DBM NEP'}</span>}<ShareLink/></div></section>
    <Tabs route={route} defaultKey="overview" items={views} ariaLabel="Analysis views"
      reset={{status: null, direction: null, ranking: null, aiBasis: null, senateView: null, gapReason: null, sort: null, dir: null, group: null, pair: null, dim: null, table: null, pdf: null, pdfPage: null, match: null, records: null, map: null, mapProject: null, scatter: null, scatterProject: null, project: null, full: null}}/>
    <h2 className="fmr-question">{{overview:'How are recorded NIA allocations distributed across sub-programs?',
      insertions:'Which House project records have no unique NEP counterpart?',
      deletions:'Which NEP project records have no unique House counterpart?',
      adjustments:'Which provisional pairs have different House and NEP allocations?',
      stats:'Which descriptive allocation patterns appear in this source?',
      chainage:'How do title-chainage ₱/m rates compare across hierarchy categories?',
      ai_monitoring:'Which project records explicitly fund AI monitoring?',
      senate:'How does NIA’s own Senate workbook reconcile the NEP with the House GAB?',
      candidates:'How does provisional pairing explain the annex funding difference?',
      controls:'How does the House annex reconcile with agency controls?'}[view] || 'Source records'}</h2>
    {view === 'chainage' ? <><Filters route={route} subprograms={stage.subprograms}/>
      <div className="fmr-stats"><Stat label="Filtered allocation" value={money(stats.total)} detail={`${stats.count} source rows`}/>
        <Stat label="Median" value={money(stats.median)}/><Stat label="Mean" value={money(stats.mean == null ? null : Math.round(stats.mean))} detail="Nearest peso"/>
        <Stat label="Largest" value={money(stats.max)}/></div>
      <p className="fmr-notice">Title-chainage ₱/m rates use Senate workbook station lengths stamped onto each source row.
        Rates are printed allocation ÷ that length — a screening proxy, not a construction unit cost.</p>
      <div className="dimension-chips" role="group" aria-label="Break down by">
        {SENATE_DIMENSIONS.map(([key, label]) =>
          <button key={key} className={statsDim === key ? 'active' : ''} aria-pressed={statsDim === key}
            onClick={() => navigate(route, {dim: key === 'category' ? null : key, records: null, map: null, mapProject: null, scatter: null, scatterProject: null, page: null, table: null})}>{label}</button>)}
      </div>
      <ChainageCostAnalysis projects={projects} route={route} dim={statsDim} stageKey={stageKey} data={data} onPdf={onPdf}/>
    </> : ['overview', 'stats'].includes(view) ? <><Filters route={route} subprograms={stage.subprograms}/>
      <div className="fmr-stats"><Stat label="Filtered allocation" value={money(stats.total)} detail={`${stats.count} source rows`}/>
        <Stat label="Median" value={money(stats.median)}/><Stat label="Mean" value={money(stats.mean == null ? null : Math.round(stats.mean))} detail="Nearest peso"/>
        <Stat label="Largest" value={money(stats.max)}/></div>
      {view === 'overview' ? <><OverviewComparison data={data} route={route} rows={rows} onPdf={onPdf} stage={stage} projects={projects}/><section className="fmr-section"><h2>Allocation by sub-program</h2>
        <div className="fmr-distribution">{subprograms.map(s => <button className="nia-distribution-row" key={s.key} onClick={() => navigate(route,{records:`overview-source:${s.key}`,group:null,page:null,table:null})}>
          <span>{s.label}</span><span className="fmr-bar-track"><span style={{width: `${s.total / max * 100}%`}}/></span>
          <strong>{money(s.total)}</strong><small>{s.count} source rows</small></button>)}</div>
        <Table tableId="overview-distribution" route={route} rows={subprograms} label="NIA allocation overview" columns={[
          {key: 'label', label: 'Sub-program',scope:'row',render:s => <button className="group-open" onClick={() => navigate(route,{records:`overview-source:${s.key}`,group:null,page:null,table:null})}>{s.label}</button>}, {key: 'count', label: 'Projects', align: 'num'},
          {key: 'total', label: 'Allocation (PHP)', align: 'num', render: s => money(s.total)},
          {key: 'share', label: 'Allocation share', align: 'num', value: s => share(s.total, stats.total), render: s => `${(share(s.total, stats.total) * 100).toFixed(1)}%`},
          {key: 'median', label: 'Median (PHP)', align: 'num', render: s => money(s.median)},
        ]}/></section></> : <>
        <p className="fmr-notice">Allocation patterns describe the recorded budget. Repeated amounts and rounding do not establish pricing, implementation, or misconduct.</p>
        <div className="dimension-chips" role="group" aria-label="Break down by">
          {SENATE_DIMENSIONS.map(([key, label]) =>
            <button key={key} className={statsDim === key ? 'active' : ''} aria-pressed={statsDim === key}
              onClick={() => navigate(route, {dim: key === 'category' ? null : key, records: null, page: null, table: null})}>{label}</button>)}
        </div>
        <section className="fmr-section"><h2>Allocation by {statsDim === 'category' ? 'hierarchy category' : statsDim === 'region' ? 'region' : statsDim === 'program' ? 'program' : statsDim === 'overall' ? 'all records' : 'sub-program'}</h2>
          {statsDim !== 'overall' && <div className="fmr-distribution">{dimAllocation.map(s =>
            <div className="nia-distribution-row" key={s.id}>
              <span>{s.label}</span><span className="fmr-bar-track"><span style={{width: `${s.total / dimMax * 100}%`}}/></span>
              <strong>{money(s.total)}</strong><small>{s.count} source rows</small>
            </div>)}</div>}
          <Table route={route} rows={dimAllocation} label="NIA allocation by dimension" columns={[
            {key: 'label', label: statsDim === 'category' ? 'Category' : statsDim === 'region' ? 'Region' : statsDim === 'program' ? 'Program' : 'Group', scope: 'row'},
            {key: 'count', label: 'Projects', align: 'num'},
            {key: 'total', label: 'Allocation (PHP)', align: 'num', render: s => money(s.total)},
            {key: 'share', label: 'Allocation share', align: 'num', value: s => share(s.total, stats.total), render: s => `${(share(s.total, stats.total) * 100).toFixed(1)}%`},
            {key: 'median', label: 'Median (PHP)', align: 'num', render: s => money(s.median)},
          ]}/>
        </section>
        <section className="fmr-section"><h2>Allocation bands</h2><Table route={route} rows={bandRows(projects)} label="NIA allocation bands" columns={[
          {key: 'label', label: 'Band'}, {key: 'projects', label: 'Projects', align: 'num'},
          {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => money(r.total_php)},
        ]}/></section>
        <section className="fmr-section"><h2>Rounding pattern</h2><Table route={route} rows={roundingLadder(projects)} label="NIA rounding ladder" columns={[
          {key: 'label', label: 'Coarsest matching multiple'}, {key: 'projects', label: 'Projects', align: 'num'},
          {key: 'total_php', label: 'Allocation (PHP)', align: 'num', render: r => money(r.total_php)},
          {key: 'share', label: 'Project share', align: 'num', render: r => `${(r.share * 100).toFixed(1)}%`},
        ]}/></section>
        <section className="fmr-section"><h2>Repeated exact allocations</h2><p>Amounts printed on at least five matching projects.</p>
          <Table route={route} rows={repeatedAmounts(projects)} label="NIA repeated amounts" columns={[
            {key: 'amount_php', label: 'Amount (PHP)', align: 'num', render: r => money(r.amount_php)},
            {key: 'projects', label: 'Projects', align: 'num'}, {key: 'total_php', label: 'Combined allocation (PHP)', align: 'num', render: r => money(r.total_php)},
          ]}/></section>
        <ConcentrationAnalysis projects={projects} stage={stage} route={route} onPdf={onPdf} dim={statsDim}/></>}
      {view === 'overview' && <section className="analysis-section"><h2>Explore further</h2><div className="analysis-crosslinks">
        <a href={href('analysis', {view: 'insertions', subprogram: p.subprogram || ''})}>Unsupported insertion candidates · unmatched House records →</a>
        <a href={href('analysis', {view: 'deletions', subprogram: p.subprogram || ''})}>Deletion candidates · unmatched NEP records →</a>
        <a href={href('analysis', {view: 'adjustments', subprogram: p.subprogram || ''})}>Paired allocation adjustments →</a>
        <a href={href('analysis', {view: 'chainage', subprogram: p.subprogram || ''})}>Title-chainage ₱/m rates →</a>
      </div></section>}
      <section className="fmr-section"><h2>Supporting source records</h2><button onClick={() => exportProjects(projects, stageKey)}>Export filtered CSV</button>
        <ProjectTable projects={projects} route={route} stage={stageKey} onPdf={onPdf}/></section>
    </> : view === 'ai_monitoring' ? <AiMonitoringAnalysis data={data} stage={stage} rows={rows} route={route} onPdf={onPdf}/>
      : view === 'senate' ? <SenateAnalysis data={data} route={route} rows={rows}/>
      : ['insertions', 'deletions', 'adjustments'].includes(view) ? <CandidateAnalysis data={data} route={route} rows={rows} onPdf={onPdf} view={view}/>
      : view === 'candidates' ? <><Filters route={route} subprograms={stage.subprograms} comparison/>
      <p>{data.matching_note}</p><FundingAnalysis data={data} rows={filterComparisons(rows, p)} route={route}/>
      <div className="comparison-table nia-analysis-ledger"><ComparisonTable rows={filterComparisons(rows, p)} total={rows.length} route={route} onPdf={onPdf}/></div></>
      : view === 'controls' ? <section className="fmr-section"><h2>House agency-table reconciliation</h2>
        <p>Agency controls provide scope context. Development and Operations include the agency-only CARP row. Context-only rows have no annex difference.</p>
        <Table route={route} rows={data.agency_controls.map((c, i) => ({...c, id: i}))} label="NIA agency controls" columns={[
          {key: 'label', label: 'Agency row'}, {key: 'total_php', label: 'Agency total (PHP)', align: 'num', render: c => money(c.total_php)},
          {key: 'annex_total_php', label: 'Reconciliation basis (PHP)', align: 'num', render: c => money(c.annex_total_php)},
          {key: 'difference_php', label: 'Difference (PHP)', align: 'num', render: c => money(c.difference_php)},
          {key: 'scope_note', label: 'Scope note'}, {key: 'source', label: 'Evidence', sortable: false, render: c => <SourceButton source={c.source} onPdf={onPdf}/>},
        ]}/></section> : <p role="alert">Unknown view. <a href={href('analysis')}>Open overview</a>.</p>}
    <ScopeNote/>
  </div>;
}
function SenateAnalysis({data, route, rows}) {
  const p = paramsOf(route);
  const projects = senateProjects(data);
  const filtered = filterSenateProjects(projects, p);
  const stats = senateStats(filtered);
  const view = p.senateView || 'all';  const full = senateStats(projects);
  const comparisonIndex = useMemo(() => senateComparisonIndex(data), [data]);
  const ledger = data.stages.nep.projects.reduce((m, x) => (m.set(x.id, x), m), new Map());
  const houseLedger = data.stages.house.projects.reduce((m, x) => (m.set(x.id, x), m), new Map());
  // Where does the official workbook corroborate our candidate matching?
  const insertionIds = new Set(projects.filter(x => x.status === 'house_insertion').map(x => x.house_join?.id).filter(Boolean));
  const ourHouseOnly = data.comparison.filter(r => r.status === 'house_only').map(r => r.house_id);
  const corroborated = ourHouseOnly.filter(id => insertionIds.has(id));
  // Row-count reconciliation pieces: split both-funded rows and unfunded rows.
  const gapRows = useMemo(() => senateGapRows(data), [data]);
  const terms = (p.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const gapFiltered = gapRows.filter(g => (!p.gapReason || g.reason === p.gapReason)
    && (!p.subprogram || g.subprogram_key === p.subprogram)
    && terms.every(t => `${g.label} ${g.category || ''} ${g.region || ''} ${g.province || ''} ${g.nep_title || ''} ${g.house_title || ''} ${g.submission_label || ''} ${g.submission_edited || ''} ${g.justification || ''}`.toLocaleLowerCase().includes(t)));
  const comparisonCounts = data.comparison_summary?.counts || {};
  const unfundedRows = useMemo(() => senateUnfundedRows(data), [data]);
  const gapEdited = gapRows.filter(g => g.submission_edited).length;
  const gapJustified = gapRows.filter(g => g.justification).length;
  const gapFixed = gapRows.filter(g => g.submission_label).length;
  const exportGapCsv = () => download('nia-senate-gap-rows.csv', csvText(
    ['id', 'row', 'subprogram', 'category', 'region', 'province', 'label', 'reason',
     'nep_id', 'nep_title', 'nep_amount', 'house_id', 'house_title', 'house_amount',
     'delta_php', 'variant_mark', 'submission_label', 'submission_edited', 'justification'],
    gapFiltered.map(g => [g.id, g.row, g.subprogram_key, g.category || '', g.region || '',
      g.province || '', g.label, g.reason, g.nep_id, g.nep_title || '', g.nep_php ?? '',
      g.house_id, g.house_title || '', g.house_php ?? '', g.delta_php ?? '',
      g.variant_mark_kind || '', g.submission_label || '', g.submission_edited || '',
      g.justification || ''])));
  const statusSelect = <label>Workbook status<select aria-label="Senate workbook status" value={p.status || ''}
    onChange={e => filterChange(route, {status: e.target.value})}>
    <option value="">All rows</option>
    {Object.entries(senateStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select></label>;
  const exportCsv = () => download('nia-senate-workbook-filtered.csv', csvText(
    ['id', 'row', 'subprogram', 'program_group', 'category', 'region', 'province', 'label', 'status',
     'nep_amount', 'hgab_amount', 'submission_label', 'submission_amount', 'edited', 'justification',
     'title_parse_source', 'coordinates', 'chainage', 'chainage_length_m',
     'nep_join_id', 'house_join_id', 'nep_join_similarity', 'house_join_similarity'],
    filtered.map(x => [x.id, x.row, x.subprogram_key, x.program_group, x.category || '', x.region || '',
      x.province || '', x.label, x.status, x.nep_amount ?? '', x.hgab_amount ?? '',
      x.submission_label || '', x.submission_amount ?? '', x.submission_edited || '',
      x.justification || '', x.title_parse?.source || '', formatSenateCoordinates(x),
      formatSenateChainage(x), senateChainageLengthM(x) ?? '',
      x.nep_join?.id || '', x.house_join?.id || '',
      x.nep_join?.similarity ?? '', x.house_join?.similarity ?? ''])));
  const viewRows = view === 'insertions' ? filtered.filter(x => x.status === 'house_insertion')
    : view === 'zeroed' ? filtered.filter(x => x.status === 'house_zeroed')
    : view === 'edits' ? filtered.filter(x => x.submission_edited)
    : filtered;
  return <><section className="analysis-section"><h2>NIA Senate workbook reconciliation</h2>
    <p>NIA's own hearing workbook (October 10) prints the published NEP detail beside the House GAB amounts and NIA's
      original submission. Rows with House money but no NEP line are NIA-acknowledged House insertions; rows with NEP
      money the House zeroed are print-level removals. Every workbook row joins one-to-one to both retained ledgers.</p>
    <div className="fmr-stats"><Stat label="Workbook rows" value={full.rows.toLocaleString()} detail="project-level detail rows"/>
      <Stat label="House insertions" value={full.insertions} detail={`${money(full.insertions_php)} with no NEP line`}/>
      <Stat label="NEP items zeroed" value={full.zeroed} detail={`${money(full.zeroed_php)} removed by the House`}/>
      <Stat label="NIA edits acknowledged" value={full.edited} detail={`${full.justified} rows carry a written justification`}/></div>
    <p className="nia-method-note">Corroboration: {corroborated.length} of {ourHouseOnly.length} unmatched House candidates in our
      title matching are official workbook insertion rows; the remainder are reworded or split/merged counterparts.</p>
  </section>
  <section className="fmr-section"><h2>Workbook rows</h2>
    <div className="analysis-controls"><Filters route={route} subprograms={data.senate.subprograms} status={false}/>
      {statusSelect}
      <label>View<select aria-label="Senate workbook view" value={view} onChange={e => filterChange(route, {senateView: e.target.value})}>
        <option value="all">All rows</option>
        <option value="insertions">House insertions</option>
        <option value="zeroed">NEP items zeroed</option>
        <option value="edits">NIA-acknowledged edits</option>
      </select></label>
      <button onClick={exportCsv}>Export filtered CSV</button></div>
    <div className="fmr-result-bar"><span>{viewRows.length} rows shown</span></div>
    <Table route={route} rows={viewRows} label="NIA Senate workbook rows" paginate initialSort={{key: 'hgab_amount', direction: 'desc'}} columns={[
      {key: 'label', label: 'Project (NEP print)', scope: 'row', render: x => <span className="nia-senate-label">
        {x.label}<small>{[x.category, x.region, x.province].filter(Boolean).join(' · ')}</small>
        {x.justification && <small className="nia-justification">“{x.justification.slice(0, 140)}{x.justification.length > 140 ? '…' : ''}”</small>}</span>},
      {key: 'status', label: 'Workbook status', render: x => <span className={`fmr-badge nia-senate-${x.status}`}>{senateStatusLabels[x.status]}</span>},
      {key: 'nep_amount', label: 'NEP (PHP)', align: 'num', render: x => x.nep_amount == null ? '—' : money(x.nep_amount)},
      {key: 'hgab_amount', label: 'House (PHP)', align: 'num', render: x => x.hgab_amount == null ? '—' : money(x.hgab_amount)},
      {key: 'submission', label: 'NIA submission', sortable: false, render: x => x.submission_label ? <span className="nia-senate-label">{x.submission_label}
        {x.submission_amount != null && x.nep_amount != null && x.submission_amount !== x.nep_amount && <small>Submission amount {money(x.submission_amount)} differs from NEP</small>}</span> : '—'},
      {key: 'coordinates', label: 'Coordinates', title: 'Normalized coordinates parsed from the column-V fixed title when present, else the NEP-print label',
        sortable: false, value: x => formatSenateCoordinates(x),
        render: x => { const text = formatSenateCoordinates(x); return text
          ? <span className="nia-senate-parse" title={x.title_parse?.source === 'submission_label' ? 'From fixed title (col V)' : 'From NEP-print label'}>{text}</span>
          : '—'; }},
      {key: 'chainage', label: 'Chainage', title: 'Station/chainage spans parsed from the same preferred title',
        sortable: false, value: x => formatSenateChainage(x),
        render: x => { const text = formatSenateChainage(x); const lengthM = senateChainageLengthM(x);
          return text || lengthM != null
            ? <span className="nia-senate-parse" title={x.title_parse?.source === 'submission_label' ? 'From fixed title (col V)' : 'From NEP-print label'}>
                {text || '—'}{lengthM != null && <small>{formatLengthKm(lengthM)}</small>}</span>
            : '—'; }},
      {key: 'join', label: 'Ledger join', sortable: false, value: x => x.nep_join?.similarity ?? 0, render: x => <span className="nia-senate-join">
        {x.nep_join ? <a href={href('nep', {node: x.nep_join.id})}>NEP ↗</a> : 'NEP —'}
        {' '}{x.house_join ? <a href={href('house', {node: x.house_join.id})}>House ↗</a> : 'House —'}
        {x.nep_join && x.nep_join.similarity < 1 && <small title="Title similarity of the workbook label to the retained ledger title">sim {(x.nep_join.similarity * 100).toFixed(0)}%</small>}</span>},
    ]}/>
  </section>
  <section className="fmr-section"><h2>Row-count reconciliation · comparison ledger vs workbook</h2>
    <p>The title-matching comparison ledger counts <em>observations</em> — one row per unmatched source line, one row per
      title-matched pair — while the workbook counts NIA's own <em>reconciliation lines</em>, aligning one NEP line with one
      House line even where our provisional matching cannot pair them. Both partitions cover every ledger row exactly once
      ({houseLedger.size.toLocaleString()} House + {ledger.size.toLocaleString()} NEP), so each dataset total decomposes into the
      same pieces below. Counts are rows, not distinct projects.</p>
    <Table route={route} rows={senateReconciliationRows(data)} label="Comparison observations vs Senate workbook rows" tableId="senate-row-reconciliation"
      initialSort={{key: 'comparison_rows', direction: 'desc'}} columns={[
      {key: 'label', label: 'Piece', scope: 'row'},
      {key: 'comparison_rows', label: `Comparison rows (${data.comparison.length.toLocaleString()} total)`, align: 'num',
        title: 'Rows in the title-matching comparison ledger — one per unmatched source line or matched pair',
        render: r => r.comparison_rows ? r.comparison_rows.toLocaleString() : '—'},
      {key: 'workbook_rows', label: `Workbook rows (${projects.length.toLocaleString()} total)`, align: 'num',
        title: 'Lines in NIA\u2019s Senate workbook sheet "DETAILS 2027"',
        render: r => r.workbook_rows ? r.workbook_rows.toLocaleString() : '—'},
      {key: 'note', label: 'How the two counts relate', sortable: false},
    ]}/>
    <p className="fmr-notice">Reading guide: the {gapRows.length.toLocaleString()} split rows are why the comparison ledger shows more unmatched
      rows ({comparisonCounts.house_only?.toLocaleString()} House-only and {comparisonCounts.nep_only?.toLocaleString()} NEP-only) than the
      workbook's official {full.insertions.toLocaleString()} insertions and {full.zeroed.toLocaleString()} zeroed items — each split
      row inflates both unmatched counts by one. All figures are recomputed from the ledgers; matching stays provisional.</p>
  </section>
  <section className="fmr-section"><h2>The {gapRows.length} NIA-aligned rows our matching splits in two</h2>
    <p>Each workbook line below carries NEP money <em>and</em> House money, and joins one-to-one to both ledgers — but the two
      joined records did not pair under the matching rules, so they appear as two separate observations (House-only and NEP-only)
      in the comparison ledger. This is the exact difference between the {comparisonCounts.house_only.toLocaleString()} unmatched
      House candidates and the {full.insertions.toLocaleString()} official insertions. Of these {gapRows.length} rows,
      {' '}{gapFixed.toLocaleString()} carry a fixed title in workbook column V, {gapEdited.toLocaleString()} carry an edit
      acknowledgement, and {gapJustified.toLocaleString()} carry a written remark — typically spelling corrections, renaming,
      or field/beneficiary notes, not explanations of the title split itself.</p>
    <div className="analysis-controls"><label>Gap reason<select aria-label="Gap reason" value={p.gapReason || ''}
        onChange={e => filterChange(route, {gapReason: e.target.value})}>
        <option value="">All reasons</option>
        {Object.entries(gapReasonLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button onClick={exportGapCsv}>Export gap rows CSV</button></div>
    <p className="fmr-notice">The search box and sub-program filter above apply here too (search also reaches edit flags and remarks).</p>
    <div className="fmr-result-bar"><span>{gapFiltered.length} rows shown</span></div>
    <Table route={route} rows={gapFiltered} label="NIA-aligned rows split into two comparison observations" tableId="senate-gap-rows" paginate
      initialSort={{key: 'house_php', direction: 'desc'}} columns={[
      {key: 'label', label: 'Workbook line (NEP print)', scope: 'row', render: g => <span className="nia-senate-label">
        {g.label}<small>{[g.category, g.region, g.province].filter(Boolean).join(' · ')}</small>
        {g.justification && <small className="nia-justification">“{g.justification.slice(0, 160)}{g.justification.length > 160 ? '…' : ''}”</small>}</span>},
      {key: 'reason', label: 'Why unpaired', render: g => <span className={`fmr-badge nia-gap-${g.reason}`}>{gapReasonLabels[g.reason]}</span>},
      {key: 'nep_php', label: 'NEP (PHP)', align: 'num', render: g => money(g.nep_php)},
      {key: 'house_php', label: 'House (PHP)', align: 'num', render: g => money(g.house_php)},
      {key: 'delta_php', label: 'Δ House–NEP (PHP)', align: 'num', render: g => signedMoney(g.delta_php)},
      {key: 'submission_label', label: 'Fixed title', title: 'Workbook column V — NIA submission / corrected project wording',
        sortable: false, value: g => g.submission_label || '',
        render: g => g.submission_label
          ? <span className="nia-senate-label nia-gap-fixed" title={g.submission_label}>{g.submission_label}
            {g.submission_label !== g.label && <small>differs from NEP print</small>}</span> : '—'},
      {key: 'submission_edited', label: 'NIA edit', title: 'Workbook edit acknowledgement (OK / CHECK)',
        render: g => g.submission_edited
          ? <span className={`fmr-badge nia-edit-${g.submission_edited.toLocaleLowerCase()}`}>{g.submission_edited}</span> : '—'},
      {key: 'justification', label: 'Workbook remark', sortable: false, value: g => g.justification || '',
        render: g => g.justification
          ? <span className="nia-senate-label nia-gap-remark" title={g.justification}>{g.justification}</span> : '—'},
      {key: 'mark', label: 'Variant mark', sortable: false, render: g => g.variant_mark_kind && g.variant_mark_kind !== 'no_counterpart'
        ? <span className="fmr-badge" title="Deterministic near-miss mark on the House half — points at a possible counterpart, never certifies identity">{variantMarkLabels[g.variant_mark_kind]}</span> : '—'},
      {key: 'titles', label: 'Ledger titles', sortable: false, value: g => g.nep_title || '', render: g => <span className="nia-senate-label">
        {g.nep_title && <small>NEP: {g.nep_title}</small>}
        {g.house_title && <small>House: {g.house_title}</small>}</span>},
      {key: 'open', label: 'Open', sortable: false, render: g => <span className="nia-senate-join">
        <a href={href('nep', {node: g.nep_id})}>NEP ↗</a>{' '}<a href={href('house', {node: g.house_id})}>House ↗</a></span>},
    ]}/>
    <p className="fmr-notice">Why unpaired: <strong>Titles differ</strong> — the two annex printings carry different wording or
      punctuation for the same project NIA aligned internally. <strong>Repeated title</strong> — identical titles occur more than
      once inside one sub-program, so one-to-one matching refuses to pair them. <strong>Fixed title</strong> is workbook
      column V (NIA's submission / corrected wording when the edit flag is set). <strong>NIA edit</strong> is the
      acknowledgement column (typically OK); <strong>Workbook remark</strong> is NIA's free-text justification when present.
      Joins carry provenance, not certified identity.
      {unfundedRows.length > 0 && <> Separately, {unfundedRows.length === 1 ? 'one workbook row prints zero in both annexes and exists only for the submission record: '
        : `${unfundedRows.length} workbook rows print zero in both annexes: `}
        {unfundedRows.map(u => <em key={u.id}>{u.label}</em>)}.</>}</p>
  </section>
  <section className="fmr-section"><h2>Reconciliation by hierarchy category</h2>
    <p>Each comparison class against the workbook-only category level. Amounts follow the side that carries the
      money — House for insertions and adjustments, NEP for deletions — so <em>House ledger</em> is the checksum
      column: insertions + unchanged + increased + decreased must reproduce it per category. Categories come from
      NIA's Senate workbook and are absent from both annex PDFs.</p>
    <Table route={route} rows={categoryReconciliationRows(rows)} label="NIA reconciliation by hierarchy category" tableId="senate-category-reconciliation"
      initialSort={{key: 'house_php', direction: 'desc'}} columns={[
      {key: 'label', label: 'Category', scope: 'row'},
      ...RECONCILIATION_CLASSES.map(([key, label, note, side]) => ({
        key, label, title: note, align: 'num',
        render: r => <span className="nia-recon-cell"><small>{r[`${key}_count`].toLocaleString()}</small> · {money(r[`${key}_php`])}</span>,
        value: r => r[`${key}_php`],
      })),
      {key: 'net_delta', label: 'Net change from NEP (PHP)', align: 'num', divider: true,
        title: 'House ledger minus NEP money in this category',
        value: r => r.net_delta_php, render: r => signedMoney(r.net_delta_php)},
      {key: 'house_ledger', label: 'House ledger (PHP)', align: 'num',
        title: 'Checksum: House-side record count and money in this category',
        value: r => r.house_php,
        render: r => <span className="nia-recon-cell"><small>{r.house_count.toLocaleString()}</small> · {money(r.house_php)}</span>},
    ]}/>
    <p className="fmr-notice">Reading guide: <strong>Unsupported insertions</strong> — House only records (no NEP line).
      <strong> Deletions</strong> — NEP only records. <strong>Unchanged</strong> — same NEP–HGAB titles, no adjustments.
      <strong> Increased</strong> — same titles, increased budget. <strong> Decreased</strong> — same titles, decreased budget.
      <strong>Net change from NEP</strong> is House ledger − NEP money. The House ledger column equals insertions +
      unchanged + increased + decreased (count and pesos); deletions carry NEP money.
      Counts are ledger rows, not distinct projects; repeated titles stay per-row.</p>
  </section>
  <section className="fmr-section"><h2>Hierarchy categories (workbook-only dimension)</h2>
    <p>The workbook prints a category level absent from both annex PDFs. Totals over the current filters.</p>
    <Table route={route} rows={senateCategoryRows(filtered)} label="NIA Senate workbook categories" columns={[
      {key: 'label', label: 'Category', scope: 'row'},
      {key: 'count', label: 'Rows', align: 'num'},
      {key: 'nep_php', label: 'NEP (PHP)', align: 'num', render: r => money(r.nep_php)},
      {key: 'house_php', 'label': 'House (PHP)', align: 'num', render: r => money(r.house_php)},
      {key: 'insertions', label: 'Insertions', align: 'num'},
    ]}/>
  </section>
  <ScopeNote/></>;
}

function senateCategoryRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.category || '(none)';
    const g = groups.get(key) || {label: key, count: 0, nep_php: 0, house_php: 0, insertions: 0};
    g.count++; g.nep_php += r.nep_amount || 0; g.house_php += r.hgab_amount || 0;
    if (r.status === 'house_insertion') g.insertions++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.house_php - a.house_php);
}

function Dialog({label, title = label, closeLabel = 'Close', className = '', onClose, children}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{title}</h2><button onClick={onClose}>{closeLabel}</button></div>{children}</dialog>;
}
function CandidateEvidence({rows, route, onPdf}) {
  const id = route.params.get('pair');
  if (!id) return null;
  const row = rows.find(r => r.id === id);
  const counterpartIds = row?.variant_mark?.counterpart_ids || [];
  const counterpartRows = counterpartIds.map(cid => rows.find(r => r.house_id === cid || r.nep_id === cid)).filter(Boolean);
  return <Dialog label="NIA candidate evidence" onClose={() => navigate(route, {pair: null})}>
    {!row ? <p role="alert">Unknown candidate selection.</p> : <><p>{statusLabels[row.status]} · {row.subprogram_key}</p>
      <p>Paired difference: {row.delta_php == null ? 'unavailable for source-only observations' : signedMoney(row.delta_php)}.</p>
      {row.variant_mark_kind && row.variant_mark_kind !== 'no_counterpart' && <p className="nia-variant-note">
        <span className="fmr-badge">{variantMarkLabels[row.variant_mark_kind]}</span>{' '}
        Deterministic review mark over equal amounts — it points at a possible counterpart but never certifies identity.
        {counterpartRows.map(c => <button key={c.id} className="nia-inline-link" onClick={() => navigate(route, {pair: c.id})}>{c.title} · {money(c.house_php ?? c.nep_php)} →</button>)}
      </p>}
      <div className="fmr-pair-evidence">{['nep', 'house'].map(side => <section key={side} className="fmr-panel"><h3>{stageLabels[side]}</h3>
        {row[side] ? <><p>{row[side].title}</p><strong>{money(row[side].amount_php)}</strong><p><code>{row[side].id}</code></p>
          <SourceButton source={row[side].source} onPdf={onPdf}/><p><a href={href(side, {node: row[side].id})}>Open source record →</a></p></> : <p>No unique title counterpart in this stage.</p>}
      </section>)}</div><p>Candidate status does not establish project identity or a certified unsupported insertion/deletion.</p></>}
  </Dialog>;
}
export default function NiaApp() {
  const [route, setRoute] = useState(() => readRoute()), [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);}, []);
  useEffect(() => {const controller = new AbortController();
    fetch(siteUrl('analysis-nia/data/nia_workbench.json'), {signal: controller.signal}).then(r => {
      if (!r.ok) throw Error(`Source data request failed (${r.status})`); return r.json();
    }).then(d => {if (d.schema_version !== 1) throw Error('Unsupported NIA dataset'); setData(d);})
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);}); return () => controller.abort();}, []);
  useEffect(() => {document.title = `${niaTabs.find(t => t[0] === route.key)?.[1] || 'Unknown page'} · NIA FY2027`;}, [route.key]);
  const rows = useMemo(() => data ? comparisonRows(data) : [], [data]);
  const onPdf = source => navigate(route, {pdf: source.source_pdf, pdfPage: source.pdf_page, pair: null, group: null,
    ...(route.key === 'compare' ? {panel: 'pdf'} : {})});
  const pdf = route.params.get('pdf'), page = Number(route.params.get('pdfPage'));
  const knownDoc = data && Object.values(data.documents).find(d => d.path === pdf);
  // Page bounds come from the documents registry (page_count), not literals.
  const validPdf = knownDoc && Number.isInteger(page) && page > 0
    && page <= (knownDoc.page_count ?? Infinity);
  const clearPdf = () => navigate(route, {pdf: null, pdfPage: null, panel: null});
  const inlineSource = validPdf && route.key === 'compare' ? {source_pdf: pdf, pdf_page: page} : null;
  return <><a className="fmr-skip" href="#nia-content" onClick={e => {e.preventDefault(); document.getElementById('nia-content')?.focus();}}>Skip to content</a>
    <WorkbenchHeader route={route.key} workspace="nia"/><main id="nia-content" tabIndex={-1} className="shell fmr-main nia-main">
      {error ? <div role="alert"><h1>NIA sources could not load</h1><p>{error}</p><button onClick={() => window.location.reload()}>Reload</button></div>
        : !data ? <p role="status">Loading NIA sources…</p>
        : ['house', 'nep'].includes(route.key) ? <SourceWorkspace key={route.key} data={data} route={route} onPdf={onPdf}/>
        : route.key === 'home' ? <Home data={data} route={route} onPdf={onPdf}/>
        : route.key === 'highlights' ? <Highlights data={data} route={route} rows={rows} onPdf={onPdf}/>
        : route.key === 'compare' ? <Compare data={data} route={route} rows={rows} onPdf={onPdf} inlineSource={inlineSource} clearPdf={clearPdf}/>
        : route.key === 'analysis' ? <Analysis data={data} route={route} rows={rows} onPdf={onPdf}/>
        : route.key === 'map' ? <Suspense fallback={<p role="status">Loading map…</p>}><NiaMap data={data} route={route}/></Suspense>
        : <><h1>Page not found</h1><a href={href('home')}>Open NIA Home</a></>}
      {data && <CandidateEvidence rows={rows} route={route} onPdf={onPdf}/>}
      {validPdf && !inlineSource && <Dialog label="NIA PDF source" onClose={clearPdf}><Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={{url: siteUrl(pdf), document: pdf.split('/').pop(), page}} downloadOriginal/></Suspense></Dialog>}
      {pdf && data && !validPdf && <p role="alert">Unknown PDF source or invalid page. <button onClick={clearPdf}>Clear PDF selection</button></p>}
    </main><footer className="shell fmr-footer"><span>FY2027 · NIA irrigation schedules</span>
      <a href={siteUrl('analysis-nia/README.md')}>Source documentation</a>
      <a href={siteUrl('analysis-nia/NEP_NIA_METHODOLOGY_AND_LESSONS.md')}>NEP extraction method</a></footer></>;
}
