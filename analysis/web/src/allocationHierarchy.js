import {HIERARCHY_STAGES} from './nepHierarchy.js';

const ORDER = (a, b) => b.amount_php - a.amount_php || a.label.localeCompare(b.label);
const DEFAULT_LEVELS = HIERARCHY_STAGES.map(s => ({...s,
  singular: {category: 'category group', pap: 'PAP group', region: 'regional branch', deo: 'office branch'}[s.key],
  plural: {category: 'category groups', pap: 'PAP groups', region: 'regional branches', deo: 'office branches'}[s.key],
  filterLabel: `Focus ${s.key === 'pap' ? 'PAP' : s.key}`,
  allLabel: {category: 'All categories', pap: 'All PAPs', region: 'All regions'}[s.key], filter: s.key !== 'deo',
}));

export function hierarchyLevels(hierarchy) {
  return (hierarchy.levels || DEFAULT_LEVELS).map((level, index) => ({...level, column: index + 1}));
}

// Keep existing DPWH rollups/links compatible while the shared viewer accepts
// native hierarchies with any number of levels.
export function hierarchyRoots(hierarchy) {
  if (hierarchy.roots) return hierarchy.roots;
  const fields = ['paps', 'regions', 'offices'];
  const convert = (node, depth) => ({id: node.id ?? node.label, label: node.label, amount_php: node.amount_php,
    ...(depth < fields.length ? {children: node[fields[depth]].map(n => convert(n, depth + 1))} : {})});
  return hierarchy.categories.map(n => convert(n, 0));
}

export function hierarchyOptions(hierarchy, filters = {}) {
  const levels = hierarchyLevels(hierarchy), maps = levels.map(() => new Map());
  const visit = (nodes, index) => {
    for (const node of nodes) {
      if (node.amount_php <= 0) continue;
      maps[index].set(node.id, {id: node.id, label: node.label});
      if (filters[levels[index].key] && filters[levels[index].key] !== node.id) continue;
      if (index + 1 < levels.length) visit(node.children, index + 1);
    }
  };
  visit(hierarchyRoots(hierarchy), 0);
  return Object.fromEntries(levels.map((level, i) => [level.key, [...maps[i].values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'en', {numeric: true}))]));
}

// Drill-down orders: every suffix of the native chain (the "Display through"
// prefixes), then every single level, deduplicated — a predictable catalog
// that works for any hierarchy depth.
export function hierarchyOrders(hierarchy) {
  const levels = hierarchyLevels(hierarchy);
  const candidates = [];
  for (let i = 0; i < levels.length; i++) candidates.push(levels.slice(i).map(l => l.key));
  for (const level of levels) candidates.push([level.key]);
  const seen = new Set(), orders = [];
  for (const keys of candidates) {
    const id = keys.join(',');
    if (!seen.has(id)) { seen.add(id); orders.push(keys); }
  }
  return orders;
}

// Rebuild the hierarchy aggregated along a different level order: flatten the
// conserved tree to its full-depth leaves, re-key every path into the
// requested order, and rebuild through buildAllocationTree so conservation
// and heading consistency are re-validated. Native or invalid orders return
// the input unchanged.
export function regroupHierarchy(hierarchy, keys) {
  const levels = hierarchyLevels(hierarchy);
  if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length ||
    keys.some(k => !levels.some(l => l.key === k)) ||
    (keys.length === levels.length && keys.every((k, i) => levels[i].key === k))) return hierarchy;
  const index = new Map(levels.map((l, i) => [l.key, i]));
  const records = [];
  const visit = (node, path) => {
    const next = [...path, {id: node.id, label: node.label}];
    if (next.length === levels.length)
      records.push({id: next.map(p => p.id).join('\u0000'), amount_php: node.amount_php,
        path: keys.map(k => next[index.get(k)])});
    else for (const child of node.children ?? []) visit(child, next);
  };
  for (const root of hierarchyRoots(hierarchy)) visit(root, []);
  const chosen = keys.map(k => {
    const {column, ...level} = levels.find(l => l.key === k);
    return level;
  });
  return {...buildAllocationTree(records, chosen, hierarchy.amount_php), defaultEnd: keys.at(-1)};
}

export function hierarchyView(hierarchy, params) {
  const levels0 = hierarchyLevels(hierarchy);
  const requested = String(params.get('order') || '').split(',').map(s => s.trim()).filter(Boolean);
  const native = levels0.map(l => l.key);
  const isNative = requested.length === native.length && requested.every((k, i) => native[i] === k);
  const order = requested.length && new Set(requested).size === requested.length && !isNative &&
    requested.every(k => native.includes(k)) ? requested : null;
  const active = order ? regroupHierarchy(hierarchy, order) : hierarchy;
  const levels = hierarchyLevels(active);
  const endAt = levels.some(l => l.key === params.get('through')) ? params.get('through') : active.defaultEnd || 'pap';
  const lastColumn = levels.find(l => l.key === endAt).column;
  const filters = {};
  for (const level of levels.filter(l => l.column <= lastColumn && l.filter !== false)) {
    const value = params.get(level.key);
    if (value && hierarchyOptions(active, filters)[level.key].some(o => o.id === value)) filters[level.key] = value;
  }
  const requestedTop = Number(params.get('top'));
  const top = Number.isSafeInteger(requestedTop) && requestedTop > 0 ? Math.min(requestedTop, 50) : null;
  return {hierarchy: active, order, levels, endAt, lastColumn, filters, top, options: hierarchyOptions(active, filters)};
}

const COLORS = ['#426b9b', '#39877b', '#9670a8', '#b28236', '#628548', '#b16d64', '#657784'];
const OTHERS_ID = '(Others)', OTHERS_LABEL = 'Others';

