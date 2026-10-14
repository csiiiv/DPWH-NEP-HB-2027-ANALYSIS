// Map symbol artwork and cluster styling for the Geolocation workspace.
//
// One artwork description feeds BOTH the React legend (<svg>) and the MapLibre
// sprite (canvas rasterization), so the legend can never drift from what is
// drawn on the map. Mirrors the FmrMap.jsx approach. Kept JSX-free so the module
// stays framework-independent and unit-testable.
//
// Channel allocation is deliberate — the data decides it:
//   SHAPE (glyph silhouette) = source grouping. Geometry already separates the
//     groups (1,652 of 1,668 FMR records are lines; 4,608 of 5,303 DPWH records
//     are points), but a silhouette keeps the ~695 DPWH lines distinguishable
//     from the 1,652 FMR lines, and survives greyscale printing and
//     colour-vision deficiency in a way hue alone does not.
//   COLOUR (badge fill) = source grouping, reinforcing the shape.
//   RING = a coordinate that carries a review issue.
//   CLUSTER FILL = homogeneity. A single-group cluster takes that group's
//     colour; a mixed cluster is neutral slate, so regional composition stays
//     readable at national zoom instead of smearing into one hue.
//   BUBBLE SIZE = member count, which is what makes density assessable.
//
// The glyph is rendered WHITE on the coloured badge rather than in the group
// colour. Painting both the same hue produced zero contrast — the silhouette was
// invisible on the map (measured: the DPWH blue occupied only 0.137% of canvas
// pixels, all of it badge, none of it glyph).

import {GROUP_COLORS} from './geoModel.js';

/** Stable group ordering: cluster aggregation compares numeric indices. */
export const GROUP_ORDER = ['fmr', 'dpwh', 'nia', 'hfep'];

/** Group -> numeric index, stored on each feature for cluster min/max. */
export const GROUP_INDEX = Object.fromEntries(GROUP_ORDER.map((g, i) => [g, i]));

/** Neutral fill for clusters that mix groupings. */
export const MIXED_CLUSTER_COLOR = '#475569';
/** Ring colour marking a coordinate that carries a review issue. */
export const ISSUE_RING_COLOR = '#dc2626';
/** Glyph paint: white, so it contrasts against every grouping colour. */
export const GLYPH_COLOR = '#ffffff';
/** Halo behind the disc, keeping the badge legible on either basemap. */
export const BADGE_OUTLINE_COLOR = '#ffffff';
/** Fill for a grouping the artwork does not recognise. */
export const UNKNOWN_GROUP_COLOR = '#334155';

/** Icon image ids registered on the map style. */
export const GROUP_ICONS = Object.fromEntries(GROUP_ORDER.map(g => [g, `geo-${g}`]));
/** Suffix for the review-issue variant of each grouping badge. */
export const ISSUE_ICON_SUFFIX = '-issue';
// Referenced by the layer's `match` fallback so an unexpected grouping value
// resolves to a registered image instead of erroring the style.
GROUP_ICONS.fallback = 'geo-unknown';

/** Zoom at which clusters dissolve into individual badges. */
export const CLUSTER_MAX_ZOOM = 11;
/** Pixel radius within which nearby points merge at a given zoom. */
export const CLUSTER_RADIUS = 38;

/**
 * Marker scale ramp. Clusters own the map below CLUSTER_MAX_ZOOM, so the useful
 * range starts where badges appear; growing past ~17 keeps a single record
// readable without swallowing the street labels.
 */
export const ICON_SIZE = ['interpolate', ['linear'], ['zoom'],
  CLUSTER_MAX_ZOOM, 0.30,
  14, 0.45,
  17, 0.62,
];

const circlePath = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Glyph is drawn scaled into the badge; both renderers share this transform. */
export const GLYPH_TRANSFORM = 'translate(32 32) scale(0.5) translate(-32 -32)';

/**
 * Glyph paths for one grouping, in the 64×64 design space, before the badge
 * transform. Each shape is {d, fill, stroke, width}; the renderer resolves the
 * fill to the glyph colour.
 */
