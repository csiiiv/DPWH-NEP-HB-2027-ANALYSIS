import {MPB_POINT_CLASSES, mpbRecordMapOverlay, mpbApproxDominantCategory} from './mpbSegmentOverlay.js';
import {DISTRICT_SEGMENT_CLASSES} from './fmrSegmentOverlay.js';

/** Toggleable map objects for #congress/map (URL `objects=`). */
export const CONGRESS_MAP_OBJECT_OPTIONS = [
  ['districts', 'Legislative districts'],
  ['fmr', 'FMR segments'],
  ['fmr_repairs', 'FMR corrections'],
  ['mpb', 'MPB buildings'],
  ['mpb_approx', 'MPB approx. (PSGC)'],
  ['mpb_unmapped', 'MPB without coordinates'],
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
    ['link', 'Incorrect original → accepted link'],
    ['point', 'Incorrect original coordinate'],
  ],
  mpb: Object.entries(MPB_POINT_CLASSES).map(([id, style]) => [id, style.label]),
  // Dashed PSGC-centroid markers for rows that print no title coordinate.
  mpb_approx: Object.entries(MPB_POINT_CLASSES).map(([id, style]) => [id, style.label]),
  // Class chips default on; the red aggregate "total" square is opt-in.
  mpb_unmapped: [
    ...Object.entries(MPB_POINT_CLASSES).map(([id, style]) => [id, style.label]),
    ['total', 'All without coordinates'],
  ],
};

function typeToken(objectId, subtypeId) {
  return `${objectId}:${subtypeId}`;
}

export const DEFAULT_CONGRESS_MAP_TYPES = Object.fromEntries(
  Object.entries(CONGRESS_MAP_TYPE_OPTIONS).map(([objectId, entries]) => [
    objectId,
    Object.fromEntries(entries.map(([subtypeId]) => [
      subtypeId,
      // Red district-total square stays off until the user asks for it.
      !(objectId === 'mpb_unmapped' && subtypeId === 'total'),
    ])),
  ]));

function congressMapTypesMatchDefault(types) {
  for (const [objectId, entries] of Object.entries(CONGRESS_MAP_TYPE_OPTIONS)) {
    for (const [subtypeId] of entries) {
      if (Boolean(types?.[objectId]?.[subtypeId])
        !== Boolean(DEFAULT_CONGRESS_MAP_TYPES[objectId][subtypeId])) {
        return false;
      }
    }
  }
  return true;
}

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

