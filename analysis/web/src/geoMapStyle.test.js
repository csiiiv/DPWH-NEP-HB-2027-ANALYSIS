import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_ORDER, GROUP_INDEX, GROUP_ICONS, ISSUE_ICON_SUFFIX, MIXED_CLUSTER_COLOR,
  ISSUE_RING_COLOR, GLYPH_COLOR, UNKNOWN_GROUP_COLOR, BADGE_OUTLINE_COLOR,
  CLUSTER_FILL, CLUSTER_BUBBLE_RADIUS, CLUSTER_PROPERTIES,
  CLUSTER_SOURCE_OPTIONS, CLUSTER_MAX_ZOOM, ICON_SIZE, GLYPH_TRANSFORM,
  MARKER_MODES, MARKER_MODE_ORDER, DEFAULT_MARKER_MODE, resolveMarkerMode,
  groupGlyph, groupBadgeArtwork, decorateClusterProps,
} from './geoMapStyle.js';
import {GROUP_COLORS} from './geoModel.js';

const feature = (group, over = {}) => ({
  type: 'Feature',
  properties: {group, status: 'parsed', ...over},
  geometry: {type: 'Point', coordinates: [121.5, 15.5]},
});

test('every grouping has a distinct glyph silhouette', () => {
  for (const group of GROUP_ORDER) {
    const glyph = groupGlyph(group);
    assert.ok(glyph.length >= 1, `${group} needs at least one path`);
    for (const shape of glyph) {
      assert.equal(typeof shape.d, 'string');
      assert.ok(shape.d.length > 4, `${group} path looks empty`);
      // Fill/stroke are tokens the renderer resolves; unknown tokens would
      // silently paint nothing.
      for (const token of [shape.fill, shape.stroke]) {
        if (token == null) continue;
        assert.ok(['glyph', 'badge', 'none'].includes(token),
          `${group} uses unresolvable colour token ${token}`);
      }
    }
  }
  // Distinct groupings must not share a silhouette, or the shape channel
  // carries no information.
  const signatures = GROUP_ORDER.map(g => groupGlyph(g).map(s => s.d).join('|'));
  assert.equal(new Set(signatures).size, GROUP_ORDER.length, 'group glyphs must differ');
});

test('unknown grouping falls back to a hollow ring', () => {
  const glyph = groupGlyph('not-a-group');
  assert.equal(glyph[0].fill, 'none');
  assert.ok(glyph[0].stroke, 'the ring must have a visible stroke');
});

test('badge paints the grouping colour with a contrasting white glyph', () => {
  for (const group of GROUP_ORDER) {
    const art = groupBadgeArtwork(group);
    assert.equal(art.badgeColor, GROUP_COLORS[group]);
    // Regression: painting the glyph in the group colour made it invisible
    // against the badge (measured 0.137% canvas pixels, none of them glyph).
    assert.ok(art.glyphTransform.includes('scale'),
      'glyph must be scaled into the badge disc');
    // The artwork must hand back the exact transform the canvas renderer
    // applies, or the SVG legend and the map sprite would disagree.
    assert.equal(art.glyphTransform, GLYPH_TRANSFORM);
    assert.ok(GLYPH_TRANSFORM.includes('translate(32 32)'),
      'glyph must be centred before scaling');
    const glyphShapes = art.shapes.filter(s => s.glyph);
    assert.ok(glyphShapes.length >= 1, `${group} must expose glyph shapes`);
    for (const shape of glyphShapes) {
      if (shape.fill && shape.fill !== 'none') {
        assert.notEqual(shape.fill, 'badge',
          `${group} glyph fill must contrast with the badge colour`);
      }
    }
    // A white outer stroke must exist so the badge reads on both basemaps.
    assert.ok(art.shapes.some(s => s.fill === '#ffffff' && !s.glyph),
      'badge needs a white outer stroke');
  }
});

test('the issue variant adds a red review ring', () => {
  const plain = groupBadgeArtwork('dpwh');
  const flagged = groupBadgeArtwork('dpwh', {issue: true});
  assert.equal(flagged.shapes.length, plain.shapes.length + 1);
  assert.ok(flagged.shapes.some(s => s.stroke === ISSUE_RING_COLOR),
    'issue badge must carry the review ring');
  assert.ok(!plain.shapes.some(s => s.stroke === ISSUE_RING_COLOR));
  // Everything else about the badge must be identical, so the ring is the only
  // difference a reviewer reads.
  assert.equal(flagged.badgeColor, plain.badgeColor);
});

