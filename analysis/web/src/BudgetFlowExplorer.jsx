import React, {useEffect, useState} from 'react';
import {loadData} from './data.js';
import BudgetCategoryFlow from './BudgetCategoryFlow.jsx';

export function selectFlowSource(catalog, params) {
  const payload = catalog.sources.find(s => s.dataset.key === params.get('dataset')) || catalog.sources[0];
  const groupingKey = Object.hasOwn(payload.groupings, params.get('intermediary')) ? params.get('intermediary') : payload.dataset.defaultGrouping;
  return {payload, groupingKey};
}

export default function BudgetFlowExplorer({route, exact, workspaces}) {
  const [catalog, setCatalog] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadData('budget_flow_sources_2027.json', controller.signal).then(data => {
      if (data.schema_version !== 1 || !data.sources?.length) throw new Error('Unsupported flow-source catalog.');
      setCatalog(data);
    }).catch(error => {if (error.name !== 'AbortError') setError(error.message);});
    return () => controller.abort();
  }, [attempt]);
  if (error) return <section className="fmr-section" role="alert"><h2>Budget flow sources could not load</h2><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></section>;
  if (!catalog) return <p role="status">Loading budget flow sources…</p>;
  const {payload, groupingKey} = selectFlowSource(catalog, route.params);
  const dataset = payload.dataset, grouping = payload.groupings[groupingKey];
  const changeSource = (sourceKey, intermediaryKey) => {
    const params = new URLSearchParams(route.params);
    for (const key of ['group', 'revision', 'category']) params.delete(key);
    if (sourceKey === 'dpwh') params.delete('dataset'); else params.set('dataset', sourceKey);
    const source = catalog.sources.find(s => s.dataset.key === sourceKey);
    const key = intermediaryKey || source.dataset.defaultGrouping;
    if (key === source.dataset.defaultGrouping) params.delete('intermediary'); else params.set('intermediary', key);
    window.location.hash = `experiments?${params}`;
  };
  return <section className="fmr-section" aria-labelledby="experiments-budget-heading">
    <h2 id="experiments-budget-heading">{dataset.label} · five-stage budget flow</h2>
    <p>NEP total → {grouping.plural} at NEP values → revision cells within each group → {grouping.plural} at HGAB values → HGAB total. {dataset.scope}</p>
    <div className="budget-flow-toolbar" data-image-export-omit>
      <label className="budget-flow-group-select">Dataset source <select aria-label="Dataset source" value={dataset.key} onChange={event => changeSource(event.target.value)}>
        {catalog.sources.map(s => <option key={s.dataset.key} value={s.dataset.key}>{s.dataset.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select">Intermediary source <select aria-label="Intermediary source" value={groupingKey} onChange={event => changeSource(dataset.key, event.target.value)}>
        {Object.values(payload.groupings).map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select></label>
    </div>
    <BudgetCategoryFlow key={`${dataset.key}:${groupingKey}`} payload={payload} groupingKey={groupingKey} exact={exact} route={route}
      workspace={workspaces.find(w => w.key === dataset.key)}/>
  </section>;
}
