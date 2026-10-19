import React, {useEffect, useMemo, useRef, useState} from 'react';
import {buildAllocationGraph, hierarchyOrders, hierarchyView} from './allocationHierarchy.js';
import {layoutAllocationHierarchy, wrapHierarchyLabel} from './hierarchyLayout.js';
import {money, compactMoney} from './fmrModel.js';
import {hierarchySectionSvg, hierarchySectionPng, saveHierarchyImage} from './hierarchyImage.js';
import './DpwhNepSankey.css';

// Shared renderer: the source catalog supplies its own levels and vocabulary.
export default function AllocationHierarchySankey({hierarchy, dataset, datasets, onDatasetChange, exact = false, stage = 'nep', route}) {
  const label = stage === 'hgab3' ? 'HGAB3' : 'NEP';
  const sourceName = stage === 'hgab3' ? 'HGAB3' : 'DBM NEP';
  const captionId = `allocation-hierarchy-${dataset.key}-${stage}-caption`;
  const params = route?.params ?? new URLSearchParams();
  const view = useMemo(() => hierarchyView(hierarchy, params), [hierarchy, route]);
  const {hierarchy: active, order, levels, endAt, lastColumn, filters, top, options} = view;
  const graph = useMemo(() => buildAllocationGraph(active, stage, view), [active, stage, view]);
  const layout = useMemo(() => layoutAllocationHierarchy(graph), [graph]);
  const orders = useMemo(() => hierarchyOrders(hierarchy), [hierarchy]);
  const orderLabels = {category: 'Category', pap: 'PAP', region: 'Region', deo: 'DEO', program: 'Program',
    subprogram: 'Sub-program', subcategory: 'Subcategory', province: 'Province',
    facility: 'Facility', component: 'Component', project: 'Project'};
  const orderLabel = keys => keys.map(k => orderLabels[k] || k[0].toUpperCase() + k.slice(1)).join(' → ');
  const scroll = useRef(null);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  useEffect(() => {
    const el = scroll.current;
    if (!el || !layout) return;
    const nodeX = layout.columnX.get(lastColumn) / layout.svgWidth * el.querySelector('svg').getBoundingClientRect().width;
    el.scrollTo({top: 0, left: lastColumn >= 3 ? Math.min(el.scrollWidth - el.clientWidth, Math.max(0, nodeX - 24)) : 0});
  }, [layout, lastColumn]);
  const setView = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      const level = levels.find(s => s.key === key);
      if (level) for (const child of levels.filter(s => s.column > level.column)) next.delete(child.key);
      if (!value || (key === 'through' && value === (active.defaultEnd || 'pap'))) next.delete(key);
      else next.set(key, value);
      if (key === 'through' && value) {
        const last = levels.find(s => s.key === value).column;
        for (const hidden of levels.filter(s => s.column > last)) next.delete(hidden.key);
      }
    }
    next.set('tab', stage);
    window.location.hash = `experiments?${next}`;
  };
  const format = exact ? money : compactMoney;
  const visibleLevels = levels.filter(s => s.column <= lastColumn);
  const axes = [{label: sourceName, column: 0}, ...visibleLevels];
  const pathLabel = axes.map(s => s.label).join(' → ');
  const filterLevels = visibleLevels.filter(s => s.filter !== false);
  const scope = filterLevels.map(level => {
    const title = level.filterLabel.replace(/^Focus /, '');
    const value = options[level.key].find(o => o.id === filters[level.key])?.label || level.allLabel;
    return `${title[0].toUpperCase()}${title.slice(1)}: ${value}`;
  }).join(' · ');
  const note = [`${label} allocations from the retained ${dataset.label} ledger.`, dataset.scope, dataset.notes,
    stage === 'hgab3' ? dataset.house_note : ''].filter(Boolean).join(' ');
  const branchCount = level => `${graph.counts[level.column]} ${graph.counts[level.column] === 1 ? level.singular : level.plural}`;
  const scopeNote = top ? `Top ${top} branches per group + ${graph.others}` : '';
  const orderNote = order ? `Grouped ${orderLabel(order)}` : '';
  const download = async format => {
    setExportError(''); setExporting(true);
    try {
      const section = hierarchySectionSvg(scroll.current?.querySelector('svg'), {
        title: `FY2027 · ${dataset.label} ${label} allocation hierarchy`, path: pathLabel, scope,
        summary: [`Allocation: ${money(graph.total)}`, orderNote, scopeNote, ...visibleLevels.map(branchCount)].filter(Boolean).join(' · '),
        axes: axes.map(axis => ({label: axis.label, x: layout.columnX.get(axis.column)})), note,
      });
      const blob = format === 'png' ? await hierarchySectionPng(section) : section.blob;
      saveHierarchyImage(blob, `${dataset.key}-2027-${stage}-allocation-hierarchy-through-${endAt}${order ? '-reordered' : ''}${Object.keys(filters).length ? '-filtered' : ''}${top ? `-top${top}` : ''}.${format}`);
    } catch (error) {setExportError(error.message);} finally {setExporting(false);}
  };
  return <div className="nep-hierarchy" data-dataset={dataset.key} data-stage={stage} data-through={endAt} data-top={top || 'all'} data-order={order ? order.join(',') : 'native'}>
    <div className="nep-hierarchy-toolbar">
      <label>Dataset source <select aria-label="Dataset source" value={dataset.key} onChange={e => onDatasetChange(e.target.value)}>
        {datasets.map(source => <option key={source.key} value={source.key}>{source.label}</option>)}
      </select></label>
      <label>Display through <select aria-label="Display through" value={endAt} onChange={e => setView({through: e.target.value})}>
        {levels.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select></label>
      <label>Drill-down order <select aria-label="Drill-down order" value={order ? order.join(',') : ''}
        onChange={e => setView({order: e.target.value, through: '', top: '', ...Object.fromEntries(levels.map(l => [l.key, '']))})}>
        <option value="">{orderLabel(levels.map(l => l.key))} (native)</option>
        {orders.map(keys => <option key={keys.join(',')} value={keys.join(',')}>{orderLabel(keys)}</option>)}
      </select></label>
      <label>Top branches <select aria-label="Top branches" value={top || ''} onChange={e => setView({top: e.target.value})}>
        <option value="">All branches</option>
        {[1, 3, 5, 10, 15, 20].map(n => <option key={n} value={n}>Top {n} + Others</option>)}
      </select></label>
      {filterLevels.map(level => <label key={level.key}>{level.filterLabel} <select aria-label={level.filterLabel}
        value={filters[level.key] || ''} onChange={e => setView({[level.key]: e.target.value})}>
        <option value="">{level.allLabel}</option>
        {options[level.key].map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select></label>)}
      <p aria-live="polite"><strong>{format(graph.total)}</strong>{visibleLevels.map(level => <React.Fragment key={level.key}> · {branchCount(level)}</React.Fragment>)}</p>
    </div>
    {(lastColumn >= 3 || graph.counts.some(count => count > 40)) && <p className="fmr-muted">Narrow the available filters to inspect a smaller branch. Scroll horizontally for later stages and vertically for more groups.</p>}
    {top && layout && <p className="fmr-muted">Compact view: only the {top} largest {top === 1 ? 'branch' : 'branches'} under each group are drawn; the rest fold into one “{graph.others}” block per parent. Hover for exact amounts.</p>}
    {!layout ? <p role="status">No positive {label} allocations in this selection.</p> : <figure className="nep-hierarchy-figure" aria-labelledby={captionId}>
      <figcaption id={captionId}>
        <div className="nep-hierarchy-caption">{dataset.label} {label} allocation hierarchy <span>{pathLabel}</span><span>Ribbon width represents {label} pesos. Hover a ribbon or block for its exact allocation.</span></div>
        <div className="nep-hierarchy-exports" data-image-export-omit>
          <button onClick={() => download('png')} disabled={exporting}>Download section PNG</button>
          <button onClick={() => download('svg')} disabled={exporting}>Download SVG</button>
          {exporting && <span role="status">Preparing image…</span>}
        </div>
        {exportError && <p className="nep-hierarchy-export-error" role="alert">{exportError}</p>}
      </figcaption>
      <div ref={scroll} className="nep-hierarchy-scroll" style={{'--hierarchy-width': `${layout.minWidth}px`}} role="region" aria-label={`${label} allocation Sankey through ${axes.at(-1).label}`} tabIndex={0}>
        <div className="nep-hierarchy-axes" aria-hidden="true">{axes.map(axis => <span key={axis.column} style={{left: `${layout.columnX.get(axis.column) / layout.svgWidth * 100}%`}}>{axis.label}</span>)}</div>
        <svg viewBox={`0 0 ${layout.svgWidth} ${layout.height}`} role="img" aria-label={`${dataset.label} ${label} ${money(graph.total)}: ${pathLabel}`}>
          {layout.links.map(link => <path key={`${link.source}:${link.target}`} className="nep-hierarchy-link" d={link.d} fill={link.color} fillOpacity=".3" data-value={link.value}>
            <title>{link.sourceName} → {link.targetName}: {money(link.value)}</title>
          </path>)}
          {layout.nodes.map(node => {
            const slot = layout.labelSlots.get(node.key);
            const lines = wrapHierarchyLabel(node.name, node.column === 1 ? 38 : 51);
            const y = node.column === 0 ? node.y0 + 20 : slot.y;
            const x = node.x1 + 10;
            return <g key={node.key} className="nep-hierarchy-node" data-column={node.column} data-value={node.value}>
              <title>{node.parent ? `${node.parent} → ` : ''}{node.name}: {money(node.value)}</title>
              <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={node.y1 - node.y0} fill={node.color} rx="2"/>
              <text x={x} y={y} className="nep-hierarchy-label">
                {lines.map((line, i) => <tspan key={i} x={x} dy={i ? 15 : 0}>{line}</tspan>)}
                <tspan x={x} dy="17" className="nep-hierarchy-amount">{format(node.value)}</tspan>
              </text>
            </g>;
          })}
        </svg>
      </div>
    </figure>}
    <p className="fmr-muted">{note}</p>
  </div>;
}