export function buildAllocationGraph(hierarchy, stage, {endAt, filters = {}, top = null}) {
  const levels = hierarchyLevels(hierarchy), roots = hierarchyRoots(hierarchy);
  const lastColumn = levels.find(l => l.key === endAt)?.column;
  if (!lastColumn) throw new Error('Allocation hierarchy: unsupported display stage');
  const prune = (node, depth) => {
    const selected = filters[levels[depth].key];
    if (node.amount_php <= 0 || (selected && selected !== node.id)) return null;
    if (depth + 1 === levels.length) return node;
    const children = node.children.map(n => prune(n, depth + 1)).filter(Boolean).sort(ORDER);
    const amount_php = children.reduce((sum, n) => sum + n.amount_php, 0);
    return amount_php > 0 ? {...node, children, amount_php} : null;
  };
  // Compact view: keep the largest `top` branches under every parent and fold
  // the rest into one per-parent "Others" block. Tail children are merged
  // from the unfolded tree and rebuilt through the same pipeline, so the fold
  // applies exactly once per level: the figure stays a strict tree with
  // unique paths that rebuilds the ledger exactly at every depth.
  const othersLabel = count => `${OTHERS_LABEL} (${count})`;
  const mergeBranches = nodes => {
    const merged = new Map();
    for (const node of nodes) {
      const entry = merged.get(node.id) ?? {id: node.id, label: node.label, amount_php: 0, children: []};
      entry.amount_php += node.amount_php;
      if (node.children) entry.children.push(...node.children);
      merged.set(node.id, entry);
    }
    return [...merged.values()].map(entry => entry.children.length
      ? {...entry, children: mergeBranches(entry.children)} : entry);
  };
  const buildNode = (node, depth) => {
    const pruned = prune(node, depth);
    if (!pruned || depth + 1 === levels.length) return pruned;
    const children = buildLevel(pruned.children, depth + 1);
    const amount_php = children.reduce((sum, n) => sum + n.amount_php, 0);
    return amount_php > 0 ? {...pruned, children, amount_php} : null;
  };
  const buildLevel = (children, depth) => {
    const full = children.map(node => prune(node, depth)).filter(Boolean).sort(ORDER);
    if (!top || full.length <= top)
      return full.map(node => buildNode(node, depth)).filter(Boolean).sort(ORDER);
    const head = full.slice(0, top).map(node => buildNode(node, depth)).filter(Boolean);
    const tail = full.slice(top);
    const merged = mergeBranches(tail.flatMap(node => node.children ?? []));
    const othersChildren = depth + 1 < levels.length ? buildLevel(merged, depth + 1) : [];
    const amount_php = othersChildren.length ? othersChildren.reduce((sum, n) => sum + n.amount_php, 0)
      : tail.reduce((sum, n) => sum + n.amount_php, 0);
    return amount_php > 0 ? [...head, {id: OTHERS_ID, label: othersLabel(tail.length),
      children: othersChildren, amount_php}].sort(ORDER) : head;
  };
  const groups = buildLevel(roots, 0);
  const total = groups.reduce((sum, n) => sum + n.amount_php, 0), counts = Array(levels.length + 1).fill(0);
  const nodes = [], links = [];
  if (total) {
    nodes.push({key: stage, name: stage === 'hgab3' ? 'HGAB3' : 'DBM NEP', column: 0,
      order: counts[0]++, value: total, color: '#203147'});
    const visit = (node, column, parentKey, path, color, parents = []) => {
      const key = JSON.stringify(path);
      nodes.push({key, name: node.label, parent: parents.join(' → '), column,
        order: counts[column]++, value: node.amount_php, color});
      links.push({source: parentKey, target: key, value: node.amount_php, color});
      if (column < lastColumn) for (const child of node.children)
        visit(child, column + 1, key, [...path, child.id], color, [...parents, node.label]);
    };
    for (const group of groups) visit(group, 1, stage, [group.id], COLORS[Math.max(0, roots.findIndex(n => n.id === group.id)) % COLORS.length]);
  }
  return {nodes, links, total, counts, lastColumn, endAt, others: top ? OTHERS_LABEL : null,
    longLabels: levels.some(l => l.column <= lastColumn && ['project', 'facility'].includes(l.key))};
}

export function buildAllocationTree(records, levels, expected) {
  const roots = new Map(), seen = new Set();
  let total = 0;
  for (const record of records) {
    if (!record.id || seen.has(record.id)) throw new Error('Allocation hierarchy: missing or repeated source identity');
    seen.add(record.id);
    if (!Number.isSafeInteger(record.amount_php) || record.amount_php < 0) throw new Error('Allocation hierarchy: invalid allocation amount');
    if (record.path.length !== levels.length) throw new Error('Allocation hierarchy: incomplete source path');
    let children = roots;
    for (const part of record.path) {
      if (!part.id || !part.label) throw new Error('Allocation hierarchy: missing source heading');
      const node = children.get(part.id) ?? {...part, amount_php: 0, children: new Map()};
      if (node.label !== part.label) throw new Error('Allocation hierarchy: conflicting source headings');
      node.amount_php += record.amount_php;
      children.set(part.id, node);
      children = node.children;
    }
    total += record.amount_php;
  }
  if (!Number.isSafeInteger(total) || total !== expected) throw new Error('Allocation hierarchy: source ledger does not match its published total');
  const serialize = (map, depth = 0) => [...map.values()].map(({children, ...node}) => {
    if (depth + 1 === levels.length) return node;
    const members = serialize(children, depth + 1);
    if (members.reduce((sum, n) => sum + n.amount_php, 0) !== node.amount_php) throw new Error('Allocation hierarchy: child allocations do not conserve their parent');
    return {...node, children: members};
  }).sort(ORDER);
  return {rows: records.length, amount_php: total, levels, roots: serialize(roots)};
}
