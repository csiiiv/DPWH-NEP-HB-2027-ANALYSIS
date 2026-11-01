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
 * Count badge sprite for coordinate-less MPB rows: one stacked chip per
 * comparison class (House only / NEP only / Matched pair), each in its
 * shared MPB color so the badge reads like a vertical slice of the point
 * legend. Zero-count classes draw no tier, so a single-class district gets
 * one small chip instead of a stack of empty boxes. Digits always render at
 * the same share of tier height (a "1" and a "427" read identically); tier
 * width grows only as far as its label needs. One sprite per distinct
 * count triple.
 */
export function mpbBadgeIconImage(counts, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tiers = Object.entries(MPB_POINT_CLASSES)
    .map(([category, style]) => ({...style, count: counts[category] || 0}))
    .filter(tier => tier.count > 0);
  const tierHeight = Math.round(size * 0.21);
  const fontPx = Math.round(tierHeight * 0.6);
  const gap = Math.round(size * 0.025);
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const widths = tiers.map(tier =>
    Math.max(tierHeight, Math.ceil(ctx.measureText(String(tier.count)).width)
      + Math.round(tierHeight * 0.5)));
  const stackHeight = tiers.length * tierHeight + (tiers.length - 1) * gap;
  const stackWidth = Math.max(...widths);
  let y = Math.round((size - stackHeight) / 2);
  const stroke = Math.max(2, Math.round(size * 0.018));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = stroke;
  ctx.strokeStyle = '#ffffff';
  tiers.forEach((tier, index) => {
    const width = widths[index];
    const x0 = Math.round((size - width) / 2);
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.roundRect(x0, y, width, tierHeight, Math.round(tierHeight * 0.24));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(tier.count), size / 2, y + tierHeight / 2 + Math.round(tierHeight * 0.04));
    y += tierHeight + gap;
  });
  return {width: size, height: size, data: ctx.getImageData(0, 0, size, size).data};
}

/** Register one stacked badge sprite per distinct unmapped count triple. */
export function ensureMpbBadgeIcons(instance, countTuples) {
  if (!instance) return;
  for (const counts of countTuples) {
    const id = mpbBadgeIconId(counts);
    if (!instance.hasImage(id)) instance.addImage(id, mpbBadgeIconImage(counts));
  }
}

export const mpbBadgeIconId = counts =>
  `${MPB_BADGE_ICON}-${counts.house_only}-${counts.nep_only}-${counts.paired}`;

export const MPB_TOTAL_BADGE_ICON = 'mpb-unmapped-total';

/**
 * Aggregate red count badge — the opt-in "all without coordinates" square.
 * Same digit-sizing rules as the stacked chips; red matches the earlier
 * cannot-be-located warning vocabulary.
 */
export function mpbTotalBadgeIconImage(count, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const label = String(count);
  const height = Math.round(size * 0.34);
  const fontPx = Math.round(height * 0.62);
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const width = Math.max(height, Math.ceil(ctx.measureText(label).width)
    + Math.round(height * 0.42));
  const x0 = Math.round((size - width) / 2);
  const y0 = Math.round((size - height) / 2);
  ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.018));
  ctx.beginPath();
  ctx.roundRect(x0, y0, width, height, Math.round(height * 0.28));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, y0 + height / 2 + Math.round(height * 0.03));
  return {width: size, height: size, data: ctx.getImageData(0, 0, size, size).data};
}

export function ensureMpbTotalBadgeIcons(instance, counts) {
  if (!instance) return;
  for (const count of new Set(counts)) {
    const id = mpbTotalBadgeIconId(count);
    if (!instance.hasImage(id)) instance.addImage(id, mpbTotalBadgeIconImage(count));
  }
}

export const mpbTotalBadgeIconId = count => `${MPB_TOTAL_BADGE_ICON}-${count}`;

