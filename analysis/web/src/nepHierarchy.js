import {matchesProgram, programLabel} from './model.js';
import {recordedOffice} from '../../viewers/project_offices.mjs';

export const HIERARCHY_STAGES = [
  {key: 'category', label: 'Category Group', column: 1},
  {key: 'pap', label: 'PAP Group', column: 2},
  {key: 'region', label: 'Region', column: 3},
  {key: 'deo', label: 'DEO / implementing office', column: 4},
];
const CHILDREN = ['paps', 'regions', 'offices'];
const order = (a, b) => b.amount_php - a.amount_php || a.label.localeCompare(b.label);

// Every branch retains the selected ledger's own assignments. Grouped source
// records split by their recorded amounts; they never reuse the parent total.
export function buildAllocationHierarchy(rows, side = 'nep') {
  if (!['nep', 'third'].includes(side)) throw new Error('Allocation hierarchy: unsupported stage');
  const label = side === 'third' ? 'HGAB3' : 'NEP';
  const fail = message => {throw new Error(`${label} hierarchy: ${message}`);};
  const validAmount = amount => {
    if (!Number.isSafeInteger(amount) || amount < 0) fail('invalid allocation amount');
    return amount;
  };
  const categories = new Map();
  let amount_php = 0, count = 0;
  rows.forEach((row, index) => {
    const record = row[side];
    if (!record) return;
    const total = validAmount(record.amount_php ?? 0);
    const members = record.records?.length ? record.records : [record];
    if (members.reduce((sum, m) => sum + validAmount(m.amount_php ?? 0), 0) !== total)
      fail('grouped source records do not rebuild their parent allocation');
    for (const member of members) {
      const source = {...row, ...record, ...member};
      const categoryId = matchesProgram(source, 'fap') ? 'fap' : source.program || '(Unassigned category)';
      const path = [categoryId, source.pap || '(Unassigned PAP)', source.region || '(Unassigned region)',
        recordedOffice(member) || recordedOffice(record) || '(No recorded office)'];
      const amount = validAmount(member.amount_php ?? 0);
      let children = categories;
      path.forEach((id, depth) => {
        const node = children.get(id) ?? {id, label: depth === 0 ? programLabel(id) : id,
          members: new Set(), amount_php: 0, children: new Map()};
        node.members.add(index);
        node.amount_php += amount;
        children.set(id, node);
        children = node.children;
      });
    }
    amount_php += total;
    count++;
  });
  const serialize = (children, depth = 0) => [...children.values()].map(node => {
    const result = {...(depth === 0 ? {id: node.id} : {}), label: node.label,
      rows: node.members.size, amount_php: node.amount_php};
    validAmount(result.amount_php);
    if (depth < CHILDREN.length) {
      result[CHILDREN[depth]] = serialize(node.children, depth + 1);
      if (result[CHILDREN[depth]].reduce((sum, n) => sum + n.amount_php, 0) !== node.amount_php)
        fail('child branches do not rebuild their parent allocation');
    }
    return result;
  }).sort(order);
  const groups = serialize(categories);
  if (!Number.isSafeInteger(amount_php) || groups.reduce((sum, g) => sum + g.amount_php, 0) !== amount_php)
    fail('category totals do not rebuild the ledger');
  return {rows: count, amount_php, categories: groups};
}

export const buildNepHierarchy = rows => buildAllocationHierarchy(rows, 'nep');
export const buildHgab3Hierarchy = rows => buildAllocationHierarchy(rows, 'third');

export function hierarchyFilterOptions(hierarchy, categoryId = '', pap = '') {
  const groups = hierarchy.categories.filter(g => g.amount_php > 0 && (!categoryId || g.id === categoryId));
  const paps = groups.flatMap(g => g.paps).filter(p => p.amount_php > 0);
  const regions = paps.filter(p => !pap || p.label === pap).flatMap(p => p.regions).filter(r => r.amount_php > 0);
  const labels = nodes => [...new Set(nodes.map(n => n.label))].sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
  return {paps: labels(paps), regions: labels(regions)};
}

const COLORS = ['#426b9b', '#39877b', '#9670a8', '#b28236', '#628548', '#b16d64', '#657784'];

export function allocationHierarchyGraph(hierarchy, categoryId = '', stage = 'nep', {endAt = 'pap', pap = '', region = ''} = {}) {
  const lastColumn = HIERARCHY_STAGES.find(s => s.key === endAt)?.column;
  if (!lastColumn) throw new Error('Allocation hierarchy: unsupported display stage');
  // Filter leaves before rebuilding their ancestors, so every visible column
  // represents exactly the same scoped allocation, even when it ends early.
  const groups = hierarchy.categories.filter(g => g.amount_php > 0 && (!categoryId || g.id === categoryId)).map(g => ({...g,
    paps: g.paps.filter(p => !pap || p.label === pap).map(p => ({...p,
      regions: p.regions.filter(r => !region || r.label === region),
    })).map(p => ({...p, amount_php: p.regions.reduce((sum, r) => sum + r.amount_php, 0)})).filter(p => p.amount_php > 0).sort(order),
  })).map(g => ({...g, amount_php: g.paps.reduce((sum, p) => sum + p.amount_php, 0)})).filter(g => g.amount_php > 0).sort(order);
  const total = groups.reduce((sum, g) => sum + g.amount_php, 0);
  const counts = [0, 0, 0, 0, 0];
  const nodes = [], links = [];
  if (total) {
    const sourceName = stage === 'hgab3' ? 'HGAB3' : 'DBM NEP';
    nodes.push({key: stage, name: sourceName, column: 0, order: counts[0]++, value: total, color: '#203147'});
    const visit = (node, column, parentKey, path, color, parents = []) => {
      const key = JSON.stringify(path);
      nodes.push({key, name: node.label, parent: parents.join(' → '), column,
        order: counts[column]++, value: node.amount_php, color});
      links.push({source: parentKey, target: key, value: node.amount_php, color});
      if (column < lastColumn) for (const child of node[CHILDREN[column - 1]].filter(n => n.amount_php > 0))
        visit(child, column + 1, key, [...path, child.label], color, [...parents, node.label]);
    };
    for (const g of groups) visit(g, 1, stage, [g.id], COLORS[hierarchy.categories.findIndex(c => c.id === g.id) % COLORS.length]);
  }
  return {nodes, links, total, papCount: counts[2], counts, lastColumn, endAt};
}

export const nepHierarchyGraph = (hierarchy, categoryId = '') => allocationHierarchyGraph(hierarchy, categoryId);