export function groupGlyph(group) {
  const shape = (d, fill = 'glyph', stroke = null, width = 0) => ({d, fill, stroke, width});

  if (group === 'fmr') {
    // Farm-to-market road: a tapering ribbon with a dashed centre line, read as
    // "linear rural road" rather than a building.
    return [
      shape('M18 58L27 6H37L46 58Z'),
      shape('M32 12V22M32 28V38M32 44V54', 'none', 'badge', 4),
    ];
  }
  if (group === 'dpwh') {
    // Public building: gabled roof with two bays — Multi-Purpose Buildings are
    // the dominant DPWH PAP in this inventory.
    return [
      shape('M17 24H47L44 57H20Z'),
      shape('M11 20H53M24 19V10H40V19', 'none', 'glyph', 5),
      shape('M26 31V49M38 31V49', 'none', 'badge', 4),
    ];
  }
  if (group === 'nia') {
    // Irrigation: a water droplet over a channel lip.
    return [
      shape('M32 6C43 21 51 31 51 41A19 19 0 0 1 13 41C13 31 21 21 32 6Z'),
      shape('M20 44H44', 'none', 'badge', 4),
    ];
  }
  if (group === 'hfep') {
    // Health facility: medical cross.
    return [shape('M25 8H39V25H56V39H39V56H25V39H8V25H25Z')];
  }
  // Unknown grouping: a hollow ring, visible but obviously uncategorised.
  return [shape(circlePath(32, 32, 20), 'none', 'glyph', 6)];
}

/**
 * Full badge artwork: coloured disc, white glyph, outer stroke, and a red ring
 * when the coordinate needs review. Returned as a flat shape list in 64×64
 * space so the SVG legend and the canvas sprite paint the same pixels.
 *
 * Every fill/stroke in `shapes` is a concrete colour or null — never a token —
 * so both renderers can paint the artwork verbatim. An unrecognised grouping
 * resolves to UNKNOWN_GROUP_COLOR rather than being left white.
 */
export function groupBadgeArtwork(group, {issue = false} = {}) {
  const badgeColor = GROUP_COLORS[group] || UNKNOWN_GROUP_COLOR;
  const shapes = [];
  // White outer stroke keeps the badge legible on both basemaps and over
  // satellite-ish land cover.
  shapes.push({d: circlePath(32, 32, 29), fill: BADGE_OUTLINE_COLOR, stroke: null, width: 0});
  shapes.push({d: circlePath(32, 32, 26), fill: badgeColor, stroke: null, width: 0});
  if (issue) {
    shapes.push({d: circlePath(32, 32, 26), fill: null, stroke: ISSUE_RING_COLOR, width: 6});
  }
  for (const shape of groupGlyph(group)) {
    shapes.push({
      ...shape,
      glyph: true,
      // Resolve tokens HERE, once. Both renderers previously resolved them a
      // second time and defaulted any unrecognised value to white, so the hex
      // this function returned for the badge disc fell through to white. Every
      // grouping then painted an all-white sprite — invisible on the basemap —
      // which is why individual markers never appeared on the map.
      fill: resolveToken(shape.fill, badgeColor),
      stroke: resolveToken(shape.stroke, badgeColor),
    });
  }
  return {badgeColor, glyphTransform: GLYPH_TRANSFORM, shapes};
}

/**
 * Turn a glyph token into a concrete colour (or null for "do not paint").
 *
 * Artwork emits tokens so the glyph paths stay declarative; this is the single
 * place that knows what they mean, and the resolved hex is what both renderers
 * consume verbatim.
 */
function resolveToken(token, badgeColor) {
  if (token === 'none' || token == null) return null;
  if (token === 'badge') return badgeColor;
  if (token === 'glyph') return GLYPH_COLOR;
  return token;
}

/**
 * Rasterize a badge into the RGBA payload MapLibre's addImage expects.
 * Glyph shapes are drawn under GLYPH_TRANSFORM so they sit inside the disc.
 */
