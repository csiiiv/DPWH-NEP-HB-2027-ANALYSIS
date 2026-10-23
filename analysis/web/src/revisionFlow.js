// Domain-neutral revision analysis. Values are non-negative safe integers in
// one caller-chosen base unit (pesos, cents, items, etc.). No matching is inferred.
export const REVISION_TYPES = [
  {key: 'insertion', label: 'Inserted', color: '#b0852b', cue: '+'},
  {key: 'unchanged', label: 'Unchanged', color: '#7f9fc0', cue: '='},
  {key: 'increased', label: 'Increased', color: '#0b6b3a', cue: '↑'},
  {key: 'reduced', label: 'Decreased', color: '#a12020', cue: '↓'},
  {key: 'deletion', label: 'Deleted', color: '#6b5543', cue: '−'},
  // Same-road pairs whose station spans share no overlap: attached for
  // scope review, delta deliberately NOT booked as an adjustment. Flows as
  // its own category so both ledgers still rebuild exactly.
  {key: 'scope_review', label: 'Scope review', color: '#7a5ba6', cue: '~'},
];
export const REVISION_ORDER = ['deletion', 'insertion', 'increased', 'unchanged', 'reduced', 'scope_review'];
export const FLOW_COLORS = {stage: '#8aa7c4', unchanged: '#7f9fc0', adjust: '#4f7db3',
  up: '#0b6b3a', down: '#a12020', insertion: '#b0852b', deletion: '#6b5543', scope_review: '#7a5ba6'};
const DEFAULT_LABELS = {before: 'Total A', after: 'Total B', intermediaryBefore: 'Intermediary A',
  intermediaryAfter: 'Intermediary B', matrix: 'Revision Matrix', additions: 'Additions', reductions: 'Reductions', count: 'records'};
const ensure = (ok, message) => {if (!ok) throw new Error(`Revision flow: ${message}`);};
const integer = (value, name) => ensure(Number.isSafeInteger(value) && value >= 0, `invalid ${name}; use non-negative safe integer base units`);
const nodeKey = (scope, role) => JSON.stringify([scope, role]);

export function buildRevisionMatrix({scope, cells, expected = {}, revisions = {}}) {
  ensure(Array.isArray(cells), 'cells must be an array');
  const seen = new Set();
  for (const cell of cells) {
    ensure(REVISION_ORDER.includes(cell.key) && !seen.has(cell.key), 'unknown or duplicate revision type');
    seen.add(cell.key);
  }
  const normalized = REVISION_TYPES.map(type => {
    const c = cells.find(c => c.key === type.key) || {count: 0, before: 0, after: 0};
    for (const key of ['count', 'before', 'after']) integer(c[key], `${type.key} ${key}`);
    ensure(c.count > 0 || (c.before === 0 && c.after === 0), `${type.key} has values without records`);
    ensure(type.key !== 'insertion' || c.before === 0, 'insertions cannot carry before values');
    ensure(type.key !== 'deletion' || c.after === 0, 'deletions cannot carry after values');
    ensure(type.key !== 'unchanged' || c.before === c.after, 'unchanged amounts differ');
    ensure(type.key !== 'increased' || (c.count ? c.after > c.before : c.after === c.before), 'increase does not increase');
    ensure(type.key !== 'reduced' || (c.count ? c.after < c.before : c.after === c.before), 'decrease does not decrease');
    // scope_review cells may carry deltas of either sign: the amount change
    // between different segments of one road is deliberately unbooked.
    return {...type, ...revisions[type.key], key: type.key, id: nodeKey(scope, type.key), scope,
      count: c.count, before: c.before, after: c.after, delta: c.after - c.before};
  });
  const totals = normalized.reduce((t, c) => ({before: t.before + c.before, after: t.after + c.after,
    // Scope-review deltas are deliberately unbooked: exclude them from
    // gross additions/reductions (they mix signs across groups, and booking
    // them would resurrect the phantom-adjustment problem in aggregate).
    additions: t.additions + (c.key === 'scope_review' ? 0 : Math.max(c.delta, 0)),
    reductions: t.reductions + (c.key === 'scope_review' ? 0 : Math.max(-c.delta, 0)),
    count: t.count + c.count}),
    {before: 0, after: 0, additions: 0, reductions: 0, count: 0});
  for (const [key, value] of Object.entries(totals)) integer(value, `total ${key}`);
  totals.delta = totals.after - totals.before;
  totals.scope_net = normalized.filter(c => c.key === 'scope_review').reduce((s, c) => s + c.delta, 0);
  ensure(Number.isSafeInteger(totals.scope_net), 'invalid total scope_net');
  for (const key of ['before', 'after', 'count']) if (expected[key] != null) {
    integer(expected[key], `expected ${key}`);
    ensure(totals[key] === expected[key], `${scope} cells do not rebuild ${key}`);
  }
  ensure(totals.additions - totals.reductions + totals.scope_net === totals.delta,
    'gross changes plus unbooked scope deltas do not rebuild the net change');
  return {scope, cells: normalized, totals};
}

