import {allocationStats, candidateAggregates, filterComparisons, filterProjects, groupLabel, medianNumber, normalizeMatchingMethod, projectGroupId, rowsForMethod, signedMoney} from './niaModel.js';

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
// `method` selects which labeled matching classification supplies the
// unmatched population.
export function aiMonitoringInsertions(rows, params = {}) {
  const method = normalizeMatchingMethod(params.method);
  const scoped = rowsForMethod(rows, method);
  const candidates = scoped.filter(r => r.status === 'house_only' && r.house);
  const ids = new Set(aiMonitoringProjects(filterProjects(candidates.map(r => r.house), params), params).map(p => p.id));
  return candidates.filter(r => ids.has(r.house.id));
}

// Deterministic reconciliation of the AI monitoring ledgers, using only the
// strict title pairs. Paired rows print identical amounts, so the whole
// NEP → House movement rides on unmatched rows and the candidate total is a
// matching residual, not the budget change. `twin_*` counts candidates that a
// one-to-one maximum matching can pair with an unpaired same-sub-program,
// same-amount NEP AI row — a review pointer that explains most candidates as
// retitled continuations, never a certified pair. Under ai_corrected the
// twins have already become pairs, so the twin pass reports on the strict
// classification only.
export function aiMonitoringReconciliation(rows, {method = 'ai_corrected'} = {}) {
  const scoped = rowsForMethod(rows, method);
  const candidates = aiMonitoringInsertions(rows, {method});
  const paired = scoped.filter(r => r.status === 'paired' && r.nep && r.house
    && aiMonitoringBasis(r.nep) && aiMonitoringBasis(r.house));
  const nepOnly = scoped.filter(r => r.status === 'nep_only' && r.nep && aiMonitoringBasis(r.nep));
  const twinPool = new Map();
  for (const r of nepOnly) {
    const key = `${r.nep.subprogram_key}\u0000${r.nep.amount_php}`;
    (twinPool.get(key) || twinPool.set(key, []).get(key)).push(r.nep.id);
  }
  // Kuhn's algorithm over the tiny candidate/twin bipartite graph: the count
  // stays order-independent, unlike a greedy first-fit pass.
  const owner = new Map();
  const assign = (row, seen) => {
    for (const id of twinPool.get(`${row.house.subprogram_key}\u0000${row.house.amount_php}`) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!owner.has(id) || assign(candidates.find(c => c.id === owner.get(id)), seen)) {
        owner.set(id, row.id); return true;
      }
    }
    return false;
  };
  const twinned = new Set();
  for (const row of candidates) if (assign(row, new Set())) twinned.add(row.id);
  let twinPhp = 0;
  for (const r of candidates) if (twinned.has(r.id)) twinPhp += r.house_php;
  const sum = (list, side) => list.reduce((s, r) => s + r[side], 0);
  const pairedNep = sum(paired, 'nep_php'), pairedHouse = sum(paired, 'house_php');
  const candidatePhp = sum(candidates, 'house_php'), nepOnlyPhp = sum(nepOnly, 'nep_php');
  return {paired_count: paired.length, paired_nep_php: pairedNep, paired_house_php: pairedHouse,
    paired_delta_php: pairedHouse - pairedNep, candidate_count: candidates.length, candidate_php: candidatePhp,
    twin_count: twinned.size, twin_php: twinPhp, nep_only_count: nepOnly.length, nep_only_php: nepOnlyPhp,
    nep_php: pairedNep + nepOnlyPhp, house_php: pairedHouse + candidatePhp, net_delta_php: candidatePhp - nepOnlyPhp};
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
// `groups` is [{key|id, label}] — usually stage.subprograms or dim options.
export function concentrationRows(projects, groups, dim = 'subprogram') {
  return groups.map(s => {
    const id = s.id || s.key;
    const scoped = projects.filter(p => projectGroupId(p, dim) === id);
    return {id, label: s.label, ...concentration(scoped)};
  }).filter(s => s.count).sort((a, b) => b.total - a.total);
}

