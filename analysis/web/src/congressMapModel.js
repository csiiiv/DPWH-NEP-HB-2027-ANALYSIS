import {MPB_POINT_CLASSES, mpbRecordMapOverlay} from './mpbSegmentOverlay.js';
import {DISTRICT_SEGMENT_CLASSES} from './fmrSegmentOverlay.js';

/** Toggleable map objects for #congress/map (URL `objects=`). */
export const CONGRESS_MAP_OBJECT_OPTIONS = [
  ['districts', 'Legislative districts'],
  ['fmr', 'FMR segments'],
  ['fmr_repairs', 'FMR corrections'],
  ['mpb', 'MPB buildings'],
];
export const DEFAULT_CONGRESS_MAP_OBJECTS = Object.fromEntries(
  CONGRESS_MAP_OBJECT_OPTIONS.map(([id]) => [id, true]));

/**
 * Per-object subtype toggles (URL `types=`). Keys are `object:subtype`
 * so FMR and MPB can share category ids without colliding.
 */
export const CONGRESS_MAP_TYPE_OPTIONS = {
  fmr: Object.entries(DISTRICT_SEGMENT_CLASSES).map(([id, style]) => [id, style.label]),
  fmr_repairs: [
    ['link', 'Printed → corrected link'],
    ['point', 'Corrected coordinate'],
  ],
  mpb: Object.entries(MPB_POINT_CLASSES).map(([id, style]) => [id, style.label]),
};

function typeToken(objectId, subtypeId) {
  return `${objectId}:${subtypeId}`;
}

function allTypeTokens() {
  return Object.entries(CONGRESS_MAP_TYPE_OPTIONS).flatMap(([objectId, entries]) =>
    entries.map(([subtypeId]) => typeToken(objectId, subtypeId)));
}

export const DEFAULT_CONGRESS_MAP_TYPES = Object.fromEntries(
  Object.entries(CONGRESS_MAP_TYPE_OPTIONS).map(([objectId, entries]) => [
    objectId,
    Object.fromEntries(entries.map(([subtypeId]) => [subtypeId, true])),
  ]));

function emptyCongressMapTypes() {
  return Object.fromEntries(
    Object.entries(CONGRESS_MAP_TYPE_OPTIONS).map(([objectId, entries]) => [
      objectId,
      Object.fromEntries(entries.map(([subtypeId]) => [subtypeId, false])),
    ]));
}

/** Read object toggles from the share URL; missing param means all on. */
export function readCongressMapObjects(params = new URLSearchParams()) {
  if (!params.has('objects')) return {...DEFAULT_CONGRESS_MAP_OBJECTS};
  const raw = params.get('objects');
  if (raw === 'none' || raw === '') {
    return Object.fromEntries(CONGRESS_MAP_OBJECT_OPTIONS.map(([id]) => [id, false]));
  }
  const selected = new Set(String(raw).split(',').filter(Boolean));
  return Object.fromEntries(CONGRESS_MAP_OBJECT_OPTIONS.map(([id]) => [id, selected.has(id)]));
}

/** Serialize toggles for the share URL; omit when every object is on. */
export function congressMapObjectsParam(objects) {
  const selected = CONGRESS_MAP_OBJECT_OPTIONS.filter(([id]) => objects[id]).map(([id]) => id);
  if (selected.length === CONGRESS_MAP_OBJECT_OPTIONS.length) return null;
  return selected.length ? selected.join(',') : 'none';
}

/** Read subtype toggles; missing `types` means every subtype is on. */
export function readCongressMapTypes(params = new URLSearchParams()) {
  if (!params.has('types')) return structuredClone(DEFAULT_CONGRESS_MAP_TYPES);
  const raw = params.get('types');
  if (raw === 'none' || raw === '') return emptyCongressMapTypes();
  const selected = new Set(String(raw).split(',').filter(Boolean));
  const next = emptyCongressMapTypes();
  for (const [objectId, entries] of Object.entries(CONGRESS_MAP_TYPE_OPTIONS)) {
    for (const [subtypeId] of entries) {
      next[objectId][subtypeId] = selected.has(typeToken(objectId, subtypeId));
    }
  }
  return next;
}

/** Serialize subtype toggles; omit when every subtype is on. */
export function congressMapTypesParam(types) {
  const selected = [];
  for (const [objectId, entries] of Object.entries(CONGRESS_MAP_TYPE_OPTIONS)) {
    for (const [subtypeId] of entries) {
      if (types?.[objectId]?.[subtypeId]) selected.push(typeToken(objectId, subtypeId));
    }
  }
  const all = allTypeTokens();
  if (selected.length === all.length) return null;
  return selected.length ? selected.join(',') : 'none';
}

