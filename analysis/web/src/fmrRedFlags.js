import {ORIGINAL_REPAIR_POINTS} from './fmrOriginalCoordinates.js';
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
function calculateFlags(data, stageKey, options = {}) {
  if (stageKey === 'all') {
    const sources = ['nep', 'house'].map(key => calculateFlags(data, key, options));
    return {...sources[0], rows:sources.flatMap(source => source.rows),
      eligibleRates:sources.reduce((sum, source) => sum + source.eligibleRates, 0)};
  }
  const config = redFlagOptions(options), projects = data.stages[stageKey].projects;
  const rows = projects.map(project => ({id:project.id, stageKey, project, ...geometryMetrics(project), flags:[]}));
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

function distanceKm(a,b) {
  const rad = value => value*Math.PI/180;
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 6371.0088*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function originalCoordinateProject(project) {
  const repairs=(project.points || []).filter(p => Object.hasOwn(ORIGINAL_REPAIR_POINTS,p.id));
  if (!repairs.length) return project;
  const byId=new Map((project.points || []).map(p => [p.id,p]));
  const originalPoint = id => Object.hasOwn(ORIGINAL_REPAIR_POINTS,id) ? ORIGINAL_REPAIR_POINTS[id]
    : byId.has(id) ? [byId.get(id).longitude,byId.get(id).latitude] : null;
  const segments=(project.segments || []).map(segment => {
    if (!(segment.point_ids || []).some(id => Object.hasOwn(ORIGINAL_REPAIR_POINTS,id))) return segment;
    const coords=segment.point_ids.map(originalPoint);
    const complete=coords.length>=2 && coords.every(validPair);
    return {...segment,coordinates:complete ? coords : [],
      straight_line_distance_km:complete ? distanceKm(coords[0],coords.at(-1)) : null};
  });
  return {...project,segments,coordinates:segments.map(s=>s.coordinates),
    points:(project.points || []).map(p => {
      const pair=originalPoint(p.id);return {...p,longitude:pair?.[0] ?? null,latitude:pair?.[1] ?? null};
    }),
    // Accepted PSGC verdicts cannot be attributed to a different printed point.
    psgc:(project.psgc || []).filter(p => !Object.hasOwn(ORIGINAL_REPAIR_POINTS,p.point_id)),
    location_agreement:null};
}
/** Source screening uses retained printed readings; accepted results stay separate. */
export function buildFmrRedFlags(data,stageKey,options={}) {
  const originalData={...data,stages:Object.fromEntries(Object.entries(data.stages)
    .map(([key,stage])=>[key,{...stage,projects:stage.projects.map(originalCoordinateProject)}]))};
  const original=calculateFlags(originalData,stageKey,options);
  const accepted=calculateFlags(data,stageKey,options);
  const acceptedRows=new Map(accepted.rows.map(row=>[row.id,row]));
  const rows=original.rows.map(row=>{
    const corrected=acceptedRows.get(row.id);
    const repaired=row.project!==corrected.project;
    const rules=[...new Set([...(corrected.project.normalization_rules || []),
      ...(corrected.project.points || []).flatMap(p=>p.rules || [])])].filter(r=>r.endsWith('repair_accepted'));
    const flags=row.flags.map(flag=>({...flag,basis:'original',
      resolution:repaired && !corrected.flags.some(f=>f.id===flag.id) ? 'Resolved by accepted correction' : 'Open'}));
    const resolvedFlags=flags.filter(f=>f.resolution!=='Open');
    return {...row,project:corrected.project,originalProject:row.project,corrected,
      flags,flagCount:flags.length,hasCorrection:repaired || rules.length>0,
      correction:{rules,clearedFlags:resolvedFlags.map(f=>f.id),textCorrected:false},
      resolvedFlags,openFlags:corrected.flags,
      reviewStatus:resolvedFlags.length ? (corrected.flagCount ? 'Source findings · some resolved' : 'Source findings · resolved by correction')
        : (repaired || rules.length) ? (corrected.flagCount ? 'Open findings + correction history' : 'Corrected · reference') : 'Source findings'};
  });
  return {...original,rows,coordinateBasis:'Original retained source readings; accepted corrections assessed separately'};
}

// Source identifiers, pagination and hierarchy labels are provenance, not project content.
const PROVENANCE_KEYS = new Set(['id','stage','source','source_pdf','project_id','point_id','point_ids','row_id','path_labels','region','image_review',
  'coordinates_raw','coordinates_interpreted','coordinate_text_basis','source_fragment_raw','source_fragment_interpreted',
  'normalization_rules','original_review_flags','review_flags','rules','issues','status','pairing_basis']);
// Same normalization as build_fmr_workbench.py canonical_title; no fuzzy matching.
export function canonicalFmrTitle(title) {
  return (String(title || '').normalize('NFKD').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ')
    .replace(/\bbrgy\b/g,'barangay').match(/[a-z0-9]+/g) || []).join(' ');
}
function comparableRecord(value) {
  if (Array.isArray(value)) return value.map(comparableRecord);
  if (value && typeof value === 'object') {
    value={...value};
    if ('title' in value) value.title=canonicalFmrTitle(value.title);
    return Object.fromEntries(Object.keys(value).sort()
    .filter(key=>!PROVENANCE_KEYS.has(key)).map(key=>[key,comparableRecord(value[key])]));
  }
  return value;
}
/** Only unique matched counterparts with identical original AND accepted content collapse. */
export function collapseIdenticalFmrReviews(rows,comparison=[]) {
  const byId=new Map(rows.map(row=>[row.id,row])), partners=new Map();
  for(const pair of comparison.filter(p=>p.status==='paired')) {
    if(!partners.has(pair.nep_id)) partners.set(pair.nep_id,[]);
    if(!partners.has(pair.house_id)) partners.set(pair.house_id,[]);
    partners.get(pair.nep_id).push(pair.house_id);partners.get(pair.house_id).push(pair.nep_id);
  }
  const fingerprint=row=>JSON.stringify(comparableRecord({accepted:row.project,original:row.originalProject}));
  const used=new Set(),result=[];
  for(const row of rows) {
    if(used.has(row.id)) continue;
    const ids=partners.get(row.id) || [],other=ids.length===1 ? byId.get(ids[0]) : null;
    const match=other && !used.has(other.id) && other.stageKey!==row.stageKey
      && partners.get(other.id)?.length===1 && fingerprint(row)===fingerprint(other);
    const members=match ? [row,other] : [row];
    members.forEach(member=>used.add(member.id));
    const flags=[...new Map(members.flatMap(member=>member.flags).map(flag=>[flag.id,flag])).values()];
    result.push({...row,members,flags,flagCount:flags.length,
      budgetSource:members.length>1 ? 'both' : row.stageKey,
      budgetSourceLabel:members.length>1 ? 'NEP+HGAB' : row.stageKey==='nep' ? 'NEP ONLY' : 'HGAB ONLY'});
  }
  return result;
}

/** Original-basis evidence for exact shared sections within the selected source. */
export function sharedCoordinateEvidence(data,row) {
  const flag=row.flags.find(flag=>flag.id==='shared_geometry');
  if(!flag) return [];
  const projects=new Map(data.stages[row.stageKey].projects.map(project=>[project.id,project]));
  const current=originalCoordinateProject(row.project);
  const currentKeys=new Set((current.segments || []).map(sectionKey).filter(Boolean));
  const peerKeys=new Set((flag.peerIds || []).flatMap(id=>{
    const project=projects.get(id);
    return project ? (originalCoordinateProject(project).segments || []).map(sectionKey).filter(Boolean) : [];
  }));
  return [row.id,...(flag.peerIds || [])].flatMap(id=>{
    const retained=projects.get(id);
    if(!retained) return [];
    const project=originalCoordinateProject(retained);
    return [{project:retained,current:id===row.id,segments:(project.segments || []).map(segment=>({
      ...segment,shared:Boolean(sectionKey(segment) && (id===row.id ? peerKeys : currentKeys).has(sectionKey(segment))),
    }))}];
  });
}

/** Count identical cross-stage versions once; never merge differing versions. */
export function summarizeFmrReviews(groups) {
  const flagged=groups.filter(group=>group.flagCount>0);
  return {entries:groups.length,sourceRecords:groups.reduce((sum,g)=>sum+g.members.length,0),
    flaggedEntries:flagged.length,flaggedAllocation:flagged.reduce((sum,g)=>sum+g.project.amount_php,0),
    findings:flagged.reduce((sum,g)=>sum+new Set(g.flags.map(f=>f.id)).size,0),
    flagMultiplicity:flagged.reduce((counts,g)=>{const count=new Set(g.flags.map(f=>f.id)).size;
      const key=count>=3 ? '3plus' : String(count);counts[key]++;return counts;},{'1':0,'2':0,'3plus':0}),
    correctedEntries:groups.filter(g=>g.members.some(r=>r.hasCorrection)).length,
    resolvedEntries:groups.filter(g=>g.members.some(r=>r.resolvedFlags.length)).length,
    openEntries:groups.filter(g=>g.members.some(r=>r.openFlags.length)).length};
}
