import React, {useEffect, useMemo, useRef, useState} from 'react';
import {allocationHierarchyGraph, hierarchyFilterOptions, HIERARCHY_STAGES} from './nepHierarchy.js';
import {layoutAllocationHierarchy, wrapHierarchyLabel} from './hierarchyLayout.js';
import {money, compactMoney} from './fmrModel.js';
import {hierarchySectionSvg, hierarchySectionPng, saveHierarchyImage} from './hierarchyImage.js';
import './DpwhNepSankey.css';

export default function DpwhHierarchySankey({hierarchy, exact = false, stage = 'nep', route}) {
  const label = stage === 'hgab3' ? 'HGAB3' : 'NEP';
  const sourceName = stage === 'hgab3' ? 'HGAB3' : 'DBM NEP';
  const captionId = `allocation-hierarchy-${stage}-caption`;
  const params = route?.params ?? new URLSearchParams();
  const endAt = HIERARCHY_STAGES.some(s => s.key === params.get('through')) ? params.get('through') : 'pap';
  const lastColumn = HIERARCHY_STAGES.find(s => s.key === endAt).column;
  const category = hierarchy.categories.some(g => g.id === params.get('category')) ? params.get('category') : '';
  const papOptions = hierarchyFilterOptions(hierarchy, category).paps;
  const pap = lastColumn >= 2 && papOptions.includes(params.get('pap')) ? params.get('pap') : '';
  const regionOptions = hierarchyFilterOptions(hierarchy, category, pap).regions;
  const region = lastColumn >= 3 && regionOptions.includes(params.get('region')) ? params.get('region') : '';
  const graph = useMemo(() => allocationHierarchyGraph(hierarchy, category, stage, {endAt, pap, region}),
    [hierarchy, category, stage, endAt, pap, region]);
  const layout = useMemo(() => layoutAllocationHierarchy(graph), [graph]);
  const scroll = useRef(null);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  useEffect(() => {
    const el = scroll.current;
    if (!el || !layout) return;
    const nodeX = layout.columnX.get(lastColumn) / layout.svgWidth * el.querySelector('svg').getBoundingClientRect().width;
    el.scrollTo({top: 0, left: lastColumn >= 3 ? Math.min(el.scrollWidth - el.clientWidth, Math.max(0, nodeX - 24)) : 0});
  }, [layout, lastColumn, category, pap, region]);
  const setView = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || (key === 'through' && value === 'pap')) next.delete(key);
      else next.set(key, value);
    }
    next.set('tab', stage);
    window.location.hash = `experiments?${next}`;
  };
  const format = exact ? money : compactMoney;
  const axes = [{label: sourceName, column: 0}, ...HIERARCHY_STAGES.filter(s => s.column <= lastColumn)];
  const pathLabel = axes.map(s => s.label).join(' → ');
  const scope = `Category: ${hierarchy.categories.find(g => g.id === category)?.label || 'All categories'} · PAP: ${pap || 'All PAPs'} · Region: ${region || 'All regions'}`;
  const note = `${label} allocations only${stage === 'hgab3' ? ' (House 3rd reading)' : ''}, from the retained DPWH comparison ledger. FAPs stay separate. Regions and offices repeat within their parent branches, using this ledger's recorded assignments. The final stage retains Central Office, regional offices and missing-office labels alongside DEOs so every peso remains accounted for.`;
  const branchCount = (value, singular, plural = `${singular}s`) => `${value} ${value === 1 ? singular : plural}`;
  const download = async format => {
    setExportError(''); setExporting(true);
    try {
      const section = hierarchySectionSvg(scroll.current?.querySelector('svg'), {
        title: `FY2027 · DPWH ${label} allocation hierarchy`, path: pathLabel, scope,
        summary: [`Allocation: ${money(graph.total)}`, branchCount(graph.counts[1], 'category group'),
          lastColumn >= 2 && branchCount(graph.counts[2], 'PAP group'),
          lastColumn >= 3 && branchCount(graph.counts[3], 'regional branch', 'regional branches'),
          lastColumn >= 4 && branchCount(graph.counts[4], 'office branch', 'office branches')].filter(Boolean).join(' · '),
        axes: axes.map(axis => ({label: axis.label, x: layout.columnX.get(axis.column)})), note,
      });
      const blob = format === 'png' ? await hierarchySectionPng(section) : section.blob;
      saveHierarchyImage(blob, `dpwh-2027-${stage}-allocation-hierarchy-through-${endAt}${category || pap || region ? '-filtered' : ''}.${format}`);
    } catch (error) {setExportError(error.message);} finally {setExporting(false);}
  };
  return <div className="nep-hierarchy" data-stage={stage} data-through={endAt}>
    <div className="nep-hierarchy-toolbar">
      <label>Display through <select aria-label="Display through" value={endAt} onChange={e => {
        const value = e.target.value;
        setView({through: value, ...(value === 'category' ? {pap: '', region: ''} : value === 'pap' ? {region: ''} : {})});
      }}>
        {HIERARCHY_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select></label>
      <label>Focus category <select aria-label="Focus category" value={category} onChange={e => setView({category: e.target.value, pap: '', region: ''})}>
        <option value="">All categories</option>
        {hierarchy.categories.filter(g => g.amount_php > 0).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select></label>
      {lastColumn >= 2 && <label>Focus PAP <select aria-label="Focus PAP" value={pap} onChange={e => setView({pap: e.target.value, region: ''})}>
        <option value="">All PAPs</option>
        {papOptions.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>}
      {lastColumn >= 3 && <label>Focus region <select aria-label="Focus region" value={region} onChange={e => setView({region: e.target.value})}>
        <option value="">All regions</option>
        {regionOptions.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>}
      <p aria-live="polite"><strong>{format(graph.total)}</strong> · {graph.counts[1]} category {graph.counts[1] === 1 ? 'group' : 'groups'}
        {lastColumn >= 2 && <> · {graph.counts[2]} PAP {graph.counts[2] === 1 ? 'group' : 'groups'}</>}
        {lastColumn >= 3 && <> · {graph.counts[3]} regional {graph.counts[3] === 1 ? 'branch' : 'branches'}</>}
        {lastColumn >= 4 && <> · {graph.counts[4]} office {graph.counts[4] === 1 ? 'branch' : 'branches'}</>}
      </p>
    </div>
    {lastColumn >= 3 && <p className="fmr-muted">Narrow the category, PAP or region to inspect a smaller branch. Scroll horizontally for later stages and vertically for more groups.</p>}
    {!layout ? <p role="status">No positive {label} allocations in this selection.</p> : <figure className="nep-hierarchy-figure" aria-labelledby={captionId}>
      <figcaption id={captionId}>
        <div className="nep-hierarchy-caption">DPWH {label} allocation hierarchy <span>{pathLabel}</span><span>Ribbon width represents {label} pesos. Hover a ribbon or block for its exact allocation.</span></div>
        <div className="nep-hierarchy-exports" data-image-export-omit>
          <button onClick={() => download('png')} disabled={exporting}>Download section PNG</button>
          <button onClick={() => download('svg')} disabled={exporting}>Download SVG</button>
          {exporting && <span role="status">Preparing image…</span>}
        </div>
        {exportError && <p className="nep-hierarchy-export-error" role="alert">{exportError}</p>}
      </figcaption>
      <div ref={scroll} className="nep-hierarchy-scroll" style={{'--hierarchy-width': `${layout.minWidth}px`}} role="region" aria-label={`${label} allocation Sankey through ${axes.at(-1).label}`} tabIndex={0}>
        <div className="nep-hierarchy-axes" aria-hidden="true">{axes.map(axis => <span key={axis.column} style={{left: `${layout.columnX.get(axis.column) / layout.svgWidth * 100}%`}}>{axis.label}</span>)}</div>
        <svg viewBox={`0 0 ${layout.svgWidth} ${layout.height}`} role="img" aria-label={`DPWH ${label} ${money(graph.total)}: ${pathLabel}`}>
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
