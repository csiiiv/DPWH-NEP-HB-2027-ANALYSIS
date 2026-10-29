import {buildRevisionFlow, collapseRevisionFlow} from './revisionFlow.js';

import {revisionMatrix} from './revisionMatrix.js';
export {REVISIONS} from './revisionMatrix.js';

export const FLOW_CAVEAT = 'Matching remains provisional. HGAB-only and NEP-only rows are unsupported insertion/deletion candidates, not confirmed edits. Changes do not establish transfers between projects.';
const ensure = (ok, message) => {if (!ok) throw new Error(`Budget flow: ${message}`);};

// The same matrix primitive powers the existing Allocation flows and each
// intermediary below. An outer matrix is the sum of its scoped children.
export function buildBudgetCategoryModel(payload, scope = 'dpwh') {
  ensure(payload?.schema_version === 1 && Array.isArray(payload.categories), 'unsupported payload');
  ensure([payload.stages?.nep?.amount_php, payload.stages?.third?.amount_php, payload.totals?.rows].every(Number.isSafeInteger), 'source ledgers or row coverage missing');
  try {
    const matrix = revisionMatrix({scope, cells: payload.categories.map(c => ({key: c.class, rows: c.rows, nep: c.nep_php, hgab: c.third_php})),
      expected: {nep: payload.stages?.nep?.amount_php, hgab: payload.stages?.third?.amount_php, rows: payload.totals?.rows}});
    return {matrix, categories: matrix.cells, totals: matrix.totals};
  } catch (error) {throw new Error(`Budget flow: ${error.message}`);}
}

export function categoryRecordHref(key, group) {
  const flags = {insertion: 'house_only', deletion: 'nep_only_all', unchanged: 'amount_same', increased: 'amount_increase', reduced: 'amount_decrease', scope_review: 'segment_scope'};
  const params = new URLSearchParams({view: 'projects'});
  if (key) params.set('flag', flags[key]);
  if (group) {
    params.set('program', group);
    if (group !== 'fap') params.set('exclude_fap', '1');
  }
  return `#compare?${params}`;
}

export function buildBudgetFlowModel(payload, groupingKey = 'category') {
  const summary = buildBudgetCategoryModel(payload, payload.dataset?.key || 'dpwh');
  const grouping = payload.groupings?.[groupingKey];
  ensure(grouping && Array.isArray(grouping.groups), 'grouping data is unavailable; rebuild dpwh_flow_2027.json');
  const seen = new Set();
  const groups = grouping.groups.map(g => {
    ensure(g.id && !seen.has(g.id), 'duplicate or missing group identity');
    seen.add(g.id);
    const nep = g.classes.reduce((s, c) => s + c.nep_php, 0), hgab = g.classes.reduce((s, c) => s + c.third_php, 0);
    const model = buildBudgetCategoryModel({schema_version: 1, categories: g.classes,
      totals: {rows: g.rows}, stages: {nep: {amount_php: nep}, third: {amount_php: hgab}}}, g.id);
    return {id: g.id, label: g.label, matrix: model.matrix, ...model.totals, cells: model.categories.map(c => ({...c, id: `${g.id}:${c.key}`, group_id: g.id}))};
  }).sort((a, b) => b.nep - a.nep || a.id.localeCompare(b.id));
  for (const key of ['rows', 'nep', 'hgab', 'additions', 'reductions']) {
    ensure(groups.reduce((s, g) => s + g[key], 0) === summary.totals[key], `group ${key} does not rebuild the total`);
  }
  for (const revision of summary.categories) {
    for (const side of ['nep', 'hgab', 'rows']) ensure(groups.reduce((s, g) => s + g.cells.find(c => c.key === revision.key)[side], 0) === revision[side], `group cells do not rebuild ${revision.key} ${side}`);
  }
  const dataset = payload.dataset || {key: 'dpwh', label: 'DPWH', count_unit: 'comparison rows', house_note: 'House 3rd reading', caveat: FLOW_CAVEAT};
  const flow = buildRevisionFlow({id: dataset.key, groups: groups.map(g => ({id: g.id, label: g.label,
    cells: g.cells.map(c => ({key: c.key, before: c.nep, after: c.hgab, count: c.rows}))})),
    expected: {before: summary.totals.nep, after: summary.totals.hgab, count: summary.totals.rows},
    labels: {before: 'NEP total', after: 'HGAB total', intermediaryBefore: `${grouping.label} · NEP`, intermediaryAfter: `${grouping.label} · HGAB`,
      matrix: 'Revision cells', additions: 'New House money', reductions: 'House Reductions', count: dataset.count_unit}});
  return {...summary, matrix: {...summary.matrix, children: groups.map(g => g.matrix)}, dataset, grouping: {key: grouping.key, label: grouping.label, plural: grouping.plural || 'categories', basis: grouping.basis}, groups, flow};
}

// A display rollup only. Source categories and all global revision totals
// stay intact; constituent evidence remains available through members.
export function collapseBudgetGroups(model, top = 3) {
  const flow = collapseRevisionFlow(model.flow, {top, othersLabel: `Others (${Math.max(0, model.groups.length - top)} ${model.grouping.plural || 'categories'})`});
  if (flow === model.flow) return model;
  const groups = flow.groups.map(g => {
    const source = model.groups.find(source => source.id === g.id);
    if (source) return source;
    const matrix = revisionMatrix({scope: g.id, cells: g.cells.map(c => ({key: c.key, rows: c.count, nep: c.before, hgab: c.after}))});
    return {id: g.id, label: g.label, matrix, ...matrix.totals,
      cells: matrix.cells.map(c => ({...c, group_id: g.id})),
      members: g.members.map(member => model.groups.find(source => source.id === member.id))};
  });
  return {...model, groups, flow, rollup: flow.rollup,
    matrix: {...model.matrix, children: groups.map(g => g.matrix)}};
}

// Scoped links are offered only where the target workspace can express the
// same record population. Other dimensions link to the comparison workspace
// with an explicit unfiltered label rather than promising a false drilldown.
export function budgetFlowRecordLink(model, revision, group) {
  const source = model.dataset?.key || 'dpwh';
  if (source === 'dpwh' && model.grouping.key === 'category') return {href: categoryRecordHref(revision, group), scoped: true};
  const status = {insertion: 'house_only', deletion: 'nep_only', unchanged: 'unchanged', increased: 'increased', reduced: 'decreased'}[revision];
  // FMR/NIA have no segment-scope machinery: a scope_review cell there is the
  // normalized empty one, and if one ever carries rows the target workspace
  // cannot express that population — fall back to the unscoped label rather
  // than promising a filter that selects the wrong rows.
  if (revision === 'scope_review' && (source === 'fmr' || source === 'nia'))
    return {href: model.dataset.comparison_href, scoped: false};
  if (source === 'fmr' || source === 'nia' && (!group || model.grouping.key === 'subprogram')) {
    const params = new URLSearchParams({view: 'projects'});
    if (status) params.set('status', status);
    if (group && group !== '__not_recorded__') params.set(source === 'fmr' ? 'region' : 'subprogram', group);
    return {href: `#${source}/compare?${params}`, scoped: group !== '__not_recorded__'};
  }
  return {href: model.dataset.comparison_href, scoped: false};
}
