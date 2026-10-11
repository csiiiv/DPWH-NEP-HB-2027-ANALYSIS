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

/** Peer axes: who counts as a "similar project" for unit-cost comparisons.
 * DEO cohorts compare within one district engineering office; region cohorts
 * pool every office (and Central Office allocations) in the region. */
export const BENCHMARK_DIMENSIONS = {
  region: 'Region',
  deo: 'District engineering office (DEO)',
};

/** per-km in PHP for a unit; null when length or amount unusable. */
export function unitPerKm(unit) {
  if (!unit || unit.point_only || !unit.amount_php || !unit.length_m) return null;
  return unit.amount_php / (unit.length_m / 1000);
}

/** Cohort label for the chosen dimension: the office for DEO grouping (falls
 * back to region when an office is unrecorded), the region otherwise. */
export function peerDimensionValue(unit, dimension = 'region') {
  if (dimension === 'deo') return unit.office || `No recorded office · ${unit.region || 'Unrecorded region'}`;
  return unit.region || 'Unrecorded region';
}

/** Peer-group key: program + dimension label + zone (FAP vs local pricing differs). */
export function peerGroupKey(unit, dimension = 'region') {
  return [unit.program || 'Unrecorded program', peerDimensionValue(unit, dimension), unit.zone || ''].join('|');
}

/**
 * Group units into peer cohorts and compute per-km statistics.
 * @param {Array} units chainage unit sidecar rows
 * @param {object} options
 * @param {string} options.source 'all' | 'nep' | 'hb2' | 'hb3'
 * @param {number} options.minPeers minimum cohort size to report (default 5)
 * @param {string} options.dimension 'region' | 'deo' peer axis (default 'region')
 */
export function peerCohorts(units, {source = 'all', minPeers = 5, dimension = 'region'} = {}) {
  const pool = units.filter(u => (source === 'all' || u.source === source) && unitPerKm(u) != null);
  const byGroup = new Map();
  for (const unit of pool) {
    const key = peerGroupKey(unit, dimension);
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
    const [program, dimensionValue, zone] = group.key.split('|');
    cohorts.push({
      key: group.key,
      dimension,
      program,
      region: dimensionValue,
      office: dimension === 'deo' ? dimensionValue : null,
      zone: zone || null,
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
export function outlierUnits(units, {source = 'all', minPeers = 5, maxZ = null, dimension = 'region'} = {}) {
  const cohorts = new Map(peerCohorts(units, {source, minPeers, dimension}).map(c => [c.key, c]));
  const rows = [];
  for (const unit of units) {
    if (source !== 'all' && unit.source !== source) continue;
    const perKm = unitPerKm(unit);
    if (perKm == null) continue;
    const cohort = cohorts.get(peerGroupKey(unit, dimension));
    if (!cohort) continue;
    const z = unitDeviation(unit, cohort);
    if (z == null) continue;
    rows.push({unit, cohort, z, per_km: perKm});
  }
  rows.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return maxZ == null ? rows : rows.filter(r => Math.abs(r.z) >= maxZ);
}

/** Population totals for the whole-unit overview: one row per source. */
export function summarizeUnits(units, {source = 'all'} = {}) {
  const pool = units.filter(u => source === 'all' || u.source === source);
  const bySource = new Map();
  const bucket = side => bySource.get(side) || {
    source: side, units: 0, measurable: 0, points: 0,
    length_m: 0, amount_php: 0, review: 0,
  };
  for (const unit of pool) {
    const row = bucket(unit.source);
    row.units++;
    if (unit.length_review) row.review++;
    if (unitPerKm(unit) != null) { row.measurable++; row.length_m += unit.length_m || 0; }
    else if (unit.point_only) row.points++;
    row.amount_php += unit.amount_php || 0;
    bySource.set(unit.source, row);
  }
  const order = ['all', 'nep', 'hb2', 'hb3'];
  return [...bySource.values()].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
}

/** Fixed ₱/km bands (₱M per km) with record/length/allocation tallies per band.
 * Edges chosen for the FY2027 population: median ≈ ₱40M/km, heavy right tail. */
export function perKmBands(units, {source = 'all', edges = [1, 5, 10, 25, 50, 100]} = {}) {
  const bands = [
    {label: `< ₱${edges[0]}M`, min: 0, max: edges[0], units: 0, length_m: 0, amount_php: 0},
    ...edges.slice(0, -1).map((edge, i) => ({
      label: `₱${edge}–${edges[i + 1]}M`, min: edge, max: edges[i + 1],
      units: 0, length_m: 0, amount_php: 0,
    })),
    {label: `₱${edges[edges.length - 1]}M+`, min: edges[edges.length - 1], max: Infinity, units: 0, length_m: 0, amount_php: 0},
  ];
  let unmeasurable = 0, unmeasurablePhp = 0;
  for (const unit of units) {
    if (source !== 'all' && unit.source !== source) continue;
    const perKm = unitPerKm(unit);
    if (perKm == null) { unmeasurable++; unmeasurablePhp += unit.amount_php || 0; continue; }
    const value = perKm / 1_000_000;
    const band = bands.find(b => value >= b.min && value < b.max) || bands[bands.length - 1];
    band.units++;
    band.length_m += unit.length_m || 0;
    band.amount_php += unit.amount_php || 0;
  }
  const measurable = bands.reduce((sum, b) => sum + b.units, 0);
  return {bands, measurable, unmeasurable, unmeasurablePhp};
}
