import {medianNumber} from './fmrModel.js';

export const RED_FLAG_DEFAULTS = {shortMeters: 100, longKm: 10, costMultiple: 3, increasePercent: 25};
export const RED_FLAG_RULES = [
  {id:'short_span',label:'Short endpoint span',description:'A positive section span falls below the selected meter threshold.'},
  {id:'zero_span',label:'Collapsed endpoints',description:'A section has zero endpoint separation.'},
  {id:'long_span',label:'Long endpoint span',description:'A section exceeds the selected kilometer threshold.'},
  {id:'high_proxy',label:'High allocation per endpoint meter',description:'Above both the selected multiple of the peer median and Q3 + 3 × IQR.'},
  {id:'missing_geometry',label:'Incomplete endpoint geometry',description:'At least one listed section cannot supply a complete numeric endpoint span.'},
  {id:'coordinate_review',label:'Unresolved coordinate review',description:'The normalized source still has open coordinate review issues.'},
  {id:'locality_disagreement',label:'Coordinate/title province disagreement',description:'A PSGC point disagrees with the province parsed from the project title.'},
  {id:'shared_geometry',label:'Shared coordinates within this source',description:'An exact section footprint also appears on another project in the same document.'},
  {id:'repeated_sections',label:'Repeated sections within a project',description:'The same section footprint occurs more than once in a project.'},
  {id:'allocation_increase',label:'Increase on unchanged candidate geometry',description:'A candidate pair has identical coordinate footprints and an allocation increase above the selected threshold.'},
];
export const RED_FLAG_MEASUREMENT_NOTE = 'Endpoint spans are straight-line distances, not measured road lengths. Allocation per endpoint meter is a screening proxy, not a construction unit cost.';

export function redFlagOptions(options = {}) {
  return Object.fromEntries(Object.entries(RED_FLAG_DEFAULTS).map(([key, fallback]) => {
    const value = Number(options[key]);
    return [key, options[key] !== '' && options[key] != null && Number.isFinite(value)
      && (key === 'increasePercent' ? value >= 0 : key === 'costMultiple' ? value >= 1 : value > 0) ? value : fallback];
  }));
}

const validPair = pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite)
  && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90;
// Exact matching, including reversed direction; no rounding or proximity matching.
function sectionKey(segment) {
  if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2 || !segment.coordinates.every(validPair)) return null;
  const forward = JSON.stringify(segment.coordinates), reverse = JSON.stringify([...segment.coordinates].reverse());
  return forward < reverse ? forward : reverse;
}
function geometryMetrics(project) {
  const segments = project.segments || [];
  const measured = segments.filter(s => sectionKey(s) && Number.isFinite(s.straight_line_distance_km) && s.straight_line_distance_km >= 0);
  const spans = measured.map(s => s.straight_line_distance_km * 1000);
  const keys = measured.map(sectionKey);
  const complete = measured.length > 0 && measured.length === segments.length
    && measured.length === (project.segment_count ?? segments.length);
  const repeated = keys.length > new Set(keys).size;
  const meters = complete ? spans.reduce((sum, value) => sum + value, 0) : null;
  const eligible = complete && !repeated && spans.every(m => m > 0)
    && project.status === 'normalized' && !(project.review_flags || []).length
    && Number.isFinite(project.amount_php) && project.amount_php > 0;
  return {meters, shortestMeters: spans.length ? Math.min(...spans) : null,
    longestMeters: spans.length ? Math.max(...spans) : null, spans, keys, complete, repeated,
    proxyPhpPerMeter: eligible ? project.amount_php / meters : null};
}
function quantile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction, low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function benchmark(rows, scope, costMultiple) {
  const values = rows.map(r => r.proxyPhpPerMeter).filter(Number.isFinite).sort((a,b) => a-b);
  if (values.length < 20) return null;
  const median = medianNumber(values), q1 = quantile(values, .25), q3 = quantile(values, .75);
  const outerFence = q3 + 3 * (q3-q1);
  return {scope, count:values.length, median, outerFence, threshold:Math.max(median * costMultiple, outerFence)};
}
const number = value => value.toLocaleString('en-PH', {maximumFractionDigits:2});

