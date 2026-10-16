import {csvText} from './fmrModel.js';

export function validateOverview(data) {
  if (data?.schema_version !== 1 || data.fiscal_year !== 2027 || !Number.isFinite(Date.parse(data.built_at)) ||
    !Array.isArray(data.workspaces) || data.workspaces.length !== 4 || !Array.isArray(data.features)) throw new Error('Unsupported Overview summary dataset.');
  for (const w of data.workspaces) {
    if (!w.sources || !w.links || !w.controls || !w.adjustments || !w.insertions || !w.deletions ||
      !w.unchanged) throw new Error('Incomplete Overview workspace summary.');
    for (const key of ['insertions', 'deletions', 'adjustments', 'increases', 'decreases', 'house', 'nep'])
      if (!w.links[key]) throw new Error('Incomplete Overview workspace links.');
    // DPWH has no unchanged deep-link yet (no amount_same compare flag); the
    // other workspaces must carry one into an existing filtered population.
    if (w.key !== 'dpwh' && !w.links.unchanged) throw new Error('Incomplete Overview workspace links.');
    const a = w.adjustments;
    if (a.net_php !== a.increased_php - a.reduced_php || w.delta_php !==
      w.insertions.amount_php - w.deletions.amount_php + a.net_php) throw new Error('Overview funding totals do not reconcile.');
    if (!Number.isSafeInteger(w.unchanged.count) || !Number.isSafeInteger(w.unchanged.amount_php) || w.unchanged.amount_php < 0)
      throw new Error('Invalid Overview unchanged population.');
    if (w.paired_comparison_rows != null &&
      w.unchanged.comparison_rows + a.increased_count + a.reduced_count !== w.paired_comparison_rows)
      throw new Error('Overview paired rows do not partition into unchanged, increased and reduced.');
  }
  return data;
}
export function overviewCsv(data) {
  const keys = ['workspace', 'comparison_basis', 'record_grain', 'built_at', 'nep_records', 'house_records',
    'nep_ledger_php', 'house_ledger_php', 'insertion_records', 'insertion_house_php', 'deletion_records', 'deletion_nep_php',
    'unchanged_records', 'unchanged_php', 'unchanged_comparison_rows', 'unchanged_href',
    'adjustment_count', 'adjustment_count_unit', 'increased_count', 'reduced_count', 'gross_increase_php', 'gross_reduction_php', 'paired_net_php',
    'house_minus_nep_ledger_php', 'house_printed_control_php', 'nep_printed_control_php', 'printed_vs_ledger_delta_residual_php',
    'insertions_href', 'deletions_href', 'adjustments_href'];
  return csvText(keys, data.workspaces.map(w => [w.label, w.basis, w.grain, data.built_at, w.sources.nep.count, w.sources.house.count,
    w.sources.nep.amount_php, w.sources.house.amount_php, w.insertions.count, w.insertions.amount_php, w.deletions.count, w.deletions.amount_php,
    w.unchanged.count, w.unchanged.amount_php, w.unchanged.comparison_rows ?? '', w.links.unchanged ?? '',
    w.adjustments.count, w.adjustments.count_unit, w.adjustments.increased_count, w.adjustments.reduced_count,
    w.adjustments.increased_php, w.adjustments.reduced_php, w.adjustments.net_php, w.delta_php,
    w.controls.house_php, w.controls.nep_php, w.controls.residual_php, w.links.insertions, w.links.deletions, w.links.adjustments]));
}
