import {ORIGINAL_REPAIR_POINTS} from './fmrOriginalCoordinates.js';
import {medianNumber} from './fmrModel.js';

export const RED_FLAG_DEFAULTS = {shortMeters: 100, longKm: 20, costMultiple: 3, increasePercent: 25};
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
  {id:'same_nep_different_house',label:'Same NEP allocation, different HGAB',description:'The DA draft keeps the NEP amount while the linked House GAB amount differs. Preserves NEP context when reviewing DA.'},
];
export const RED_FLAG_DELTA_STATUSES = {
  cleared: 'Cleared under DA draft',
  persisted: 'Still flagged under DA',
  new: 'New under DA draft',
  dropped: 'House project dropped in DA',
  unmatched_house: 'House-only (no DA match)',
  unmatched_da: 'DA-only (no House match)',
};
export const RED_FLAG_MEASUREMENT_NOTE = 'Endpoint spans are straight-line distances, not measured road lengths. Allocation per endpoint meter is a screening proxy, not a construction unit cost.';

/** Evidence classes, not severity ranks. Each source flag belongs to one class. */
export const RED_FLAG_TIERS = Object.freeze({
  document:{label:'Within-document', short:'Measurements and transcription from one source'},
  cross:{label:'Cross-reference', short:'Comparison with another record or geographic reference'},
  screen:{label:'Statistical screen', short:'Outlier relative to a valid peer population'},
});
const explain = (tier,whatItIs,whyItMatters,whatItDoesNotMean,nextSteps,interplay) =>
  ({tier,whatItIs,whyItMatters,whatItDoesNotMean,nextSteps,interplay});
