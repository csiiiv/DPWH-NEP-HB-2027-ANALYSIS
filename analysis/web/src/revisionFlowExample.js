import {buildRevisionFlowFromRecords} from './revisionFlow.js';

// A second domain: item quantities at two inventory snapshots. These records
// are already paired. A null side is absent; an actual zero remains present.
export const inventoryRecords = [
  {id: 'a', region: 'North', department: 'Tools', before: 40, after: 25},
  {id: 'b', region: 'North', department: 'Tools', before: 20, after: 35},
  {id: 'c', region: 'North', department: 'Parts', before: 10, after: null},
  {id: 'd', region: 'South', department: 'Parts', before: null, after: 12},
  {id: 'e', region: 'South', department: 'Tools', before: 30, after: 30},
  {id: 'f', region: 'South', department: 'Parts', before: 0, after: 0},
];

export function inventoryFlow(dimension = 'region') {
  if (!['region', 'department'].includes(dimension)) throw new Error('Unknown inventory grouping');
  return buildRevisionFlowFromRecords(inventoryRecords, {
    id: 'inventory', group: record => ({id: record[dimension], label: record[dimension]}),
    expected: {before: 100, after: 102, count: 6},
    labels: {before: 'Opening stock', after: 'Closing stock',
      intermediaryBefore: `${dimension} · opening`, intermediaryAfter: `${dimension} · closing`,
      additions: 'Added items', reductions: 'Removed items', count: 'stock records'},
  });
}
