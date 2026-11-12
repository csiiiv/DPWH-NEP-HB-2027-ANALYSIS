/** Map helpers over the shareable NIA consolidated dataset (one workbook row). */

import {formatChainageSpans} from './chainageDisplay.js';
import {senateStatusLabels} from './niaModel.js';

export const NIA_CONSOLIDATED_MAP_NOTE = 'Projects are NIA Senate workbook lines (937). '
  + 'Title GPS uses decimal coordinates printed in the fixed/submission title; PSGC points are '
  + 'barangay or municipality polygon centroids. Toggle layers — both may describe the same '
  + 'project, so counts are distinct projects, never summed across layers or site points.';

export const LOCATION_LAYERS = {
  title_gps: {
    label: 'Title GPS',
    hint: 'Coordinates parsed from the project title (site-level; multi-site rows show several points).',
  },
  psgc: {
    label: 'PSGC centroid',
    hint: 'Administrative barangay/municipality centroid from the geolocation enrichment.',
  },
  both: {
    label: 'Both layers',
    hint: 'Title GPS and PSGC together, styled differently. Same project id is not two fundable rows.',
  },
};
export const LOCATION_LAYER_ORDER = ['title_gps', 'psgc', 'both'];
export const DEFAULT_LOCATION_LAYER = 'title_gps';

export const WORKBOOK_STATUS_COLORS = {
  both_funded: '#0e7490',
  house_insertion: '#b45309',
  house_zeroed: '#7c3aed',
  unfunded: '#64748b',
};

// Sub-program palette — title GPS is dominated by pump projects, so status
// alone reads as “all funded”; type colors keep the map legible.
export const SUBPROGRAM_COLORS = {
  'National Irrigation System': '#0f766e',
  'Communal Irrigation System': '#1d4ed8',
  'Other Irrigation System': '#7c3aed',
  'Establishment of Pump Irrigation': '#c2410c',
  'Special Irrigation': '#a16207',
  'Extension/Expansion': '#be123c',
};
export const SUBPROGRAM_COLOR_FALLBACK = '#64748b';

/** Toggleable map objects for the Congress-style layers panel (URL `objects=`). */
export const NIA_MAP_OBJECT_OPTIONS = [
  ['title_gps', 'Title GPS'],
  ['psgc', 'PSGC centroid (fallback)'],
];
export const NIA_MAP_LAYER_HINTS = {
  title_gps: 'Decimal coordinates printed in the fixed/submission title. Multi-site lines show several points; House insertions rarely print GPS.',
  psgc: 'Barangay/municipality centroid fallback from the geolocation enrichment — only rows whose titles print no coordinates.',
};
export const NIA_MAP_STATUS_OPTIONS = [
  ['both_funded', 'Both funded'],
  ['house_insertion', 'House insertion'],
  ['house_zeroed', 'NEP zeroed'],
  ['unfunded', 'Unfunded'],
];
// Sub-program toggles mirror the sub-program color mode; ids match
// SUBPROGRAM_COLORS keys so panel dots and map fills stay in sync.
export const NIA_MAP_SUBPROGRAM_OPTIONS = [
  ...Object.keys(SUBPROGRAM_COLORS).map(key => [key, key.replace('Establishment of ', '')]),
  ['other', 'Other'],
];
const SUBPROGRAM_IDS = new Set(Object.keys(SUBPROGRAM_COLORS));

/** Subtype toggles follow the active color dimension. */
export function niaMapTypeOptionsFor(colorMode = 'status') {
  return colorMode === 'subprogram' ? NIA_MAP_SUBPROGRAM_OPTIONS : NIA_MAP_STATUS_OPTIONS;
}
export function defaultNiaMapTypesFor(colorMode = 'status') {
  const entries = niaMapTypeOptionsFor(colorMode);
  return Object.fromEntries(NIA_MAP_OBJECT_OPTIONS.map(([objectId]) => [
    objectId,
    Object.fromEntries(entries.map(([subtypeId]) => [subtypeId, true])),
  ]));
}
export function niaMapSubtypeKey(project, dimension = 'status') {
  if (dimension === 'subprogram') {
    const key = project.subprogram_key || '';
    return SUBPROGRAM_IDS.has(key) ? key : 'other';
  }
  return project.workbook_status || 'unknown';
}

export const DEFAULT_NIA_MAP_OBJECTS = {title_gps: true, psgc: true};
export const DEFAULT_NIA_MAP_TYPES = defaultNiaMapTypesFor('status');

function typeToken(objectId, subtypeId) {
  return `${objectId}:${subtypeId}`;
}

