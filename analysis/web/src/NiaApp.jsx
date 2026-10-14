import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import AnalysisValue from './AnalysisValue.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';
import {siteUrl} from './data.js';
import {aiMonitoringBasis, aiMonitoringInsertions, aiMonitoringLabels, aiMonitoringProjects, concentration, concentrationRows, fundingGroups, fundingSummary, share} from './niaAnalysis.js';
import {allocationStats, analysisCandidateRows, bandRows, candidateAggregates, candidateGroupRows, comparisonRows, comparisonFilterLabels,
  csvText, filterComparisons, filterProjects, flagLabels, money, signedMoney, signedPct, pctChange, niaTabs,
  repeatedAmounts, roundingLadder, sourceArithmetic, sourceNode, sourcePath,
  stageLabels, statusLabels, subprogramAllocationRows, overviewComparisonRows, overviewGroupRows, REVIEW_CATEGORIES} from './niaModel.js';
import './Fmr.css';
import './Nia.css';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
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
  const keys = ['candidate_id', 'status', 'subprogram', 'ambiguous_title', 'delta_php'];
  const sideKeys = ['id', 'title', 'amount_php', 'source_pdf', 'pdf_page', 'printed_page'];
  download('nia-comparison-filtered.csv', csvText([...keys, ...['nep', 'house'].flatMap(s => sideKeys.map(k => `${s}_${k}`))],
    rows.map(r => [r.id, r.status, r.subprogram_key, Boolean(r.ambiguous_title), r.delta_php,
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
        : <a href={href(route.key, {...paramsOf(route), node: n.id})}>{n.label}</a>}
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
        <small>{r.subprogram_key}</small><span className="fmr-badge">{statusLabels[r.status]}{r.ambiguous_title && ' · repeated-title ambiguity'}</span></>},
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
        </details><ComparisonTable rows={filtered} total={rows.length} route={route} onPdf={onPdf}/>
          <p className="muted nia-count-explanation">Comparison observations are not unique projects. Unresolved counterparts can appear separately; each source allocation is retained once.</p></>
          : view === 'subprograms' ? <><ComparisonToolbar rows={controlRows} total={data.subprogram_controls.length} onCsv={() => exportControls(controlRows)} name="nia-subprogram-controls" description="sub-program controls"/>
            <Controls data={data} route={route} onPdf={onPdf} rows={controlRows} responsive/></>
          : <p role="alert">Unknown view. <a href={href('compare')}>Open sub-programs</a>.</p>}
      </section>{inlineSource && <PdfPane source={inlineSource} onClose={clearPdf}/>}
    </div>
  </div>;
}
function Highlights({data, route, rows, onPdf}) {
  const agg = candidateAggregates(rows);
  const coverage = fundingSummary(rows).sources;
  return <><Hero title="NIA highlights"><p>Findings bounded to the retained irrigation schedules.</p></Hero>
    <section className="fmr-section"><h2>Annex funding rises by {money(data.comparison_summary.delta_php)}</h2>
      <p>NEP has {data.stages.nep.projects.length} project rows; the supplied House annex has {data.stages.house.projects.length}. The controls below account for the full difference.</p>
      <Controls data={data} route={route} onPdf={onPdf}/></section>
    <section className="fmr-section"><h2>{agg.counts.paired} candidate pairs; {data.comparison_summary.changed_pairs} have different amounts</h2>
      <p>{agg.unchanged} pairs have equal allocations. Unique canonical titles within the same sub-program form candidates;
        OCR/title changes and repeated titles can leave rows unmatched.</p>
      <a href={href('compare', {view: 'projects', status: 'changed'})}>Inspect changed pairs →</a>
      <p>Paired difference {signedMoney(agg.paired_delta_php)} + House-only {money(agg.house_only_php)} − NEP-only {money(agg.nep_only_php)} = {signedMoney(agg.net_delta_php)}.</p>
      <p>The provisional pairs cover {(coverage.nep.allocation_share * 100).toFixed(1)}% of NEP allocation and {(coverage.house.allocation_share * 100).toFixed(1)}% of House allocation.
        {' '}<a href={href('analysis', {view: 'candidates'})}>See funding reconciliation and pairing coverage →</a></p>
      <a href={href('compare', {view: 'projects'})}>Inspect all candidate observations →</a></section>
    <section className="fmr-section"><h2>Agency scope extends beyond the annex</h2>
      <p>The House agency table adds a CARP-linked ₱698,067,000 row to Operations. Its ₱45,172,024,000 agency total covers a broader scope.</p>
      <SourceButton source={data.agency_controls.find(c => c.agency_only).source} onPdf={onPdf} label="Agency PAP controls"/>
      <SourceButton source={data.agency_controls.find(c => c.label === 'TOTAL NEW APPROPRIATIONS').source} onPdf={onPdf} label="Agency total and CARP provision"/>
    </section>
    <section className="fmr-section"><h2>Extraction review remains traceable</h2>
      {Object.values(data.stages).map(s => <p key={s.key}>{s.label}: {s.projects.filter(p => p.extraction_flags?.length).length} extraction-flagged rows;
        {' '}{s.projects.filter(p => p.repeated_title).length} rows with repeated exact titles.
        {' '}<a href={href(s.key, {view: 'review'})}>Inspect source review →</a></p>)}
      <p>Repeated titles remain separate printed allocations. Selected NEP rows retain rendered adjudication crops.</p>
    </section><ScopeNote/>
  </>;
}
function CandidateAnalysis({data, route, rows, onPdf, view}) {
  const p = paramsOf(route), filtered = analysisCandidateRows(rows, {...p, view});
  const dim = ['overall', 'subprogram', 'program'].includes(p.dim) ? p.dim : 'subprogram';
  const groups = candidateGroupRows(filtered, view, dim, data.stages.house.subprograms);
  const adjustment = view === 'adjustments', side = view === 'deletions' ? 'nep' : 'house';
  const title = {insertions: 'Insertion candidates', deletions: 'Deletion candidates', adjustments: 'Paired amount adjustments'}[view];
  const total = filtered.reduce((s, r) => s + (adjustment ? r.delta_php : r[`${side}_php`]), 0);
  const agg = candidateAggregates(filtered);
  const group = p.group && groups.find(g => g.id === p.group);
  const groupedRows = group ? filtered.filter(r => (dim === 'program' ? (r.house || r.nep).program_group : r.subprogram_key) === group.id) : [];
  const initialSort = adjustment ? {key: 'delta_php', direction: p.direction === 'increased' ? 'desc' : 'asc'}
    : {key: `${side}_php`, direction: 'desc'};
  return <section className="analysis-section nia-candidate-analysis"><h2>{title}</h2>
    <div className="analysis-controls">{adjustment ? <label>Direction<select aria-label="Revision direction" value={p.direction || 'all'}
      onChange={e => filterChange(route, {direction: e.target.value, sort: null, dir: null, group: null})}>
      <option value="all">All amount changes</option><option value="increased">Increased · House above NEP</option><option value="decreased">Reduced · House below NEP</option>
    </select></label> : <label>Candidate group<select aria-label={`Analysis ${view === 'insertions' ? 'insertion' : 'deletion'} group`} value={p.ranking || 'all'}
      onChange={e => filterChange(route, {ranking: e.target.value, group: null})}>
      <option value="all">All {side === 'house' ? 'House' : 'NEP'}-only candidates</option>
      <option value="unambiguous">Without repeated-title ambiguity</option><option value="ambiguous">Repeated-title ambiguity</option>
    </select></label>}</div>
    <div className="dimension-chips" role="group" aria-label="Break down by">{[['overall', 'Overall'], ['subprogram', 'Sub-program'], ['program', 'Program']].map(([key, label]) =>
      <button key={key} className={dim === key ? 'active' : ''} aria-pressed={dim === key} onClick={() => navigate(route, {dim: key, group: null, page: null})}>{label}</button>)}</div>
    <Filters route={route} subprograms={data.stages.house.subprograms} status={false}/>
    <div className="cards analysis-headlines"><article><h3>{adjustment ? 'Changed candidate pairs' : 'Candidate source rows'}</h3><strong>{filtered.length.toLocaleString()}</strong>
      <p>{adjustment ? 'Both source records attached' : `${stageLabels[side]} · unmatched by unique canonical title`}</p></article>
      <article><h3>{adjustment ? 'Net paired difference' : `${stageLabels[side]} allocation`}</h3><strong className={adjustment ? total > 0 ? 'up' : total < 0 ? 'down' : '' : ''}>{adjustment ? signedMoney(total) : money(total)}</strong>
        <p>{adjustment ? 'House minus NEP · paired amounts only' : 'Exact source allocation · each row retained once'}</p></article>
      <article><h3>{adjustment ? 'Increased / reduced pairs' : 'Repeated-title ambiguity'}</h3><strong>{adjustment ? `${agg.increased.count} / ${agg.decreased.count}` : filtered.filter(r => r.ambiguous_title).length}</strong>
        <p>{adjustment ? `Gross increases ${money(agg.increased.amount)} · gross reductions ${money(agg.decreased.amount)}` : 'Canonical title repeated on at least one side, with a counterpart key on the other'}</p></article></div>
    <p className="notice">{adjustment ? 'These are amount differences between provisional House and NEP pairs. NIA has one retained House schedule; this view does not establish changes between House readings.'
      : `${side === 'house' ? 'House rows without a unique NEP counterpart are insertion candidates' : 'NEP rows without a unique House counterpart are deletion candidates'}. Title differences, OCR, and repeated titles can prevent pairing. Candidate status does not certify ${side === 'house' ? 'an insertion' : 'a deletion'}.`}</p>
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
function ConcentrationAnalysis({projects, stage, route, onPdf}) {
  const overall = concentration(projects), groups = concentrationRows(projects, stage.subprograms);
  const selected = route.params.get('records');
  const group = selected === 'top10' ? overall : groups.find(g => `top10:${g.id}` === selected);
  const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  return <section className="fmr-section"><h2>Largest-project concentration</h2>
    <p>The largest {overall.top.length} filtered source rows account for {money(overall.top_amount_php)} ({percent(overall.top_share)} of the filtered allocation).
      {' '}<button className="group-open" onClick={() => navigate(route, {records: 'top10'})}>Inspect largest rows</button></p>
    <p>Each sub-program below uses its own largest ten rows, or all rows when fewer than ten remain. Concentration describes allocation, not implementation or service area.</p>
    <Table route={route} rows={groups} label="NIA allocation concentration" initialSort={{key: 'top_share', direction: 'desc'}} columns={[
      {key: 'label', label: 'Sub-program', scope: 'row'},
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
function AiMonitoringAnalysis({data, stage, rows, route, onPdf}) {
  const p = paramsOf(route), projects = aiMonitoringProjects(filterProjects(stage.projects, p), p);
  const stats = allocationStats(projects), annexTotal = allocationStats(stage.projects).total;
  const variants = projects.filter(project => aiMonitoringBasis(project) === 'ocr_variant');
  const insertions = aiMonitoringInsertions(rows, p), insertionStats = allocationStats(insertions.map(r => r.house));
  const houseStats = allocationStats(aiMonitoringProjects(filterProjects(data.stages.house.projects, p), p));
  const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '—';
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
  <section className="fmr-section" aria-label="AI monitoring insertion summary"><h2>House AI monitoring insertion candidates</h2>
    <p>House-only AI monitoring rows under the current filters, regardless of the selected budget source. OCR/title differences and repeated titles can prevent a NEP counterpart from pairing; these remain provisional insertion candidates.</p>
    <div className="fmr-stats"><Stat label="Insertion candidates" value={insertionStats.count} detail="Unmatched House project rows"/>
      <Stat label="Candidate House allocation" value={money(insertionStats.total)} detail="Whole project allocations"/>
      <Stat label="Share of House AI projects" value={percent(insertionStats.count, houseStats.count)} detail={`Of ${houseStats.count} filtered House AI rows`}/>
      <Stat label="Share of House AI allocation" value={percent(insertionStats.total, houseStats.total)} detail={`Of ${money(houseStats.total)}`}/></div>
    <p>{insertions.filter(r => r.ambiguous_title).length} candidates have repeated-title ambiguity.</p>
    <button className="group-open" onClick={() => navigate(route, {records: 'ai_insertions', page: null})}>Inspect insertion candidates</button>
    {p.records === 'ai_insertions' && <Dialog label="NIA AI monitoring insertion candidates" onClose={() => navigate(route, {records: null})}>
      <p>{insertionStats.count} House-only candidates · {money(insertionStats.total)} in whole project allocations.</p>
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
  const p=paramsOf(route), dim=['overall','subprogram','program'].includes(p.dim) ? p.dim : 'subprogram';
  const groups=overviewComparisonRows(rows,p,data.stages.house.subprograms,dim);
  const comparisonGroup=p.group?.startsWith('overview:') ? groups.find(g => g.id === p.group.slice(9)) : null;
  const sourceKey=p.records?.startsWith('overview-source:') ? p.records.slice(16) : null;
  const sourceGroup=sourceKey && stage.subprograms.find(s => s.key === sourceKey);
  const sourceRows=sourceGroup ? projects.filter(r => r.subprogram_key === sourceKey) : [];
  const close=() => navigate(route,{group:null,records:null,table:null});
  return <><section className="fmr-section"><h2>NEP → House by {dim === 'program' ? 'program group' : dim === 'overall' ? 'all records' : 'sub-program'}</h2>
    <div className="dimension-chips" role="group" aria-label="Break down by">{[['overall','Overall'],['subprogram','Sub-program'],['program','Program']].map(([id,label]) => <button key={id} className={dim===id?'active':''} aria-pressed={dim===id} onClick={() => navigate(route,{dim:id,group:null,records:null,page:null,sort:null,dir:null,table:null})}>{label}</button>)}</div>
    <p className="fmr-notice">This distribution uses project records from the comparison ledger, with the same source filters on both stages. Each side counts under its own printed group. Proposed title matches do not certify identity; allocation patterns do not establish implementation or misconduct.</p>
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
  const subprograms = subprogramAllocationRows(projects, stage.subprograms);
  const max = Math.max(1, ...subprograms.map(s => s.total));
  const views = [['overview', 'Overview'], ['insertions', 'Insertions'], ['deletions', 'Deletions'], ['adjustments', 'Adjustments'],
    ['stats', 'Statistics'], ['ai_monitoring', 'AI monitoring'], ['candidates', 'Candidates'], ['controls', 'Agency controls']];
  return <div className="headline-analysis nia-analysis"><section className="hero"><p className="eyebrow">NIA · FY2027</p><h1>NIA allocation analysis</h1>
    <p>Recorded allocations, candidate insertions and deletions, and paired amount adjustments.</p>
    <div className="hero-actions">{['overview', 'stats', 'ai_monitoring'].includes(view) ? <label className="hero-source">Budget source<select aria-label="Analysis budget source" value={stageKey}
      onChange={e => navigate(route, {stage: e.target.value, page: null})}>{Object.entries(stageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      : <span className="nia-analysis-basis">{view === 'insertions' ? 'House GAB · unmatched source rows' : view === 'deletions' ? 'DBM NEP · unmatched source rows' : view === 'controls' ? 'House agency table' : 'House GAB ↔ DBM NEP'}</span>}<ShareLink/></div></section>
    <Tabs route={route} defaultKey="overview" items={views} ariaLabel="Analysis views"
      reset={{status: null, direction: null, ranking: null, aiBasis: null, sort: null, dir: null, group: null, pair: null, dim: null, table: null, pdf: null, pdfPage: null}}/>
    <h2 className="fmr-question">{{overview:'How are recorded NIA allocations distributed across sub-programs?',
      insertions:'Which House project records have no unique NEP counterpart?',
      deletions:'Which NEP project records have no unique House counterpart?',
      adjustments:'Which provisional pairs have different House and NEP allocations?',
      stats:'Which descriptive allocation patterns appear in this source?',
      ai_monitoring:'Which project records explicitly fund AI monitoring?',
      candidates:'How does provisional pairing explain the annex funding difference?',
      controls:'How does the House annex reconcile with agency controls?'}[view] || 'Source records'}</h2>
    {['overview', 'stats'].includes(view) ? <><Filters route={route} subprograms={stage.subprograms}/>
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
        <ConcentrationAnalysis projects={projects} stage={stage} route={route} onPdf={onPdf}/></>}
      {view === 'overview' && <section className="analysis-section"><h2>Explore further</h2><div className="analysis-crosslinks">
        <a href={href('analysis', {view: 'insertions', subprogram: p.subprogram || ''})}>Insertion candidates · unmatched House records →</a>
        <a href={href('analysis', {view: 'deletions', subprogram: p.subprogram || ''})}>Deletion candidates · unmatched NEP records →</a>
        <a href={href('analysis', {view: 'adjustments', subprogram: p.subprogram || ''})}>Paired allocation adjustments →</a>
      </div></section>}
      <section className="fmr-section"><h2>Supporting source records</h2><button onClick={() => exportProjects(projects, stageKey)}>Export filtered CSV</button>
        <ProjectTable projects={projects} route={route} stage={stageKey} onPdf={onPdf}/></section>
    </> : view === 'ai_monitoring' ? <AiMonitoringAnalysis data={data} stage={stage} rows={rows} route={route} onPdf={onPdf}/>
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
function Dialog({label, onClose, children}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className="fmr-dialog" aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{label}</h2><button onClick={onClose}>Close</button></div>{children}</dialog>;
}
function CandidateEvidence({rows, route, onPdf}) {
  const id = route.params.get('pair');
  if (!id) return null;
  const row = rows.find(r => r.id === id);
  return <Dialog label="NIA candidate evidence" onClose={() => navigate(route, {pair: null})}>
    {!row ? <p role="alert">Unknown candidate selection.</p> : <><p>{statusLabels[row.status]} · {row.subprogram_key}</p>
      <p>Paired difference: {row.delta_php == null ? 'unavailable for source-only observations' : signedMoney(row.delta_php)}.</p>
      <div className="fmr-pair-evidence">{['nep', 'house'].map(side => <section key={side} className="fmr-panel"><h3>{stageLabels[side]}</h3>
        {row[side] ? <><p>{row[side].title}</p><strong>{money(row[side].amount_php)}</strong><p><code>{row[side].id}</code></p>
          <SourceButton source={row[side].source} onPdf={onPdf}/><p><a href={href(side, {node: row[side].id})}>Open source record →</a></p></> : <p>No unique title counterpart in this stage.</p>}
      </section>)}</div><p>Candidate status does not establish project identity or a certified insertion/deletion.</p></>}
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
        : <><h1>Page not found</h1><a href={href('home')}>Open NIA Home</a></>}
      {data && <CandidateEvidence rows={rows} route={route} onPdf={onPdf}/>}
      {validPdf && !inlineSource && <Dialog label="NIA PDF source" onClose={clearPdf}><Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={{url: siteUrl(pdf), document: pdf.split('/').pop(), page}} downloadOriginal/></Suspense></Dialog>}
      {pdf && data && !validPdf && <p role="alert">Unknown PDF source or invalid page. <button onClick={clearPdf}>Clear PDF selection</button></p>}
    </main><footer className="shell fmr-footer"><span>FY2027 · NIA irrigation schedules</span>
      <a href={siteUrl('analysis-nia/README.md')}>Source documentation</a>
      <a href={siteUrl('analysis-nia/NEP_NIA_METHODOLOGY_AND_LESSONS.md')}>NEP extraction method</a></footer></>;
}
