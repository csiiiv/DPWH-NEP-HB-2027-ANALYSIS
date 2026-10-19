import React, {useMemo} from 'react';
import {computeFlowLayout} from './columnFlow.js';
import {money, compactMoney} from './fmrModel.js';

// Three-axis alluvial for DPWH stage membership: NEP → HGAB2 → HGAB3.
// Flow unit is comparison rows (membership is conserved); amounts ride
// along as node totals. Custom column-flow layout — columns fixed by stage,
// every stratum rendered in each axis it participates in, including
// link-less blocks that a generic sankey would clamp or drop.
const AXIS_LABELS = {nep: 'DBM NEP', second: 'HGAB 2nd reading', third: 'HGAB 3rd reading'};
const STRATUM_META = {
  'true/true/true': {label: 'In all three stages', color: '#4f7db3'},
  'false/true/true': {label: 'House only (both readings)', color: '#b0852b'},
  'true/false/false': {label: 'NEP only', color: '#6b5543'},
  'false/false/true': {label: 'HGAB3 only', color: '#7a5aa0'},
  'true/true/false': {label: 'NEP + HGAB2', color: '#3d8f8a'},
  'true/false/true': {label: 'NEP + HGAB3', color: '#5f8f3d'},
  'false/true/false': {label: 'HGAB2 only', color: '#a05f72'},
};
const number = value => value.toLocaleString('en-PH');
const STAGES = ['nep', 'second', 'third'];

export default function DpwhAlluvial({payload, exact = false}) {
  const width = 980, height = 500;
  const format = value => (exact ? money : compactMoney)(value);

  const layout = useMemo(() => {
    const stageCount = stratum => stratum.key.split('/').filter(v => v === 'true').length;
    const participates = (stratum, i) => stratum.key.split('/')[i] === 'true';
    // Column stacks: multi-stage strata on top (descending rows) so ribbons
    // read as one continuous band; single-stage strata stack below.
    const rank = key => ({rank: stageCount({key}) < 2 ? 1 : 0, rows: 0});
    const nodes = [], links = [];
    for (let i = 0; i < STAGES.length; i++) {
      const inColumn = payload.strata
        .filter(s => participates(s, i))
        .sort((a, b) => (rank(b.key).rank - rank(a.key).rank) || (b.rows - a.rows));
      inColumn.forEach((s, r) => nodes.push({key: `${STAGES[i]}:${s.key}`, column: i, order: r,
        value: s.rows, rows: s.rows, amount_php: s[`${STAGES[i]}_php`],
        name: STRATUM_META[s.key]?.label ?? s.key, color: STRATUM_META[s.key]?.color ?? '#8aa7c4', stage: STAGES[i]}));
    }
    for (const s of payload.strata) {
      const m = s.key.split('/').map(v => v === 'true');
      for (let i = 0; i < 2; i++) if (m[i] && m[i + 1])
        links.push({source: `${STAGES[i]}:${s.key}`, target: `${STAGES[i + 1]}:${s.key}`,
          value: s.rows, color: STRATUM_META[s.key]?.color, label: STRATUM_META[s.key]?.label ?? s.key});
    }
    return computeFlowLayout({nodes, links, width, height, marginSide: 210, marginTop: 64});
  }, [payload]);

  return <figure className="flow-sankey" aria-labelledby="dpwh-alluvial-title">
    <figcaption id="dpwh-alluvial-title">
      DPWH · three-stage membership alluvial <span className="fmr-muted">({number(payload.totals.rows)} comparison rows; ribbon width and block height are row counts; labels state rows and Allocations Worth)</span>
    </figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`DPWH comparison rows regrouped across the NEP, HGAB2 and HGAB3 axes: ${number(payload.stages.nep.rows)} NEP rows, ${number(payload.stages.second.rows)} HGAB2 rows, ${number(payload.stages.third.rows)} HGAB3 rows.`}>
      {STAGES.map((stage, i) => {
        const x = layout.columnX.get(i);
        return <text key={stage} className="flow-label axis-caption" x={x} y={40}>
          <tspan className="flow-name">{AXIS_LABELS[stage]} · {number(payload.stages[stage].rows)} rows · {format(payload.stages[stage].amount_php)}</tspan>
        </text>;
      })}
      {layout.links.map((link, i) => <path key={i} className="flow-link" d={link.d}
        fill={link.color ?? '#8aa7c4'} opacity={0.35}>
        <title>{`${link.label}: ${number(link.value)} rows`}</title>
      </path>)}
      {layout.nodes.map(node => <g key={node.key} className="flow-node">
        <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={node.y1 - node.y0} fill={node.color} rx={2}>
          <title>{`${AXIS_LABELS[node.stage]} · ${node.name}: ${number(node.rows)} rows · ${money(node.amount_php)}`}</title>
        </rect>
      </g>)}
      {layout.nodes.map(node => {
        const slot = layout.labelSlots.get(node.key);
        return <text key={node.key} className="flow-label" x={slot.x} y={slot.y} textAnchor={slot.anchor}>
          <tspan className="flow-name">{node.column === 1 ? '' : node.name}</tspan>
          <tspan className="flow-amount" x={slot.x} dy="1.15em">{number(node.rows)} rows · {format(node.amount_php)}</tspan>
        </text>;
      })}
    </svg>
  </figure>;
}