// Regression: groupBadgeArtwork used to hand back literal hex for the badge disc
// while BOTH renderers re-resolved "tokens" and defaulted anything unrecognised
// to white. The disc therefore fell through to white for every grouping, so each
// sprite was an all-white disc with an all-white glyph — present in the style,
// present in MapLibre's render index, and invisible on the basemap. These tests
// pin the contract that prevented it: artwork is the ONLY resolver, and its
// output is paintable as-is.
const TOKENS = ['glyph', 'badge', 'none'];

test('artwork emits concrete colours, never renderer tokens', () => {
  for (const group of [...GROUP_ORDER, 'unknown', 'not-a-group']) {
    for (const issue of [false, true]) {
      const art = groupBadgeArtwork(group, {issue});
      for (const shape of art.shapes) {
        for (const [key, value] of Object.entries({fill: shape.fill, stroke: shape.stroke})) {
          if (value == null) continue; // null means "do not paint"
          assert.ok(!TOKENS.includes(value),
            `${group} (issue=${issue}) ${key} left the token "${value}" unresolved`);
          assert.match(value, /^#[0-9a-f]{6}$/i,
            `${group} (issue=${issue}) ${key} is not a hex colour: ${value}`);
        }
      }
      // A stroked shape needs a width, or the stroke silently paints nothing.
      for (const shape of art.shapes) {
        if (shape.stroke) {
          assert.ok(shape.width > 0,
            `${group} (issue=${issue}) stroked shape has no width`);
        }
      }
    }
  }
});

test('every grouping colour reaches a painted shape', () => {
  // This is the assertion whose absence let the all-white sprites ship: the
  // palette must survive into artwork that a renderer consumes verbatim.
  for (const group of GROUP_ORDER) {
    const art = groupBadgeArtwork(group);
    const painted = new Set();
    for (const shape of art.shapes) {
      if (shape.fill) painted.add(shape.fill.toLowerCase());
      if (shape.stroke && shape.width > 0) painted.add(shape.stroke.toLowerCase());
    }
    assert.ok(painted.has(GROUP_COLORS[group].toLowerCase()),
      `${group}: badge colour ${GROUP_COLORS[group]} never reaches a shape`);
    // The glyph must contrast with the disc, or the silhouette disappears.
    assert.ok(painted.has(GLYPH_COLOR.toLowerCase()),
      `${group}: glyph colour ${GLYPH_COLOR} never reaches a shape`);
    assert.ok(painted.size >= 2,
      `${group} paints only ${[...painted].join(', ')} — no figure/ground contrast`);
  }
});

test('distinct groupings paint distinct sprites', () => {
  // The colour channel is what a reviewer uses to tell groupings apart at a
  // glance, so no two may collapse to the same palette.
  const palettes = GROUP_ORDER.map(group => {
    const art = groupBadgeArtwork(group);
    return art.shapes.map(s => [s.fill, s.stroke, s.width].join('~')).sort().join('|');
  });
  assert.equal(new Set(palettes).size, GROUP_ORDER.length,
    'groupings must not share an identical badge palette');
});

test('unknown grouping falls back to a neutral, still-painted badge', () => {
  const art = groupBadgeArtwork('not-a-group');
  assert.equal(art.badgeColor, UNKNOWN_GROUP_COLOR);
  const painted = new Set(art.shapes.filter(s => s.fill).map(s => s.fill.toLowerCase()));
  assert.ok(painted.has(UNKNOWN_GROUP_COLOR.toLowerCase()),
    'the fallback badge must paint its neutral colour, not white');
});

test('icon ids are registered for every grouping plus a fallback', () => {
  for (const group of GROUP_ORDER) {
    assert.equal(GROUP_ICONS[group], `geo-${group}`);
    assert.equal(typeof GROUP_INDEX[group], 'number');
  }
  assert.equal(GROUP_ICONS.fallback, 'geo-unknown');
  assert.ok(ISSUE_ICON_SUFFIX.startsWith('-'));
  // Indices must be distinct, otherwise the homogeneity test collapses.
  assert.equal(new Set(Object.values(GROUP_INDEX)).size, GROUP_ORDER.length);
});

