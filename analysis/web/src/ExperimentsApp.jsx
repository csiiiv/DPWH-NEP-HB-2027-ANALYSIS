import React, { useEffect, useMemo, useState } from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import {loadData} from './data.js';
import {readRoute} from './routes.js';
import {validateOverview} from './mainOverviewModel.js';
import {money} from './fmrModel.js';
import FlowSankey from './FlowSankey.jsx';
import DpwhAlluvial from './DpwhAlluvial.jsx';
import RevisionFlowDiagram from './RevisionFlowDiagram.jsx';
import {buildFlowFromGrouping} from './flowFromGrouping.js';
import {categoryRecordHref} from './budgetFlowModel.js';
import BudgetFlowExplorer from './BudgetFlowExplorer.jsx';
import AllocationHierarchyExplorer from './AllocationHierarchyExplorer.jsx';
import BarComparisonExplorer from './BarComparisonExplorer.jsx';
import {layoutPapFlow} from './papFlowLayout.js';
import './Fmr.css';
import './MainOverview.css';

// Experiments: unlisted exploration views reached only via #experiments.
// Nothing here is part of the published reading surface — charts and
// prototypes land first, get reviewed by direct link, then either move into
// a listed workspace or get deleted. Data still comes from the same
// validated Overview payload, so figures remain reproducible. Each
// experiment lives on its own tab (?tab=…) so a figure under review is
// directly linkable.
const TABS = [
  {key: 'stages', label: '3-stage alluvial', render: renderStages},
  {key: 'pap', label: '5-stage category alluvial', render: renderPap},
  {key: 'flows', label: 'Allocation flows', render: renderFlows},
  {key: 'budget', label: 'Budget flow', render: renderBudget},
  {key: 'bars', label: 'Bar chart comparison', render: renderBars},
  {key: 'nep', label: 'NEP → Category → PAP', render: renderNep},
  {key: 'hgab3', label: 'HGAB3 → Category → PAP', render: renderHgab3},
];

// The generic flow builder is domain-neutral: it knows before/after values and
// a revision vocabulary, never NEP, HGAB or categories. Supplying a grouping
// key and this vocabulary is all DPWH adds; the formatters stay DPWH-side too.
// Swapping `grouping` for a region/DEO/PAP contract — and relabeling — reuses
// the same figure unchanged. Module-level so the identity is stable and the
// layout memo does not rebuild.
// Flow figures use their own compact format: 3 decimal places everywhere
// (₱572.924B), tighter than the 4-decimal workbench convention.
const flowMoney = value => value == null ? '—'
  : Math.abs(value) >= 1e9 ? `₱${(value / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 3})}B`
  : Math.abs(value) >= 1e6 ? `₱${(value / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M`
  : money(value);
const CATEGORY_FLOW_OPTIONS = {grouping: 'category', id: 'dpwh',
  labels: {before: 'DBM NEP', after: 'HGAB', intermediaryBefore: 'Category · NEP',
    intermediaryAfter: 'Category · HGAB', matrix: 'Revision cells',
    additions: 'New House money', reductions: 'House Reductions', count: 'comparison rows'},
  recordHref: categoryRecordHref};

function renderNep({exact, route}) {
  return <AllocationHierarchyExplorer exact={exact} route={route} stage="nep"/>;
}

function renderHgab3({exact, route}) {
  return <AllocationHierarchyExplorer exact={exact} route={route} stage="hgab3"/>;
}

function renderBudget({exact, data, route}) {
  return <BudgetFlowExplorer exact={exact} route={route} workspaces={data.workspaces}/>;
}

function renderBars({exact, route}) {
  return <BarComparisonExplorer exact={exact} route={route}/>;
}

function renderStages({flow, exact}) {
  return <section className="fmr-section" aria-labelledby="experiments-flow-heading">
    <h2 id="experiments-flow-heading">DPWH · three-stage membership alluvial</h2>
    <p>Every comparison row participates in up to three printed stages. Ribbons carry row counts across the NEP, HGAB 2nd reading and HGAB 3rd reading axes; amounts ride along as node totals. The 2nd↔3rd reading change is five rows (₱134M) — the verified annex identity — while NEP↔House differences dominate.</p>
    {flow?.error ? <p role="alert">Flow payload unavailable: {flow.error}. Run <code>node analysis/web/buildDpwhFlow.mjs</code>.</p>
      : flow ? <DpwhAlluvial payload={flow} exact={exact}/>
      : <p role="status">Loading three-stage flow…</p>}
    {flow && !flow.error && <p className="fmr-muted">Strata rebuild each stage ledger exactly — NEP {money(flow.stages.nep.amount_php)}, HGAB2 {money(flow.stages.second.amount_php)}, HGAB3 {money(flow.stages.third.amount_php)}. Row grain is comparison candidates; grouped members are not expanded here.</p>}
  </section>;
}