function emptyNiaMapTypes(colorMode = 'status') {
  const entries = niaMapTypeOptionsFor(colorMode);
  return Object.fromEntries(NIA_MAP_OBJECT_OPTIONS.map(([objectId]) => [
    objectId,
    Object.fromEntries(entries.map(([subtypeId]) => [subtypeId, false])),
  ]));
}

export function readNiaMapObjects(params = new URLSearchParams()) {
  // Legacy single-select `layer=` still works when `objects` is absent.
  if (!params.has('objects')) {
    const legacy = params.get('layer');
    if (legacy === 'title_gps') return {title_gps: true, psgc: false};
    if (legacy === 'psgc') return {title_gps: false, psgc: true};
    if (legacy === 'both' || !legacy) return {...DEFAULT_NIA_MAP_OBJECTS};
  }
  const raw = params.get('objects');
  if (raw === 'none' || raw === '') {
    return Object.fromEntries(NIA_MAP_OBJECT_OPTIONS.map(([id]) => [id, false]));
  }
  const selected = new Set(String(raw).split(',').filter(Boolean));
  return Object.fromEntries(NIA_MAP_OBJECT_OPTIONS.map(([id]) => [id, selected.has(id)]));
}

export function niaMapObjectsParam(objects) {
  const selected = NIA_MAP_OBJECT_OPTIONS.filter(([id]) => objects[id]).map(([id]) => id);
  if (selected.length === NIA_MAP_OBJECT_OPTIONS.length) return null;
  return selected.length ? selected.join(',') : 'none';
}

export function readNiaMapTypes(params = new URLSearchParams(), colorMode = 'status') {
  const defaults = defaultNiaMapTypesFor(colorMode);
  if (!params.has('types')) return defaults;
  const raw = params.get('types');
  if (raw === 'none' || raw === '') return emptyNiaMapTypes(colorMode);
  const selected = new Set(String(raw).split(',').filter(Boolean));
  const entries = niaMapTypeOptionsFor(colorMode);
  const next = emptyNiaMapTypes(colorMode);
  for (const [objectId] of NIA_MAP_OBJECT_OPTIONS) {
    for (const [subtypeId] of entries) {
      next[objectId][subtypeId] = selected.has(typeToken(objectId, subtypeId));
    }
  }
  return next;
}

export function niaMapTypesParam(types, colorMode = 'status') {
  const entries = niaMapTypeOptionsFor(colorMode);
  const defaults = defaultNiaMapTypesFor(colorMode);
  const selected = [];
  let allDefault = true;
  for (const [objectId] of NIA_MAP_OBJECT_OPTIONS) {
    for (const [subtypeId] of entries) {
      const on = Boolean(types?.[objectId]?.[subtypeId]);
      if (on) selected.push(typeToken(objectId, subtypeId));
      if (on !== Boolean(defaults[objectId][subtypeId])) allDefault = false;
    }
  }
  if (allDefault) return null;
  return selected.length ? selected.join(',') : 'none';
}

/** Rows whose titles print at least one parseable decimal coordinate. */
function hasTitleGps(project) {
  return (project.locations?.title_gps?.point_count || 0) > 0;
}

/** Per-layer counts for the panel (projects + markers) in either dimension. */
export function niaMapLayerCounts(projects, dimension = 'status') {
  const empty = () => Object.fromEntries(
    niaMapTypeOptionsFor(dimension === 'subprogram' ? 'subprogram' : 'status')
      .map(([id]) => [id, {projects: 0, markers: 0}]));
  const counts = {title_gps: empty(), psgc: empty()};
  for (const project of projects || []) {
    const key = niaMapSubtypeKey(project, dimension);
    const gpsN = project.locations?.title_gps?.point_count || 0;
    if (gpsN > 0 && counts.title_gps[key]) {
      counts.title_gps[key].projects += 1;
      counts.title_gps[key].markers += gpsN;
    }
    // Mirrors the plotted fallback: PSGC counts only rows without title GPS.
    if (!gpsN) {
      const primary = project.locations?.psgc?.primary;
      if (Array.isArray(primary?.coordinates) && primary.coordinates.length >= 2
          && counts.psgc[key]) {
        counts.psgc[key].projects += 1;
        counts.psgc[key].markers += 1;
      }
    }
  }
  return counts;
}

export const COLOR_MODES = {
  subprogram: {label: 'Sub-program', hint: 'Color by irrigation sub-program (NIS, CIS, pumps, …).'},
  status: {label: 'Workbook status', hint: 'Color by Senate workbook status (both funded, insertion, zeroed).'},
};
export const COLOR_MODE_ORDER = ['subprogram', 'status'];
export const DEFAULT_COLOR_MODE = 'subprogram';