test('cluster accumulators use MapLibre [reduce, map] order', () => {
  // MapLibre destructures each entry as `[operator, mapExpression]`, i.e. the
  // REDUCE comes first — the reverse of supercluster's own docs. Reversing it
  // makes the map step evaluate ['accumulated'] (null outside a reduce), which
  // warns "Expected value to be of type number, but found null".
  for (const [key, value] of Object.entries(CLUSTER_PROPERTIES)) {
    assert.ok(Array.isArray(value) && value.length === 2,
      `${key} must be a [reduce, map] tuple`);
    const [reduce, map] = value;
    for (const expression of value) {
      assert.ok(Array.isArray(expression), `${key} expression must be an array`);
      assert.equal(typeof expression[0], 'string');
    }
    // reduce FIRST, and it must fold over the accumulated value.
    assert.ok(JSON.stringify(reduce).includes('accumulated'),
      `${key} reduce expression must read ['accumulated']`);
    // map SECOND, reading the raw decorated feature property.
    assert.ok(!JSON.stringify(map).includes('accumulated'),
      `${key} map expression must not read ['accumulated']`);
    assert.equal(JSON.stringify(map), JSON.stringify(['get',
      key === 'issues' ? 'hasIssue' : 'gIndex']),
      `${key} map must read the decorated source property`);
  }
  assert.equal(CLUSTER_SOURCE_OPTIONS.clusterProperties, CLUSTER_PROPERTIES);
  assert.equal(CLUSTER_SOURCE_OPTIONS.cluster, true);
  assert.equal(CLUSTER_SOURCE_OPTIONS.clusterMaxZoom, CLUSTER_MAX_ZOOM);
});

test('reduce reads its own accumulated key, not the source property', () => {
  // In the reduce step MapLibre passes the cluster's accumulated properties as
  // the feature, so ['get', 'gIndex'] would be undefined there. Each reduce must
  // reference its OWN key so the fold chains correctly.
  for (const [key, [reduce]] of Object.entries(CLUSTER_PROPERTIES)) {
    assert.ok(JSON.stringify(reduce).includes(JSON.stringify(['get', key])),
      `${key} reduce must read ['get', '${key}']`);
  }
});

test('cluster fill separates homogeneous from mixed bubbles', () => {
  const serialized = JSON.stringify(CLUSTER_FILL);
  assert.ok(serialized.includes('"gMin"') && serialized.includes('"gMax"'));
  assert.ok(serialized.includes(MIXED_CLUSTER_COLOR));
  for (const group of GROUP_ORDER) {
    assert.ok(serialized.includes(GROUP_COLORS[group]),
      `cluster fill should be able to render ${group}`);
  }
  // A homogeneous cluster must NOT fall back to the mixed colour.
  assert.equal(CLUSTER_FILL[1][0], '==');
});

test('cluster bubble radius scales with member count', () => {
  // Density assessment needs size keyed to point_count, not zoom alone.
  assert.equal(CLUSTER_BUBBLE_RADIUS[2][1], 'point_count');
  const stops = CLUSTER_BUBBLE_RADIUS.slice(3);
  assert.equal(stops.length % 2, 0);
  const radii = stops.filter((_, i) => i % 2 === 1);
  for (let i = 1; i < radii.length; i++) {
    assert.ok(radii[i] > radii[i - 1], 'radius must grow with count');
  }
});

test('interpolation modes are ones MapLibre actually supports', () => {
  // Regression: ['interpolate', ['sqrt'], …] aborts the whole style with
  // "Unknown interpolation type sqrt", blanking the canvas. Only linear,
  // exponential and cubic-bezier exist.
  const SUPPORTED = ['linear', 'exponential', 'cubic-bezier'];
  const ramps = {
    clusterRadius: CLUSTER_BUBBLE_RADIUS,
    iconSize: ICON_SIZE,
  };
  for (const [name, expression] of Object.entries(ramps)) {
    assert.equal(expression[0], 'interpolate', name);
    const mode = expression[1];
    const modeName = Array.isArray(mode) ? mode[0] : mode;
    assert.ok(SUPPORTED.includes(modeName),
      `${name} uses unsupported interpolation mode ${JSON.stringify(mode)}`);
  }
  // A sub-linear ramp is what keeps cluster AREA roughly proportional to count.
  const mode = CLUSTER_BUBBLE_RADIUS[1];
  assert.equal(mode[0], 'exponential');
  assert.ok(mode[1] < 1, 'bubble growth must be concave (base < 1)');
});