// One three-column matrix, repeated once per intermediary in the five-stage
// graph. Insertions have no source link; deletions have no outgoing link.
export function revisionMatrixGraph(matrix, {labels = {}, groupId = matrix.scope} = {}) {
  labels = {...DEFAULT_LABELS, ...labels};
  const by = Object.fromEntries(matrix.cells.map(c => [c.key, c]));
  const key = role => nodeKey(groupId, role);
  const nodes = [
    {role: 'before', column: 0, order: 0, value: matrix.totals.before, name: labels.before, kind: 'stage'},
    ...REVISION_ORDER.map((role, order) => ({role, column: 1, order, revision: role,
      value: Math.max(by[role].before, by[role].after), name: by[role].label,
      kind: {increased: 'up', reduced: 'adjust'}[role] || role})),
    {role: 'after', column: 2, order: 0, value: matrix.totals.after, name: labels.after, kind: 'stage'},
    {role: 'reductions', column: 2, order: 1, value: -by.reduced.delta, name: labels.reductions, revision: 'reduced', kind: 'down'},
    // Scope-review deficit sink (surplus enters the scope node as an
    // external stub instead — like insertions/increases — so no node needed).
    ...(by.scope_review.delta < 0 ? [{role: 'scopeLoss', column: 2, order: 2, value: -by.scope_review.delta,
      name: `${labels.matrix ? labels.matrix + ' · ' : ''}Unbooked scope loss`, revision: 'scope_review', kind: 'scope_review'}] : []),
  ].filter(n => n.value > 0).map(n => ({...n, key: key(n.role), groupId, color: FLOW_COLORS[n.kind]}));
  const links = [], stubs = [];
  const link = (source, target, value, kind, revision) => {
    if (value > 0) links.push({key: nodeKey(groupId, `link:${source}:${target}`), source: key(source), target: key(target), value, kind, revision, groupId, color: FLOW_COLORS[kind]});
  };
  link('before', 'deletion', by.deletion.before, 'deletion', 'deletion');
  link('before', 'increased', by.increased.before, 'adjust', 'increased');
  link('before', 'unchanged', by.unchanged.before, 'unchanged', 'unchanged');
  link('before', 'reduced', by.reduced.before, 'adjust', 'reduced');
  link('before', 'scope_review', by.scope_review.before, 'scope_review', 'scope_review');
  link('insertion', 'after', by.insertion.after, 'insertion', 'insertion');
  link('increased', 'after', by.increased.after, 'up', 'increased');
  link('unchanged', 'after', by.unchanged.after, 'unchanged', 'unchanged');
  link('reduced', 'after', by.reduced.after, 'adjust', 'reduced');
  link('scope_review', 'after', by.scope_review.after, 'scope_review', 'scope_review');
  link('reduced', 'reductions', -by.reduced.delta, 'down', 'reduced');
  // Scope-review net: like insertions/increases, surplus value exists only
  // on the House side, so it enters as an external stub; deficit exits to a
  // loss sink. Both keep the node reconciled without booking the delta.
  if (by.scope_review.delta > 0) {
    stubs.push({key: nodeKey(groupId, 'stub:scopeGain'), target: key('scope_review'),
      revision: 'scope_review', value: by.scope_review.delta, kind: 'scope_review', groupId,
      color: FLOW_COLORS.scope_review});
  } else if (by.scope_review.delta < 0) {
    link('scope_review', 'scopeLoss', -by.scope_review.delta, 'scope_review', 'scope_review');
  }
  for (const [revision, value, kind] of [['insertion', by.insertion.after, 'insertion'], ['increased', by.increased.delta, 'up']]) {
    if (value > 0) stubs.push({key: nodeKey(groupId, `stub:${revision}`), target: key(revision), revision, value, kind, groupId, color: FLOW_COLORS[kind]});
  }
  return {nodes, links, stubs, keys: Object.fromEntries(['before', ...REVISION_ORDER, 'after', 'reductions'].map(role => [role, key(role)]))};
}