/** Derived review annotations only: retained projects, amounts and coordinates stay unchanged. */
export function buildFmrRedFlags(data, stageKey, options = {}) {
  const config = redFlagOptions(options), projects = data.stages[stageKey].projects;
  const rows = projects.map(project => ({id:project.id, project, ...geometryMetrics(project), flags:[]}));
  const regional = new Map();
  for (const row of rows) {
    if (!regional.has(row.project.region_key)) regional.set(row.project.region_key, []);
    regional.get(row.project.region_key).push(row);
  }
  const sourceBenchmark = benchmark(rows, 'Whole source', config.costMultiple);
  const regionalBenchmarks = new Map([...regional].map(([region, group]) => [region, benchmark(group, `Region ${region}`, config.costMultiple)]));
  const shared = new Map();
  for (const row of rows) for (const key of new Set(row.keys)) {
    if (!shared.has(key)) shared.set(key, new Set());
    shared.get(key).add(row.id);
  }
  const byId = new Map(Object.values(data.stages).flatMap(stage => stage.projects).map(project => [project.id, project]));
  const pairs = new Map((data.comparison || []).filter(r => r.status === 'paired').map(r => [stageKey === 'house' ? r.house_id : r.nep_id, r]));
  for (const row of rows) {
    const p = row.project, add = (id, detail, evidence = {}) => row.flags.push({id, detail, ...evidence});
    if (row.spans.some(m => m > 0 && m < config.shortMeters)) add('short_span', `Shortest section: ${number(Math.min(...row.spans.filter(m => m > 0)))} m; review threshold: below ${number(config.shortMeters)} m.`);
    if (row.spans.some(m => m === 0)) add('zero_span', 'A complete numeric endpoint pair has zero separation; no allocation-per-meter proxy is calculated.');
    if (row.spans.some(m => m > config.longKm * 1000)) add('long_span', `Longest section: ${number(row.longestMeters / 1000)} km; review threshold: above ${number(config.longKm)} km.`);
    if (!row.complete) add('missing_geometry', 'One or more listed sections are missing complete coordinates or a numeric distance. No partial-distance denominator is used.');
    if (p.status === 'needs_review' || (p.review_flags || []).length) add('coordinate_review', `Open source findings: ${(p.review_flags || []).join(', ') || 'needs_review'}.`);
    if (p.location_agreement === 'DISAGREE' || (p.psgc || []).some(point => point.kind !== 'candidate_repair' && point.verdict === 'DISAGREE'))
      add('locality_disagreement', 'PSGC reverse-geocoding disagrees with the parsed title province for at least one printed point. Verify the title parsing and the source coordinate.');
    const peers = [...new Set(row.keys.flatMap(key => [...shared.get(key)]))].filter(id => id !== p.id).sort();
    if (peers.length) add('shared_geometry', `${peers.length} other project(s) in this document share at least one exact section footprint. Cross-document repetitions are excluded.`, {peerIds:peers});
    if (row.repeated) add('repeated_sections', 'A section footprint repeats within this project, including reversed endpoint order. No proxy rate is calculated from the repeated denominator.');
    row.benchmark = regionalBenchmarks.get(p.region_key) || sourceBenchmark;
    row.peerMultiple = row.proxyPhpPerMeter != null && row.benchmark?.median > 0 ? row.proxyPhpPerMeter / row.benchmark.median : null;
    if (row.proxyPhpPerMeter != null && row.benchmark && row.proxyPhpPerMeter > row.benchmark.threshold)
      add('high_proxy', `₱${number(row.proxyPhpPerMeter)} per endpoint meter is ${number(row.peerMultiple)}× the ${row.benchmark.scope.toLowerCase()} median. Threshold: above ₱${number(row.benchmark.threshold)}/m; ${row.benchmark.count} eligible source projects.`);
    const pair = pairs.get(p.id), nep = pair && byId.get(pair.nep_id), house = pair && byId.get(pair.house_id);
    if (nep && house && nep.amount_php > 0 && house.amount_php > nep.amount_php) {
      const n = geometryMetrics(nep), h = geometryMetrics(house);
      const percent = (house.amount_php - nep.amount_php) / nep.amount_php * 100;
      if (n.complete && h.complete && JSON.stringify([...n.keys].sort()) === JSON.stringify([...h.keys].sort()) && percent >= config.increasePercent)
        add('allocation_increase', `The candidate House allocation is ${number(percent)}% above NEP on an identical coordinate footprint. The pairing method is ${pair.method}; project identity and changes in scope still require review.`, {pairId:pair.id});
    }
    row.flagCount = row.flags.length;
  }
  return {config, rows, eligibleRates:rows.filter(r => r.proxyPhpPerMeter != null).length,
    rules:RED_FLAG_RULES, measurementNote:RED_FLAG_MEASUREMENT_NOTE};
}
