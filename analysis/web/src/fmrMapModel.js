// Map overlay geometry: paired merge at true coords, perpendicular offset for
// unmatched overlaps, and shared hub markers so the printed location stays visible.
import {comparisonRows, filterComparisons} from './fmrModel.js';

export const STAGE_COLORS = {nep: '#1a7f4b', house: '#245fa8'};
export const PAIRED_COLOR = '#7a4fb8';
/** Deep alarm red for shared printed-location markers. */
export const HUB_COLOR = '#9f1239';
export const INCREASE_COLOR = '#15803d';
export const DECREASE_COLOR = '#c2410c';
export const MULTI_SEGMENT_COLOR = '#b45309';
/** Metres of lateral separation between unmatched overlapping segments. */
export const OVERLAP_OFFSET_M = 45;
/** Shared MapLibre radius ramp for every map marker (hubs, deltas, multi-seg). */
export const MARKER_RADIUS = ['interpolate', ['linear'], ['zoom'], 4, 5.5, 8, 9, 12, 13];

export const MAP_OBJECT_OPTIONS = [
  ['nep_only', 'NEP Only Segment'],
  ['house_only', 'House Only Segment'],
  ['paired', 'Paired Segment'],
  ['shared_marker', 'Shared Pair Marker'],
  ['pair_increase', 'Pair Increase Marker'],
  ['pair_decrease', 'Pair Decrease Marker'],
  ['multi_segment', 'Multi Segment Marker'],
];
export const DEFAULT_MAP_OBJECTS = Object.fromEntries(MAP_OBJECT_OPTIONS.map(([id]) => [id, true]));

export const COORD_BASIS_OPTIONS = [
  ['reviewed', 'Reviewed'],
  ['normalized', 'Normalized'],
];

/** Pre-acceptance printed [lon,lat] for points that received an accepted digit repair. */
export const DIGIT_REPAIR_PRINTED = {
  'ib:p667:r7:point1': [120.7245783, 17.00918],
  'ib:p677:r5:point2': [121.879302, 18.826792],
  'ib:p685:r5:point2': [129.8030109, 15.6377206],
  'ib:p692:r16:point2': [121.583412, 4.606488],
  'ib:p692:r16:point3': [121.583835, 4.606694],
  'ib:p696:r17:point2': [121.917756, 13.846302],
  'ib:p696:r19:point2': [121.914231, 13.823398],
  'ib:p697:r12:point3': [121.953232, 13.84248],
  'ib:p713:r3:point4': [123.4080266, 1.8042275],
  'ib:p713:r12:point1': [124.488833, 11.871556],
  'nep_fmr:p44:r10:point2': [125.008575, 7.989994],
  'nep_fmr:p1:r7:point1': [120.7245783, 17.00918],
  'nep_fmr:p11:r11:point2': [121.879302, 18.826792],
  'nep_fmr:p18:r15:point2': [129.8030109, 15.6377206],
  'nep_fmr:p24:r10:point2': [121.583412, 4.606488],
  'nep_fmr:p24:r10:point3': [121.583835, 4.606694],
  'nep_fmr:p37:r8:point1': [124.488833, 11.871556],
};

export function extractPrintedNumbers(text) {
  return [...String(text || '').matchAll(/-?\d+(?:\.\d+)?/g)].map(m => Number(m[0])).filter(Number.isFinite);
}

/**
 * Pre-review printed reading for map compare: accepted digit repairs undo to the
 * printed pair; otherwise use the current normalized point.
 */
export function normalizedPointCoordinates(point) {
  const printed = point?.id ? DIGIT_REPAIR_PRINTED[point.id] : null;
  if (printed && printed.every(Number.isFinite)) return [...printed];
  if (point?.longitude == null || point?.latitude == null) return null;
  if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return null;
  return [point.longitude, point.latitude];
}

/** Reviewed / accepted coordinates (includes PSGC-supported digit repairs). */
export function reviewedPointCoordinates(point) {
  if (point?.longitude == null || point?.latitude == null) return null;
  if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return null;
  return [point.longitude, point.latitude];
}

export function pointCoordinates(point, basis = 'reviewed') {
  return basis === 'normalized' ? normalizedPointCoordinates(point) : reviewedPointCoordinates(point);
}

