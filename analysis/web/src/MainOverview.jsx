import React, {useEffect, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import {loadData, repo, siteUrl} from './data.js';
import {readRoute, routeHref} from './routes.js';
import {compactMoney, money} from './fmrModel.js';
import {overviewCsv, validateOverview} from './mainOverviewModel.js';
import {CardShareMenu, CardModal, SectionHeader} from './CardShare.jsx';
import './Fmr.css';
import './MainOverview.css';

const number = value => value == null ? '—' : value.toLocaleString('en-PH');
function Amount({value, exact, signed = false}) {
  const sign = signed && value != null ? value > 0 ? '+' : value < 0 ? '−' : '' : '';
  const formatted = (exact ? money : compactMoney)(signed && value != null ? Math.abs(value) : value);
  return <span className={signed ? value > 0 ? 'up' : value < 0 ? 'down' : '' : ''}
    title={money(value)}>{sign}{formatted}</span>;
}
// Five-group vocabulary (agreed 16 October 2026): title + literal subheader.
const POPULATION_LABELS = {
  insertions: {title: 'Unsupported insertions', sub: 'House Only Records', note: 'House Allocations Worth'},
  deletions: {title: 'Deletions', sub: 'NEP Only Records', note: 'NEP Allocations Worth'},
  unchanged: {title: 'Unchanged', sub: 'Same NEP-HGAB Titles, no adjustments', note: 'Unchanged Allocations Worth'},
};
function Population({workspace, kind, label, exact}) {
  const metric = workspace[kind];
  const text = POPULATION_LABELS[kind];
  const body = <><strong>{text.title}<small className="overview-subhead">{text.sub}</small></strong>
    <span>{number(metric.count)} {workspace.count_unit}</span>
    <b><Amount value={metric.amount_php} exact={exact}/></b>
    <small>{text.note}
      {metric.comparison_rows != null && metric.comparison_rows !== metric.count ? ` · ${number(metric.comparison_rows)} comparison rows` : ''} · inspect records →</small></>;
  return <a className="overview-population" href={workspace.links[kind]} aria-label={`${workspace.label} ${text.title.toLowerCase()}`}>{body}</a>;
}
function SummaryCard({workspace: w, exact, inModal = false}) {
  const a = w.adjustments;
  return <article className="overview-workspace-card" aria-labelledby={`overview-${w.key}${inModal ? '-modal' : ''}`}>
    {!inModal && <div className="overview-card-share"><CardShareMenu label={w.label} cardKey={w.key} routeBase="#overview" currentParams={{exact: exact ? '1' : ''}}/></div>}
    <p className="fmr-eyebrow">{w.basis}</p><h2 id={`overview-${w.key}${inModal ? '-modal' : ''}`}><a href={w.links.home}>{w.label} →</a></h2>
    <p>{w.scope}</p><p className="overview-grain">Counted unit: {w.grain}.</p>
    <dl className="overview-stage-totals">
      {['nep', 'house'].map(side => <div key={side}><dt>{side === 'nep' ? 'DBM NEP' : 'House GAB'}</dt>
        <dd><Amount value={w.sources[side].amount_php} exact={exact}/><small>{number(w.sources[side].count)} {w.count_unit}
          {w.sources[side].facility_count != null ? ` · ${number(w.sources[side].facility_count)} facility rows` : ''}</small></dd></div>)}
    </dl>
    <div className="overview-populations"><Population workspace={w} kind="insertions" exact={exact}/>
      <Population workspace={w} kind="deletions" exact={exact}/>
      <Population workspace={w} kind="unchanged" exact={exact}/></div>
    <section className="overview-adjustments" aria-label={`${w.label} adjustments`}>
      <h3><a href={w.links.adjustments}>Adjustments · {number(a.count)} {a.count_unit} →</a></h3>
      <dl><div><dt>Increased<small className="overview-subhead">Same Titles, increased budget</small> · {number(a.increased_count)} pairs</dt>
          <dd>NEP to HGAB3 Allocations Worth: <Amount value={a.increased_nep_php} exact={exact}/> → <Amount value={a.increased_house_php} exact={exact}/></dd>
          <small className="overview-base-alloc">Adjustments worth +<Amount value={a.increased_php} exact={exact}/></small></div>
        <div><dt>Decreased<small className="overview-subhead">Same Titles, decreased budget</small> · {number(a.reduced_count)} pairs</dt>
          <dd>NEP to HGAB3 Allocations Worth: <Amount value={a.reduced_nep_php} exact={exact}/> → <Amount value={a.reduced_house_php} exact={exact}/></dd>
          <small className="overview-base-alloc">Adjustments worth −<Amount value={a.reduced_php} exact={exact}/></small></div>
        <div><dt>Net paired movement</dt><dd>Adjustments worth <Amount value={a.net_php} exact={exact} signed/></dd></div></dl>
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
/** Presentation variant of the full SummaryCards grid for modal viewing:
 *  no wrapper id or share menu — CardModal supplies the heading and the
 *  page copy keeps its unique anchors. */
function ModalSummaryGrid({workspaceKeys, data, exact}) {
  return <section aria-label="Budget change summaries">
    <div className="cards overview-workspaces">{workspaceKeys.map(k => <SummaryCard key={k} workspace={data.workspaces.find(w => w.key === k)} exact={exact} inModal/>)}</div>
  </section>;
}
function downloadSummary(data) {
  const url = URL.createObjectURL(new Blob([overviewCsv(data)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'fy2027-overview-summary.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Coverage and candidate-change tables follow the DPWH Highlights pattern:
// every cell states its own counting unit, and figures come only from the
// validated summary payload — never cross-workspace additions.
// Totals row for the candidate-change table: pesos sum exactly because each
// workspace's funding bridge holds (insertions − deletions + paired net +
// scope-review net = House − NEP). Scope review is shown separately below
// the table, never booked back into paired adjustments. Record
// counts, however, add across different grains — allocation records (DPWH),
// project records (FMR and NIA) and funding-column records (HFEP) — so the
// summed counts are record totals, not comparable project counts; the
// footnote states this beside the row.
function changesTotals(workspaces) {
  const sumBy = pick => workspaces.reduce((total, w) => total + pick(w), 0);
  return {
    insertions: {count: sumBy(w => w.insertions.count), amount_php: sumBy(w => w.insertions.amount_php)},
    deletions: {count: sumBy(w => w.deletions.count), amount_php: sumBy(w => w.deletions.amount_php)},
    unchanged: {count: sumBy(w => w.unchanged.count), amount_php: sumBy(w => w.unchanged.amount_php)},
    increased: {count: sumBy(w => w.adjustments.increased_count), nep_php: sumBy(w => w.adjustments.increased_nep_php),
      house_php: sumBy(w => w.adjustments.increased_house_php), php: sumBy(w => w.adjustments.increased_php)},
    reduced: {count: sumBy(w => w.adjustments.reduced_count), nep_php: sumBy(w => w.adjustments.reduced_nep_php),
      house_php: sumBy(w => w.adjustments.reduced_house_php), php: sumBy(w => w.adjustments.reduced_php)},
    house: {count: sumBy(w => w.sources.house.count), amount_php: sumBy(w => w.sources.house.amount_php)},
  };
}
function CoverageTables({data, exact, inModal = false}) {
  const columns = [
    ['nep', 'DBM NEP', w => w.sources.nep, w => w.links.nep],
    ['second', 'HGAB 2nd', w => w.readings.second ?? {count: w.sources.house.count, amount_php: w.sources.house.amount_php}, w => w.links.house_second ?? w.links.house],
    ['third', 'HGAB 3rd', w => w.readings.third ?? {count: w.sources.house.count, amount_php: w.sources.house.amount_php}, w => w.links.house],
  ];
  return <>
    <section className="fmr-section" aria-labelledby={`overview-coverage-heading${inModal ? '-modal' : ''}`}>
      <SectionHeader title="Budget coverage by stage" id="overview-coverage-heading" shareKey="coverage-tables" currentParams={{exact: exact ? '1' : ''}} share={!inModal}/>
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
                <span title={money(value.amount_php)}>Allocations Worth <Amount value={get(w).amount_php} exact/></span></a>;
            })()}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="fmr-muted">DPWH covers operations only; agency controls above operations are excluded here and shown in its card. DPWH retains both readings; each annex workspace retains its 2nd-reading House schedule, whose annex text was verified identical to the 3rd-reading printing — {data.workspaces.filter(w => w.readings?.third?.same_as_second).map(w => `${w.label}: ${w.readings.third.verified_identical_pages} pages`).join(', ')} — so its HGAB 2nd figures also state HGAB 3rd coverage. Unmatched candidates between stages do not make counts comparable as projects.</p>
    </section>
    <section className="fmr-section" aria-labelledby={`overview-changes-heading${inModal ? '-modal' : ''}`}>
      <SectionHeader title="House vs. NEP: candidate changes" id="overview-changes-heading" shareKey="candidate-changes" currentParams={{exact: exact ? '1' : ''}} share={!inModal}/>
      <p>Unsupported insertion and deletion candidates with their allocations, unchanged matched records with equal allocations, and gross movement on paired counterparts. A candidate is a matching observation, not a certified policy change; each workspace's card states its matching basis. Unchanged records are matched House–NEP records with no change in budget allocations. Select a figure to review the underlying records in its workspace.</p>
      <div className="table-scroll" role="region" aria-label="Overview House versus NEP candidate changes" tabIndex={0}>
        <table className="highlights-table highlights-changes overview-changes-table"><caption>Candidate changes · Allocations Worth figures for every group; Increased/Decreased show the pairs' NEP-to-HGAB3 Allocations Worth with the signed total adjustment</caption>
          <thead><tr><th scope="col">Workspace</th>
            <th scope="col">Unsupported insertions<small className="overview-subhead">House Only Records</small></th>
            <th scope="col">Deletions<small className="overview-subhead">NEP Only Records</small></th>
            <th scope="col">Unchanged<small className="overview-subhead">Same NEP-HGAB Titles, no adjustments</small></th>
            <th scope="col">Increased<small className="overview-subhead">Same Titles, increased budget</small></th>
            <th scope="col">Decreased<small className="overview-subhead">Same Titles, decreased budget</small></th>
            <th scope="col">House ledger</th></tr></thead>
          <tbody>{data.workspaces.map(w => <tr key={w.key}>
            <th scope="row"><a href={w.links.home}>{w.label}</a></th>
            {[['insertions', 'House Allocations Worth'], ['deletions', 'NEP Allocations Worth']].map(([key, note]) => <td key={key}>
              <a className="highlights-cell-link" href={w.links[key]} aria-label={`${w.label} ${key === 'insertions' ? 'unsupported insertion' : 'deletion'} candidates`}>
                <strong>{number(w[key].count)} {w.count_unit}</strong>
                <span title={money(w[key].amount_php)}>{note} <Amount value={w[key].amount_php} exact/></span></a></td>)}
            <td><a className="highlights-cell-link" href={w.links.unchanged} aria-label={`${w.label} unchanged pairs`}>
              <strong>{number(w.unchanged.count)} {w.count_unit}</strong>
              <span title={money(w.unchanged.amount_php)}>Unchanged Allocations Worth <Amount value={w.unchanged.amount_php} exact/></span></a></td>
          {[['increases', 'increased_house_php', 'increased_count', 'increased_nep_php'],
            ['decreases', 'reduced_house_php', 'reduced_count', 'reduced_nep_php']].map(([key, houseBase, cnt, nepBase]) => {const delta = key === 'increases' ? w.adjustments.increased_php : -w.adjustments.reduced_php;
            return <td key={key}>
            <a className="highlights-cell-link" href={w.links[key]} aria-label={`${w.label} paired ${key}`}>
              <strong>{number(w.adjustments[cnt])} record pairs</strong>
              <span title={money(w.adjustments[nepBase])}>NEP to HGAB3 Allocations Worth:</span>
              <span title={money(w.adjustments[nepBase])}><Amount value={w.adjustments[nepBase]} exact/> → <Amount value={w.adjustments[houseBase]} exact/></span>
              <span title={money(delta)}>Adjustments worth: <Amount value={delta} exact signed/></span></a></td>;})}
            <td><a className="highlights-cell-link" href={w.links.house}>
              <strong>{number(w.sources.house.count)} {w.count_unit}</strong>
              <span title={money(w.sources.house.amount_php)}>House Allocations Worth <Amount value={w.sources.house.amount_php} exact/></span></a></td>
          </tr>)}</tbody>
          <tfoot><tr className="overview-changes-total">
            <th scope="row">Total<small className="overview-subhead">4 workspaces · summed figures</small></th>
            {(() => {const t = changesTotals(data.workspaces); return <><td key="insertions">
              <span className="highlights-cell-link">
                <strong>{number(t.insertions.count)} records</strong>
                <span title={money(t.insertions.amount_php)}>House Allocations Worth <Amount value={t.insertions.amount_php} exact/></span></span></td>
            <td key="deletions">
              <span className="highlights-cell-link">
                <strong>{number(t.deletions.count)} records</strong>
                <span title={money(t.deletions.amount_php)}>NEP Allocations Worth <Amount value={t.deletions.amount_php} exact/></span></span></td>
            <td key="unchanged">
              <span className="highlights-cell-link">
                <strong>{number(t.unchanged.count)} records</strong>
                <span title={money(t.unchanged.amount_php)}>Unchanged Allocations Worth <Amount value={t.unchanged.amount_php} exact/></span></span></td>
            <td key="increases">
              <span className="highlights-cell-link">
                <strong>{number(t.increased.count)} record pairs</strong>
                <span title={money(t.increased.nep_php)}>NEP to HGAB3 Allocations Worth:</span>
                <span title={money(t.increased.nep_php)}><Amount value={t.increased.nep_php} exact/> → <Amount value={t.increased.house_php} exact/></span>
                <span title={money(t.increased.php)}>Adjustments worth: <Amount value={t.increased.php} exact signed/></span></span></td>
            <td key="decreases">
              <span className="highlights-cell-link">
                <strong>{number(t.reduced.count)} record pairs</strong>
                <span title={money(t.reduced.nep_php)}>NEP to HGAB3 Allocations Worth:</span>
                <span title={money(t.reduced.nep_php)}><Amount value={t.reduced.nep_php} exact/> → <Amount value={t.reduced.house_php} exact/></span>
                <span title={money(t.reduced.php)}>Adjustments worth: <Amount value={t.reduced.php} exact signed/></span></span></td>
            <td key="house">
              <span className="highlights-cell-link">
                <strong>{number(t.house.count)} records</strong>
                <span title={money(t.house.amount_php)}>House Allocations Worth <Amount value={t.house.amount_php} exact/></span></span></td>
          </>;})()}</tr></tfoot>
        </table>
      </div>
      {data.workspaces.filter(w => w.scope_review?.count).map(w => <p key={w.key} className="fmr-notice overview-scope-review">
        <strong>{w.label}: {number(w.scope_review.count)} pairs under scope review.</strong>{' '}
        NEP allocations <Amount value={w.scope_review.nep_php} exact/> → House allocations <Amount value={w.scope_review.house_php} exact/>;
        net <Amount value={w.scope_review.net_php} exact signed/> is held separately from same-project adjustments.{' '}
        <a href={w.key === 'dpwh' ? routeHref('analysis', {view: 'relations', tab: 'overlaps'}, 'dpwh') : w.links.adjustments}>Review segment scope →</a>
      </p>)}
      <p className="fmr-muted">Counts use each workspace's record grain, so they are not comparable across rows. "Allocations Worth" figures are total allocations; "Adjustments worth" figures are signed total adjustments (+/−) within those pairs, never allocations. Adjustments are gross movements within pairs — {data.workspaces.map(w => `${w.label}: ${w.adjustments.count_unit}`).join('; ')}. The DPWH pair counts include region-difference candidates. Unchanged allocations are equal on both stages. HFEP paired column additions/drops sit in its adjustments; its Analysis view displays NEP minus House. The Total row sums the four workspaces; add the separately shown scope-review allocations to reconstruct the full ledgers. Unsupported insertions − deletions + net adjustments + scope-review net equal House − NEP in every workspace. Record counts add across different counting grains, so treat them as record totals, not comparable project counts.</p>
    </section>
  </>;
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
  // Shareable routes: card=<key>, section=<key>, or modal=<key> open that item centered for presentation.
  const targetCard = route.params.get('card'), targetSection = route.params.get('section'), modalTarget = route.params.get('modal');
  useEffect(() => {
    if (!data) return;
    const id = modalTarget ? null : targetCard || targetSection;
    if (!id) return;
    // Section links scroll to the SectionHeader wrapper (section-<key>);
    // card links to the workspace article (overview-<key>).
    const el = document.getElementById(targetSection ? `section-${id}` : `overview-${id}`) || document.getElementById(id);
    el?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, [data, targetCard, targetSection, modalTarget]);
  const closeModal = () => navigate({modal: null});
  const modalWorkspace = data?.workspaces.find(w => w.key === modalTarget);
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
        <p>Explore public works, farm-to-market roads, health facilities and irrigation allocations. Inspect unsupported insertion and deletion candidates, follow paired amount changes, and verify the source records.</p>
        <div className="hero-actions"><button className="primary" onClick={() => document.getElementById('overview-summaries')?.scrollIntoView()}>Explore the summaries ↓</button><ShareLink/>
          <label><input type="checkbox" checked={exact} onChange={e => navigate({exact: e.target.checked ? '1' : null})}/> Show exact pesos</label></div>
        {data && <p className="fmr-muted">Dataset build: {new Intl.DateTimeFormat('en-PH', {dateStyle: 'long', timeZone: 'Asia/Manila'}).format(new Date(data.built_at))} · Changes shown as House minus NEP.</p>}
      </section>
      <p className="fmr-notice">Allocations are budget figures. Unsupported insertions and deletions are provisional candidates: title, scope and OCR differences can prevent matching. Counts use each dataset's declared record grain; each source and workspace keeps its own totals.</p>
      {error ? <section role="alert"><h2>Overview data could not load</h2><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry summary</button>{' '}<a href="#home">Open DPWH</a></section>
        : !data ? <p role="status">Loading validated workspace summaries…</p> : <>
          <section id="overview-summaries" aria-label="Budget change summaries">
            <SectionHeader title="Unsupported insertions, deletions, unchanged records and adjustments" id="overview-summaries-head" shareKey="summaries" currentParams={{exact: exact ? '1' : ''}}/>
            <div className="cards overview-workspaces">{data.workspaces.map(w => <SummaryCard key={w.key} workspace={w} exact={exact}/>)}</div></section>
          <section className="fmr-section" aria-labelledby="overview-funding-heading">
            <SectionHeader title="Source funding snapshot" id="overview-funding-heading" shareKey="funding" currentParams={{exact: exact ? '1' : ''}}/>
            <p>Ledger totals use the same records as the summaries. DPWH covers operations; HFEP excludes MOOE. Printed controls and their coverage are available in each card.</p>
            <SortableTable tableId="main-overview-funding" rows={rows} ariaLabel="Overview source funding snapshot" sort={sort}
              onSortChange={update => {const next = typeof update === 'function' ? update(sort) : update; navigate({sort: next?.key, dir: next?.direction});}} columns={[
                {key: 'label', label: 'Workspace', scope: 'row', render: w => <a href={w.links.home}>{w.label}<small>{w.count_unit}</small></a>},
                {key: 'nep_count', label: 'NEP records', band: 'records', bandLabel: 'Records', align: 'num', render: w => number(w.nep_count)},
                {key: 'house_count', label: 'House records', band: 'records', bandLabel: 'Records', align: 'num', render: w => number(w.house_count)},
                {key: 'nep_php', label: 'NEP ledger (PHP)', band: 'allocations', bandLabel: 'Allocations', divider: true, align: 'num', render: w => <Amount value={w.nep_php} exact={exact}/>},
                {key: 'house_php', label: 'House ledger (PHP)', band: 'allocations', bandLabel: 'Allocations', align: 'num', render: w => <Amount value={w.house_php} exact={exact}/>},
                {key: 'delta_php', label: 'House − NEP (PHP)', band: 'allocations', bandLabel: 'Allocations', align: 'num', render: w => <Amount value={w.delta_php} exact={exact} signed/>},
              ]}/><button onClick={() => downloadSummary(data)}>Export overview CSV</button>{' '}<a href={siteUrl('analysis/main_overview_2027.json')} download>Download summary JSON</a></section>
          <section className="fmr-section" aria-labelledby="overview-findings-heading">
            <SectionHeader title="Selected findings" id="overview-findings-heading" shareKey="findings" currentParams={{exact: exact ? '1' : ''}}/>
            <div className="cards overview-findings">{data.features.map(f => <article key={f.key}>
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
    </main>
    {/* Modal presentations: bigger dialog width, cards shrink gracefully
        inside. Gated on data so shared modal URLs survive a cold load. */}
    {data && modalTarget === 'summaries' && <CardModal cardKey="summaries" active label="Unsupported insertions, deletions, unchanged records and adjustments" onClose={closeModal}>
      <ModalSummaryGrid workspaceKeys={data.workspaces.map(w => w.key)} data={data} exact={exact}/>
      <p className="fmr-muted">Single-section presentation view. <a href="#overview">Return to full overview →</a></p>
    </CardModal>}
    {data && modalTarget === 'funding' && <CardModal cardKey="funding" active label="Source funding snapshot" onClose={closeModal}>
      <div className="fmr-section">
        <p>Ledger totals use the same records as the summaries. DPWH covers operations; HFEP excludes MOOE.</p>
        <SortableTable tableId="modal-funding" rows={rows} ariaLabel="Source funding snapshot" sort={sort} columns={[
          {key: 'label', label: 'Workspace', scope: 'row', render: w => <span>{w.label}</span>},
          {key: 'nep_count', label: 'NEP records', align: 'num', render: w => number(w.nep_count)},
          {key: 'house_count', label: 'House records', align: 'num', render: w => number(w.house_count)},
          {key: 'nep_php', label: 'NEP ledger (PHP)', align: 'num', render: w => <Amount value={w.nep_php} exact={exact}/>},
          {key: 'house_php', label: 'House ledger (PHP)', align: 'num', render: w => <Amount value={w.house_php} exact={exact}/>},
          {key: 'delta_php', label: 'House − NEP (PHP)', align: 'num', render: w => <Amount value={w.delta_php} exact={exact} signed/>},
        ]}/>
        <p><a href="#overview">Return to full overview →</a></p>
      </div>
    </CardModal>}
    {data && modalTarget === 'findings' && <CardModal cardKey="findings" active label="Selected findings" onClose={closeModal}>
      <div className="fmr-section">
        <div className="cards overview-findings">{data.features.map(f => <article key={f.key}>
          <p className="fmr-eyebrow">{data.workspaces.find(w => w.key === f.key)?.label}</p><h3>{f.title}</h3>
          <strong>{f.count != null ? `${number(f.count)} candidates · ` : ''}<Amount value={f.amount_php} exact={exact}/></strong>
          <p>{f.detail}</p><a href={f.href}>Inspect supporting analysis →</a></article>)}</div>
        <p><a href="#overview">Return to full overview →</a></p>
      </div>
    </CardModal>}
    {data && modalTarget === 'coverage-tables' && <CardModal cardKey="coverage-tables" active label="Budget coverage by stage" onClose={closeModal}>
      <CoverageTables data={data} exact={exact} inModal/>
      <p><a href="#overview">Return to full overview →</a></p>
    </CardModal>}
    {data && modalTarget === 'candidate-changes' && <CardModal cardKey="candidate-changes" active label="House vs. NEP: candidate changes" onClose={closeModal}>
      <section className="fmr-section">
        <div className="table-scroll" role="region" aria-label="Candidate changes" tabIndex={0}>
          <table className="highlights-table highlights-changes overview-changes-table"><caption>Candidate changes · Allocations Worth figures</caption>
            <thead><tr><th scope="col">Workspace</th>
              <th scope="col">Unsupported insertions</th><th scope="col">Deletions</th><th scope="col">Unchanged</th>
              <th scope="col">Increased</th><th scope="col">Decreased</th><th scope="col">House ledger</th></tr></thead>
            <tbody>{data.workspaces.map(w => <tr key={w.key}>
              <th scope="row">{w.label}</th>
              {[['insertions','House Allocations Worth'],['deletions','NEP Allocations Worth']].map(([key,note]) => <td key={key}>
                <strong>{number(w[key].count)} {w.count_unit}</strong><br/><span title={money(w[key].amount_php)}>{note}: <Amount value={w[key].amount_php} exact/></span></td>)}
              <td><strong>{number(w.unchanged.count)} {w.count_unit}</strong><br/><span title={money(w.unchanged.amount_php)}>Unchanged Allocations Worth: <Amount value={w.unchanged.amount_php} exact/></span></td>
              {[['increases','increased_house_php','increased_count','increased_nep_php'],
                ['decreases','reduced_house_php','reduced_count','reduced_nep_php']].map(([key,houseBase,cnt,nepBase]) => {const delta = key === 'increases' ? w.adjustments.increased_php : -w.adjustments.reduced_php;
                return <td key={key}>
                <strong>{number(w.adjustments[cnt])} record pairs</strong><br/>
                <span title={money(w.adjustments[nepBase])}>NEP to HGAB3 Allocations Worth:</span><br/>
                <span title={money(w.adjustments[nepBase])}><Amount value={w.adjustments[nepBase]} exact/> → <Amount value={w.adjustments[houseBase]} exact/></span><br/>
                <span title={money(delta)}>Adjustments worth: <Amount value={delta} exact signed/></span></td>;})}
              <td><strong>{number(w.sources.house.count)} {w.count_unit}</strong><br/><span title={money(w.sources.house.amount_php)}>House Allocations Worth: <Amount value={w.sources.house.amount_php} exact/></span></td>
            </tr>)}</tbody>
            <tfoot><tr>
              <th scope="row">Total<small className="overview-subhead">4 workspaces</small></th>
              {(() => {const t = changesTotals(data.workspaces); return <>
                <td><strong>{number(t.insertions.count)} records</strong><br/><span title={money(t.insertions.amount_php)}>House Allocations Worth: <Amount value={t.insertions.amount_php} exact/></span></td>
                <td><strong>{number(t.deletions.count)} records</strong><br/><span title={money(t.deletions.amount_php)}>NEP Allocations Worth: <Amount value={t.deletions.amount_php} exact/></span></td>
                <td><strong>{number(t.unchanged.count)} records</strong><br/><span title={money(t.unchanged.amount_php)}>Unchanged Allocations Worth: <Amount value={t.unchanged.amount_php} exact/></span></td>
                <td><strong>{number(t.increased.count)} record pairs</strong><br/>
                  <span title={money(t.increased.nep_php)}>NEP to HGAB3 Allocations Worth:</span><br/>
                  <span title={money(t.increased.nep_php)}><Amount value={t.increased.nep_php} exact/> → <Amount value={t.increased.house_php} exact/></span><br/>
                  <span title={money(t.increased.php)}>Adjustments worth: <Amount value={t.increased.php} exact signed/></span></td>
                <td><strong>{number(t.reduced.count)} record pairs</strong><br/>
                  <span title={money(t.reduced.nep_php)}>NEP to HGAB3 Allocations Worth:</span><br/>
                  <span title={money(t.reduced.nep_php)}><Amount value={t.reduced.nep_php} exact/> → <Amount value={t.reduced.house_php} exact/></span><br/>
                  <span title={money(t.reduced.php)}>Adjustments worth: <Amount value={t.reduced.php} exact signed/></span></td>
                <td><strong>{number(t.house.count)} records</strong><br/><span title={money(t.house.amount_php)}>House Allocations Worth: <Amount value={t.house.amount_php} exact/></span></td>
              </>;})()}</tr></tfoot>
          </table>
        </div>
        <p className="fmr-muted">Totals sum the four workspaces. Allocation pesos reconcile exactly; record counts add across different counting grains.</p>
        <p><a href="#overview">Return to full overview →</a></p>
      </section>
    </CardModal>}
    {/* Legacy single-card presentation still exists. */}
    {modalWorkspace && <CardModal cardKey={modalWorkspace.key} active label={`${modalWorkspace.label} budget change summary`} onClose={closeModal}>
      <div className="overview-workspace-card modal-card" aria-label={`${modalWorkspace.label} summary`}>
        <SummaryCard workspace={modalWorkspace} exact={exact} inModal/>
        <p className="fmr-muted">Single-card presentation view of the Main Overview. <a href="#overview">Return to full overview →</a></p>
      </div>
    </CardModal>}
    <footer className="shell fmr-footer"><span>FY2027 · Budget Workbenches</span><a href={repo + 'README.md'}>Repository and source guides</a></footer></>;
}
