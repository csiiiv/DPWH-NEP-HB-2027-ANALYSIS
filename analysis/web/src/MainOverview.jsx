import React, {useEffect, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import {loadData, repo, siteUrl} from './data.js';
import {readRoute} from './routes.js';
import {compactMoney, money} from './fmrModel.js';
import {overviewCsv, validateOverview} from './mainOverviewModel.js';
import './Fmr.css';
import './MainOverview.css';

const number = value => value == null ? '—' : value.toLocaleString('en-PH');
function Amount({value, exact, signed = false}) {
  const sign = signed && value != null ? value > 0 ? '+' : value < 0 ? '−' : '' : '';
  const formatted = (exact ? money : compactMoney)(signed && value != null ? Math.abs(value) : value);
  return <span className={signed ? value > 0 ? 'up' : value < 0 ? 'down' : '' : ''}
    title={money(value)}>{sign}{formatted}</span>;
}
function Population({workspace, kind, label, exact}) {
  const metric = workspace[kind];
  return <a className="overview-population" href={workspace.links[kind]} aria-label={`${workspace.label} ${label.toLowerCase()}`}>
    <strong>{label}</strong><span>{number(metric.count)} {workspace.count_unit}</span>
    <b><Amount value={metric.amount_php} exact={exact}/></b>
    <small>{kind === 'insertions' ? 'House allocation' : 'NEP allocation'}
      {metric.comparison_rows != null && metric.comparison_rows !== metric.count ? ` · ${number(metric.comparison_rows)} comparison rows` : ''} · inspect records →</small>
  </a>;
}
function SummaryCard({workspace: w, exact}) {
  const a = w.adjustments;
  return <article className="overview-workspace-card" aria-labelledby={`overview-${w.key}`}>
    <p className="fmr-eyebrow">{w.basis}</p><h2 id={`overview-${w.key}`}><a href={w.links.home}>{w.label} →</a></h2>
    <p>{w.scope}</p><p className="overview-grain">Counted unit: {w.grain}.</p>
    <dl className="overview-stage-totals">
      {['nep', 'house'].map(side => <div key={side}><dt>{side === 'nep' ? 'DBM NEP' : 'House GAB'}</dt>
        <dd><Amount value={w.sources[side].amount_php} exact={exact}/><small>{number(w.sources[side].count)} {w.count_unit}
          {w.sources[side].facility_count != null ? ` · ${number(w.sources[side].facility_count)} facility rows` : ''}</small></dd></div>)}
    </dl>
    <div className="overview-populations"><Population workspace={w} kind="insertions" label="Insertion candidates" exact={exact}/>
      <Population workspace={w} kind="deletions" label="Deletion candidates" exact={exact}/></div>
    <section className="overview-adjustments" aria-label={`${w.label} adjustments`}>
      <h3><a href={w.links.adjustments}>Adjustments · {number(a.count)} {a.count_unit} →</a></h3>
      <dl><div><dt>Increased · {number(a.increased_count)}</dt><dd><Amount value={a.increased_php} exact={exact} signed/></dd></div>
        <div><dt>Reduced · {number(a.reduced_count)}</dt><dd><Amount value={-a.reduced_php} exact={exact} signed/></dd></div>
        <div><dt>Net paired movement</dt><dd><Amount value={a.net_php} exact={exact} signed/></dd></div></dl>
      {a.events && <p>{a.events.revised} revised · {a.events.added} NEP-only columns · {a.events.dropped} House-only columns within paired facilities.</p>}
    </section>
    <p className="overview-movement">House − NEP ledger: <strong><Amount value={w.delta_php} exact={exact} signed/></strong></p>
    {w.direction_note && <p className="fmr-muted">{w.direction_note}</p>}
    <details className="fmr-method"><summary>Matching basis and source controls</summary><p>{w.matching}</p>
      <p>Printed {w.key === 'dpwh' ? 'agency new appropriations' : 'annex controls'}: House <Amount value={w.controls.house_php} exact/>
        {' '}· NEP <Amount value={w.controls.nep_php} exact/>.</p>
      {w.controls.note && <p>{w.controls.note}</p>}
      {w.controls.residual_php !== 0 && w.controls.residual_php != null && <p>The NEP printed control exceeds its facility ledger by ₱140,000.
        Printed-control movement differs from ledger movement by <Amount value={w.controls.residual_php} exact signed/>.</p>}
      <p><a href={w.links.house}>House source evidence →</a>{' '}<a href={w.links.nep}>NEP source evidence →</a></p>
    </details>
    <div className="hero-actions"><a href={w.links.compare}>Compare stages →</a><a href={w.links.highlights}>Highlights →</a></div>
  </article>;
}
function downloadSummary(data) {
  const url = URL.createObjectURL(new Blob([overviewCsv(data)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'fy2027-overview-summary.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Coverage and candidate-change tables follow the DPWH Highlights pattern:
// every cell states its own counting unit, and figures come only from the
// validated summary payload — never cross-workspace additions.
function CoverageTables({data, exact}) {
  const columns = [
    ['nep', 'DBM NEP', w => w.sources.nep, w => w.links.nep],
    ['second', 'HGAB 2nd', w => w.readings.second ?? {count: w.sources.house.count, amount_php: w.sources.house.amount_php}, w => w.links.house_second ?? w.links.house],
    ['third', 'HGAB 3rd', w => w.readings.third ?? {count: w.sources.house.count, amount_php: w.sources.house.amount_php}, w => w.links.house],
  ];
  return <><section className="fmr-section" aria-labelledby="overview-coverage-heading">
    <h2 id="overview-coverage-heading">Budget coverage by stage</h2>
    <p>Each workspace counts its own declared record grain — {data.workspaces.map(w => `${w.label.toLowerCase()} (${w.count_unit})`).join(', ')}. Counts and ledger totals come from the same validated build as the summaries; stages are counted separately and never added across workspaces.</p>
    <div className="table-scroll" role="region" aria-label="Overview budget coverage by stage" tabIndex={0}>
      <table className="highlights-table overview-coverage-table"><caption>Source allocation records and amounts · each workspace's retained schedules</caption>
        <thead><tr><th scope="col">Workspace</th><th scope="col">DBM NEP</th><th scope="col">HGAB 2nd</th><th scope="col">HGAB 3rd</th></tr></thead>
        <tbody>{data.workspaces.map(w => <tr key={w.key}>
          <th scope="row"><a href={w.links.home}>{w.label}</a></th>
          {columns.map(([key, , get, link]) => <td key={key}>{(() => {
            const value = get(w);
            if (!value) return <span className="highlights-unavailable">Not covered</span>;
            if (value.same_as_second) return <a className="highlights-cell-link" href={link(w)}>
              <strong>Unchanged from HGAB 2nd</strong>
              <span title={money(value.amount_php)}>Same {number(value.count)} {w.count_unit} · verified across {value.verified_identical_pages} annex pages</span></a>;
            return <a className="highlights-cell-link" href={link(w)}>
              <strong>{number(value.count)} {w.count_unit}</strong>
              <span title={money(value.amount_php)}>Worth <Amount value={get(w).amount_php} exact/></span></a>;
          })()}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="fmr-muted">DPWH covers operations only; agency controls above operations are excluded here and shown in its card. DPWH retains both readings; each annex workspace retains its 2nd-reading House schedule, whose annex text was verified identical to the 3rd-reading printing — {data.workspaces.filter(w => w.readings?.third?.same_as_second).map(w => `${w.label}: ${w.readings.third.verified_identical_pages} pages`).join(', ')} — so its HGAB 2nd figures also state HGAB 3rd coverage. Unmatched candidates between stages do not make counts comparable as projects.</p>
  </section>
  <section className="fmr-section" aria-labelledby="overview-changes-heading">
    <h2 id="overview-changes-heading">House vs. NEP: candidate changes</h2>
    <p>Insertion and deletion candidates with their allocations, plus gross movement on paired counterparts. A candidate is a matching observation, not a certified policy change; each workspace's card states its matching basis. Select a figure to review the underlying records in its workspace.</p>
    <div className="table-scroll" role="region" aria-label="Overview House versus NEP candidate changes" tabIndex={0}>
      <table className="highlights-table highlights-changes overview-changes-table"><caption>Candidate changes · full source allocations for insertions/deletions; gross paired movement for increases/decreases</caption>
        <thead><tr><th scope="col">Workspace</th><th scope="col">Insertion candidates</th><th scope="col">Deletion candidates</th><th scope="col">Paired increases</th><th scope="col">Paired reductions</th><th scope="col">House ledger</th></tr></thead>
        <tbody>{data.workspaces.map(w => <tr key={w.key}>
          <th scope="row"><a href={w.links.home}>{w.label}</a></th>
          {[['insertions', 'House allocation'], ['deletions', 'NEP allocation']].map(([key, note]) => <td key={key}>
            <a className="highlights-cell-link" href={w.links[key]} aria-label={`${w.label} ${key === 'insertions' ? 'insertion' : 'deletion'} candidates`}>
              <strong>{number(w[key].count)} {w.count_unit}</strong>
              <span title={money(w[key].amount_php)}>{note} <Amount value={w[key].amount_php} exact/></span></a></td>)}
          {[['increases', 'increased_php', 'increased_count'], ['decreases', 'reduced_php', 'reduced_count']].map(([key, php, cnt]) => <td key={key}>
            <a className="highlights-cell-link" href={w.links[key]} aria-label={`${w.label} paired ${key}`}>
              <strong>{number(w.adjustments[cnt])} {w.adjustments.count_unit.replace('changed ', '').replace('candidate ', '')}</strong>
              <span title={money(w.adjustments[php])}>Gross <Amount value={w.adjustments[php]} exact/></span></a></td>)}
          <td><a className="highlights-cell-link" href={w.links.house}>
            <strong>{number(w.sources.house.count)} {w.count_unit}</strong>
            <span title={money(w.sources.house.amount_php)}>Worth <Amount value={w.sources.house.amount_php} exact/></span></a></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="fmr-muted">Counts use each workspace's record grain, so they are not comparable across rows. Adjustments are gross movements within pairs — {data.workspaces.map(w => `${w.label}: ${w.adjustments.count_unit}`).join('; ')}. The DPWH pair counts include region-difference candidates. HFEP paired column additions/drops sit in its adjustments; its Analysis view displays NEP minus House.</p>
  </section></>;
}
export default function MainOverview() {
  const [route, setRoute] = useState(() => readRoute()), [data, setData] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);}, []);
  useEffect(() => {document.title = 'Overview · FY2027 Budget Workbenches';}, []);
  useEffect(() => {const controller = new AbortController(); setError('');
    loadData('main_overview_2027.json', controller.signal).then(validateOverview).then(setData)
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);}); return () => controller.abort();}, [attempt]);
  const exact = route.params.get('exact') === '1';
  const sortKey = route.params.get('sort') || 'label';
  const sort = {key: ['label', 'nep_count', 'house_count', 'nep_php', 'house_php', 'delta_php'].includes(sortKey) ? sortKey : 'label',
    direction: route.params.get('dir') === 'desc' ? 'desc' : 'asc'};
  const navigate = patch => {const next = {...Object.fromEntries(route.params), ...patch};
    for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
    const query = new URLSearchParams(next).toString(); window.location.hash = '#overview' + (query ? '?' + query : '');};
  if (route.key !== 'home') return <><WorkbenchHeader workspace="overview" route="home"/><main className="shell fmr-main">
    <h1>Unknown Overview view</h1><a href="#overview">Open Overview</a></main></>;
  const rows = data?.workspaces.map(w => ({...w, nep_count: w.sources.nep.count, house_count: w.sources.house.count,
    nep_php: w.sources.nep.amount_php, house_php: w.sources.house.amount_php})) || [];
  return <><a className="fmr-skip" href="#overview-content" onClick={e => {e.preventDefault(); document.getElementById('overview-content')?.focus();}}>Skip to content</a>
    <WorkbenchHeader workspace="overview" route="home"/><main id="overview-content" tabIndex={-1} className={`shell fmr-main main-overview${exact ? ' show-exact' : ''}`}>
      <section className="hero"><p className="eyebrow">FY2027 · Retained budget schedules</p><h1>Budget allocation overview</h1>
        <p>Explore public works, farm-to-market roads, health facilities and irrigation allocations. Inspect insertion and deletion candidates, follow paired amount changes, and verify the source records.</p>
        <div className="hero-actions"><button className="primary" onClick={() => document.getElementById('overview-summaries')?.scrollIntoView()}>Explore the summaries ↓</button><ShareLink/>
          <label><input type="checkbox" checked={exact} onChange={e => navigate({exact: e.target.checked ? '1' : null})}/> Show exact pesos</label></div>
        {data && <p className="fmr-muted">Dataset build: {new Intl.DateTimeFormat('en-PH', {dateStyle: 'long', timeZone: 'Asia/Manila'}).format(new Date(data.built_at))} · Changes shown as House minus NEP.</p>}
      </section>
      <p className="fmr-notice">Allocations are budget figures. Insertions and deletions are provisional candidates: title, scope and OCR differences can prevent matching. Counts use each dataset's declared record grain; each source and workspace keeps its own totals.</p>
      {error ? <section role="alert"><h2>Overview data could not load</h2><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry summary</button>{' '}<a href="#home">Open DPWH</a></section>
        : !data ? <p role="status">Loading validated workspace summaries…</p> : <>
          <section id="overview-summaries" aria-label="Budget change summaries"><h2>Insertions, deletions and adjustments</h2>
            <div className="cards overview-workspaces">{data.workspaces.map(w => <SummaryCard key={w.key} workspace={w} exact={exact}/>)}</div></section>
          <section className="fmr-section"><h2>Source funding snapshot</h2><p>Ledger totals use the same records as the summaries. DPWH covers operations; HFEP excludes MOOE. Printed controls and their coverage are available in each card.</p>
            <SortableTable tableId="main-overview-funding" rows={rows} ariaLabel="Overview source funding snapshot" sort={sort}
              onSortChange={update => {const next = typeof update === 'function' ? update(sort) : update; navigate({sort: next?.key, dir: next?.direction});}} columns={[
                {key: 'label', label: 'Workspace', scope: 'row', render: w => <a href={w.links.home}>{w.label}<small>{w.count_unit}</small></a>},
                {key: 'nep_count', label: 'NEP records', band: 'records', bandLabel: 'Records', align: 'num', render: w => number(w.nep_count)},
                {key: 'house_count', label: 'House records', band: 'records', bandLabel: 'Records', align: 'num', render: w => number(w.house_count)},
                {key: 'nep_php', label: 'NEP ledger (PHP)', band: 'allocations', bandLabel: 'Allocations', divider: true, align: 'num', render: w => <Amount value={w.nep_php} exact={exact}/>},
                {key: 'house_php', label: 'House ledger (PHP)', band: 'allocations', bandLabel: 'Allocations', align: 'num', render: w => <Amount value={w.house_php} exact={exact}/>},
                {key: 'delta_php', label: 'House − NEP (PHP)', band: 'allocations', bandLabel: 'Allocations', align: 'num', render: w => <Amount value={w.delta_php} exact={exact} signed/>},
              ]}/><button onClick={() => downloadSummary(data)}>Export overview CSV</button>{' '}<a href={siteUrl('analysis/main_overview_2027.json')} download>Download summary JSON</a></section>
          <section className="fmr-section"><h2>Selected findings</h2><div className="cards overview-findings">{data.features.map(f => <article key={f.key}>
            <p className="fmr-eyebrow">{data.workspaces.find(w => w.key === f.key)?.label}</p><h3>{f.title}</h3>
            <strong>{f.count != null ? `${number(f.count)} candidates · ` : ''}<Amount value={f.amount_php} exact={exact}/></strong>
            <p>{f.detail}</p><a href={f.href}>Inspect supporting analysis →</a></article>)}</div></section>
          <CoverageTables data={data} exact={exact}/>
        </>}
      <section className="fmr-section"><h2>What do you want to investigate?</h2><ul className="home-directory">
        <li><a href="#compare"><strong>Public works allocations →</strong><span>Compare retained NEP, Transparency and House-reading records.</span></a></li>
        <li><a href="#fmr/map"><strong>Farm-to-market roads →</strong><span>Explore allocations and the normalized coordinate map.</span></a></li>
        <li><a href="#hfep/compare"><strong>Health facilities →</strong><span>Inspect infrastructure, medical-equipment and vehicle records.</span></a></li>
        <li><a href="#nia/analysis"><strong>Irrigation allocations →</strong><span>Explore sub-programs, candidate changes and AI monitoring.</span></a></li>
        <li><a href="#geo/map"><strong>Geolocation →</strong><span>Explore coordinate text across overlapping retained artifacts; counts are per source artifact.</span></a></li>
        <li><a href="#resources"><strong>Datasets and source documents →</strong><span>Download retained ledgers and verification artifacts.</span></a></li>
      </ul></section>
      <section className="fmr-section"><h2>Sources and coverage</h2><p>Figures come from retained FY2027 documents and reproducible dataset builds. Supporting views provide source IDs, PDF pages and population exports.</p>
        <p><a href={repo + 'analysis/docs/shareable_datasets_by_page.md'}>Shareable dataset guide</a>{' · '}
          <a href={repo + 'analysis/docs/analysis_tabs_framework.md'}>Analysis methods and counting units</a>{' · '}<a href="#about">About the workbench</a></p></section>
    </main><footer className="shell fmr-footer"><span>FY2027 · Budget Workbenches</span><a href={repo + 'README.md'}>Repository and source guides</a></footer></>;
}