/** Segment line: reviewed uses retained arrays; normalized undoes digit repairs. */
export function segmentCoordinates(project, segment, basis = 'reviewed') {
  if (basis === 'reviewed' || basis === 'original') {
    // `original` kept as alias for older callers; both mean accepted geometry.
    const coords = segment?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    if (!coords.every(c => Array.isArray(c) && c.length === 2 && c.every(v => Number.isFinite(v)))) return null;
    return coords;
  }
  const byId = new Map((project.points || []).map(p => [p.id, p]));
  const ids = segment.point_ids || [];
  if (ids.length < 2) return null;
  const coords = [];
  for (const id of ids) {
    const pt = byId.get(id);
    const pair = pointCoordinates(pt, 'normalized');
    if (!pair) return null;
    coords.push(pair);
  }
  return coords.length >= 2 ? coords : null;
}

export function drawableSegments(project, basis = 'reviewed') {
  return (project.segments || []).flatMap(segment => {
    const coordinates = segmentCoordinates(project, segment, basis);
    if (!coordinates) return [];
    return [{...segment, coordinates, coordinate_basis: basis === 'original' ? 'reviewed' : basis}];
  });
}

export function coordKey(coordinates) {
  return JSON.stringify(coordinates);
}

export function midpoint(coordinates) {
  const a = coordinates[0], b = coordinates[coordinates.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Perpendicular offset in lon/lat. slot is a signed half-step index (−1.5…1.5). */
export function offsetLine(coordinates, slot, meters = OVERLAP_OFFSET_M) {
  if (!slot) return coordinates.map(c => [...c]);
  const a = coordinates[0], b = coordinates[coordinates.length - 1];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const nx = -dy, ny = dx;
  const lat = (a[1] + b[1]) / 2;
  const dist = meters * slot;
  const dLon = dist / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) * nx;
  const dLat = (dist / 111320) * ny;
  return coordinates.map(([lon, lat0]) => [lon + dLon, lat0 + dLat]);
}

export function comparisonIndexes(comparison = []) {
  const byNep = new Map(), byHouse = new Map();
  for (const row of comparison) {
    if (row.nep_id) byNep.set(row.nep_id, row);
    if (row.house_id) byHouse.set(row.house_id, row);
  }
  return {byNep, byHouse};
}

function segmentMembers(rows, basis) {
  return rows.flatMap(r => drawableSegments(r.project, basis).map(seg => ({
    ...r,
    segment: seg,
    key: coordKey(seg.coordinates),
  })));
}

function featureBase(member, extras = {}) {
  const {project, stageKey, stageLabel, segment} = member;
  const objectKind = extras.objectKind || (stageKey === 'nep' ? 'nep_only' : 'house_only');
  const trueCoords = extras.trueCoordinates || segment.coordinates;
  return {
    type: 'Feature',
    id: extras.id || segment.id,
    properties: {
      segmentId: segment.id,
      segmentIndex: segment.segment_index,
      sectionLabel: segment.section_label || '',
      distanceKm: segment.straight_line_distance_km ?? null,
      projectId: project.id,
      title: project.title,
      regionKey: project.region_key,
      amountPhp: project.amount_php,
      stageKey,
      stageLabel,
      status: project.status,
      segmentCount: project.segment_count || (project.segments || []).length,
      coordinateBasis: segment.coordinate_basis || 'normalized',
      // JSON string so MapLibre worker round-trips keep the printed geometry.
      trueCoordinates: JSON.stringify(trueCoords),
      offset: Boolean(extras.offset),
      shareCount: extras.shareCount || 1,
      matchKind: extras.matchKind || 'single',
      objectKind,
      pairId: extras.pairId || null,
      method: extras.method || null,
      nepId: extras.nepId || (stageKey === 'nep' ? project.id : null),
      houseId: extras.houseId || (stageKey === 'house' ? project.id : null),
      nepTitle: extras.nepTitle || (stageKey === 'nep' ? project.title : null),
      houseTitle: extras.houseTitle || (stageKey === 'house' ? project.title : null),
      nepPhp: extras.nepPhp ?? (stageKey === 'nep' ? project.amount_php : null),
      housePhp: extras.housePhp ?? (stageKey === 'house' ? project.amount_php : null),
      deltaPhp: extras.deltaPhp ?? null,
      nepStatus: extras.nepStatus || (stageKey === 'nep' ? project.status : null),
      houseStatus: extras.houseStatus || (stageKey === 'house' ? project.status : null),
      titleDiffers: Boolean(extras.titleDiffers),
      color: extras.color,
      hubKey: extras.hubKey || null,
      ...extras.props,
    },
    geometry: {type: 'LineString', coordinates: extras.displayCoordinates || segment.coordinates},
  };
}

function deltaMarker(feature, direction) {
  const coords = JSON.parse(feature.properties.trueCoordinates);
  return {
    type: 'Feature',
    id: `${feature.id}:${direction}`,
    properties: {
      ...feature.properties,
      objectKind: direction === 'increase' ? 'pair_increase' : 'pair_decrease',
      color: direction === 'increase' ? INCREASE_COLOR : DECREASE_COLOR,
      markerDirection: direction,
    },
    geometry: {type: 'Point', coordinates: midpoint(coords)},
  };
}

function multiSegmentMarkers(rows, basis) {
  const markers = [];
  for (const {project, stageKey, stageLabel} of rows) {
    if ((project.segment_count || (project.segments || []).length) <= 1) continue;
    const segs = drawableSegments(project, basis);
    if (!segs.length) continue;
    const mid = segs.reduce((acc, seg) => {
      const m = midpoint(seg.coordinates);
      return [acc[0] + m[0], acc[1] + m[1]];
    }, [0, 0]).map(v => v / segs.length);
    markers.push({
      type: 'Feature',
      id: `multi:${project.id}`,
      properties: {
        projectId: project.id,
        title: project.title,
        regionKey: project.region_key,
        amountPhp: project.amount_php,
        stageKey,
        stageLabel,
        status: project.status,
        segmentCount: project.segment_count || segs.length,
        objectKind: 'multi_segment',
        color: MULTI_SEGMENT_COLOR,
        coordinateBasis: basis,
        trueCoordinates: JSON.stringify(segs[0].coordinates),
        nepId: stageKey === 'nep' ? project.id : null,
        houseId: stageKey === 'house' ? project.id : null,
      },
      geometry: {type: 'Point', coordinates: mid},
    });
  }
  return markers;
}

/**
 * Build map GeoJSON from the same filtered comparison ledger as Compare →
 * project records. Paired exact-coord matches become one purple line; remaining
 * co-located unmatched segments are offset and linked to a shared hub.
 *
 * Default geometry uses Reviewed coordinates (accepted digit repairs). Pass
 * coordBasis:'normalized' to undo those repairs and show pre-review printed pairs.
 */
export function buildMapOverlay(data, filters = {}) {
  const rawBasis = filters.coordBasis || 'reviewed';
  const coordBasis = rawBasis === 'original' ? 'reviewed' : rawBasis;
  const {coordBasis: _ignored, ...comparisonFilters} = filters;
  const filtered = filterComparisons(comparisonRows(data), comparisonFilters);
  const {byNep, byHouse} = comparisonIndexes(filtered);
  const nepIds = new Set(filtered.map(r => r.nep_id).filter(Boolean));
  const houseIds = new Set(filtered.map(r => r.house_id).filter(Boolean));
  const rows = [
    ...data.stages.nep.projects.filter(p => nepIds.has(p.id)).map(p => ({
      project: p, stageKey: 'nep', stageLabel: data.stages.nep.label,
    })),
    ...data.stages.house.projects.filter(p => houseIds.has(p.id)).map(p => ({
      project: p, stageKey: 'house', stageLabel: data.stages.house.label,
    })),
  ];
  const members = segmentMembers(rows, coordBasis);
  const groups = new Map();
  for (const m of members) {
    if (!groups.has(m.key)) groups.set(m.key, []);
    groups.get(m.key).push(m);
  }

  const features = [];
  const hubs = [];

  for (const [key, group] of groups) {
    const used = new Set();
    for (const nepMember of group.filter(m => m.stageKey === 'nep')) {
      const pair = byNep.get(nepMember.project.id);
      if (!pair || pair.status !== 'paired') continue;
      const houseMember = group.find(m => m.stageKey === 'house' && m.project.id === pair.house_id);
      if (!houseMember) continue;
      used.add(nepMember);
      used.add(houseMember);
      const titleDiffers = nepMember.project.title !== houseMember.project.title;
      features.push(featureBase(houseMember, {
        id: `pair:${pair.id}:${nepMember.segment.id}`,
        matchKind: 'paired',
        objectKind: 'paired',
        pairId: pair.id,
        method: pair.method,
        nepId: nepMember.project.id,
        houseId: houseMember.project.id,
        nepTitle: nepMember.project.title,
        houseTitle: houseMember.project.title,
        nepPhp: nepMember.project.amount_php,
        housePhp: houseMember.project.amount_php,
        deltaPhp: pair.delta_php,
        nepStatus: nepMember.project.status,
        houseStatus: houseMember.project.status,
        titleDiffers,
        color: PAIRED_COLOR,
        shareCount: 1,
        hubKey: null,
        props: {
          projectId: houseMember.project.id,
          title: houseMember.project.title,
          stageKey: 'paired',
          stageLabel: 'NEP + House',
        },
      }));
    }

    const leftover = group.filter(m => !used.has(m));
    if (!leftover.length) continue;
    const shareCount = leftover.length;
    const hubKey = shareCount > 1 ? `hub:${key}` : null;
    if (hubKey) {
      hubs.push({
        type: 'Feature',
        id: hubKey,
        properties: {
          hubKey,
          shareCount,
          objectKind: 'shared_marker',
          color: HUB_COLOR,
          trueCoordinates: JSON.stringify(leftover[0].segment.coordinates),
          memberIds: leftover.map(m => m.segment.id).join(';'),
        },
        geometry: {type: 'Point', coordinates: midpoint(leftover[0].segment.coordinates)},
      });
    }
    leftover.forEach((member, index) => {
      const slot = shareCount === 1 ? 0 : index - (shareCount - 1) / 2;
      const display = offsetLine(member.segment.coordinates, slot);
      const pair = member.stageKey === 'nep' ? byNep.get(member.project.id) : byHouse.get(member.project.id);
      const objectKind = member.stageKey === 'nep' ? 'nep_only' : 'house_only';
      features.push(featureBase(member, {
        displayCoordinates: display,
        offset: slot !== 0,
        shareCount,
        hubKey,
        objectKind,
        matchKind: pair?.status || 'single',
        pairId: pair?.status === 'paired' ? pair.id : null,
        method: pair?.method || null,
        color: STAGE_COLORS[member.stageKey],
      }));
    });
  }

  const increases = [], decreases = [];
  for (const feature of features) {
    if (feature.properties.objectKind !== 'paired' || feature.properties.deltaPhp == null) continue;
    if (feature.properties.deltaPhp > 0) increases.push(deltaMarker(feature, 'increase'));
    else if (feature.properties.deltaPhp < 0) decreases.push(deltaMarker(feature, 'decrease'));
  }
  const multis = multiSegmentMarkers(rows, coordBasis);

  return {
    lines: {type: 'FeatureCollection', features},
    hubs: {type: 'FeatureCollection', features: hubs},
    increases: {type: 'FeatureCollection', features: increases},
    decreases: {type: 'FeatureCollection', features: decreases},
    multis: {type: 'FeatureCollection', features: multis},
    summary: {
      drawn: features.length,
      paired: features.filter(f => f.properties.objectKind === 'paired').length,
      nep_only: features.filter(f => f.properties.objectKind === 'nep_only').length,
      house_only: features.filter(f => f.properties.objectKind === 'house_only').length,
      offset: features.filter(f => f.properties.offset).length,
      hubs: hubs.length,
      increases: increases.length,
      decreases: decreases.length,
      multis: multis.length,
      projects: rows.length,
      candidates: filtered.length,
      coordBasis,
    },
  };
}

/** Apply Objects checklist visibility without rebuilding geometry. */
export function filterOverlayByObjects(overlay, objects = DEFAULT_MAP_OBJECTS) {
  const on = {...DEFAULT_MAP_OBJECTS, ...objects};
  return {
    lines: {
      type: 'FeatureCollection',
      features: overlay.lines.features.filter(f => on[f.properties.objectKind]),
    },
    hubs: {
      type: 'FeatureCollection',
      features: on.shared_marker ? overlay.hubs.features : [],
    },
    increases: {
      type: 'FeatureCollection',
      features: on.pair_increase ? overlay.increases.features : [],
    },
    decreases: {
      type: 'FeatureCollection',
      features: on.pair_decrease ? overlay.decreases.features : [],
    },
    multis: {
      type: 'FeatureCollection',
      features: on.multi_segment ? (overlay.multis?.features || []) : [],
    },
    summary: {
      ...overlay.summary,
      drawn: overlay.lines.features.filter(f => on[f.properties.objectKind]).length,
      visible_hubs: on.shared_marker ? overlay.hubs.features.length : 0,
      visible_increases: on.pair_increase ? overlay.increases.features.length : 0,
      visible_decreases: on.pair_decrease ? overlay.decreases.features.length : 0,
      visible_multis: on.multi_segment ? (overlay.multis?.features || []).length : 0,
    },
  };
}

export function stackForFeature(lines, feature) {
  if (!feature) return [];
  const hubKey = feature.properties.hubKey;
  if (hubKey) {
    return lines.features.filter(f => f.properties.hubKey === hubKey);
  }
  return [feature];
}