function renderPap({flow, exact}) {
  // The 5-stage figure drawn through the shared generic engine: the payload's
  // category grouping contract is adapted (flowFromGrouping) into the
  // domain-neutral revision-flow model, then rendered by the same
  // RevisionFlowDiagram the Budget flow tab uses. A region/DEO/PAP contract
  // renders here unchanged once those identities exist in the payload.
  return <section className="fmr-section" aria-labelledby="experiments-pap-heading">
    <h2 id="experiments-pap-heading">DPWH · category-scoped revision flow</h2>
    <p>The planning document's five-stage structure with categories as the intermediate level: DBM NEP → category groups at NEP values → each category's own five-cell revision matrix → category groups at HGAB values → HGAB. The Allocation flows grammar runs recursively per category, so new House money enters through floating stubs and every category keeps its own House Reductions sink instead of one shared pool.</p>
    <CategoryFlowFigure flow={flow} exact={exact}/>
    {flow && !flow.error && <p className="fmr-muted">Stage-C cells rebuild both ledgers — NEP {money(flow.stages.nep.amount_php)} and HGAB {money(flow.stages.third.amount_php)} over {flow.totals.rows.toLocaleString('en-PH')} comparison rows ({flow.groupings.category.groups.length} category groups). Column C blocks follow Column B's order and keep the workspace class order (deletion → insertion → increased → unchanged → reduced) inside each block. Insertions enter as new House money; deletions end at stage C. Row grain is comparison candidates.</p>}
  </section>;
}

function CategoryFlowFigure({flow, exact}) {
  const model = useMemo(() => {
    if (!flow || flow.error) return null;
    try {return buildFlowFromGrouping(flow, CATEGORY_FLOW_OPTIONS);}
    catch (error) {return {error: error.message};}
  }, [flow]);
  const layout = useMemo(() => model && !model.error ? layoutPapFlow(model) : null, [model]);
  if (flow?.error) return <p role="alert">Category flow payload unavailable: {flow.error}. Run <code>node analysis/web/buildDpwhFlow.mjs</code>.</p>;
  if (!model) return <p role="status">Loading category revision flow…</p>;
  if (model.error) return <p role="alert">Category flow unavailable: {model.error}</p>;
  return <div className="category-flow"><RevisionFlowDiagram model={model} layout={layout}
    title="DPWH · NEP → Category → Revisions → Category → HGAB"
    captionDetail={` · ${flow.totals.rows.toLocaleString('en-PH')} comparison rows · PHP`}
    formatValue={exact ? money : flowMoney} formatExact={money}
    footer={[`Source: retained FY2027 DBM NEP and HGAB 3rd reading · ${model.groups.length} category groups (FAPs separated from program groups)`,
      'New money enters through floating stubs. Gross cuts end in per-category House Reductions. Deletions end at C. Zero-value cells omitted.']}/></div>;
}

function renderFlows({data, exact}) {
  return <section className="fmr-section" aria-labelledby="experiments-sankey-heading">
    <h2 id="experiments-sankey-heading">Allocation flow: NEP to House</h2>
    <p>How each workspace's NEP ledger flows through the five groups into its House ledger. Ribbon thickness is Allocations Worth; the gross increase stub into Increased and the House Reductions side-flow are gross adjustments on paired titles. Select a ribbon or group to inspect its records in its workspace.</p>
    <div className="flow-sankeys">{data.workspaces.map(w => <FlowSankey key={w.key} workspace={w} exact={exact}/>)}</div>
    <p className="fmr-muted">Flows conserve every ledger exactly — the same invariants the Overview tables enforce. Deletions and House reductions end outside the House ledger by definition. Each workspace keeps its own record grain and matching basis.</p>
  </section>;
}

export default function ExperimentsApp() {
  const [route, setRoute] = useState(() => readRoute());
  useEffect(() => {const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update);}, []);
  const tab = TABS.some(t => t.key === route.params.get('tab')) ? route.params.get('tab') : 'stages';
  const [data, setData] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [exact, setExact] = useState(false);
  const [flow, setFlow] = useState(null);
  useEffect(() => {document.title = `Experiments · ${TABS.find(t => t.key === tab).label} · FY2027 Budget Workbenches`;}, [tab]);
  useEffect(() => {const controller = new AbortController(); setError('');
    loadData('main_overview_2027.json', controller.signal).then(validateOverview).then(setData)
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);}); return () => controller.abort();}, [attempt]);
  useEffect(() => {if (!['stages', 'pap'].includes(tab) || flow && !flow.error) return;
    const controller = new AbortController();
    loadData('dpwh_flow_2027.json', controller.signal).then(setFlow)
      .catch(e => {if (e.name !== 'AbortError') setFlow({error: e.message});}); return () => controller.abort();}, [attempt, tab]);
  const active = TABS.find(t => t.key === tab);
  return <>
    <WorkbenchHeader workspace="experiments" route="home"/>
    <main className="shell fmr-main main-overview">
      <section className="hero">
        <p className="eyebrow">FY2027 · experiments</p>
        <h1>Experiments</h1>
        <p>Exploration views built on the same validated budget payloads. This page is unlisted: it never appears in the workspace navigation and is reached only by its direct link. Charts here are candidates, not published reading surfaces.</p>
        <div className="hero-actions">
          <label><input type="checkbox" checked={exact} onChange={e => setExact(e.target.checked)}/> Show exact pesos</label>
        </div>
      </section>
      <nav className="experiments-tabs" aria-label="Experiments views">
        {TABS.map(t => <a key={t.key} href={`#experiments?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>{t.label}</a>)}
      </nav>
      {error ? <section role="alert"><h2>Experiment data could not load</h2><p>{error}</p>
          <button onClick={() => setAttempt(n => n + 1)}>Retry</button>{' '}<a href="#overview">Open Overview</a></section>
        : !data ? <p role="status">Loading validated workspace summaries…</p>
        : active.render({data, flow, exact, route})}
    </main>
  </>;
}