export const RED_FLAG_EXPLAINERS = Object.freeze({
  short_span:explain('document','A positive endpoint span is shorter than the configured meter limit.',
    'The listed section may be unusually short or the coordinates may need checking.',
    'It does not measure constructed road length or establish an incorrect project.',
    'Check the source PDF, section endpoints and intended scope.','May overlap with repeated or incomplete geometry.'),
  zero_span:explain('document','A complete endpoint pair has zero straight-line separation.',
    'There is no positive distance for a meaningful per-meter proxy.',
    'It is not proof that no road work exists.','Inspect whether the source describes a point or repeated endpoint.',
    'Excluded from allocation-per-meter screening.'),
  long_span:explain('document','A section exceeds the configured kilometer limit.',
    'Long spans can reveal transcribed digits, endpoint ambiguity or unusually broad coverage.',
    'It is not road length or definitive evidence of a location error.',
    'Compare original PDF coordinates with the mapped endpoints and project title.',
    'May coexist with location disagreements or coordinate repair history.'),
  high_proxy:explain('screen','The allocation divided by complete endpoint distance exceeds both a peer-median multiple and an outer IQR fence.',
    'Identifies source-relative ratios worth checking for scope or geometry omissions.',
    'It is not an engineering construction cost estimate or a fixed overpricing threshold.',
    'Review the allocation scope, road width, terrain, bridges and complete measured length.',
    'Only complete positive, non-repeated, normalized geometry enters peer populations.'),
  missing_geometry:explain('document','One or more sections cannot provide complete numeric endpoint evidence.',
    'Incomplete source geometry prevents reliable distance-based comparisons.',
    'The project is not automatically invalid or absent.',
    'Inspect source page and any unparsed or ambiguous coordinate text.',
    'Partial spans cannot be used as the cost-proxy denominator.'),
  coordinate_review:explain('document','The source record retains unresolved coordinate-normalization review flags.',
    'Source extraction or coordinate formatting may need independent checking.',
    'It does not mean the printed document is necessarily wrong.',
    'Review original OCR, repairs, unresolved fields and PDF source page.',
    'The proxy excludes unresolved geometries.'),
  locality_disagreement:explain('cross','A parsed title province disagrees with a PSGC-referenced point location.',
    'The title, coordinate interpretation or location description may need examination.',
    'It does not prove that the road crosses provinces or that fraud occurred.',
    'Check all coordinates, title locality and PSGC reference boundaries.',
    'MIXED/PARTIAL results are not automatically classified as disagreement.'),
  shared_geometry:explain('cross','An exact section footprint appears in another project in the same source document.',
    'May indicate overlapping road sections that deserve project-scope verification.',
    'Shared endpoints do not prove duplicate funding.',
    'Inspect related project titles, section coordinates, allocation descriptions and source pages.',
    'Expected repetitions between NEP and House are excluded.'),
  repeated_sections:explain('document','The same footprint appears twice within one project, including reverse order.',
    'Double-entered geometry can distort total distance calculations.',
    'It is not itself proof of duplicate allocation.',
    'Check the original section list and record intended section roles.',
    'Repeated geometry is excluded from proxy denominators.'),
  allocation_increase:explain('cross','A candidate linked project has the same complete coordinate footprints and an allocation increase above the configured percentage.',
    'Flags a change that warrants confirming project identity and scope.',
    'A larger allocation does not by itself establish insertion, wrongdoing or overpricing.',
    'Review both stage records, amounts, project descriptions and pairing method.',
    'Requires matched candidate identity; an unchanged footprint is not proof of unchanged scope. Used for NEP→House; DA uses same_nep_different_house when NEP context matters.'),
  same_nep_different_house:explain('cross','The DA draft amount equals the linked NEP amount and differs from the linked House GAB amount.',
    'Keeps the NEP baseline visible when DA appears to restore or retain the executive allocation against HGAB.',
    'It does not prove that DA corrected House, or that House was wrong.',
    'Compare NEP, House and DA amounts, dispositions (retain/modified/new) and coordinate footprints.',
    'Replaces DA-vs-House allocation_increase so NEP context is not dropped from the DA review.'),
});
export const RED_FLAG_DELTA_STATUS_EXPLAINERS = Object.freeze({
  cleared:'A House flag is no longer present in the linked DA draft observation. This reflects the assessed values, not independent confirmation of a correction.',
  persisted:'At least one House flag remains on the linked DA draft observation; other flags may also be cleared or new.',
  new:'A linked DA draft observation has analytical flags where the corresponding House row did not.',
  dropped:'The linked House record has no active DA proposed observation. Check the DA disposition and source row.',
  unmatched_house:'A flagged House project has no matching DA comparison record in the retained matching layer.',
  unmatched_da:'A flagged DA project has no linked House comparison record in the retained matching layer.',
});
export function flagTier(id) {
  const tier = RED_FLAG_EXPLAINERS[id]?.tier;
  if (!tier) throw new Error('Unknown FMR red flag: ' + id);
  return tier;
}
const tierOrder = ['document','cross','screen'];
export function sortFlagsByTier(flags) {
  return [...flags].sort((a,b) => tierOrder.indexOf(flagTier(typeof a === 'string' ? a : a.id))
    - tierOrder.indexOf(flagTier(typeof b === 'string' ? b : b.id)));
}
export function tierCounts(groups) {
  const result = Object.fromEntries(tierOrder.map(t => [t,{entries:0, findings:0}]));
  for (const group of groups) {
    const flags = new Set((group.flags || []).map(f => typeof f === 'string' ? f : f.id));
    const seen = new Set();
    for (const flag of flags) {
      const tier = flagTier(flag);
      result[tier].findings++;
      seen.add(tier);
    }
    for (const tier of seen) result[tier].entries++;
  }
  return result;
}
export function tierDeltaCounts(rows) {
  return Object.fromEntries(['cleared','persisted','new'].map(kind => [kind,
    tierCounts(rows.map(row => ({flags:(row[kind+'_flags'] || [])}))) ]));
}
export function flagExplainer(id, config = {}) {
  const meta = RED_FLAG_EXPLAINERS[id];
  if (!meta) throw new Error('Unknown FMR red flag: ' + id);
  const c = redFlagOptions(config);
  const howFlagged = {
    short_span:`Any positive section span below ${c.shortMeters} m.`,
    zero_span:'Any complete numeric endpoint pair with 0 m separation.',
    long_span:`Any section span strictly above ${c.longKm} km.`,
    high_proxy:`More than ${c.costMultiple}× the eligible peer median AND above Q3 + 3×IQR (minimum 20 eligible projects).`,
    missing_geometry:'At least one missing or invalid numeric endpoint section.',
    coordinate_review:'Remaining source review flags or a needs_review record status.',
    locality_disagreement:'PSGC point agreement is DISAGREE against the title province.',
    shared_geometry:'Exact section coordinates match a different project within the same source, including reversed endpoint order.',
    repeated_sections:'Two sections within one project have identical geometry, including reversed endpoint order.',
    allocation_increase:`Identical complete candidate geometry and an allocation increase of at least ${c.increasePercent}% (NEP→House).`,
    same_nep_different_house:'Linked DA amount equals NEP and differs from House GAB (DA review keeps the NEP baseline).',
  }[id];
  return {id,label:RED_FLAG_RULES.find(rule=>rule.id===id)?.label || id, ...meta,
    tierLabel:RED_FLAG_TIERS[meta.tier].label,howFlagged};
}
if (RED_FLAG_RULES.length !== 11 ||
    new Set(RED_FLAG_RULES.map(r=>r.id)).size !== 11 ||
    RED_FLAG_RULES.some(r => !RED_FLAG_TIERS[RED_FLAG_EXPLAINERS[r.id]?.tier]))
  throw new Error('FMR red-flag tier metadata must cover exactly eleven unique rules');

