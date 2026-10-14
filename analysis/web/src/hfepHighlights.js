import {COLUMN_LABELS, columnAmount, columnSum, controlArithmetic, FUND_COLUMNS,
  isFlagged, isInterpreted} from './hfepModel.js';
import {compactMoney} from './fmrModel.js';

export function hfepColumnReconciliation(data) {
  return FUND_COLUMNS.map(column => {
    const nep = columnAmount(data.stages.nep.annex_control, column);
    const house = columnAmount(data.stages.house.annex_control, column);
    const nepLedger = columnSum(data.stages.nep.facilities, column);
    const houseLedger = columnSum(data.stages.house.facilities, column);
    return {id: column, label: COLUMN_LABELS[column], nep_php: nep, house_php: house,
      delta_php: house - nep, nep_ledger_php: nepLedger, house_ledger_php: houseLedger,
      nep_residual_php: nep - nepLedger, house_residual_php: house - houseLedger};
  });
}
// Align printed category numbers, keeping both original labels and sources.
// This aligns controls only; it makes no facility identity claim.
export function hfepCategoryMovements(data) {
  const groups = new Map();
  for (const side of ['nep', 'house']) for (const category of data.stages[side].categories) {
    const key = category.label.match(/^\d+/)?.[0] || category.label;
    const row = groups.get(key) || {id: key};
    row[side] = category;
    groups.set(key, row);
  }
  return [...groups.values()].map(row => ({...row, label: (row.house || row.nep).label,
    nep_php: columnAmount(row.nep?.amounts_php, 'total'), house_php: columnAmount(row.house?.amounts_php, 'total'),
    delta_php: (columnAmount(row.house?.amounts_php, 'total') || 0) - (columnAmount(row.nep?.amounts_php, 'total') || 0),
  })).sort((a, b) => Math.abs(b.delta_php) - Math.abs(a.delta_php));
}
export function hfepControlEvidence(index) {
  // Audit internal controls exclude the root and its grand-total echo.
  return [...index.byId.values()].filter(node => !['facility', 'root', 'grand_total'].includes(node.kind)).map(node => {
    const arithmetic = controlArithmetic(index, node.id);
    const total = arithmetic.columns.find(c => c.column === 'total');
    // Arithmetic treats empty components as zero contributions, but an
    // exported printed cell must retain its original unavailable value.
    const columns = arithmetic.columns.map(column => ({...column, printed: columnAmount(node.amounts_php, column.column)}));
    return {...node, facilities: arithmetic.facilities, printed_php: total.printed, facility_sum_php: total.facility_sum,
      max_difference_php: Math.max(...arithmetic.columns.map(c => Math.abs(c.difference))), columns};
  });
}
export function hfepHospitalPriorities(data) {
  const categories = hfepCategoryMovements(data).filter(row => ['2', '3'].includes(row.id));
  const projects = Object.fromEntries(['nep', 'house'].map(side => {
    const labels = new Set(categories.map(row => row[side]?.label).filter(Boolean));
    return [side, data.stages[side].facilities.filter(facility => labels.has(facility.path_labels[1]))];
  }));
  return {categories, projects};
}
export function hfepHighlights(data) {
  const {nep, house} = data.stages;
  const columns = hfepColumnReconciliation(data), total = columns.find(row => row.id === 'total');
  const review = nep.facilities.filter(f => isFlagged(f) || isInterpreted(f));
  const flagged = review.filter(isFlagged).length, interpreted = review.filter(isInterpreted).length;
  const affected = new Set(nep.printed_defects.map(d => d.node_id)).size;
  const hospitals = hfepHospitalPriorities(data);
  const doh = hospitals.categories.find(row => row.id === '3'), lgu = hospitals.categories.find(row => row.id === '2');
  const metric = (label, value, format) => ({label, value, format});
  return [
    {id: 'nep-defect', kind: 'Printed discrepancy', title: `A ${compactMoney(total.nep_residual_php)} NEP control overhang`,
      body: `The printed NEP medical-equipment and total controls exceed their retained facility sums by ${compactMoney(total.nep_residual_php)}. The same documented overhang propagates through ${affected} controls.`,
      prompt: 'Where does the overhang first appear, and how does it reach the annex total?', actionLabel: 'Trace the control overhang',
      href: 'nep', params: {node: 'nep_hfep:p2:r47', view: 'tree'},
      takeaway: 'Follow the Metro Manila control up through region, subcategory, category and annex, comparing printed values with facility sums.',
      limit: 'The chain repeats one discrepancy. Do not add its echoed amounts together or infer an identified missing facility from the residual alone.',
      metrics: [metric('Printed NEP annex', total.nep_php, 'money'), metric('NEP facility ledger', total.nep_ledger_php, 'money'), metric('Control overhang', total.nep_residual_php, 'money')]},
    {id: 'lgu-split', kind: 'Printed controls', title: `HFEP capital outlays fall by ${compactMoney(Math.abs(total.delta_php))}`,
      body: `Printed NEP ${compactMoney(total.nep_php)} → House ${compactMoney(total.house_php)}. Review the infrastructure, equipment and vehicle changes alongside the different movements in LGU and DOH hospital categories.`,
      prompt: 'Which funding columns and facility categories explain the reduction?', actionLabel: 'Compare funding and categories', href: 'compare',
      takeaway: 'Printed funding-column and category controls independently reconcile the capital-outlay change. Original category labels and source pages remain visible.',
      limit: `Controls describe allocations, not certified facility replacements. The NEP facility ledger has a separate ${compactMoney(total.nep_residual_php)} documented residual; it is not an additional budget cut.`,
      metrics: [metric('NEP capital outlays', total.nep_php, 'money'), metric('House capital outlays', total.house_php, 'money'), metric('House − NEP', total.delta_php, 'signed')]},
    {id: 'house-balance', kind: 'Source arithmetic', title: 'House controls reconcile to the peso',
      body: `All ${house.audit_summary.internal_control_checks} internal controls reconcile across four funding columns, and ${house.facilities.length} facility rows reproduce the annex total.`,
      prompt: 'Does each printed control match its facility sums on every funding column?', actionLabel: 'Inspect the control checks', href: 'house', params: {view: 'tree'},
      takeaway: 'Inspect the full internal-control population and select any control for its four-column arithmetic and printed page.',
      limit: 'Balanced arithmetic establishes internal consistency. It does not authenticate facility identity, project readiness, delivery or procurement costs. Parent controls and facility rows describe the same money.',
      metrics: [metric('Internal controls', house.audit_summary.internal_control_checks), metric('House facility rows', house.facilities.length), metric('Ledger − printed total', total.house_ledger_php - total.house_php, 'signed')]},
    {id: 'ocr-flags', kind: 'Extraction evidence', title: `${review.length} NEP facilities retain extraction notes`,
      body: `${flagged} facilities carry flags and ${interpreted} carry interpretation events; the ${review.length} distinct rows include their overlap. Original cells, accepted readings and reasons are retained.`,
      prompt: 'What did each printed cell say, and how was its accepted reading established?', actionLabel: 'Inspect extraction notes', href: 'nep', params: {view: 'review'}, projects: review,
      takeaway: 'Inspect both flagged and interpreted facilities, including dash readings, verified odd amounts and documented label repairs.',
      limit: 'These are extraction records, including resolved findings. Routine derived row-identity zeros alone do not put a facility in this population. Flags and interpretation events overlap.',
      metrics: [metric('Distinct reviewed rows', review.length), metric('Flagged rows', flagged), metric('Interpreted rows', interpreted)]},
    {id: 'hospital-priorities', aliases: ['agency-check'], kind: 'Hospital allocations',
      title: 'Why do DOH hospital allocations fall while LGU hospital allocations rise?',
      body: `DOH Hospitals: ${compactMoney(doh.nep_php)} NEP → ${compactMoney(doh.house_php)} House, down ${compactMoney(Math.abs(doh.delta_php))}. LGU Hospitals: ${compactMoney(lgu.nep_php)} → ${compactMoney(lgu.house_php)}, up ${compactMoney(lgu.delta_php)}.`,
      prompt: 'Which facilities account for these opposing changes, what needs justify them, and what could they mean for access to care?',
      actionLabel: 'Explore hospital funding priorities', href: 'compare', params: {view: 'columns'}, hospitals,
      takeaway: 'Compare the two printed hospital-category controls and their original facility allocations in each source. Seek amendment justifications and service plans to explain the priorities.',
      limit: 'These are HFEP capital outlays. Opposite category movements do not establish a direct transfer or demonstrate closures, staffing changes or service impacts. Facility counterparts remain provisional.',
      metrics: [metric('DOH Hospitals change', doh.delta_php, 'signed'), metric('LGU Hospitals change', lgu.delta_php, 'signed'),
        metric('Combined hospital change', doh.delta_php + lgu.delta_php, 'signed')]},
  ];
}