export function groupIconImage(group, {issue = false} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = ctx.lineCap = 'round';
  const art = groupBadgeArtwork(group, {issue});
  for (const {d, fill, stroke, width, glyph} of art.shapes) {
    const path = new Path2D(d);
    if (glyph) {
      // Same affine transform as the SVG legend: scale the 64-space glyph into
      // the badge disc.
      ctx.save();
      ctx.translate(32, 32);
      ctx.scale(0.5, 0.5);
      ctx.translate(-32, -32);
    }
    // `fill`/`stroke` are already concrete colours (or null): groupBadgeArtwork
    // resolved the tokens. Re-resolving here is what silently repainted every
    // badge white, so paint them verbatim.
    if (fill) {ctx.fillStyle = fill; ctx.fill(path);}
    if (stroke && width) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke(path);
    }
    if (glyph) ctx.restore();
  }
  return {width: 64, height: 64, data: new Uint8Array(ctx.getImageData(0, 0, 64, 64).data.buffer)};
}

/** Register every grouping badge (plain + issue variant) on the map style. */
export function ensureGroupIcons(instance) {
  for (const group of [...GROUP_ORDER, 'unknown']) {
    for (const issue of [false, true]) {
      const id = `${GROUP_ICONS[group] || GROUP_ICONS.fallback}${issue ? ISSUE_ICON_SUFFIX : ''}`;
      if (!instance.hasImage(id)) instance.addImage(id, groupIconImage(group, {issue}));
    }
  }
}

/**
 * Cluster bubble fill: the group colour when every member shares one grouping,
 * neutral slate when the cluster mixes groupings. The clustered source
 * accumulates gMin/gMax, so equality means "homogeneous".
 */
export const CLUSTER_FILL = ['case',
  ['==', ['get', 'gMin'], ['get', 'gMax']],
  ['match', ['get', 'gMin'],
    0, GROUP_COLORS.fmr,
    1, GROUP_COLORS.dpwh,
    2, GROUP_COLORS.nia,
    3, GROUP_COLORS.hfep,
    MIXED_CLUSTER_COLOR],
  MIXED_CLUSTER_COLOR];

/**
 * Bubble radius grows with member count. A sub-linear (sqrt-like) ramp keeps
 * perceived area roughly proportional to count, so a cluster of 15 does not
 * dwarf one of 10 while still staying visibly larger.
 *
 * `interpolate` has no `sqrt` mode — only linear, exponential and cubic-bezier —
 * so exponential with base 0.5 is used; it is the same concave shape.
 */
export const CLUSTER_BUBBLE_RADIUS = ['interpolate', ['exponential', 0.5], ['get', 'point_count'],
  2, 7,
  10, 10,
  50, 14,
  200, 19,
  1000, 24,
];

/**
 * Cluster accumulators.
 *
 * MapLibre destructures each entry as `[operator, mapExpression]`, so the REDUCE
 * comes first — the reverse of supercluster's documented `[map, reduce]`. Getting
 * this backwards produces "Expected value to be of type number, but found null",
 * because the map step then tries to evaluate `['accumulated']`, which is null
 * outside a cluster reduce.
 *
 * The two expressions also run against different property objects:
 *   map    sees the raw point feature, so it reads the decorated `gIndex` /
 *          `hasIssue` fields;
 *   reduce sees the accumulated cluster properties plus `['accumulated']`, so it
 *          reads its OWN key (`gMin`, not `gIndex`) for the incoming member.
 *
 * gMin/gMax give a cheap homogeneity test — equal bounds mean every member shares
 * one grouping — and `issues` counts records needing review.
 */
export const CLUSTER_PROPERTIES = {
  gMin: [['min', ['accumulated'], ['get', 'gMin']], ['get', 'gIndex']],
  gMax: [['max', ['accumulated'], ['get', 'gMax']], ['get', 'gIndex']],
  issues: [['+', ['accumulated'], ['get', 'issues']], ['get', 'hasIssue']],
};

/** Cluster aggregation spec for the GeoJSON source. */
export const CLUSTER_SOURCE_OPTIONS = {
  cluster: true,
  clusterMaxZoom: CLUSTER_MAX_ZOOM,
  clusterRadius: CLUSTER_RADIUS,
  clusterProperties: CLUSTER_PROPERTIES,
};