/** Distinct groups present in `projects` for a stats/overview dimension. */
export function dimensionGroups(projects, dim, subprogramLabels = new Map()) {
  const groups = new Map();
  for (const p of projects) {
    const id = projectGroupId(p, dim);
    if (!groups.has(id)) {
      groups.set(id, {id, key: id, label: groupLabel(id, dim, subprogramLabels)});
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Allocation rollup (count/total/median) for any analysis dimension. */
export function allocationRowsByDim(projects, dim, subprogramLabels = new Map()) {
  const buckets = new Map();
  for (const p of projects) {
    const id = projectGroupId(p, dim);
    const entry = buckets.get(id) || {
      id, key: id, label: groupLabel(id, dim, subprogramLabels), amounts: [],
    };
    entry.amounts.push(p.amount_php);
    buckets.set(id, entry);
  }
  return [...buckets.values()]
    .map(({amounts, ...rest}) => ({
      ...rest,
      ...allocationStats(amounts.map(amount_php => ({amount_php}))),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function quantileSorted(sorted, fraction) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/** Descriptive stats over finite php_per_m values (title-chainage proxy). */
export function phpPerMStats(projects) {
  const rates = projects.map(p => p.php_per_m).filter(Number.isFinite).sort((a, b) => a - b);
  return phpPerMDistribution(rates);
}

/**
 * Box/whisker + scatter inputs for a sorted ₱/m series.
 * Whiskers use Tukey fences (1.5 × IQR); points beyond are outliers.
 */
export function phpPerMDistribution(ratesInput) {
  const rates = [...ratesInput].filter(Number.isFinite).sort((a, b) => a - b);
  const n = rates.length;
  if (!n) {
    return {
      count: 0, rates: [], median: null, mean: null, p25: null, p75: null,
      min: null, max: null, whisker_low: null, whisker_high: null,
    };
  }
  const total = rates.reduce((s, v) => s + v, 0);
  const p25 = quantileSorted(rates, 0.25);
  const p75 = quantileSorted(rates, 0.75);
  const iqr = p75 - p25;
  const fenceLow = p25 - 1.5 * iqr;
  const fenceHigh = p75 + 1.5 * iqr;
  let whiskerLow = rates[0], whiskerHigh = rates[n - 1];
  for (const rate of rates) {
    if (rate >= fenceLow) {whiskerLow = rate; break;}
  }
  for (let i = n - 1; i >= 0; i--) {
    if (rates[i] <= fenceHigh) {whiskerHigh = rates[i]; break;}
  }
  return {
    count: n,
    rates,
    median: medianNumber(rates),
    mean: total / n,
    p25, p75,
    min: rates[0],
    max: rates[n - 1],
    whisker_low: whiskerLow,
    whisker_high: whiskerHigh,
  };
}

/** Shared log domain for comparable ₱/m strips across groups. */
export function phpPerMStripDomain(rows, pad = 0.08) {
  const rates = rows.flatMap(r => r.rates || []).filter(v => Number.isFinite(v) && v > 0);
  if (!rates.length) return {min: 1_000, max: 1_000_000};
  let lo = Math.min(...rates), hi = Math.max(...rates);
  if (lo === hi) {
    lo = lo / 2;
    hi = hi * 2;
  }
  const logLo = Math.log10(lo), logHi = Math.log10(hi);
  const span = Math.max(logHi - logLo, 0.5);
  return {
    min: 10 ** (logLo - span * pad),
    max: 10 ** (logHi + span * pad),
  };
}

/**
 * Per-dimension chainage ₱/m table. `projects` is the filtered stage
 * population; rows without a positive title-chainage length contribute to
 * `projects` but not to the rate stats.
 */
export function phpPerMRowsByDim(projects, dim, subprogramLabels = new Map()) {
  const buckets = new Map();
  for (const p of projects) {
    const id = projectGroupId(p, dim);
    const entry = buckets.get(id) || {
      id, label: groupLabel(id, dim, subprogramLabels), projects: [],
    };
    entry.projects.push(p);
    buckets.set(id, entry);
  }
  return [...buckets.values()].map(g => {
    const rates = phpPerMStats(g.projects);
    return {
      id: g.id,
      label: g.label,
      projects: g.projects.length,
      with_chainage: rates.count,
      chainage_share: g.projects.length ? rates.count / g.projects.length : null,
      median: rates.median,
      mean: rates.mean,
      p25: rates.p25,
      p75: rates.p75,
      min: rates.min,
      max: rates.max,
      rates: rates.rates,
      whisker_low: rates.whisker_low,
      whisker_high: rates.whisker_high,
    };
  }).filter(r => r.projects)
    .sort((a, b) => (b.with_chainage - a.with_chainage)
      || ((b.median ?? -1) - (a.median ?? -1))
      || a.label.localeCompare(b.label));
}

/**
 * Preferred project wording for chainage views: Senate column-V fixed /
 * submission title when stamped, else the annex print title.
 */
export function preferredChainageTitle(project) {
  const fixed = project?.submission_label;
  if (typeof fixed === 'string' && fixed.trim()) return fixed.trim();
  const title = project?.title || project?.label;
  return typeof title === 'string' ? title : '';
}

/** Compact funding-scope labels for chainage project tables. */
export const chainageFundingLabels = {
  both_funded: 'NEP+House',
  house_zeroed: 'NEP Only',
  house_insertion: 'House Only',
  unfunded: 'Unfunded',
};

/**
 * Senate workbook funding scope for a stage project. Prefers a stamped
 * `workbook_status`, else looks up the workbook row by `senate_id` / join id.
 */
export function chainageFundingScope(project, senateByStageId = null) {
  const status = project?.workbook_status
    || project?.funding_scope
    || (project?.senate_id && senateByStageId?.get(project.senate_id)?.status)
    || (project?.id && senateByStageId?.get(project.id)?.status)
    || null;
  if (!status) return {status: null, label: '—'};
  return {status, label: chainageFundingLabels[status] || status};
}

/** Index Senate workbook rows by NEP/House ledger id and workbook id. */
export function senateByStageIdIndex(senateProjects = []) {
  const map = new Map();
  for (const p of senateProjects) {
    map.set(p.id, p);
    if (p.nep_join?.id) map.set(p.nep_join.id, p);
    if (p.house_join?.id) map.set(p.house_join.id, p);
  }
  return map;
}

/**
 * Tukey extremity in IQR units past the near quartile.
 * Mild outliers start at 1.5; classic “extreme” Tukey cutoff is 3.0.
 */
export function phpPerMOutlierFenceScore(rate, stats, side) {
  const iqr = stats.p75 - stats.p25;
  if (!(iqr > 0) || !Number.isFinite(rate)) return null;
  if (side === 'high') return (rate - stats.p75) / iqr;
  if (side === 'low') return (stats.p25 - rate) / iqr;
  return null;
}

/** How many times the group median the rate is (always ≥ 1 for outliers). */
export function phpPerMOutlierMedianRatio(rate, median, side) {
  if (!(median > 0) || !Number.isFinite(rate) || !(rate > 0)) return null;
  return side === 'high' ? rate / median : median / rate;
}

/**
 * Triage band from fence score (IQR units past P25/P75).
 * mild < 3 · moderate < 5 · severe < 10 · extreme ≥ 10
 */
export function phpPerMOutlierSeverity(fenceScore) {
  if (!(fenceScore >= 0)) return null;
  if (fenceScore < 3) return 'mild';
  if (fenceScore < 5) return 'moderate';
  if (fenceScore < 10) return 'severe';
  return 'extreme';
}

/**
 * Title-chainage projects beyond their group's Tukey whiskers (same rule as
 * the brown scatter dots). Each outlier is scored against its own dim bucket,
 * not a global fence. `fence_score` = IQR units past P25/P75; `severity` is
 * the triage band; `median_ratio` is × group median.
 */
export function phpPerMOutlierProjects(projects, dim, subprogramLabels = new Map()) {
  const buckets = new Map();
  for (const p of projects) {
    const id = projectGroupId(p, dim);
    const entry = buckets.get(id) || {
      id, label: groupLabel(id, dim, subprogramLabels), projects: [],
    };
    entry.projects.push(p);
    buckets.set(id, entry);
  }
  const outliers = [];
  for (const g of buckets.values()) {
    const stats = phpPerMStats(g.projects);
    if (!stats.count || stats.whisker_low == null) continue;
    const iqr = stats.p75 - stats.p25;
    if (!(iqr > 0)) continue;
    for (const p of g.projects) {
      if (!Number.isFinite(p.php_per_m)) continue;
      const high = p.php_per_m > stats.whisker_high;
      const low = p.php_per_m < stats.whisker_low;
      if (!high && !low) continue;
      const side = high ? 'high' : 'low';
      const fence_score = phpPerMOutlierFenceScore(p.php_per_m, stats, side);
      const median_ratio = phpPerMOutlierMedianRatio(p.php_per_m, stats.median, side);
      outliers.push({
        id: p.id,
        title: preferredChainageTitle(p),
        ledger_title: p.title || null,
        submission_label: p.submission_label || null,
        senate_id: p.senate_id || null,
        group_id: g.id,
        group_label: g.label,
        php_per_m: p.php_per_m,
        amount_php: p.amount_php,
        chainage_length_m: p.chainage_length_m,
        side,
        fence_score,
        median_ratio,
        severity: phpPerMOutlierSeverity(fence_score),
        p25: stats.p25,
        p75: stats.p75,
        iqr,
        whisker_low: stats.whisker_low,
        whisker_high: stats.whisker_high,
        median: stats.median,
        source: p.source,
        subprogram_key: p.subprogram_key,
        subprogram_label: p.subprogram_label,
        category: p.category,
        region: p.region,
        program_group: p.program_group,
        workbook_status: p.workbook_status || null,
      });
    }
  }
  return outliers.sort((a, b) => (b.fence_score - a.fence_score)
    || (b.php_per_m - a.php_per_m)
    || (b.amount_php - a.amount_php)
    || a.title.localeCompare(b.title));
}

// Highlights findings, derived entirely from the retained ledgers. Pure data
// (id, kind, headline value, copy, route targets, supporting population) so
// the card grid, evidence dialogs and tests share one definition. The view
// layer owns formatting; every figure in the copy is recomputed from `rows`
// and the workbench controls rather than restated by hand.
export function highlightsCards(data, rows) {
  const summary = data.comparison_summaries?.ai_corrected || data.comparison_summary, agg = candidateAggregates(rows);
  const strictSummary = data.comparison_summaries?.strict;
  const coverage = fundingSummary(rows).sources;
  const bySize = [...data.subprogram_controls].sort((a, b) =>
    Math.abs(b.delta_php) - Math.abs(a.delta_php) || a.key.localeCompare(b.key));
  const largestChange = bySize[0];
  const changed = rows.filter(r => r.status === 'paired' && r.delta_php !== 0)
    .sort((a, b) => a.delta_php - b.delta_php || a.id.localeCompare(b.id));
  const insertions = rows.filter(r => r.status === 'house_only');
  const deletions = rows.filter(r => r.status === 'nep_only');
  const aiProjects = side => aiMonitoringProjects(data.stages[side].projects);
  const aiInsertions = aiMonitoringInsertions(rows, {method: 'ai_corrected'});
  const aiRecon = aiMonitoringReconciliation(rows, {method: 'strict'});
  const aiCorrected = aiMonitoringReconciliation(rows, {method: 'ai_corrected'});
  const flagged = data.stages.nep.projects.filter(p => (p.extraction_flags || []).length);
  const repeated = side => data.stages[side].projects.filter(p => p.repeated_title).length;
  const agencyTotal = data.agency_controls.find(c => c.label === 'TOTAL NEW APPROPRIATIONS');
  const carp = data.agency_controls.find(c => c.agency_only);
  const nia = allocationStats(data.stages.nep.projects).total,
    house = allocationStats(data.stages.house.projects).total;
  const pct = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const topChanged = changed.slice(0, 2).map(r =>
    `${r.nep.title.split(':')[0]} (₱${(r.nep_php / 1e6).toLocaleString('en-PH')}M → ₱${(r.house_php / 1e6).toLocaleString('en-PH')}M)`);
  const largestDeletion = deletions.slice().sort((a, b) => b.nep_php - a.nep_php)[0];
  const cards = [
    {id: 'annex-increase', kind: 'Printed controls', value: summary.delta_php, signed: true,
      title: `Annex funding rises by ₱${(summary.delta_php / 1e6).toLocaleString('en-PH')}M`,
      body: `The House annex prints ₱${(house / 1e9).toFixed(3)}B against the NEP's ₱${(nia / 1e9).toFixed(3)}B across the same six sub-programs. Every printed control reconciles on both sides.`,
      prompt: 'Which sub-program movements reconcile the increase?',
      href: 'compare',
      controls: data.subprogram_controls},
    {id: 'subprogram-shift', kind: 'Printed controls', value: largestChange.delta_php, signed: true,
      title: `${largestChange.label.replace(' Sub-Program', '')} absorbs the largest movement`,
      body: `${largestChange.label} moves from ₱${(largestChange.nep_php / 1e9).toFixed(2)}B (NEP) to ₱${(largestChange.house_php / 1e9).toFixed(2)}B (House) — a change of ${signedMoney(largestChange.delta_php)}. ${bySize[1].label} follows with ${signedMoney(bySize[1].delta_php)}; each control moves independently.`,
      prompt: 'Do the unmatched rows explain the shift, or were titles reworded between documents?',
      href: 'compare', params: {subprogram: largestChange.key},
      rows: filterComparisons(rows, {subprogram: largestChange.key}), controls: [largestChange]},
    {id: 'changed-pairs', kind: 'Candidate matching', value: changed.length,
      title: `${changed.length} paired titles change amount, all ${changed.every(r => r.delta_php < 0) ? 'reductions' : 'movements'}`,
      body: `${summary.counts.paired} unique-title pairs carry ₱${(agg.paired_delta_php / 1e6).toLocaleString('en-PH')}M net${changed.length ? `, led by ${topChanged.join(' and ')}` : ''}.`,
      prompt: 'Do the printed scope descriptions explain each reduction, or was scope redefined?',
      href: 'compare', params: {view: 'projects', status: 'changed'},
      rows: changed},
    {id: 'insertions', kind: 'Candidate matching', value: summary.counts.house_only,
      title: `${summary.counts.house_only} House rows have no unique NEP title match`,
      body: `Unmatched House allocations total ₱${(agg.house_only_php / 1e9).toFixed(3)}B: ${summary.house_only_split.no_counterpart.count} rows (₱${(summary.house_only_split.no_counterpart.amount_php / 1e9).toFixed(2)}B) have no counterpart at all; ${summary.house_only_split.unresolved.count} (₱${(summary.house_only_split.unresolved.amount_php / 1e9).toFixed(2)}B) carry near-miss marks and stay unresolved.`,
      prompt: 'Which unmatched titles are new works, and which continue NEP items under reworded titles?',
      href: 'compare', params: {view: 'projects', status: 'house_only'},
      rows: insertions},
    {id: 'deletions', kind: 'Candidate matching', value: summary.counts.nep_only,
      title: `${summary.counts.nep_only} NEP rows have no unique House title match`,
      body: `Unmatched NEP allocations total ₱${(agg.nep_only_php / 1e9).toFixed(3)}B${largestDeletion ? `; the largest is ${largestDeletion.nep.title.split(':')[0]} (₱${(largestDeletion.nep_php / 1e6).toLocaleString('en-PH')}M)` : ''}: ${summary.nep_only_split.no_counterpart.count} rows (₱${(summary.nep_only_split.no_counterpart.amount_php / 1e9).toFixed(2)}B) have no counterpart at all; ${summary.nep_only_split.unresolved.count} (₱${(summary.nep_only_split.unresolved.amount_php / 1e9).toFixed(2)}B) stay unresolved.`,
      prompt: 'Which NEP projects did the House drop, retitled, or merge into other lines?',
      href: 'compare', params: {view: 'projects', status: 'nep_only'},
      rows: deletions},
    {id: 'pairing-coverage', kind: 'Candidate matching', value: pct(coverage.nep.allocation_share),
      title: `Provisional pairs cover ${pct(coverage.nep.allocation_share)} of NEP allocation`,
      body: `${summary.counts.paired} unique-title pairs cover ${pct(coverage.nep.allocation_share)} of NEP and ${pct(coverage.house.allocation_share)} of House allocation; the remainder rides on unmatched source rows awaiting counterpart review.`,
      prompt: 'Why do almost half of both ledgers resist unique-title pairing?',
      href: 'analysis', params: {view: 'candidates'},
      rows},
    {id: 'ai-monitoring', kind: 'Source titles', value: allocationStats(aiProjects('nep')).total, money: true,
      title: `AI monitoring moves from ₱${(allocationStats(aiProjects('nep')).total / 1e9).toFixed(1)}B in the NEP to ₱${(allocationStats(aiProjects('house')).total / 1e9).toFixed(1)}B in the House`,
      body: `${aiProjects('nep').length} NEP rows and ${aiProjects('house').length} House rows name AI or satellite-assisted monitoring — a net change of ${signedMoney(aiCorrected.net_delta_php)}. No reliably paired record changes amount. After verified OCR and wording normalization, ${aiCorrected.paired_count} pairs (₱${(aiCorrected.paired_house_php / 1e9).toFixed(3)}B) are unchanged, leaving ${aiCorrected.candidate_count} House-only rows (₱${(aiCorrected.candidate_php / 1e6).toLocaleString('en-PH')}M) and ${aiCorrected.nep_only_count} NEP-only rows (₱${(aiCorrected.nep_only_php / 1e6).toLocaleString('en-PH')}M) for counterpart review. Under strict titles the same residual is ${aiRecon.candidate_count} House-only (₱${(aiRecon.candidate_php / 1e9).toFixed(2)}B): ${aiRecon.twin_count} of them (₱${(aiRecon.twin_php / 1e6).toLocaleString('en-PH')}M) have a same-sub-program, same-amount unpaired NEP twin, marking reworded or OCR-variant titles rather than certified new works.`,
      prompt: 'What does the monitoring component cost, and who supplies and maintains it?',
      href: 'analysis', params: {view: 'ai_monitoring'},
      rows: aiInsertions, projects: {nep: aiProjects('nep'), house: aiProjects('house')}},
    {id: 'agency-scope', kind: 'Printed controls', value: agencyTotal?.total_php ?? null,
      title: `The annex ledger is one component of the ₱${((agencyTotal?.total_php ?? 0) / 1e9).toFixed(1)}B agency appropriation`,
      body: `The House agency table adds a CARP-linked ₱${((carp?.total_php ?? 0) / 1e6).toLocaleString('en-PH')}M row to Operations with no annex detail; the agency total also covers MOOE and programs outside this annex.`,
      prompt: 'What is funded outside the detailed annex, and why does CARP sit outside the project ledger?',
      href: 'analysis', params: {view: 'controls'},
      agency: data.agency_controls},
    {id: 'extraction-review', kind: 'Extraction evidence', value: flagged.length,
      title: `${flagged.length} NEP rows retain extraction flags with rendered evidence`,
      body: `The scanned NEP annex relies on OCR: ${flagged.length} rows keep adjudication flags (₱${(allocationStats(flagged).total / 1e6).toLocaleString('en-PH')}M); ${repeated('nep')} NEP and ${repeated('house')} House rows repeat exact titles. Printed values were never altered.`,
      prompt: 'Review each retained crop and flag against the rendered page before citing the figure.',
      href: 'nep', params: {view: 'review'},
      review: {flagged: data.stages.nep.projects.filter(p => (p.extraction_flags || []).length),
        repeatedNep: data.stages.nep.projects.filter(p => p.repeated_title),
        repeatedHouse: data.stages.house.projects.filter(p => p.repeated_title)}},
  ];
  const metrics = {
    'annex-increase': [['NEP annex', nia, 'money'], ['House annex', house, 'money'], ['Net increase', summary.delta_php, 'signed']],
    'subprogram-shift': [['NEP control', largestChange.nep_php, 'money'], ['House control', largestChange.house_php, 'money'], ['Control change', largestChange.delta_php, 'signed']],
    'changed-pairs': [['Changed pairs', changed.length], ['NEP allocation', changed.reduce((s, r) => s + r.nep_php, 0), 'money'], ['Paired change', agg.paired_delta_php, 'signed']],
    insertions: [['Unmatched House rows', insertions.length], ['House allocation', agg.house_only_php, 'money'], ['No counterpart at all', summary.house_only_split.no_counterpart.count]],
    deletions: [['Unmatched NEP rows', deletions.length], ['NEP allocation', agg.nep_only_php, 'money'], ['No counterpart at all', summary.nep_only_split.no_counterpart.count]],
    'pairing-coverage': [['Provisional pairs', coverage.nep.paired_count], ['NEP allocation coverage', pct(coverage.nep.allocation_share)], ['House allocation coverage', pct(coverage.house.allocation_share)]],
    'ai-monitoring': [['NEP project allocations', allocationStats(aiProjects('nep')).total, 'money'], ['House project allocations', allocationStats(aiProjects('house')).total, 'money'], ['Net change', aiCorrected.net_delta_php, 'signed']],
    'agency-scope': [['House annex', house, 'money'], ['Agency-only CARP row', carp?.total_php, 'money'], ['Whole House agency', agencyTotal?.total_php, 'money']],
    'extraction-review': [['NEP flagged rows', flagged.length], ['NEP repeated-title rows', repeated('nep')], ['House repeated-title rows', repeated('house')]],
  };
  const evidence = {
    'annex-increase': ['Inspect funding movements', 'The small net increase combines much larger gains and reductions across six sub-programs.', 'These are annex controls. They do not establish a change in the whole NIA agency budget.'],
    'subprogram-shift': ['Inspect the sub-program cut', 'Compare the printed reduction with the paired and unmatched allocations within this sub-program.', 'The bridge reconciles amounts; it cannot explain whether unmatched titles represent cancelled, retitled or merged works.'],
    'changed-pairs': ['Compare paired reductions', 'Both original source titles and amounts are retained for each changed pair. Open a project title for the side-by-side records.', 'Title matches are provisional. A reduction in allocation does not by itself establish a reduction in physical scope.'],
    insertions: ['Review unmatched House rows', 'Start with the largest allocations and the sub-programs carrying the unmatched funding.', 'No unique title match does not establish a new project. Reworded titles may continue earlier works, even without repeated-title ambiguity.'],
    deletions: ['Review unmatched NEP rows', 'Check the largest unmatched NEP allocations against House source pages and alternative project titles.', 'No unique title match does not establish cancellation. Rewording, consolidation and changed scope require further review.'],
    'pairing-coverage': ['Inspect pairing coverage', 'Compare coverage by both row count and pesos, then review the unmatched balance by sub-program.', 'Pairing coverage describes title continuity, not delivery performance or extraction accuracy.'],
    'ai-monitoring': ['Inspect AI project allocations', 'Review both source ledgers and the unmatched House AI titles separately; the strict pairing leaves most candidates with an identical-amount NEP twin.', 'Amounts cover whole irrigation projects. The schedules do not isolate AI costs or identify suppliers, procurement arrangements or maintenance obligations.'],
    'agency-scope': ['Reconcile annex and agency scope', 'Follow the annex into the agency Operations subtotal, including the separately printed CARP row.', 'This is House scope context. The retained agency controls alone cannot establish a whole-agency NEP-to-House increase or cut.'],
    'extraction-review': ['Review flags and retained crops', 'Select a flagged NEP row to inspect its adjudication notes, retained crop and source page.', 'Flags record extraction history, including resolved issues. Repeated exact titles are separate printed rows and do not prove duplicate funding.'],
  };
  return cards.map(card => ({...card, metrics: metrics[card.id].map(([label, value, format]) => ({label, value, format})),
    actionLabel: evidence[card.id][0], takeaway: evidence[card.id][1], limit: evidence[card.id][2]}));
}