export function resolveLocationLayer(value) {
  return LOCATION_LAYERS[value] ? value : DEFAULT_LOCATION_LAYER;
}
export function resolveColorMode(value) {
  return COLOR_MODES[value] ? value : DEFAULT_COLOR_MODE;
}

function projectAmount(project) {
  if (project.hgab_amount != null) return project.hgab_amount;
  if (project.nep_amount != null) return project.nep_amount;
  return null;
}

function baseProperties(project, kind) {
  const primary = project.locations?.psgc?.primary || {};
  // Never name a property `point_count` — MapLibre clustering uses that key,
  // and multi-site rows would be drawn as oversized cluster bubbles.
  return {
    id: project.id,
    kind,
    title: project.submission_label || project.label || project.id,
    status: project.workbook_status || 'unknown',
    status_label: senateStatusLabels[project.workbook_status] || project.workbook_status || '',
    subprogram: project.subprogram_key || '',
    category: project.category || '',
    amount: projectAmount(project),
    region: project.region || '',
    province: project.province || primary.province || '',
    municipality: primary.municipality || '',
    barangay: primary.barangay || '',
    psgc: primary.psgc || '',
    anchor: primary.coordinate_anchor || '',
    coverage: project.locations?.coverage || 'none',
    flags: (project.flags || []).join(';'),
    site_count: project.locations?.title_gps?.point_count || 0,
  };
}

/** GeoJSON features for the selected location layer(s). */
export function consolidatedMapFeatures(projects, layerOrObjects = DEFAULT_LOCATION_LAYER, types = null, dimension = 'status') {
  const features = [];
  let wantGps, wantPsgc;
  if (typeof layerOrObjects === 'string') {
    wantGps = layerOrObjects === 'title_gps' || layerOrObjects === 'both';
    wantPsgc = layerOrObjects === 'psgc' || layerOrObjects === 'both';
  } else {
    wantGps = Boolean(layerOrObjects?.title_gps);
    wantPsgc = Boolean(layerOrObjects?.psgc);
  }
  const statusOn = (kind, key) => {
    if (!types) return true;
    return Boolean(types?.[kind]?.[key]);
  };
  for (const project of projects || []) {
    const key = niaMapSubtypeKey(project, dimension);
    if (wantGps && statusOn('title_gps', key)) {
      const points = project.locations?.title_gps?.points || [];
      for (const pt of points) {
        const lat = Number(pt.latitude), lon = Number(pt.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        features.push({
          type: 'Feature',
          geometry: {type: 'Point', coordinates: [lon, lat]},
          properties: {
            ...baseProperties(project, 'title_gps'),
            role: pt.role || '',
            point_index: pt.index ?? null,
          },
        });
      }
    }
  }
  // PSGC is a fallback: rows whose titles print coordinates are already
  // plotted (more precisely) by Title GPS and are not duplicated here.
  // Co-located rows aggregate into one square marker carrying the stack
  // count (rendered inside when >= 2) and clickable member ids.
  if (wantPsgc) {
    const psgcBuckets = new Map();
    for (const project of projects || []) {
      if (hasTitleGps(project) || !statusOn('psgc', niaMapSubtypeKey(project, dimension))) continue;
      const coords = project.locations?.psgc?.primary?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2
          || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
      const key = `${coords[0]},${coords[1]}`;
      const bucket = psgcBuckets.get(key);
      if (bucket) bucket.push(project);
      else psgcBuckets.set(key, [project]);
    }
    for (const [key, bucket] of psgcBuckets) {
      const [lon, lat] = key.split(',').map(Number);
      // Representative: the largest amount keeps hover/context meaningful
      // when many rows share one centroid.
      const rep = [...bucket].sort((a, b) => (projectAmount(b) ?? -Infinity)
        - (projectAmount(a) ?? -Infinity))[0];
      features.push({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [lon, lat]},
        properties: {
          ...baseProperties(rep, 'psgc'),
          role: '',
          point_index: null,
          stack_count: bucket.length,
          stack_ids: bucket.map(p => p.id).join(','),
        },
      });
    }
  }
  return features;
}

/**
 * LineString chains connecting the title-GPS points of multi-site rows, in
 * title order (FMR-style: the line makes one workbook line's several sites
 * readable as a single scheme). Not a route — just a visual join.
 */