function linkedDaProjectId(row) {
  if (!row?.da) return null;
  if (row.da.proposed?.id) return row.da.proposed.id;
  if (row.da.from && row.da.from.disposition !== 'dropped') return row.da.from.id;
  return null;
}

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
  const stage = data.stages[stageKey];
  if (!stage) return {config:redFlagOptions(options), rows:[], eligibleRates:0, rules:RED_FLAG_RULES, measurementNote:RED_FLAG_MEASUREMENT_NOTE};
  const config = redFlagOptions(options), projects = stage.projects;
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
  const byId = new Map(Object.values(data.stages).flatMap(s => (s.projects || []).map(project => [project.id, project])));
  const pairs = new Map();
  for (const row of data.comparison || []) {
    if (stageKey === 'da') {
      const daId = linkedDaProjectId(row);
      if (daId && row.house_id) pairs.set(daId, row);
    } else if (row.status === 'paired') {
      pairs.set(stageKey === 'house' ? row.house_id : row.nep_id, row);
    }
  }
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
    // DA reviews need the full NEP→House→DA amount story. Do not reduce that to
    // DA-vs-House allocation_increase (that drops the NEP baseline).
    if (stageKey === 'da' && house && nep
        && p.amount_php > 0 && house.amount_php > 0 && nep.amount_php > 0
        && p.amount_php === nep.amount_php && p.amount_php !== house.amount_php) {
      const houseVsNep = house.amount_php - nep.amount_php;
      const direction = houseVsNep > 0 ? 'above' : 'below';
      const percent = Math.abs(houseVsNep) / nep.amount_php * 100;
      add('same_nep_different_house',
        `DA keeps the NEP allocation (₱${number(nep.amount_php)}) while House is ${number(percent)}% ${direction} NEP (₱${number(house.amount_php)}). `
        + 'This preserves the NEP baseline when reviewing the DA draft against HGAB.',
        {pairId: pair.id});
    } else if (stageKey !== 'da' && nep && house && nep.amount_php > 0 && house.amount_php > nep.amount_php) {
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
      budgetSourceLabel:members.length>1 ? 'NEP+HGAB'
        : row.stageKey==='nep' ? 'NEP ONLY'
        : row.stageKey==='da' ? 'DA ONLY'
        : 'HGAB ONLY'});
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

function analyticalFlagIds(row) {
  return (row.openFlags || row.flags || []).map(flag => flag.id);
}

