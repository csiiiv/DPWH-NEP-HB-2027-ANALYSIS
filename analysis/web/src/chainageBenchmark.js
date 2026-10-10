/** Peer benchmark for chainage unit costs across ALL chainage-bearing records.
 *
 * Unlike chainageAnalysis.js (matched-pair amendments), this module works on
 * the chainage_units sidecar: every allocation with parsed spans regardless of
 * match status. Use it to ask "is this ₱/km plausible given similar PAPs in
 * the same region?" — not "did this pair change?" */

export const BENCHMARK_SOURCES = {
  all: 'All sources',
  nep: 'DBM NEP',
  hb2: 'HGAB · 2nd reading',
  hb3: 'HGAB · 3rd reading',
};

/** per-km in PHP for a unit; null when length or amount unusable. */
export function unitPerKm(unit) {
  if (!unit || unit.point_only || !unit.amount_php || !unit.length_m) return null;
  return unit.amount_php / (unit.length_m / 1000);
}

/** Peer-group key: same program + region + zone (FAP vs local pricing differs). */
export function peerGroupKey(unit) {
  return [unit.program || 'Unrecorded program', unit.region || 'Unrecorded region', unit.zone || ''].join('|');
}

/**
 * Group units into peer cohorts and compute per-km statistics.
 * @param {Array} units chainage unit sidecar rows
 * @param {object} options
 * @param {string} options.source 'all' | 'nep' | 'hb2' | 'hb3'
 * @param {number} options.minPeers minimum cohort size to report (default 5)
 */
export function peerCohorts(units, {source = 'all', minPeers = 5} = {}) {
  const pool = units.filter(u => (source === 'all' || u.source === source) && unitPerKm(u) != null);
  const byGroup = new Map();
  for (const unit of pool) {
    const key = peerGroupKey(unit);
    let group = byGroup.get(key);
    if (!group) byGroup.set(key, group = {key, units: [], values: []});
    group.units.push(unit);
    group.values.push(unitPerKm(unit));
  }
  const cohorts = [];
  for (const group of byGroup.values()) {
    if (group.values.length < minPeers) continue;
    const sorted = [...group.values].sort((a, b) => a - b);
    const n = sorted.length;
    const quantile = q => sorted[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
    const median = quantile(0.5);
    cohorts.push({
      key: group.key,
      program: group.key.split('|')[0],
      region: group.key.split('|')[1],
      zone: group.key.split('|')[2] || null,
      units: n,
      amount_php: group.units.reduce((s, u) => s + u.amount_php, 0),
      length_m: group.units.reduce((s, u) => s + (u.length_m || 0), 0),
      median_per_km: median,
      p25_per_km: quantile(0.25),
      p75_per_km: quantile(0.75),
      min_per_km: sorted[0],
      max_per_km: sorted[n - 1],
      // MAD-based robust z (median absolute deviation × 1.4826 ≈ σ)
      mad: medianAbsoluteDeviation(sorted, median),
    });
  }
  cohorts.sort((a, b) => b.units - a.units);
  return cohorts;
}

function medianAbsoluteDeviation(sortedValues, median) {
  const deviations = sortedValues.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length / 2)];
}

/** Robust z-score of a unit against its cohort: (per_km − median) / (1.4826·MAD). */
export function unitDeviation(unit, cohort) {
  const perKm = unitPerKm(unit);
  if (perKm == null || !cohort || !cohort.mad) return null;
  return (perKm - cohort.median_per_km) / (1.4826 * cohort.mad);
}

/** Rank units by |robust z| within their cohort; worst outliers first. */
export function outlierUnits(units, {source = 'all', minPeers = 5, maxZ = null} = {}) {
  const cohorts = new Map(peerCohorts(units, {source, minPeers}).map(c => [c.key, c]));
  const rows = [];
  for (const unit of units) {
    if (source !== 'all' && unit.source !== source) continue;
    const perKm = unitPerKm(unit);
    if (perKm == null) continue;
    const cohort = cohorts.get(peerGroupKey(unit));
    if (!cohort) continue;
    const z = unitDeviation(unit, cohort);
    if (z == null) continue;
    rows.push({unit, cohort, z, per_km: perKm});
  }
  rows.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return maxZ == null ? rows : rows.filter(r => Math.abs(r.z) >= maxZ);
}