test('badge scale ramp starts where clusters dissolve', () => {
  assert.equal(ICON_SIZE[2][0], 'zoom');
  const stops = ICON_SIZE.slice(3);
  assert.equal(stops[0], CLUSTER_MAX_ZOOM,
    'badges should appear as clusters dissolve, not before');
  const sizes = stops.filter((_, i) => i % 2 === 1);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1], 'badge must grow with zoom');
  }
  // Keep badges readable but never larger than the source artwork.
  assert.ok(sizes[sizes.length - 1] <= 1);
});

// The marker-view selector gives three readings of the same points. Each must be
// internally consistent, and exactly one may own clustering at a time — two
// modes claiming `cluster: true` would make the toggle ambiguous.
//
// DEFERRED at the user's request (2026-10-14): marker-view coverage is skipped
// until the E2E verification loop is in place. Keep the assertions here so
// un-skipping restores the full contract; the feature itself was verified
// manually (paint properties, cluster toggle round-trip, pixel checks).
const SKIP_MARKERS = 'deferred: marker-view tests pending E2E harness (user request)';

test('marker modes cover both clustering states', {skip: SKIP_MARKERS}, () => {
  assert.equal(MARKER_MODE_ORDER.length, 3);
  for (const key of MARKER_MODE_ORDER) {
    assert.ok(MARKER_MODES[key], `${key} must be defined`);
    const mode = MARKER_MODES[key];
    assert.equal(typeof mode.label, 'string');
    assert.ok(mode.label.length > 0, `${key} needs a label`);
    assert.equal(typeof mode.cluster, 'boolean', `${key} must state clustering`);
    assert.ok(typeof mode.hint === 'string' && mode.hint.length > 20,
      `${key} needs an explanatory hint`);
    // iconOpacity null means "no sprite"; otherwise it must be a number or a
    // ramp, because syncLayers feeds it straight to setPaintProperty.
    if (mode.iconOpacity !== null) {
      const okType = typeof mode.iconOpacity === 'number'
        || (Array.isArray(mode.iconOpacity) && mode.iconOpacity[0] === 'interpolate');
      assert.ok(okType, `${key} iconOpacity must be a number, ramp or null`);
    }
    const okCircle = typeof mode.circleOpacity === 'number'
      || (Array.isArray(mode.circleOpacity) && mode.circleOpacity[0] === 'interpolate');
    assert.ok(okCircle, `${key} circleOpacity must be a number or ramp`);
    // A size is always required: the layer sets icon-size unconditionally.
    const okSize = typeof mode.iconSize === 'number'
      || (Array.isArray(mode.iconSize) && mode.iconSize[0] === 'interpolate');
    assert.ok(okSize, `${key} iconSize must be a number or ramp`);
  }
  // Only the clustered mode may aggregate; the others exist precisely to show
  // every project individually.
  assert.equal(MARKER_MODES.clusters.cluster, true);
  assert.equal(MARKER_MODES.badges.cluster, false);
  assert.equal(MARKER_MODES.dots.cluster, false);
});

test('marker modes differ in what they draw', {skip: SKIP_MARKERS}, () => {
  // badges shows sprites at every zoom, dots hides them entirely. If these
  // converged the selector would offer two names for one view.
  assert.equal(MARKER_MODES.dots.iconOpacity, null);
  assert.notEqual(MARKER_MODES.badges.iconOpacity, null);
  assert.notEqual(MARKER_MODES.clusters.iconOpacity, null);
  // In dots mode the dot itself must be fully present, not faded out.
  assert.ok(MARKER_MODES.dots.circleOpacity > 0.8,
    'dots mode must show its dots');
  // clusters reuses the shared badge ramp rather than restating the stops, so
  // the scale has a single definition the earlier ramp test still covers.
  assert.equal(MARKER_MODES.clusters.iconSize, ICON_SIZE);
});