/** Compare House GAB red flags to the DA working-draft assessment for linked rows. */
export function buildHouseDaRedFlagDelta(data, options = {}) {
  const houseAnalysis = buildFmrRedFlags(data, 'house', options);
  const daAnalysis = buildFmrRedFlags(data, 'da', options);
  const houseById = new Map(houseAnalysis.rows.map(row => [row.id, row]));
  const daById = new Map(daAnalysis.rows.map(row => [row.id, row]));
  const linkedHouse = new Set();
  const linkedDa = new Set();
  const rows = [];

  for (const comparison of data.comparison || []) {
    if (!comparison.house_id || !comparison.da) continue;
    const houseRow = houseById.get(comparison.house_id);
    if (!houseRow) continue;
    linkedHouse.add(comparison.house_id);
    const daId = linkedDaProjectId(comparison);
    const daRow = daId ? daById.get(daId) : null;
    if (daId) linkedDa.add(daId);
    const houseFlags = new Set(analyticalFlagIds(houseRow));
    const daFlags = new Set(daRow ? analyticalFlagIds(daRow) : []);
    const cleared = [...houseFlags].filter(id => !daFlags.has(id)).sort();
    const persisted = [...houseFlags].filter(id => daFlags.has(id)).sort();
    const added = [...daFlags].filter(id => !houseFlags.has(id)).sort();
    if (!houseFlags.size && !daFlags.size) continue;
    let status;
    if (!daRow) status = 'dropped';
    else if (!houseFlags.size && daFlags.size) status = 'new';
    else if (houseFlags.size && !daFlags.size) status = 'cleared';
    else status = 'persisted';
    rows.push({
      id: comparison.id,
      status,
      region_key: comparison.region_key,
      house_id: comparison.house_id,
      da_id: daId,
      excel_rows: comparison.da.excel_rows || [],
      control_no: comparison.da.proposed?.control_no || comparison.da.from?.control_no || null,
      title: daRow?.project?.title || houseRow.project.title,
      house_php: houseRow.project.amount_php,
      da_php: daRow?.project?.amount_php ?? null,
      house_flags: [...houseFlags].sort(),
      da_flags: [...daFlags].sort(),
      cleared_flags: cleared,
      persisted_flags: persisted,
      new_flags: added,
      house_flag_count: houseFlags.size,
      da_flag_count: daFlags.size,
      disposition: comparison.da.from?.disposition || null,
    });
  }

  for (const houseRow of houseAnalysis.rows) {
    const openCount = analyticalFlagIds(houseRow).length;
    if (linkedHouse.has(houseRow.id) || !openCount) continue;
    rows.push({
      id: `unmatched_house:${houseRow.id}`,
      status: 'unmatched_house',
      region_key: houseRow.project.region_key,
      house_id: houseRow.id,
      da_id: null,
      excel_rows: [],
      control_no: null,
      title: houseRow.project.title,
      house_php: houseRow.project.amount_php,
      da_php: null,
      house_flags: analyticalFlagIds(houseRow).sort(),
      da_flags: [],
      cleared_flags: [],
      persisted_flags: [],
      new_flags: [],
      house_flag_count: openCount,
      da_flag_count: 0,
      disposition: null,
    });
  }

  for (const daRow of daAnalysis.rows) {
    const openCount = analyticalFlagIds(daRow).length;
    if (linkedDa.has(daRow.id) || !openCount) continue;
    rows.push({
      id: `unmatched_da:${daRow.id}`,
      status: 'unmatched_da',
      region_key: daRow.project.region_key,
      house_id: null,
      da_id: daRow.id,
      excel_rows: daRow.project.source?.excel_row != null ? [daRow.project.source.excel_row] : [],
      control_no: daRow.project.control_no || daRow.project.source?.control_no || null,
      title: daRow.project.title,
      house_php: null,
      da_php: daRow.project.amount_php,
      house_flags: [],
      da_flags: analyticalFlagIds(daRow).sort(),
      cleared_flags: [],
      persisted_flags: [],
      new_flags: analyticalFlagIds(daRow).sort(),
      house_flag_count: 0,
      da_flag_count: openCount,
      disposition: daRow.project.disposition || null,
    });
  }

  const counts = Object.fromEntries(Object.keys(RED_FLAG_DELTA_STATUSES).map(key => [key, 0]));
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return {
    config: houseAnalysis.config,
    measurementNote: RED_FLAG_MEASUREMENT_NOTE,
    rules: RED_FLAG_RULES,
    statusLabels: RED_FLAG_DELTA_STATUSES,
    counts,
    rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
    house: houseAnalysis,
    da: daAnalysis,
  };
}