/** Total A → groups A → each group's revision matrix → groups B → Total B.
 * Input groups partition the population; each matched record has ONE stable
 * intermediary identity. Classify records before aggregating, preserving gross
 * changes even when they offset. `order` may be a group comparator. */
export function buildRevisionFlow({id = 'flow', groups, expected, labels, revisions, order} = {}) {
  ensure(typeof id === 'string' && id.length > 0, 'missing flow identity');
  ensure(Array.isArray(groups), 'groups must be an array');
  const seen = new Set();
  const members = groups.map(g => {
    ensure(typeof g.id === 'string' && g.id.length > 0 && !seen.has(g.id), 'duplicate or missing group identity');
    seen.add(g.id);
    const matrix = buildRevisionMatrix({scope: g.id, cells: g.cells, expected: g.expected, revisions});
    return {id: g.id, label: g.label || g.id, matrix, cells: matrix.cells, ...matrix.totals};
  }).sort(order || ((a, b) => b.before - a.before || a.id.localeCompare(b.id)));
  const matrix = buildRevisionMatrix({scope: id, revisions, expected, cells: REVISION_ORDER.map(key => ({key,
    ...Object.fromEntries(['before', 'after', 'count'].map(field => [field, members.reduce((s, g) => s + g.cells.find(c => c.key === key)[field], 0)]))}))});
  const vocabulary = {...DEFAULT_LABELS, ...labels};
  const totals = matrix.totals;
  const beforeKey = nodeKey(id, 'total:before'), afterKey = nodeKey(id, 'total:after');
  // Scoped keys include a separate namespace, even if a group id equals id.
  for (const group of members) {
    group.graph = revisionMatrixGraph(group.matrix, {labels: vocabulary, groupId: nodeKey(id, group.id)});
    for (const list of [group.graph.nodes, group.graph.links, group.graph.stubs]) for (const item of list) item.groupId = group.id;
  }
  const nodes = [
    {key: beforeKey, role: 'totalBefore', column: 0, order: 0, value: totals.before, name: vocabulary.before, color: '#203147'},
    ...members.flatMap((g, index) => g.graph.nodes.map(n => ({...n, groupId: g.id, column: n.column + 1,
      order: n.column === 1 ? index * REVISION_ORDER.length + n.order : index * 2 + n.order}))),
    {key: afterKey, role: 'totalAfter', column: 4, order: 0, value: totals.after, name: vocabulary.after, color: '#203147'},
  ].filter(n => n.value > 0);
  const links = members.flatMap(g => {
    const node = role => g.graph.nodes.find(n => n.role === role);
    return [...g.graph.links.map(l => ({...l, groupId: g.id})),
      ...(g.before ? [{key: nodeKey(g.id, 'outer:before'), source: beforeKey, target: node('before').key, value: g.before, groupId: g.id, kind: 'stage', color: FLOW_COLORS.stage}] : []),
      ...(g.after ? [{key: nodeKey(g.id, 'outer:after'), source: node('after').key, target: afterKey, value: g.after, groupId: g.id, kind: 'stage', color: FLOW_COLORS.stage}] : [])];
  });
  const stubs = members.flatMap(g => g.graph.stubs.map(s => ({...s, groupId: g.id})));
  // Check the complete graph, including external stubs and terminal sinks.
  for (const n of nodes) {
    const incoming = links.filter(l => l.target === n.key).reduce((s, l) => s + l.value, 0) + stubs.filter(s => s.target === n.key).reduce((sum, s) => sum + s.value, 0);
    const outgoing = links.filter(l => l.source === n.key).reduce((s, l) => s + l.value, 0);
    ensure(n.role === 'totalBefore' || incoming === n.value, `${n.key} inflow does not reconcile`);
    ensure(['deletion', 'reductions', 'scopeLoss', 'totalAfter'].includes(n.role) ? outgoing === 0 : outgoing === n.value, `${n.key} outflow does not reconcile`);
  }
  return {id, labels: vocabulary, matrix: {...matrix, children: members.map(g => g.matrix)}, totals, groups: members, graph: {nodes, links, stubs}};
}

