import {allocationStats, candidateAggregates, filterProjects} from './niaModel.js';

export const share = (value, total) => total ? value / total : null;

export const aiMonitoringLabels = {explicit: 'Explicit AI wording', ocr_variant: 'NEP OCR variant (Al/AT)'};
// The 59 retained NEP Al/AL/AT Monitoring titles were checked against the
// rendered NIA annex and read AI. Classify them without rewriting source text
// or changing canonical-title pairs. Generic remote monitoring is excluded.
export function aiMonitoringBasis(project) {
  const title = String(project.title || '').normalize('NFKC');
  if (/\b(?:AI|Artificial\s+Intelligence)[\s-]+(?:Satellite[\s-]+Assisted[\s-]+)?Monitoring\b/i.test(title)) return 'explicit';
  if (project.source?.source_pdf === 'dbm-other-nep-line-data/NIA.pdf' && /\b(?:Al|AT)\s+Monitoring\b/i.test(title)) return 'ocr_variant';
  return null;
}
export function aiMonitoringProjects(projects, {aiBasis = 'all'} = {}) {
  return projects.filter(p => {const basis = aiMonitoringBasis(p); return basis && (aiBasis === 'all' || aiBasis === basis);});
}
// Insertion figures always use unmatched House source rows. The source-stage
// selector does not turn unmatched NEP rows into insertion candidates.
export function aiMonitoringInsertions(rows, params = {}) {
  const candidates = rows.filter(r => r.status === 'house_only' && r.house);
  const ids = new Set(aiMonitoringProjects(filterProjects(candidates.map(r => r.house), params), params).map(p => p.id));
  return candidates.filter(r => ids.has(r.house.id));
}

// Each source row contributes once. Coverage counts both the rows and pesos
// represented by provisional pairs; it never certifies project identity.
export function fundingSummary(rows) {
  const result = {...candidateAggregates(rows), sources: {}};
  for (const side of ['nep', 'house']) {
    const source = rows.filter(r => r[side]);
    const paired = source.filter(r => r.status === 'paired');
    const total = source.reduce((s, r) => s + r[side].amount_php, 0);
    const pairedAmount = paired.reduce((s, r) => s + r[side].amount_php, 0);
    result.sources[side] = {count: source.length, total, paired_count: paired.length,
      paired_amount_php: pairedAmount, row_share: share(paired.length, source.length),
      allocation_share: share(pairedAmount, total)};
  }
  return result;
}

export function fundingGroups(rows, controls) {
  return controls.map(control => ({id: control.key, label: control.label,
    rows: rows.filter(r => r.subprogram_key === control.key)})).filter(g => g.rows.length).map(g => {
    const summary = fundingSummary(g.rows);
    return {id: g.id, label: g.label,
      nep_php: summary.sources.nep.total, house_php: summary.sources.house.total,
      delta_php: summary.net_delta_php, paired_delta_php: summary.paired_delta_php,
      house_only_php: summary.house_only_php, nep_only_php: summary.nep_only_php};
  }).sort((a, b) => Math.abs(b.delta_php) - Math.abs(a.delta_php) || a.id.localeCompare(b.id));
}

export function concentration(projects) {
  const stats = allocationStats(projects);
  const largest = [...projects].sort((a, b) => b.amount_php - a.amount_php || a.id.localeCompare(b.id)).slice(0, 10);
  const amount = largest.reduce((s, p) => s + p.amount_php, 0);
  return {...stats, top: largest, top_amount_php: amount, top_share: share(amount, stats.total)};
}

// Concentration is calculated within the current filtered source population.
// Controls and parent headings are excluded; ties use stable source IDs.
export function concentrationRows(projects, subprograms) {
  return subprograms.map(s => ({id: s.key, label: s.label,
    ...concentration(projects.filter(p => p.subprogram_key === s.key))}))
    .filter(s => s.count).sort((a, b) => b.total - a.total);
}