/** Enabled category ids for a category-colored object (FMR / MPB). */
export function enabledCongressMapCategories(types, objectId) {
  const entries = CONGRESS_MAP_TYPE_OPTIONS[objectId] ?? [];
  return entries.map(([id]) => id).filter(id => types?.[objectId]?.[id]);
}

/** MapLibre filter keeping only the enabled category values. */
export function congressMapCategoryFilter(categories) {
  if (!categories?.length) return ['==', ['get', 'category'], '__none__'];
  if (categories.length === 1) return ['==', ['get', 'category'], categories[0]];
  return ['in', ['get', 'category'], ['literal', categories]];
}

const GOLDEN_ANGLE = 137.508;

/** Lightness/saturation ramp matching PSGC2LEG/viz/index.html shadeFor(). */
function shadeFor(districtNo, total) {
  if (!total || total <= 1) return {l: 46, s: 64};
  const t = ((districtNo || 1) - 1) / (total - 1);
  return {l: Math.round(60 - t * 32), s: Math.round(58 + t * 16)};
}

function fallbackHue(name, hueOrder) {
  const idx = hueOrder.indexOf(name);
  return idx < 0 ? 0 : Math.round((idx * GOLDEN_ANGLE) % 360);
}

/**
 * Color legislative-district features the same way PSGC2LEG/viz does:
 * adjacency-aware province hues with a per-district lightness ramp.
 * Mutates a shallow-copied FeatureCollection; does not alter the source file.
 */
export function colorDistrictFeatures(geojson, hues) {
  const features = geojson?.features ?? [];
  const byJurisdiction = new Map();
  for (const feature of features) {
    const {jurisdiction, district_no: districtNo} = feature.properties;
    const districts = byJurisdiction.get(jurisdiction) || new Map();
    districts.set(districtNo ?? 0, feature.properties.district_label);
    byJurisdiction.set(jurisdiction, districts);
  }
  const hueOrder = [...byJurisdiction.keys()]
    .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  const hueTable = hues && typeof hues === 'object' ? hues : {};

  return {
    type: 'FeatureCollection',
    features: features.map(feature => {
      const {jurisdiction, district_no: districtNo} = feature.properties;
      const total = byJurisdiction.get(jurisdiction)?.size || 1;
      const h = hueTable[jurisdiction] != null
        ? hueTable[jurisdiction]
        : fallbackHue(jurisdiction, hueOrder);
      const {l, s} = shadeFor(districtNo, total);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          color: `hsl(${h}, ${s}%, ${l}%)`,
        },
      };
    }),
  };
}

/** psgc_leg_id (viz) → lens district_id from the packaged map artifact props. */
export function districtIdBridge(mapArtifact) {
  const bridge = new Map();
  for (const feature of mapArtifact?.features ?? []) {
    const {psgc_leg_id: psgc, district_id: districtId} = feature.properties || {};
    if (psgc && districtId) bridge.set(psgc, districtId);
  }
  return bridge;
}

/** Attach lens district_id onto viz features via the map-artifact bridge. */
export function decorateDistrictIds(coloredGeojson, bridge) {
  return {
    type: 'FeatureCollection',
    features: (coloredGeojson?.features ?? []).map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        district_id: bridge.get(feature.properties.leg_id) ?? null,
      },
    })),
  };
}

/**
 * Nationwide MPB point overlay from explorer rows that already carry
 * `mpbPoints` (same grain as MpbPointsModal / mpbDistrictMapOverlay).
 * Multi-point titles also contribute a same-title west→east connector line.
 */
export function mpbNationalMapOverlay(records) {
  const points = [];
  const lines = [];
  for (const record of records) {
    const overlay = mpbRecordMapOverlay(record);
    points.push(...overlay.points.features);
    lines.push(...overlay.lines.features);
  }
  const counts = Object.fromEntries(Object.keys(MPB_POINT_CLASSES).map(category => [category, {
    records: records.filter(record => {
      if (record.house_php != null && record.nep_php != null) return category === 'paired';
      return category === (record.nep_php != null ? 'nep_only' : 'house_only');
    }).length,
    points: points.filter(feature => feature.properties.category === category).length,
    linkedTitles: lines.filter(feature => feature.properties.category === category).length,
  }]));
  return {
    points: {type: 'FeatureCollection', features: points},
    lines: {type: 'FeatureCollection', features: lines},
    counts,
  };
}

/**
 * First legislative-lens card id for a district. The reverse `districts`
 * index on FMR/MPB payloads still carries DEO office-group ids, so card
 * lookup walks `cards[].districts` instead.
 */
export function districtCardId(index, districtId) {
  if (!index || !districtId) return null;
  const matches = (index.cards ?? []).filter(card =>
    (card.districts ?? []).some(district => district.id === districtId));
  if (!matches.length) return null;
  const preferred = matches.find(card =>
    ['title_psgc', 'district', 'coordinate', 'deo_to_leg'].includes(card.location_tier))
    ?? matches[0];
  return preferred.id;
}