export function consolidatedMapChains(projects, layerOrObjects = DEFAULT_LOCATION_LAYER, types = null, dimension = 'status') {
  const features = [];
  let wantGps;
  if (typeof layerOrObjects === 'string') {
    wantGps = layerOrObjects === 'title_gps' || layerOrObjects === 'both';
  } else {
    wantGps = Boolean(layerOrObjects?.title_gps);
  }
  if (!wantGps) return features;
  const typeOn = key => (!types || Boolean(types?.title_gps?.[key]));
  for (const project of projects || []) {
    const points = (project.locations?.title_gps?.points || [])
      .filter(pt => Number.isFinite(Number(pt.longitude)) && Number.isFinite(Number(pt.latitude)));
    if (points.length < 2) continue;
    if (!typeOn(niaMapSubtypeKey(project, dimension))) continue;
    const coords = points.map(pt => [Number(pt.longitude), Number(pt.latitude)]);
    features.push({
      type: 'Feature',
      geometry: {type: 'LineString', coordinates: coords},
      properties: {
        ...baseProperties(project, 'title_gps'),
        role: '', point_index: null,
        site_count: points.length,
      },
    });
  }
  return features;
}

export function filterConsolidatedProjects(projects, {
  layer = DEFAULT_LOCATION_LAYER,
  objects = null,
  types = null,
  filter = 'located',
  status = 'all',
  anchor = 'all',
  dimension = 'status',
} = {}) {
  const wantGps = objects
    ? Boolean(objects.title_gps)
    : (layer === 'title_gps' || layer === 'both');
  const wantPsgc = objects
    ? Boolean(objects.psgc)
    : (layer === 'psgc' || layer === 'both');
  return (projects || []).filter(p => {
    if (status !== 'all' && p.workbook_status !== status) return false;
    if (filter === 'flagged' && !(p.flags || []).length) return false;
    const hasGps = (p.locations?.title_gps?.point_count || 0) > 0;
    const primary = p.locations?.psgc?.primary;
    const hasPsgc = Array.isArray(primary?.coordinates) && primary.coordinates.length >= 2;
    if (anchor !== 'all') {
      if (!hasPsgc || primary.coordinate_anchor !== anchor) return false;
    }
    const subtypeKey = niaMapSubtypeKey(p, dimension);
    const gpsOk = wantGps && hasGps && (!types || types.title_gps?.[subtypeKey]);
    // Same fallback rule as plotting: PSGC only carries rows without GPS.
    const psgcOk = wantPsgc && !hasGps && hasPsgc && (!types || types.psgc?.[subtypeKey]);
    if (anchor !== 'all') return psgcOk;
    return Boolean(gpsOk || psgcOk);
  });
}

export function consolidatedMapSummary(consolidated) {
  const counts = consolidated?.meta?.counts || {};
  return {
    projects: counts.projects || 0,
    with_title_gps: counts.with_title_gps || 0,
    title_gps_points: counts.title_gps_points || 0,
    with_psgc_centroid: counts.with_psgc_centroid || 0,
    matching_split: counts.matching_split || 0,
    coverage: counts.coverage || {},
    money_note: consolidated?.meta?.money_note || '',
    location_note: consolidated?.meta?.location_note || '',
  };
}

/** Index consolidated rows by stage ledger id (nep_id / house_id). */
export function consolidatedByStageId(projects, stageKey) {
  const field = stageKey === 'house' ? 'house_id' : 'nep_id';
  const map = new Map();
  for (const project of projects || []) {
    const id = project[field];
    if (id) map.set(id, project);
  }
  return map;
}

/** Option A: plottable when title GPS or PSGC centroid exists. */
export function hasPlottableLocation(project) {
  return preferredMapFocus(project) != null;
}

/**
 * Prefer title-GPS points; fall back to the primary PSGC centroid.
 * Returns {basis, coordinates: [[lon,lat], ...], label} or null.
 */
export function preferredMapFocus(project) {
  const gpsPoints = (project?.locations?.title_gps?.points || [])
    .map(pt => {
      const lon = Number(pt.longitude ?? pt.lon ?? (Array.isArray(pt.coordinates) ? pt.coordinates[0] : NaN));
      const lat = Number(pt.latitude ?? pt.lat ?? (Array.isArray(pt.coordinates) ? pt.coordinates[1] : NaN));
      return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
    })
    .filter(Boolean);
  if (gpsPoints.length) {
    return {basis: 'title_gps', coordinates: gpsPoints, label: 'Title GPS'};
  }
  const primary = project?.locations?.psgc?.primary;
  const coords = primary?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2
      && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1]))) {
    const place = [primary.barangay || primary.municipality, primary.province]
      .filter(Boolean).join(', ');
    return {
      basis: 'psgc',
      coordinates: [[Number(coords[0]), Number(coords[1])]],
      label: place ? `PSGC centroid · ${place}` : 'PSGC centroid',
    };
  }
  return null;
}

/** Title-chainage spans printed on the consolidated workbook row. */
export function formatConsolidatedChainage(project) {
  return formatChainageSpans(project?.locations?.chainage?.spans) || '';
}
