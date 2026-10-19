// Bar chart comparison: one horizontal NEP/HGAB bar pair per detail group,
// each bar segmented by revision class (unchanged, increased, decreased, and
// deleted on NEP / inserted on HGAB). The model delegates to the validated
// budget-flow builder — both ledgers must reconcile before any bar is drawn —
// and the layout is a pure geometry pass where every segment shares one peso
// scale, like the flow figures.
import {buildBudgetFlowModel} from './budgetFlowModel.js';
import {REVISIONS} from './revisionMatrix.js';
import {wrapHierarchyLabel} from './hierarchyLayout.js';

// One shared class order on both bars, one-sided classes last, so the first
// three segments start at the same x on the NEP and HGAB bars and widths
// compare directly (unchanged aligns with unchanged, increased with increased).
export const SEGMENTS = ['unchanged', 'increased', 'reduced', 'deletion', 'insertion']
  .map(key => REVISIONS.find(r => r.key === key));
export const SIDES = [
  {key: 'nep', label: 'DBM NEP', short: 'NEP'},
  {key: 'hgab', label: 'HGAB', short: 'HGAB'},
];

export function barComparisonModel(payload, groupingKey = 'category') {
  const model = buildBudgetFlowModel(payload, groupingKey);
  return {dataset: model.dataset, grouping: model.grouping, totals: model.totals,
    provenance: payload.provenance || null,
    bars: model.groups.map(({id, label, rows, nep, hgab, cells}) => ({id, label, rows, nep, hgab,
      classes: Object.fromEntries(cells.map(c => [c.key, {rows: c.rows, nep: c.nep, hgab: c.hgab}]))}))};
}

// 'nep' keeps the validated largest-first order; 'label' is numeric-aware so
// Region II follows Region I; 'delta' ranks by absolute net change.
export const SORTS = [
  {key: 'nep', label: 'Largest NEP first'},
  {key: 'hgab', label: 'Largest HGAB first'},
  {key: 'delta', label: 'Largest net change first'},
  {key: 'label', label: 'Label (A→Z)'},
];

export function sortBars(bars, mode = 'nep') {
  const sorted = [...bars];
  if (mode === 'label') sorted.sort((a, b) =>
    a.label.localeCompare(b.label, 'en', {numeric: true}) || a.id.localeCompare(b.id));
  else if (mode === 'hgab') sorted.sort((a, b) =>
    b.hgab - a.hgab || b.nep - a.nep || a.id.localeCompare(b.id));
  else if (mode === 'delta') sorted.sort((a, b) =>
    Math.abs(b.hgab - b.nep) - Math.abs(a.hgab - a.nep) || b.nep - a.nep || a.id.localeCompare(b.id));
  else sorted.sort((a, b) => b.nep - a.nep || b.hgab - a.hgab || a.id.localeCompare(b.id));
  return sorted;
}

// DPWH records centrally-managed money under an explicit Central Office group
// (today only at DEO grain). Hiding it re-fits the peso scale so the
// remaining groups become comparable; the exact table keeps every row.
const CENTRAL_OFFICE = /central office/i;
export const isCentralOffice = bar => CENTRAL_OFFICE.test(bar.id) || CENTRAL_OFFICE.test(bar.label);

export function splitCentralOffice(bars) {
  const visible = [], hidden = [];
  for (const bar of bars) (isCentralOffice(bar) ? hidden : visible).push(bar);
  return {visible, hidden};
}

export function sumBars(bars) {
  const totals = bars.reduce((t, bar) => ({nep: t.nep + bar.nep, hgab: t.hgab + bar.hgab, rows: t.rows + bar.rows}),
    {nep: 0, hgab: 0, rows: 0});
  return {...totals, delta: totals.hgab - totals.nep};
}

// Compact rollup, mirroring collapseRevisionFlow: selection ranks by the NEP
// ledger (stable regardless of the display sort), and Others stays last even
// when its sum exceeds a retained group. Class cells sum per revision type,
// so the drawn set keeps conserving both ledgers exactly.
export function collapseBars(bars, {top, plural} = {}) {
  if (!Number.isSafeInteger(top) || top <= 0 || bars.length <= top) return {kept: bars, others: null, rollup: null};
  const ranked = [...bars].sort((a, b) => b.nep - a.nep || a.id.localeCompare(b.id));
  const kept = ranked.slice(0, top), remainder = ranked.slice(top);
  const classes = {};
  for (const seg of SEGMENTS) {
    const cell = {rows: 0, nep: 0, hgab: 0};
    for (const bar of remainder) {
      const c = bar.classes[seg.key];
      if (c) {cell.rows += c.rows; cell.nep += c.nep; cell.hgab += c.hgab;}
    }
    if (cell.rows > 0 || cell.nep > 0 || cell.hgab > 0) classes[seg.key] = cell;
  }
  const totals = sumBars(remainder);
  const others = {id: '__others__', label: `Others (${remainder.length} ${plural})`,
    rows: totals.rows, nep: totals.nep, hgab: totals.hgab, classes,
    members: remainder.map(({id, label}) => ({id, label}))};
  return {kept, others, rollup: {top, rankBy: 'nep', othersId: others.id, members: others.members}};
}

