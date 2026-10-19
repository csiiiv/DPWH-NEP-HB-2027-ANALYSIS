import React, {useMemo} from 'react';
import {computeFlowLayout, stubPath, stubPort} from './columnFlow.js';
import {flowGraph, FLOW_COLORS as KIND_COLORS} from './overviewFlows.js';
import {compactMoney, money} from './fmrModel.js';

// Readable on the pale panel background; kinds reuse the workspace palette
// (green up / red down from Fmr.css) plus neutral blues for stage flows.
const number = value => value.toLocaleString('en-PH');
// Flow figures use their own compact format: 3 decimal places everywhere
// (₱572.924B), tighter than the 4-decimal workbench convention.
const flowMoney = value => value == null ? '—'
  : Math.abs(value) >= 1e9 ? `₱${(value / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 3})}B`
  : Math.abs(value) >= 1e6 ? `₱${(value / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M`
  : money(value);

/** One allocation flow: NEP ledger → five-group vocabulary → House ledger.
 *  Custom column-flow layout: columns are fixed by topology (col 0 sources,
 *  col 1 groups, col 2 sinks) instead of being inferred from connectivity,
 *  so dead-end nodes (Deletions, House reductions) keep their own column
 *  and nothing gets clamped or dropped. Ribbons and node labels deep-link
 *  into the workspace's filtered record populations, matching every other
 *  Overview figure. Rendered as inline SVG so it is assertable, accessible
 *  and printable. */
export default function FlowSankey({workspace: w, exact = false, inModal = false}) {
  const graph = useMemo(() => flowGraph(w), [w]);
  const width = 960, height = 460;
  const layout = useMemo(() => computeFlowLayout({
    nodes: graph.nodes.map(n => ({...n, column: n.col, value: n.amount_php})),
    links: graph.links, stubs: graph.stubs, width, height,
    nodeWidth: 14, padding: 26, marginSide: 150, marginTop: 14, labelLine: 17,
  }), [graph]);

  const format = value => (exact ? money : flowMoney)(value);
  const id = `${w.key}${inModal ? '-modal' : ''}`;
  return <figure className={`flow-sankey${inModal ? ' in-modal' : ''}`} aria-labelledby={`flow-title-${id}`}>
    <figcaption id={`flow-title-${id}`}>
      <a href={w.links.home}>{w.label}</a> · <span className="fmr-muted">flows in Allocations Worth ({exact ? 'exact pesos' : 'compact'}), House − NEP direction</span>
    </figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${w.label}: NEP ledger of ${format(w.sources.nep.amount_php)} flows through deletions, reduced, unchanged and increased groups into the House ledger of ${format(w.sources.house.amount_php)}; insertions enter from the House side.`}>
      {layout.links.map((link, i) => <path key={i} className={`flow-link kind-${link.kind}`}
        d={link.d} fill={KIND_COLORS[link.kind] ?? '#8aa7c4'} opacity={0.4}>
        <title>{`${link.sourceName} → ${link.targetName}${link.label ? ` (${link.label})` : ''}: ${money(link.value)}`}</title>
      </path>)}
      {layout.ribbonLabels.map((slot, i) => <text key={`rl-${i}`} className="flow-ribbon-label" x={slot.x}
        y={slot.y} textAnchor="middle" dominantBaseline="middle">
        {flowMoney(slot.link.value)}
      </text>)}
      {layout.stubs.map((stub, i) => {
        const target = layout.nodes.find(n => n.key === stub.target);
        // 'auto' = halfway from the entry extent's center to the node's
        // top edge, floored at an absolute 6px so tiny nodes (a few px
        // tall) still get a clearly separated diagonal entry. Numeric
        // lifts pass straight through.
        const halfLift = Math.max(6, (target.y0 + (stub.y1a + stub.y1b) / 2) / 2 - stub.y1a);
        const lift = stub.lift === 'auto' ? halfLift : (stub.lift ?? 0);
        const port = stubPort(target.x0, stub.y1a, stub.y1b, lift);
        return <g key={`stub-${i}`} className={`flow-stub kind-${stub.kind}`}>
          <path d={stubPath(target.x0, stub.y1a, stub.y1b, lift)} fill={KIND_COLORS[stub.kind] ?? '#8aa7c4'} opacity={0.4}>
            <title>{`${stub.targetName} in: ${money(stub.value)} (new House money)`}</title>
          </path>
          <circle cx={port.cx} cy={port.cy} r={3.5} fill={KIND_COLORS[stub.kind] ?? '#8aa7c4'}/>
          <text className="flow-label" x={port.cx - 8} y={port.cy - 6} textAnchor="end">
            <tspan className="flow-name">{flowMoney(stub.value)}</tspan>
          </text>
        </g>;
      })}
      {layout.nodes.map(node => <g key={node.key} className="flow-node">
        <a href={node.href}>
          <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={Math.max(2, node.y1 - node.y0)}
            fill={node.kind === 'stage' ? '#203147' : KIND_COLORS[node.kind] ?? '#4f7db3'} rx={2}>
            <title>{`${node.name} (${node.sub}): ${money(node.amount_php)} · ${number(node.count)} ${w.count_unit}`}</title>
          </rect>
        </a>
        <text className={`flow-label ${node.column === 0 ? 'left' : 'right'}`}
          x={layout.labelSlots.get(node.key).x} y={layout.labelSlots.get(node.key).y}
          textAnchor={layout.labelSlots.get(node.key).anchor}>
          <tspan className="flow-name">{node.name}</tspan>
          <tspan className="flow-amount" x={layout.labelSlots.get(node.key).x} dy="1.15em">{format(node.amount_php)}</tspan>
        </text>
      </g>)}
    </svg>
  </figure>;
}