/** Serialize subtype toggles; omit when they match the defaults. */
export function congressMapTypesParam(types) {
  if (congressMapTypesMatchDefault(types)) return null;
  const selected = [];
  for (const [objectId, entries] of Object.entries(CONGRESS_MAP_TYPE_OPTIONS)) {
    for (const [subtypeId] of entries) {
      if (types?.[objectId]?.[subtypeId]) selected.push(typeToken(objectId, subtypeId));
    }
  }
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
 * Per-district badges for MPB rows that print no TITLE coordinate —
 * including rows the PSGC-approx layer places at centroids. The badge
 * answers "how many MPB rows does this district own without printed GPS",
 * independently of where (or whether) approx markers visualize them, so the
 * two layers deliberately overlap in coverage. Class split mirrors the
 * explorer vocabulary: insertions = House only, deletions = NEP only,
 * remaining buckets = pairs.
 */
export function mpbUnmappedDistrictBadges(mpbIndex, districtsGeojson) {
  if (!mpbIndex || !districtsGeojson) return {type: 'FeatureCollection', features: []};
  const keep = id => !(mpbIndex.row_points ?? {})[id]?.length;
  const unmapped = new Map();
  // Distinct-record totals (returned as `counts`): a row on a multi-district
  // card lights up every district badge it belongs to, but it is still ONE
  // record, so national figures dedupe by row id.
  const distinct = {house_only: new Set(), nep_only: new Set(), paired: new Set()};
  for (const card of [...(mpbIndex.cards ?? []), ...(mpbIndex.region_cards ?? [])]) {
    const rowIds = card.row_ids ?? {};
    const houseOnly = (rowIds.insertions ?? []).filter(keep);
    const nepOnly = (rowIds.deletions ?? []).filter(keep);
    const pairedRows = [...(rowIds.increased ?? []), ...(rowIds.reduced ?? []),
      ...(rowIds.unchanged ?? []), ...(rowIds.scope_review ?? [])].filter(keep);
    for (const id of houseOnly) distinct.house_only.add(id);
    for (const id of nepOnly) distinct.nep_only.add(id);
    for (const id of pairedRows) distinct.paired.add(id);
    for (const district of card.districts ?? []) {
      const entry = unmapped.get(district.id) ?? {house_only: 0, nep_only: 0, paired: 0};
      entry.house_only += houseOnly.length;
      entry.nep_only += nepOnly.length;
      entry.paired += pairedRows.length;
      if (entry.house_only + entry.nep_only + entry.paired > 0) {
        unmapped.set(district.id, entry);
      }
    }
  }
  const features = (districtsGeojson.features ?? [])
    .filter(feature => unmapped.has(feature.properties.district_id))
    .map(feature => {
      const counts = unmapped.get(feature.properties.district_id);
      const total = counts.house_only + counts.nep_only + counts.paired;
      return {
        type: 'Feature',
        id: `mpb-unmapped:${feature.properties.district_id}`,
        properties: {
          objectKind: 'mpb_unmapped',
          districtId: feature.properties.district_id,
          districtLabel: `${feature.properties.jurisdiction} · ${feature.properties.district_label}`,
          unmapped: total,
          // Flat copies for the icon-image expression: MapLibre's `get`
          // cannot reach into nested objects, so sprite ids concatenate
          // these top-level props instead of the unmappedByClass dict.
          house_only: counts.house_only,
          nep_only: counts.nep_only,
          paired: counts.paired,
          unmappedByClass: counts,
        },
        geometry: {type: 'Point', coordinates: polygonCentroid(feature.geometry)},
      };
    });
  return {
    type: 'FeatureCollection',
    features,
    counts: {
      house_only: distinct.house_only.size,
      nep_only: distinct.nep_only.size,
      paired: distinct.paired.size,
      total: distinct.house_only.size + distinct.nep_only.size + distinct.paired.size,
    },
  };
}

/**
 * Apply subtype toggles to unmapped badges: zero out disabled class tiers
 * for the stacked sprite, and optionally emit a separate red total feature
 * per district. Districts with nothing left to draw drop out of each view.
 */
export function mpbUnmappedBadgeViews(mpbBadges, types) {
  const toggles = types?.mpb_unmapped ?? DEFAULT_CONGRESS_MAP_TYPES.mpb_unmapped;
  const stack = [];
  const total = [];
  for (const feature of mpbBadges?.features ?? []) {
    const props = feature.properties ?? {};
    const counts = {
      house_only: toggles.house_only ? (props.house_only || 0) : 0,
      nep_only: toggles.nep_only ? (props.nep_only || 0) : 0,
      paired: toggles.paired ? (props.paired || 0) : 0,
    };
    if (counts.house_only + counts.nep_only + counts.paired > 0) {
      stack.push({
        ...feature,
        properties: {...props, ...counts, unmappedByClass: counts},
      });
    }
    if (toggles.total && (props.unmapped || 0) > 0) {
      total.push({
        ...feature,
        id: `${feature.id}:total`,
        properties: {...props, badgeKind: 'total'},
      });
    }
  }
  return {
    stack: {type: 'FeatureCollection', features: stack},
    total: {type: 'FeatureCollection', features: total},
  };
}

/**
 * Nationwide sums for the unmapped-layer subtype toggles. Prefers the
 * distinct-record `counts` from `mpbUnmappedDistrictBadges` (a row shared by
 * several districts is one record); falls back to summing badge features.
 */
export function mpbUnmappedClassTotals(mpbBadges) {
  if (mpbBadges?.counts?.total != null) return {...mpbBadges.counts};
  const totals = {house_only: 0, nep_only: 0, paired: 0, total: 0};
  for (const feature of mpbBadges?.features ?? []) {
    const props = feature.properties ?? {};
    totals.house_only += props.house_only || 0;
    totals.nep_only += props.nep_only || 0;
    totals.paired += props.paired || 0;
    totals.total += props.unmapped || 0;
  }
  return totals;
}

/**
 * GeoJSON for the PSGC-centroid approximate overlay. One feature per collapsed
 * barangay/municipality marker from the supplement JSON. Not survey GPS —
 * `placement` stays `psgc_centroid` so the map can style dashed boxes.
 */
export function mpbApproxMapOverlay(approxOverlay) {
  const features = (approxOverlay?.markers ?? []).map(marker => {
    const counts = marker.counts ?? {};
    const category = mpbApproxDominantCategory(counts);
    return {
      type: 'Feature',
      id: marker.id,
      properties: {
        objectKind: 'mpb_approx',
        placement: 'psgc_centroid',
        psgcCode: marker.psgc_code,
        level: marker.level,
        name: marker.name,
        barangay: marker.barangay,
        municipality: marker.municipality,
        province: marker.province,
        // MapLibre GeoJSON properties must be scalars; join for query/click.
        districtIds: (marker.district_ids ?? []).join(','),
        rowIds: (marker.row_ids ?? []).join(','),
        house_only: counts.house_only || 0,
        nep_only: counts.nep_only || 0,
        paired: counts.paired || 0,
        count: counts.total || 0,
        category,
        categoryLabel: MPB_POINT_CLASSES[category].label,
        color: MPB_POINT_CLASSES[category].color,
        centroidSource: marker.centroid_source,
      },
      geometry: {type: 'Point', coordinates: [marker.lng, marker.lat]},
    };
  });
  return {
    type: 'FeatureCollection',
    features,
    counts: approxOverlay?.counts?.rows_by_class ?? {house_only: 0, nep_only: 0, paired: 0},
  };
}

/** Apply class subtype toggles to approx markers (drop empties). */
export function mpbApproxMarkerViews(approxOverlayFc, types) {
  const toggles = types?.mpb_approx ?? DEFAULT_CONGRESS_MAP_TYPES.mpb_approx;
  const features = [];
  for (const feature of approxOverlayFc?.features ?? []) {
    const props = feature.properties ?? {};
    const counts = {
      house_only: toggles.house_only ? (props.house_only || 0) : 0,
      nep_only: toggles.nep_only ? (props.nep_only || 0) : 0,
      paired: toggles.paired ? (props.paired || 0) : 0,
    };
    const total = counts.house_only + counts.nep_only + counts.paired;
    if (total <= 0) continue;
    const category = mpbApproxDominantCategory(counts);
    features.push({
      ...feature,
      properties: {
        ...props,
        ...counts,
        count: total,
        category,
        categoryLabel: MPB_POINT_CLASSES[category].label,
        color: MPB_POINT_CLASSES[category].color,
      },
    });
  }
  return {type: 'FeatureCollection', features};
}

/** Area-weighted centroid of a polygon ring set — a stable anchor point. */
function polygonCentroid(geometry) {
  const rings = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  let bestArea = -1, bestPoint = [122.5, 12.5];
  for (const polygon of rings) {
    const ring = polygon?.[0] ?? [];
    let twiceArea = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    if (twiceArea === 0) continue;
    const area = Math.abs(twiceArea);
    if (area > bestArea) {
      bestArea = area;
      bestPoint = [cx / (3 * twiceArea), cy / (3 * twiceArea)];
    }
  }
  return bestPoint;
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