// Pure bar geometry: wrapped labels left, two segmented bars per row on one
// shared peso scale, total labels reserved right. Returns null when nothing
// is drawable. Every positive segment width is exactly value * scale; a
// class absent on one side leaves a gap, keeping the other classes aligned.
// Rows grow with their label: a group needs up to maxLabelLines lines, and
// the paired bars stay vertically centered inside the taller row.
export function layoutBarChart(bars, options = {}) {
  const {width = 1180, labelWidth = 288, valueWidth = 168, barHeight = 15,
    barGap = 3, rowGap = 14, top = 24, bottom = 20, labelChars = 26,
    maxLabelLines = 4, lineHeight = 15, segmentLabelMin = 56} = options;
  if (!Array.isArray(bars) || !bars.length) return null;
  // The scale fits the longest bar (a side total = the sum of its segments),
  // so the longest bar fills the track and every segment divides it exactly.
  const maxValue = Math.max(1, ...bars.flatMap(bar => [bar.nep, bar.hgab]));
  const usable = width - labelWidth - valueWidth;
  if (usable <= 0) throw new Error('Bar comparison layout: label and value margins exceed the figure width');
  const scale = usable / maxValue;
  const block = 2 * barHeight + barGap;
  const rows = [];
  let y = top;
  for (const bar of bars) {
    const lines = ellipsizeLines2(wrapHierarchyLabel(bar.label, labelChars), maxLabelLines, labelChars);
    // The row is as tall as its label needs; the bar block centers inside it.
    const height = Math.max(block, lines.length * lineHeight);
    const center = y + height / 2;
    const labelYs = lines.map((_, line) =>
      center - (lines.length - 1) * lineHeight / 2 + line * lineHeight + 4);
    const sides = SIDES.map(({key, label, short}, sideIndex) => {
      const sideY = center - block / 2 + sideIndex * (barHeight + barGap);
      let x = labelWidth;
      const segments = SEGMENTS.flatMap(seg => {
        const c = bar.classes[seg.key], value = c?.[key] ?? 0;
        if (!(value > 0)) return [];
        const segWidth = value * scale;
        const node = {key: seg.key, label: seg.label, color: seg.color,
          rows: c.rows, value, nep: c.nep, hgab: c.hgab, side: key,
          y: sideY, height: barHeight, x, width: segWidth,
          textFill: seg.key === 'unchanged' ? '#203147' : '#fff',
          labelVisible: segWidth >= segmentLabelMin, labelX: x + segWidth / 2, labelY: sideY + barHeight - 3.5};
        x += segWidth;
        return [node];
      });
      return {key, label, short, y: sideY, height: barHeight, total: bar[key],
        segments, endX: x, labelX: x + 8, labelY: sideY + barHeight - 3.5};
    });
    rows.push({...bar, y, height, center, lines, labelYs, bars: sides});
    y += height + rowGap;
  }
  return {width, height: y - rowGap + bottom, top,
    labelWidth, valueWidth, usable, scale, maxValue, rows};
}

// Keep the readable head of a long heading; the full label stays in the row's
// <title> and in the exact-PHP tables below the figure.
function ellipsizeLines(lines, max, maxChars) {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max - 1), tail = lines.slice(max - 1).join(' ');
  kept.push(tail.length > maxChars ? `${tail.slice(0, maxChars - 1).trimEnd()}…` : tail);
  return kept;
}

// Hard word-level cap: wrapHierarchyLabel cannot split a word, so a single
// token like "Completion/Upgrading/Repair/Equipping" (37 chars) would still
// overflow the gutter. Trim the head and ellipsize; the full label stays in
// the row's <title> and in the exact-PHP tables.
function capLine(line, maxChars) {
  return line.length > maxChars ? `${line.slice(0, maxChars - 1).trimEnd()}…` : line;
}
function ellipsizeLines2(lines, max, maxChars) {
  return ellipsizeLines(lines.map(l => capLine(l, maxChars)), max, maxChars);
}
