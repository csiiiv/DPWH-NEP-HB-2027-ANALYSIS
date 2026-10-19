import {buildRevisionFlow} from './revisionFlow.js';

// Adapter from a *grouping contract* to the generic revision flow.
//
// `revisionFlow.js` is domain-neutral but expects normalized groups:
// `{id, label, cells: [{key, before, after, count}]}`. Real payloads are not
// shaped like that — the DPWH flow payload nests cells under
// `groupings[key].groups[].classes` with `nep_php`/`third_php` fields, while
// another dataset would use entirely different names.
//
// This module closes that gap with accessors instead of hardcoding either
// schema, so a new dataset supplies its own field readers and gets the same
// five-stage figure with no change to the builder or any renderer. Nothing
// here knows about NEP, HGAB, pesos or categories; the defaults merely happen
// to match the DPWH payload.
//
//   groupsOf(payload)      -> [group]        the intermediary members
//   cellsOf(group)         -> [cell]         that member's revision cells
//   groupKey / groupLabel  -> string         member identity and display name
//   cellKey                -> revision type  one of revisionFlow REVISION_ORDER
//   cellBefore / cellAfter -> safe integer   the two compared amounts
//   cellCount              -> safe integer   supporting record count
//   expectedBefore/After/Count -> totals the groups must rebuild exactly

const ensure = (ok, message) => {if (!ok) throw new Error(`Grouping flow: ${message}`);};

/** Run a caller-supplied accessor, converting a raw TypeError (a wrong field
 *  name in someone else's dataset) into a message naming the accessor. A bad
 *  contract must be diagnosable, not a crash from inside this module. */
const read = (accessor, what) => {
  try {return accessor();}
  catch (error) {
    throw error instanceof TypeError
      ? new Error(`Grouping flow: ${what} (${error.message})`) : error;
  }
};

/** The default contract: the DPWH flow payload's `groupings[key]` shape. */
export const DEFAULT_ACCESSORS = (grouping = 'category') => ({
  groupsOf: payload => payload?.groupings?.[grouping]?.groups,
  cellsOf: group => group.classes,
  groupKey: group => group.id,
  groupLabel: group => group.label,
  cellKey: cell => cell.class,
  cellBefore: cell => cell.nep_php,
  cellAfter: cell => cell.third_php,
  cellCount: cell => cell.rows,
  expectedBefore: payload => payload?.stages?.nep?.amount_php,
  expectedAfter: payload => payload?.stages?.third?.amount_php,
  expectedCount: payload => payload?.totals?.rows,
});

/** Build the generic flow from a grouping contract.
 *
 *  `recordHref(revision, groupId)` optionally deep-links each graph node to its
 *  supporting records. It decorates nodes and cannot affect geometry, so it is
 *  applied after the conserved graph is built and validated. */
export function buildFlowFromGrouping(payload, {
  grouping = 'category', id = 'flow', labels, revisions, order, recordHref = null,
  ...accessors
} = {}) {
  const a = {...DEFAULT_ACCESSORS(grouping), ...accessors};
  const groups = read(() => a.groupsOf(payload), `cannot read the '${grouping}' grouping`);
  ensure(Array.isArray(groups) && groups.length > 0,
    `grouping '${grouping}' is unavailable; rebuild the flow payload`);

  const flow = buildRevisionFlow({id, labels, revisions, order,
    groups: groups.map(group => {
      const key = read(() => a.groupKey(group), `cannot read a '${grouping}' group identity`);
      ensure(typeof key === 'string' && key.length > 0,
        `cannot read a '${grouping}' group identity; every group needs a non-empty string id`);
      const cells = read(() => a.cellsOf(group), `cannot read the revision cells of group '${key}'`);
      ensure(Array.isArray(cells) && cells.length > 0, `group '${key}' has no revision cells`);
      return {id: key,
        label: read(() => a.groupLabel(group), `cannot read the label of group '${key}'`) ?? key,
        cells: cells.map(cell => {
          const type = read(() => a.cellKey(cell), `cannot read a revision type in group '${key}'`);
          return {key: type,
            before: read(() => a.cellBefore(cell), `cannot read a before value for '${type}' in group '${key}'`),
            after: read(() => a.cellAfter(cell), `cannot read an after value for '${type}' in group '${key}'`),
            count: read(() => a.cellCount(cell), `cannot read a record count for '${type}' in group '${key}'`)};
        })};
    }),
    expected: {
      before: read(() => a.expectedBefore(payload), 'cannot read the before ledger'),
      after: read(() => a.expectedAfter(payload), 'cannot read the after ledger'),
      count: read(() => a.expectedCount(payload), 'cannot read the total record count')}});

  if (!recordHref) return flow;
  // Roles map onto the caller's revision vocabulary: a reductions sink is the
  // gross side of a reduced cell, and a ledger node covers the whole grouping.
  const revisionOf = node => node.revision ?? (node.role === 'reductions' ? 'reduced' : null);
  for (const node of flow.graph.nodes) node.href = recordHref(revisionOf(node), node.groupId ?? null);
  return flow;
}