/** Convenience adapter for already-matched record pairs. null/undefined means
 * absent; zero is a present zero-valued record. group(record) returns {id,label}.
 * Accessors let callers regroup by category, region, office, etc. An optional
 * revise(record, a, b) returns 'scope_review' (or null for the amount-based
 * default) so callers can withhold same-road zero-overlap pairs from booked
 * adjustments exactly where the matcher flagged them. */
export function buildRevisionFlowFromRecords(records, {group, before = r => r.before, after = r => r.after, recordId = r => r.id, revise = null, ...options} = {}) {
  ensure(Array.isArray(records) && typeof group === 'function', 'records and a group accessor are required');
  const groups = new Map(), ids = new Set();
  for (const record of records) {
    const id = recordId(record), a = before(record), b = after(record), member = group(record);
    ensure(typeof id === 'string' && id.length > 0 && !ids.has(id), 'duplicate or missing record identity');
    ids.add(id);
    ensure(a != null || b != null, `${id} is absent on both sides`);
    if (a != null) integer(a, `${id} before`);
    if (b != null) integer(b, `${id} after`);
    ensure(typeof member?.id === 'string' && member.id.length > 0, `${id} has no group identity`);
    const label = member.label || member.id;
    if (!groups.has(member.id)) groups.set(member.id, {id: member.id, label, cells: new Map()});
    const g = groups.get(member.id);
    ensure(g.label === label, `conflicting labels for group ${member.id}`);
    const flagged = revise?.(record, a, b) ?? null;
    ensure(flagged === null || flagged === 'scope_review', 'revise may only flag scope_review');
    ensure(flagged !== 'scope_review' || (a != null && b != null), 'scope review requires both sides');
    const key = flagged ?? (a == null ? 'insertion' : b == null ? 'deletion' : a === b ? 'unchanged' : b > a ? 'increased' : 'reduced');
    if (!g.cells.has(key)) g.cells.set(key, {key, before: 0, after: 0, count: 0});
    const c = g.cells.get(key);
    c.before += a ?? 0; c.after += b ?? 0; c.count++;
  }
  return buildRevisionFlow({...options, groups: [...groups.values()].map(g => ({...g, cells: [...g.cells.values()]}))});
}

/** Keep the largest groups and combine the rest revision-by-revision. Ranking
 * is fixed from the before ledger, and Others stays last even if its sum is
 * larger than a retained group. Never reclassify a rolled-up net amount. */
export function collapseRevisionFlow(model, {top = 3, othersId = 'others', othersLabel = 'Others'} = {}) {
  ensure(Number.isSafeInteger(top) && top >= 0, 'top must be a non-negative integer');
  if (model.groups.length <= top) return model;
  ensure(typeof othersId === 'string' && othersId.length > 0 && !model.groups.some(g => g.id === othersId), 'Others identity conflicts with a group');
  const ranked = [...model.groups].sort((a, b) => b.before - a.before || a.id.localeCompare(b.id));
  const retained = ranked.slice(0, top), remainder = ranked.slice(top);
  const cells = REVISION_TYPES.map(({key}) => ({key,
    ...Object.fromEntries(['before', 'after', 'count'].map(field => [field, remainder.reduce((sum, g) => sum + g.cells.find(c => c.key === key)[field], 0)]))}));
  const groups = [...retained, {id: othersId, label: othersLabel, cells}];
  const rank = new Map(groups.map((g, index) => [g.id, index]));
  const flow = buildRevisionFlow({id: model.id, labels: model.labels, expected: model.totals, groups,
    revisions: Object.fromEntries(model.matrix.cells.map(c => [c.key, {label: c.label, cue: c.cue, color: c.color}])),
    order: (a, b) => rank.get(a.id) - rank.get(b.id)});
  const members = remainder.map(g => ({id: g.id, label: g.label}));
  flow.groups.find(g => g.id === othersId).members = members;
  return {...flow, rollup: {top, rankBy: 'before', othersId, members}};
}
