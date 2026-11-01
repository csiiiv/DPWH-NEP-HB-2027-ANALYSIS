import {STAGE_COLORS} from './fmrMapModel.js';

/** Point-style classes for the MPB map overlays. MPBs are point facilities:
 * one coordinate pair locates a building. When one title prints several
 * pairs (e.g. multiple units), a thin line joins those same-title points
 * left-to-right (west→east) so the path stays x-monotone and does not
 * self-intersect — never between unrelated buildings. Colors follow the
 * shared stage vocabulary. */
export const MPB_POINT_CLASSES = {
  house_only: {label: 'House only', color: STAGE_COLORS.house},
  nep_only: {label: 'NEP only', color: STAGE_COLORS.nep},
  paired: {label: 'Matched pair', color: '#7c3aed'},
};

export const MPB_BOX_ICON = 'mpb-box-marker';
export const mpbBoxIconId = category => `${MPB_BOX_ICON}-${category}`;

function parseHexColor(color) {
  const hex = String(color || '#888888').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Opaque square sprite (not SDF). MapLibre SDF icons look washed-out at the
 * small country-zoom sizes we use for MPB; baking the category color keeps
 * markers fully solid like the FMR circles.
 */
export function mpbBoxIconImage(color = '#ffffff', size = 64) {
  const [r, g, b] = parseHexColor(color);
  const data = new Uint8Array(size * size * 4);
  const pad = Math.max(1, Math.round(size * 0.06));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = x >= pad && x < size - pad && y >= pad && y < size - pad;
      if (!inside) continue;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return {width: size, height: size, data};
}

/** MapLibre expression picking the baked box sprite for a feature category. */
export const MPB_BOX_ICON_IMAGE = [
  'match', ['get', 'category'],
  'house_only', mpbBoxIconId('house_only'),
  'nep_only', mpbBoxIconId('nep_only'),
  'paired', mpbBoxIconId('paired'),
  mpbBoxIconId('house_only'),
];

/** Register one opaque box sprite per MPB status color. */
export function ensureMpbBoxIcon(instance) {
  if (!instance) return;
  for (const [category, style] of Object.entries(MPB_POINT_CLASSES)) {
    const id = mpbBoxIconId(category);
    if (instance.hasImage(id)) continue;
    instance.addImage(id, mpbBoxIconImage(style.color));
  }
}

export const MPB_BADGE_ICON = 'mpb-unmapped-badge';

/**
 * Square badge sprite with the unmapped count printed in the middle.
 * Rendered on a canvas so digits stay crisp; sized by digit count so a
 * 4-figure total still fits. One sprite per distinct count value.
 */
export function mpbBadgeIconImage(count, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const label = String(count);
  const digits = label.length;
  // Square badge sized by digit count: 3 digits need a wider box than 1.
  const box = Math.min(size, Math.round(size * (0.62 + digits * 0.13)));
  const offset = Math.round((size - box) / 2);
  // Red: a district total that cannot be located — matches the shared
  // red-flag vocabulary the FMR corrections already use.
  ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, Math.round(size * 0.045));
  const radius = Math.round(box * 0.18);
  ctx.beginPath();
  ctx.roundRect(offset, offset, box, box, radius);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(box / (digits * 0.72 + 0.35))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + Math.round(box * 0.02));
  return {width: size, height: size, data: ctx.getImageData(0, 0, size, size).data};
}

/** Register one badge sprite per distinct unmapped count on the map. */
export function ensureMpbBadgeIcons(instance, counts) {
  if (!instance) return;
  for (const count of new Set(counts)) {
    const id = `${MPB_BADGE_ICON}-${count}`;
    if (!instance.hasImage(id)) instance.addImage(id, mpbBadgeIconImage(count));
  }
}

export const mpbBadgeIconId = count => `${MPB_BADGE_ICON}-${count}`;

function comparisonClass(record) {
  // An MPB row is "paired" when both amount stages are present on the
  // comparison row, matching the bucket vocabulary the explorer prints.
  if (record.house_php != null && record.nep_php != null) return 'paired';
  return record.nep_php != null ? 'nep_only' : 'house_only';
}

/** Stage flags for a retained point: which source documents printed it.
 * The builder keeps one entry per unique lon/lat pair with its stage
 * observations, so both readings of the same building collapse to one dot.
 * House evidence is the second/third reading vocabulary the location lens
 * commits (a point never carries a literal "house" stage). */
function pointStages(point) {
  const stages = point.stages ?? [];
  return {
    house: stages.some(stage => stage === 'second' || stage === 'third'),
    nep: stages.includes('nep'),
  };
}

/**
 * Left-to-right visit order: start at the westernmost point, then proceed
 * east. An x-monotone chain cannot self-intersect, so multi-unit titles do
 * not draw as a scribble. Latitude breaks longitude ties.
 */
export function leftToRightOrder(coordinates) {
  return (coordinates || []).slice().sort((a, b) =>
    (a[0] - b[0]) || (a[1] - b[1]));
}

/** Point overlay for one MPB explorer record (the per-row map button). */
export function mpbRecordMapOverlay(record) {
  const category = comparisonClass(record);
  const style = MPB_POINT_CLASSES[category];
  const points = (record.mpbPoints ?? []).map((point, index) => {
    const flags = pointStages(point);
    return {
      type: 'Feature',
      id: `${record.id}#${index}`,
      properties: {
        recordId: record.id,
        title: record.title,
        category,
        categoryLabel: style.label,
        printedByHouse: flags.house,
        printedByNep: flags.nep,
        issues: point.issues ?? [],
        color: style.color,
        objectKind: 'mpb',
      },
      geometry: {type: 'Point', coordinates: [point.lng, point.lat]},
    };
  });
  // Same-title multi-unit titles: join retained pairs west→east.
  const lines = [];
  if (points.length >= 2) {
    const ordered = leftToRightOrder(points.map(feature => feature.geometry.coordinates));
    lines.push({
      type: 'Feature',
      id: `${record.id}#title-link`,
      properties: {
        recordId: record.id,
        title: record.title,
        category,
        categoryLabel: style.label,
        color: style.color,
        objectKind: 'mpb',
        pointCount: points.length,
        linkOrder: 'left_to_right',
      },
      geometry: {
        type: 'LineString',
        coordinates: ordered,
      },
    });
  }
  return {
    points: {type: 'FeatureCollection', features: points},
    lines: {type: 'FeatureCollection', features: lines},
    count: points.length,
  };
}

/** Every retained MPB point on one card (the View all buildings overlay). */
export function mpbDistrictMapOverlay(records) {
  const points = [];
  const lines = [];
  for (const record of records) {
    const overlay = mpbRecordMapOverlay(record);
    points.push(...overlay.points.features);
    lines.push(...overlay.lines.features);
  }
  const counts = Object.fromEntries(Object.keys(MPB_POINT_CLASSES).map(category => [category, {
    records: records.filter(record => comparisonClass(record) === category).length,
    points: points.filter(feature => feature.properties.category === category).length,
    linkedTitles: lines.filter(feature => feature.properties.category === category).length,
  }]));
  return {
    points: {type: 'FeatureCollection', features: points},
    lines: {type: 'FeatureCollection', features: lines},
    counts,
  };
}

/** Frame coordinates for fitting the map to an overlay. */
export function mpbOverlayFrame(overlay) {
  return overlay.points.features.map(feature => feature.geometry.coordinates);
}