/**
 * Marker views the user can choose between.
 *
 * These answer different questions about the same points, so none is strictly
 * better: clustering is the only way to read *density* at national zoom, badges
 * are the only way to read *which grouping* a specific project belongs to
 * without zooming in, and plain dots stay legible when thousands of badges
 * would overlap into noise.
 *
 * `cluster` toggles MapLibre's own aggregation. It is safe to flip at runtime
 * via source.setClusterOptions — that call only rewrites `cluster`,
 * `clusterRadius` and `clusterMaxZoom`, so the `clusterProperties`
 * accumulators (gMin/gMax/issues) that drive bubble homogeneity survive a
 * round trip through "off" and back.
 *
 * `iconOpacity` / `circleOpacity` are zoom ramps. `null` means "hide this
 * element in this mode"; layers are always present in the style, because
 * add/removeLayer per mode change would also drop their click handlers.
 */
export const MARKER_MODES = {
  clusters: {
    label: 'Clusters',
    cluster: true,
    hint: 'Bubbles aggregate nearby projects; size = count, colour = grouping mix. Zoom past level '
      + `${CLUSTER_MAX_ZOOM} or click a bubble for individual markers.`,
    // Cross-fade: bubbles own the map, badges take over as clusters dissolve.
    iconOpacity: ['interpolate', ['linear'], ['zoom'],
      CLUSTER_MAX_ZOOM - 1, 0, CLUSTER_MAX_ZOOM + 1, 0.97],
    circleOpacity: ['interpolate', ['linear'], ['zoom'],
      CLUSTER_MAX_ZOOM - 1, 0.92, CLUSTER_MAX_ZOOM + 1, 0.15],
    // Reuses the shared ramp rather than restating the stops, so the badge
    // scale has one definition that the existing tests still cover.
    iconSize: ICON_SIZE,
  },
  badges: {
    label: 'Badges',
    cluster: false,
    hint: 'Every project individually, with its grouping icon and colour at all zoom levels. '
      + 'Dense areas overlap — switch to Clusters to read density.',
    // Always visible: this mode exists so grouping is readable without zooming.
    iconOpacity: 0.97,
    circleOpacity: 0.15,
    // Smaller floor than the cluster ramp, or national zoom becomes solid ink.
    iconSize: ['interpolate', ['linear'], ['zoom'], 4, 0.22, 11, 0.30, 14, 0.45, 17, 0.62],
  },
  dots: {
    label: 'Dots',
    cluster: false,
    hint: 'Every project individually as a plain coloured dot — grouping by colour only. '
      + 'Lightest view at national zoom; switch to Badges to see the icon shapes.',
    iconOpacity: null,
    circleOpacity: 0.92,
    iconSize: 0.30,
  },
};

/** Ordered for the control, matching the legend's grouping order convention. */
export const MARKER_MODE_ORDER = ['clusters', 'badges', 'dots'];
/** Mode used when the URL carries none or an unrecognised value. */
export const DEFAULT_MARKER_MODE = 'clusters';

/**
 * Resolve a URL value to a known mode. Unknown values fall back rather than
 * throwing, so a hand-edited or stale shared link still renders.
 */
export function resolveMarkerMode(value) {
  return MARKER_MODE_ORDER.includes(value) ? value : DEFAULT_MARKER_MODE;
}

/**
 * Attach the per-feature properties the cluster accumulators and icon variants
 * read.
 *
 * Kept here rather than in geoModel so presentation concerns (numeric group
 * index, issue flag) do not leak into the data model, and geoModel stays the
 * single source of truth for record semantics.
 */
export function decorateClusterProps(points) {
  const features = (points?.features || []).map(feature => {
    const props = feature.properties || {};
    const hasIssue = props.status === 'parsed_with_issues'
      || (props.issues || []).length > 0 ? 1 : 0;
    return {
      ...feature,
      properties: {
        ...props,
        gIndex: GROUP_INDEX[props.group] ?? GROUP_ORDER.length,
        hasIssue,
        // Resolved here so the layer's icon-image expression stays a simple
        // lookup instead of re-deriving issue state per vertex.
        icon: `${GROUP_ICONS[props.group] || GROUP_ICONS.fallback}${hasIssue ? ISSUE_ICON_SUFFIX : ''}`,
      },
    };
  });
  return {type: 'FeatureCollection', features};
}
