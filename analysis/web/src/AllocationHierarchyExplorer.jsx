import React, {useEffect, useState} from 'react';
import {loadData} from './data.js';
import AllocationHierarchySankey from './DpwhHierarchySankey.jsx';
import {hierarchyView} from './allocationHierarchy.js';

export function selectHierarchySource(catalog, params) {
  return catalog.sources.find(s => s.dataset.key === params.get('dataset')) || catalog.sources[0];
}

export default function AllocationHierarchyExplorer({route, stage, exact}) {
  const [catalog, setCatalog] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadData('allocation_hierarchy_sources_2027.json', controller.signal).then(data => {
      if (data.schema_version !== 1 || !data.sources?.length) throw new Error('Unsupported hierarchy-source catalog.');
      setCatalog(data);
    }).catch(e => {if (e.name !== 'AbortError') setError(e.message);});
    return () => controller.abort();
  }, [attempt]);
  if (error) return <section className="fmr-section" role="alert"><h2>Hierarchy sources could not load</h2><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></section>;
  if (!catalog) return <p role="status">Loading allocation hierarchy sources…</p>;
  const {dataset, hierarchies} = selectHierarchySource(catalog, route.params);
  const hierarchy = hierarchies[stage], view = hierarchyView(hierarchy, route.params);
  const label = stage === 'hgab3' ? 'HGAB3' : 'NEP';
  const path = [label, ...view.levels.filter(l => l.column <= view.lastColumn).map(l => l.label)].join(' → ');
  const changeDataset = key => {
    const params = new URLSearchParams(route.params);
    for (const source of catalog.sources) for (const tree of Object.values(source.hierarchies))
      for (const level of tree.levels) params.delete(level.key);
    params.delete('through');
    params.delete('top');
    params.delete('order');
    if (key === 'dpwh') params.delete('dataset'); else params.set('dataset', key);
    params.set('tab', stage);
    window.location.hash = `experiments?${params}`;
  };
  return <section className="fmr-section" aria-labelledby={`experiments-${stage}-heading`}>
    <h2 id={`experiments-${stage}-heading`}>{dataset.label} · {path}</h2>
    <p>Follow {label}{stage === 'hgab3' ? ' (House 3rd reading)' : ''} allocations using this dataset’s recorded hierarchy. Choose the final stage and use its filters to inspect smaller branches. {dataset.scope}</p>
    <AllocationHierarchySankey key={`${dataset.key}:${stage}`} hierarchy={hierarchy} dataset={dataset}
      datasets={catalog.sources.map(s => s.dataset)} onDatasetChange={changeDataset} exact={exact} route={route} stage={stage}/>
  </section>;
}