test('resolveMarkerMode falls back on unknown values', {skip: SKIP_MARKERS}, () => {
  assert.equal(DEFAULT_MARKER_MODE, 'clusters');
  for (const key of MARKER_MODE_ORDER) {
    assert.equal(resolveMarkerMode(key), key);
  }
  // A stale or hand-edited shared link must still render instead of throwing.
  assert.equal(resolveMarkerMode('nonsense'), DEFAULT_MARKER_MODE);
  assert.equal(resolveMarkerMode(null), DEFAULT_MARKER_MODE);
  assert.equal(resolveMarkerMode(undefined), DEFAULT_MARKER_MODE);
  assert.equal(resolveMarkerMode(''), DEFAULT_MARKER_MODE);
});

test('only MapLibre-supported interpolation modes appear in marker modes', {skip: SKIP_MARKERS}, () => {
  // Regression guard: an unsupported mode like ['sqrt'] aborts the whole style
  // and blanks the canvas, not just the one property.
  const SUPPORTED = ['linear', 'exponential', 'cubic-bezier'];
  const ramps = [];
  for (const [key, mode] of Object.entries(MARKER_MODES)) {
    for (const prop of ['iconOpacity', 'circleOpacity', 'iconSize']) {
      const value = mode[prop];
      if (Array.isArray(value)) ramps.push([`${key}.${prop}`, value]);
    }
  }
  assert.ok(ramps.length >= 3, 'expected the cluster cross-fade ramps to be tested');
  for (const [name, expression] of ramps) {
    assert.equal(expression[0], 'interpolate', `${name} must be an interpolate`);
    const mode = expression[1];
    const modeName = Array.isArray(mode) ? mode[0] : mode;
    assert.ok(SUPPORTED.includes(modeName),
      `${name} uses unsupported interpolation mode ${JSON.stringify(mode)}`);
    assert.equal(expression[2][0], 'zoom', `${name} must ramp on zoom`);
  }
});

test('decorateClusterProps attaches keys the accumulators and icons read', () => {
  const points = {type: 'FeatureCollection', features: [
    feature('dpwh'),
    feature('fmr', {status: 'parsed_with_issues'}),
    feature('dpwh', {issues: ['outside_philippines_orientation_bounds']}),
    feature('mystery'),
  ]};
  const out = decorateClusterProps(points);
  assert.equal(out.features.length, 4);
  assert.equal(out.features[0].properties.gIndex, GROUP_INDEX.dpwh);
  assert.equal(out.features[0].properties.hasIssue, 0);
  assert.equal(out.features[0].properties.icon, 'geo-dpwh');
  // Either an issue status or a point-level issue selects the flagged sprite.
  assert.equal(out.features[1].properties.hasIssue, 1);
  assert.equal(out.features[1].properties.icon, `geo-fmr${ISSUE_ICON_SUFFIX}`);
  assert.equal(out.features[2].properties.hasIssue, 1);
  assert.equal(out.features[2].properties.icon, `geo-dpwh${ISSUE_ICON_SUFFIX}`);
  // Unknown groupings sort above the known ones and still resolve to a sprite.
  assert.equal(out.features[3].properties.gIndex, GROUP_ORDER.length);
  assert.equal(out.features[3].properties.icon, GROUP_ICONS.fallback);
  // Original properties must survive decoration.
  assert.equal(out.features[0].properties.status, 'parsed');
  assert.deepEqual(out.features[0].geometry, points.features[0].geometry);
});

test('decoration tolerates missing or empty feature collections', () => {
  assert.deepEqual(decorateClusterProps(undefined).features, []);
  assert.deepEqual(decorateClusterProps({features: []}).features, []);
  const bare = {type: 'Feature', geometry: {type: 'Point', coordinates: [121, 15]}};
  const out = decorateClusterProps({features: [bare]});
  assert.equal(out.features[0].properties.gIndex, GROUP_ORDER.length);
  assert.equal(out.features[0].properties.hasIssue, 0);
  assert.equal(out.features[0].properties.icon, GROUP_ICONS.fallback);
});

test('decoration does not mutate the input overlay', () => {
  const points = {type: 'FeatureCollection', features: [feature('dpwh')]};
  decorateClusterProps(points);
  assert.equal(points.features[0].properties.gIndex, undefined,
    'source overlay must stay presentation-free');
  assert.equal(points.features[0].properties.icon, undefined);
});