export const MPB_APPROX_ICON = 'mpb-approx-marker';
/** Light gray slash used on all PSGC-approx markers. */
export const MPB_APPROX_STRIPE = 'rgba(203, 213, 225, 0.95)';
/** @deprecated Kept for any leftover legend imports; approx markers no longer split orange. */
export const MPB_APPROX_ACCENT = '#ea580c';
export const mpbApproxIconId = (category, count) =>
  `${MPB_APPROX_ICON}-${category}-${count}`;

function fillApproxStriped(ctx, x0, y0, width, height, radius, classColor) {
  // Solid class color with one thick light-gray diagonal so the marker still
  // reads its status but cannot be mistaken for printed GPS.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, width, height, radius);
  ctx.clip();
  ctx.fillStyle = classColor;
  ctx.fillRect(x0, y0, width, height);
  ctx.strokeStyle = MPB_APPROX_STRIPE;
  ctx.lineWidth = Math.max(6, Math.round(Math.min(width, height) * 0.38));
  ctx.lineCap = 'butt';
  ctx.beginPath();
  // Corner-to-corner slash through the box.
  ctx.moveTo(x0 - width * 0.05, y0 + height * 0.85);
  ctx.lineTo(x0 + width * 1.05, y0 + height * 0.15);
  ctx.stroke();
  ctx.restore();
}

/**
 * PSGC-centroid approximate markers: class color + one light-gray slash.
 * - count === 1: same 64px footprint as a solid title-GPS box, no digit
 * - count > 1: compact counted chip
 */
export function mpbApproxIconImage(color = '#2563eb', count = 1, size = null,
  category = 'house_only') {
  const singleton = count <= 1;
  const canvasSize = size ?? (singleton ? 64 : 96);
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');

  if (singleton) {
    const pad = Math.max(1, Math.round(canvasSize * 0.06));
    const side = canvasSize - pad * 2;
    fillApproxStriped(ctx, pad, pad, side, side, Math.round(side * 0.16), color);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, Math.round(canvasSize * 0.05));
    ctx.beginPath();
    ctx.roundRect(pad, pad, side, side, Math.round(side * 0.16));
    ctx.stroke();
    return {
      width: canvasSize, height: canvasSize,
      data: ctx.getImageData(0, 0, canvasSize, canvasSize).data,
    };
  }

  const label = String(count);
  const height = Math.round(canvasSize * 0.46);
  const fontPx = Math.round(height * 0.55);
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const width = Math.max(height, Math.ceil(ctx.measureText(label).width)
    + Math.round(height * 0.45));
  const x0 = Math.round((canvasSize - width) / 2);
  const y0 = Math.round((canvasSize - height) / 2);
  const radius = Math.round(height * 0.22);
  fillApproxStriped(ctx, x0, y0, width, height, radius, color);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(canvasSize * 0.03));
  ctx.beginPath();
  ctx.roundRect(x0, y0, width, height, radius);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(canvasSize * 0.04);
  ctx.fillText(label, canvasSize / 2, y0 + height / 2 + Math.round(height * 0.04));
  ctx.shadowBlur = 0;
  return {
    width: canvasSize, height: canvasSize,
    data: ctx.getImageData(0, 0, canvasSize, canvasSize).data,
  };
}

export function ensureMpbApproxIcons(instance, specs) {
  if (!instance) return;
  for (const {category, count, color} of specs) {
    const id = mpbApproxIconId(category, count);
    if (!instance.hasImage(id)) {
      instance.addImage(id, mpbApproxIconImage(color, count, null, category));
    }
  }
}

/** CSS background for approx legend/key chips by category. */
export function mpbApproxSwatchBackground(category, classColor) {
  // One thick gray slash over the class color (matches the map sprite).
  return `linear-gradient(-45deg, ${classColor} 34%, rgba(203, 213, 225, 0.95) 34% 56%, ${classColor} 56%)`;
}

/** Majority (or paired-on-tie) class for a collapsed approx marker. */
export function mpbApproxDominantCategory(counts = {}) {
  const ranked = Object.keys(MPB_POINT_CLASSES)
    .map(category => [category, counts[category] || 0])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked[0][1]) return 'paired';
  if (ranked[1] && ranked[0][1] === ranked[1][1]) return 'paired';
  return ranked[0][0];
}

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