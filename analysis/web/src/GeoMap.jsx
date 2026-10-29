import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref, readRoute} from './routes.js';
import {siteUrl} from './data.js';
import ShareLink from './ShareLink.jsx';
import {
  GROUP_COLORS, STATUS_LABELS, FRAGMENT_KIND_LABELS,
  RULE_LABELS, ISSUE_LABELS, CHANGE_TYPE_LABELS, MULTI_FILTER_KEYS,
  parseMulti, serializeMulti, formatAmountPhp,
  filterRecords, parsedPoints, buildOverlay, optionLists, recordCodes,
  recordPdfSources, recordHref, inPhilippineBounds, PHILIPPINE_BOUNDS,
} from './geoModel.js';
import {
  CLUSTER_FILL, CLUSTER_BUBBLE_RADIUS, CLUSTER_SOURCE_OPTIONS, CLUSTER_MAX_ZOOM,
  ISSUE_RING_COLOR, GLYPH_TRANSFORM, GROUP_ORDER,
  MARKER_MODES, MARKER_MODE_ORDER, DEFAULT_MARKER_MODE, resolveMarkerMode,
  decorateClusterProps, ensureGroupIcons, groupBadgeArtwork,
} from './geoMapStyle.js';
import './FmrMap.css';
import './Fmr.css';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};
const LINES_ID = 'geo-records-lines';
const POINTS_ID = 'geo-records-points';
const LINE_LAYER = 'geo-records-line';
const HALO_LAYER = 'geo-records-halo';
const POINT_LAYER = 'geo-records-point';
const POINT_ISSUE_LAYER = 'geo-records-point-issue';
const POINT_ICON_LAYER = 'geo-records-point-icon';
const CLUSTER_LAYER = 'geo-records-cluster';
const CLUSTER_ISSUE_LAYER = 'geo-records-cluster-issue';
const CLUSTER_COUNT_LAYER = 'geo-records-cluster-count';
// q and basemap stay single-valued; every facet key holds an array of
// selected values (empty = all). URL state joins them with '|'.
const FILTER_DEFAULTS = {q: '', basemap: 'light', markers: DEFAULT_MARKER_MODE,
  ...Object.fromEntries(MULTI_FILTER_KEYS.map(key => [key, []]))};

function readState(params = new URLSearchParams()) {
  const filters = {...FILTER_DEFAULTS, ...Object.fromEntries(MULTI_FILTER_KEYS.map(key => [key, []]))};
  filters.q = params.get('q') || '';
  filters.basemap = params.get('basemap') || 'light';
  // Tolerates a stale or hand-edited link rather than throwing on an unknown mode.
  filters.markers = resolveMarkerMode(params.get('markers'));
  for (const key of MULTI_FILTER_KEYS) filters[key] = parseMulti(params.get(key));
  return filters;
}
function patchParams(params, patch) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (MULTI_FILTER_KEYS.includes(key)) {
      const serialized = serializeMulti(value);
      if (serialized) next.set(key, serialized);
      else next.delete(key);
    } else if (value == null || value === '' || value === FILTER_DEFAULTS[key]) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}
function navigate(patch) {
  const current = readRoute();
  window.location.hash = routeHref('map', Object.fromEntries(patchParams(current.params, patch)), 'geo');
}
function setFilter(key, value) {navigate({[key]: value});}
function toggleFilterValue(key, value, active) {
  const next = active.includes(value) ? active.filter(v => v !== value) : [...active, value];
  setFilter(key, next);
}
function clearFilters() {window.location.hash = routeHref('map', {}, 'geo');}

/** True for individual points left over after clustering (not cluster bubbles). */
const LEAF_FILTER = ['!', ['has', 'cluster']];
/** True for cluster bubbles only. */
const CLUSTER_FILTER = ['has', 'cluster'];
/** Clusters containing at least one review-issue coordinate. */
const CLUSTER_ISSUE_FILTER = ['>', ['get', 'issues'], 0];
const CLUSTER_CLEAN_FILTER = ['!', CLUSTER_ISSUE_FILTER];
/** Review-issue points, split out so the ring width can be its own ramp. */
const ISSUE_FILTER = ['>', ['get', 'hasIssue'], 0];
const CLEAN_FILTER = ['!', ISSUE_FILTER];
/** Every layer that represents a single selectable record. */
const PICK_LAYERS = [LINE_LAYER, POINT_LAYER, POINT_ISSUE_LAYER, POINT_ICON_LAYER];

function syncLayers(instance, overlay, mode) {
  if (!instance?.getStyle()) return;
  // Normalized here rather than via a default parameter: callers pass a ref
  // value that is briefly null on the first style event, and a null mode must
  // fall back to the default view instead of throwing on property access.
  const view = mode || MARKER_MODES[DEFAULT_MARKER_MODE];
  const ensureSource = (id, data, options = {}) => {
    // Cluster options are fixed at source creation, so they cannot change later;
    // only `data` is refreshed. That is fine because the accumulators are
    // presentation constants, not filter state.
    if (!instance.getSource(id)) instance.addSource(id, {type: 'geojson', data, generateId: false, ...options});
    else instance.getSource(id).setData(data);
  };
  ensureSource(LINES_ID, overlay.lines);
  // Points carry the numeric group index and issue flag the cluster
  // accumulators reduce over, so homogeneity is known per bubble.
  ensureSource(POINTS_ID, decorateClusterProps(overlay.points), CLUSTER_SOURCE_OPTIONS);
  ensureGroupIcons(instance);

  if (!instance.getLayer(HALO_LAYER)) {
    instance.addLayer({id: HALO_LAYER, type: 'line', source: LINES_ID,
      paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 4, 12, 8], 'line-opacity': 0.65},
      layout: {'line-cap': 'round', 'line-join': 'round'}});
  }
  if (!instance.getLayer(LINE_LAYER)) {
    instance.addLayer({id: LINE_LAYER, type: 'line', source: LINES_ID,
      paint: {'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2.6, 12, 5], 'line-opacity': 0.9},
      layout: {'line-cap': 'round', 'line-join': 'round'}});
  }

  // Cluster bubbles: fill encodes grouping homogeneity, radius encodes member
  // count, and a red ring flags clusters containing reviewed-issue coordinates.
  // Split into clean/issue layers for the same reason as the points below: a
  // `case` wrapping a zoom `interpolate` is rejected by MapLibre ("zoom
  // expression may only be used as input to a top-level step or interpolate"),
  // and that rejection aborts the whole style, leaving a blank canvas.
  const clusterPaint = (strokeColor, strokeWidth) => ({
    'circle-color': CLUSTER_FILL,
    'circle-radius': CLUSTER_BUBBLE_RADIUS,
    'circle-stroke-color': strokeColor,
    'circle-stroke-width': strokeWidth,
    'circle-opacity': 0.92,
  });
  if (!instance.getLayer(CLUSTER_LAYER)) {
    instance.addLayer({id: CLUSTER_LAYER, type: 'circle', source: POINTS_ID,
      filter: ['all', CLUSTER_FILTER, CLUSTER_CLEAN_FILTER],
      paint: clusterPaint('#ffffff', ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 2.4])});
  }
  if (!instance.getLayer(CLUSTER_ISSUE_LAYER)) {
    instance.addLayer({id: CLUSTER_ISSUE_LAYER, type: 'circle', source: POINTS_ID,
      filter: ['all', CLUSTER_FILTER, CLUSTER_ISSUE_FILTER],
      // A thicker ring so "this cluster needs review" survives at national zoom
      // where the bubble is small.
      paint: clusterPaint(ISSUE_RING_COLOR, ['interpolate', ['linear'], ['zoom'], 4, 2.8, 8, 3.6])});
  }
  if (!instance.getLayer(CLUSTER_COUNT_LAYER)) {
    instance.addLayer({id: CLUSTER_COUNT_LAYER, type: 'symbol', source: POINTS_ID, filter: CLUSTER_FILTER,
      layout: {'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12,
        // Font stack matching the CARTO styles' own convention; both the light
        // and dark basemaps resolve these from the same glyphs template.
        'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
        'text-allow-overlap': true, 'text-ignore-placement': true},
      paint: {'text-color': '#ffffff'}});
  }

  // Individual points. In `clusters` mode these are revealed as clusters
  // dissolve; in `badges`/`dots` mode they are the whole story at every zoom.
  // The badge sprite carries both channels at once — its fill is the grouping
  // colour and its white glyph is the grouping silhouette, with a red ring for
  // review issues. A small circle backs it as a pick target and covers isolated
  // singletons at national zoom, where a full badge would be visually heavy.
  //
  // Clean and review-issue points are separate layers rather than one layer with
  // a `case` around two `interpolate`s: MapLibre permits only one zoom-driven
  // interpolate per expression, and the nested form aborts the entire style
  // (blank canvas), not just that property.
  //
  // Opacity and size come from the active marker mode, and a mode that hides an
  // element sets it to opacity 0 rather than removing the layer — removal would
  // also drop the click handlers registered against PICK_LAYERS.
  const circleOpacity = view.circleOpacity == null ? 0 : view.circleOpacity;
  const leafPaint = (strokeColor, strokeWidth) => ({
    'circle-color': ['get', 'color'],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.6, 8, 4.2, 12, 5],
    'circle-stroke-color': strokeColor,
    'circle-stroke-width': strokeWidth,
    'circle-opacity': circleOpacity,
  });
  if (!instance.getLayer(POINT_LAYER)) {
    instance.addLayer({id: POINT_LAYER, type: 'circle', source: POINTS_ID,
      filter: ['all', LEAF_FILTER, CLEAN_FILTER],
      paint: leafPaint('#ffffff', ['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, 1.6])});
  }
  if (!instance.getLayer(POINT_ISSUE_LAYER)) {
    instance.addLayer({id: POINT_ISSUE_LAYER, type: 'circle', source: POINTS_ID,
      filter: ['all', LEAF_FILTER, ISSUE_FILTER],
      // A wider ring is what makes a review issue visible at a glance; the hue
      // alone is not enough for colour-vision deficiency.
      paint: leafPaint(ISSUE_RING_COLOR, ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 2.8])});
  }
  if (!instance.getLayer(POINT_ICON_LAYER)) {
    instance.addLayer({id: POINT_ICON_LAYER, type: 'symbol', source: POINTS_ID, filter: LEAF_FILTER,
      layout: {
        // Resolved per feature by decorateClusterProps so an unexpected grouping
        // falls back to a registered image instead of erroring the style.
        'icon-image': ['get', 'icon'],
        // Overlap is allowed deliberately: hiding colliding badges would
        // silently drop records from view, and the dense fields are already
        // absorbed by clusters at these zooms.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {'icon-opacity': 0.97}});
  }
  // Layers are created once but the marker mode changes at runtime, so the
  // mode-driven properties must be re-applied on every sync — including right
  // after creation, which is why this runs unconditionally below the guards.
  // Cluster layers stay in the style in every mode: with clustering off the
  // source simply yields no cluster features, so they render nothing.
  const iconOpacity = view.iconOpacity == null ? 0 : view.iconOpacity;
  instance.setPaintProperty(POINT_LAYER, 'circle-opacity', circleOpacity);
  instance.setPaintProperty(POINT_ISSUE_LAYER, 'circle-opacity', circleOpacity);
  instance.setPaintProperty(POINT_ICON_LAYER, 'icon-opacity', iconOpacity);
  instance.setLayoutProperty(POINT_ICON_LAYER, 'icon-size', view.iconSize);

  // Clustering on/off. setClusterOptions only rewrites `cluster`,
  // `clusterRadius` and `clusterMaxZoom`, so the `clusterProperties`
  // accumulators set at source creation survive toggling — gMin/gMax/issues
  // keep driving bubble homogeneity after a round trip through "off".
  const source = instance.getSource(POINTS_ID);
  if (typeof source?.setClusterOptions === 'function') {
    const current = source.getClusterOptions?.();
    if (!current || current.cluster !== view.cluster) {
      source.setClusterOptions({cluster: view.cluster});
    }
  }
}

/**
 * Legend glyph drawn from the same artwork the map sprite uses, so the legend
 * cannot drift from what is on the canvas. geoMapStyle.js stays JSX-free; this
 * is the only React binding to it.
 *
 * The glyph shapes sit in the 64×64 design space and are scaled into the badge
 * disc by GLYPH_TRANSFORM — the same affine transform the canvas renderer
 * applies, which is what keeps the two pixel-identical.
 */
function GroupLegendIcon({group}) {
  const art = groupBadgeArtwork(group);
  // Artwork now hands back concrete colours (or null). Mapping null to SVG
  // 'none' is the only translation needed here: this component used to
  // re-resolve tokens and defaulted anything it did not recognise — including
  // the badge's own hex — to white, which made every legend swatch a blank
  // white disc that no longer matched the map sprite.
  const paint = color => (color == null ? 'none' : color);
  return <svg className="fmr-map-legend-icon geo-legend-icon" viewBox="0 0 64 64" aria-hidden="true">
    {art.shapes.map(({d, fill, stroke, width, glyph}, i) => glyph
      ? <g key={i} transform={GLYPH_TRANSFORM}>
          <path d={d} fill={paint(fill)} stroke={paint(stroke)} strokeWidth={width || 0}
            strokeLinejoin="round" strokeLinecap="round"/>
        </g>
      : <path key={i} d={d} fill={paint(fill)} stroke={paint(stroke)} strokeWidth={width || 0}
          strokeLinejoin="round" strokeLinecap="round"/>)}
  </svg>;
}

function Dialog({label, onClose, children, className = ''}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{label}</h2><button onClick={onClose}>Close</button></div>{children}</dialog>;
}

function RuleChips({codes, labels, kind}) {
  if (!codes?.length) return null;
  return <div className="fmr-map-flags">{codes.map(code => <span key={code} className={`fmr-map-flag ${kind}`}
    title={labels[code] || code}>{labels[code] || code}</span>)}</div>;
}

/**
 * Multi-select facet as a floating checkbox popover (same interaction model as
 * the FMR map's Objects filter). Empty selection means "all values pass";
 * ticking boxes restricts the map to those values. Selection lives in the URL
 * (values joined with '|') so it survives reload and sharing.
 *
 * The menu is absolutely positioned so opening it never reflows the page, and
 * it stays open across ticks so several values can be chosen in one pass.
 */
function FilterGroup({filterKey, label, options, selected, onToggle, onBulk}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {if (root.current && !root.current.contains(e.target)) setOpen(false);};
    const onKey = e => {if (e.key === 'Escape') setOpen(false);};
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey);};
  }, [open]);
  if (!options?.length) return null;
  const allValues = options.map(o => o.value);
  const active = (selected || []).filter(v => allValues.includes(v));
  const allOn = active.length === allValues.length;
  const state = active.length === 0 || allOn ? `All · ${allValues.length}`
    : active.length === 1 ? (options.find(o => o.value === active[0])?.label || '1 selected')
    : `${active.length} selected`;
  return <div className="geo-filter-group" ref={root}>
    <button type="button" className="geo-filter-trigger" aria-haspopup="listbox"
      aria-expanded={open} aria-label={`${label}: ${state}`}
      data-active={active.length > 0 && !allOn} onClick={() => setOpen(v => !v)}>
      <span className="geo-filter-label">{label}</span>
      <span className="geo-filter-count">{state}</span>
      <span className="geo-filter-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div className="geo-filter-menu">
      <div className="geo-filter-bulk">
        <button type="button" disabled={allOn} onClick={() => onBulk(filterKey, allValues)}>Select all</button>
        <button type="button" disabled={!active.length} onClick={() => onBulk(filterKey, [])}>Select none</button>
      </div>
      {/* The listbox owns the options directly; li wrappers are presentational. */}
      <ul role="listbox" aria-label={label} aria-multiselectable="true">
        {options.map(o => <li key={o.value} role="presentation">
          <label role="option" aria-selected={active.includes(o.value)}>
            <input type="checkbox" checked={active.includes(o.value)}
              onChange={() => onToggle(filterKey, o.value, active)}/>
            <span>{o.label}</span>
            <small>{o.count.toLocaleString()}</small>
          </label>
        </li>)}
      </ul>
    </div>}
  </div>;
}

function SelectionCard({data, record, dataset, onClose, onZoom, onPdf}) {
  const points = parsedPoints(record);
  const meta = data.datasets.find(d => d.id === record.dataset);
  const link = record.link;
  const pdfRefs = recordPdfSources(record, data.documents);
  const kinds = recordCodes(record, 'kinds'), rules = recordCodes(record, 'rules'), issues = recordCodes(record, 'issues');
  const amount = formatAmountPhp(record.amount);
  const delta = Number.isFinite(record.amount_delta) && record.amount_delta !== 0 ? record.amount_delta : null;
  const changeLabel = record.change_type ? (CHANGE_TYPE_LABELS[record.change_type] || record.change_type) : null;
  return <aside className="fmr-map-info" role="region" aria-label="Selected GPS record">
    <div className="fmr-map-info-head">
      <span className="fmr-eyebrow">{meta?.label || record.dataset}</span>
      <button className="fmr-map-close" type="button" onClick={onClose} aria-label="Close record selection">×</button>
    </div>
    <h2 className="fmr-map-project-title">{record.title || record.record_id}</h2>
    <div className="fmr-map-project-meta">
      <span className="fmr-badge">{STATUS_LABELS[record.status] || record.status}</span>
      {changeLabel && <span className={`fmr-badge change-${record.change_type}`}>{changeLabel}</span>}
      <span><code>{record.record_id}</code></span>
    </div>
    {amount && <p className="fmr-map-amount"><strong>{amount}</strong>
      {delta != null && <span className={`fmr-map-amount-delta ${delta > 0 ? 'up' : 'down'}`}>
        {delta > 0 ? '▲' : '▼'} {formatAmountPhp(Math.abs(delta))} House vs NEP</span>}
      {!delta && record.change_type === 'insertion' && <span className="fmr-map-amount-delta up">House-only row — no NEP baseline</span>}
      {!delta && record.change_type === 'deletion' && <span className="fmr-map-amount-delta down">NEP-only row — no House amount</span>}
    </p>}
    {!amount && <p className="fmr-map-small-note">No printed amount on this record.</p>}
    {record.pap && <p className="fmr-map-small-note"><strong>PAP:</strong> {record.pap}</p>}
    <p className="fmr-map-small-note">{meta?.description}</p>
    <RuleChips codes={kinds} labels={FRAGMENT_KIND_LABELS}/>
    {points.length > 0 ? <dl className="fmr-map-budget">
      <dt>Parsed points</dt><dd>{points.length}</dd>
      {points[0] && <><dt>First printed pair</dt><dd><code>{points[0].source_fragment || '—'}</code></dd></>}
    </dl> : <p className="fmr-map-small-note">No numeric pair parsed for this record under the FMR grammar.</p>}
    {rules.length > 0 && <section aria-label="Interpretation rules applied"><h3>Interpretation rules</h3>
      <ul className="fmr-map-findings">{rules.map(code => <li key={code}><strong>{RULE_LABELS[code] || code}</strong></li>)}</ul></section>}
    {issues.length > 0 && <section className="fmr-map-coordinate-summary" aria-label="Review issues"><h3>Review issues</h3>
      <ul className="fmr-map-findings">{issues.map(code => <li key={code}><strong>{ISSUE_LABELS[code] || code}</strong></li>)}</ul>
      <p className="fmr-map-small-note">Issues mark text that needed interpretation or failed a check — same grammar as the FMR coordinate review.</p></section>}
    {(record.fields || []).map(field => <details key={field.field} className="fmr-method"><summary>Field “{field.field}”</summary>
      <p className="fmr-map-small-note">{field.snippet}</p></details>)}
    <div className="fmr-map-quick-sources">
      {pdfRefs.map((ref, i) => <button key={`${ref.document}-${i}`} className={i === 0 ? 'primary' : ''}
        onClick={() => onPdf(ref)}>{ref.label} · p. {ref.page}</button>)}
      {!pdfRefs.length && <span className="fmr-map-small-note">No joinable PDF page for this record.</span>}
      {link && recordHref(record) && <a className="primary" href={recordHref(record)}>Open project record →</a>}
    </div>
    <div className="fmr-map-info-actions">
      <button onClick={onZoom} disabled={points.length < 2}>Zoom to record</button>
      <button onClick={onClose}>Close</button>
    </div>
  </aside>;
}

export default function GeoMap({data, route}) {
  const routeKey = route?.params.toString() || '';
  const filters = useMemo(() => readState(route?.params), [routeKey]);
  const container = useRef(null);
  const map = useRef(null);
  const overlayRef = useRef(null);
  const markerModeRef = useRef(null);
  const appliedStyle = useRef('light');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [selected, setSelected] = useState(null);
  const [pdfSource, setPdfSource] = useState(null);

  useEffect(() => {setSelected(null);}, [routeKey]);

  const records = useMemo(() => filterRecords(data.records, filters), [data, filters]);
  const overlay = useMemo(() => buildOverlay(records, data), [records, data]);
  overlayRef.current = overlay;
  // The marker view is URL state, so it survives reload and is shareable — a
  // reviewer can send a link that opens in exactly the reading they mean.
  const markerMode = MARKER_MODES[filters.markers] || MARKER_MODES[DEFAULT_MARKER_MODE];
  markerModeRef.current = markerMode;

  // Facet options are counted over the full record set, not the filtered
  // subset, so ticking one box never hides its siblings — otherwise selecting a
  // single rule would remove every other rule checkbox from its own list.
  const facets = useMemo(() => optionLists(data.records, data), [data]);

  const onToggle = (key, value, active) => toggleFilterValue(key, value, active);
  const onBulk = (key, values) => setFilter(key, values);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new MapLibreMap({container: container.current, style: STYLES.light,
      center: [122.5, 12.5], zoom: 5.2, attributionControl: {compact: true}});
    instance.addControl(new NavigationControl({showCompass: false}), 'top-right');
    instance.addControl(new ScaleControl({unit: 'metric'}), 'bottom-left');
    // Reads the mode from a ref, not from the closure: this handler is
    // registered once on mount, so closing over the first render's mode would
    // re-sync with a stale view after a basemap switch reloaded the style.
    const onStyle = () => {syncLayers(instance, overlayRef.current, markerModeRef.current); setReady(true);};
    instance.on('load', onStyle);
    instance.on('style.load', onStyle);
    instance.on('error', e => setFailed(String(e?.error?.message ?? e)));
    const pick = e => {
      const hits = instance.queryRenderedFeatures(e.point, {layers: PICK_LAYERS});
      if (!hits.length) return;
      const properties = hits[0].properties;
      const record = data.records.find(r => r.record_id === properties.recordId && r.dataset === properties.dataset);
      setSelected(record ? {record} : null);
    };
    // A cluster bubble is not a record, so it expands instead of opening a card:
    // clicking zooms just far enough for that bubble to break apart.
    const expandCluster = e => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = instance.getSource(POINTS_ID);
      if (clusterId == null || !source?.getClusterExpansionZoom) return;
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        instance.easeTo({center: feature.geometry.coordinates, zoom, duration: 400});
      });
    };
    for (const id of PICK_LAYERS) {
      instance.on('click', id, pick);
      instance.on('mouseenter', id, () => {instance.getCanvas().style.cursor = 'pointer';});
      instance.on('mouseleave', id, () => {instance.getCanvas().style.cursor = '';});
    }
    // Both cluster layers are bubbles, so both expand on click — the issue
    // variant is a separate layer only to give its ring its own width ramp.
    for (const id of [CLUSTER_LAYER, CLUSTER_ISSUE_LAYER]) {
      instance.on('click', id, expandCluster);
      instance.on('mouseenter', id, () => {instance.getCanvas().style.cursor = 'zoom-in';});
      instance.on('mouseleave', id, () => {instance.getCanvas().style.cursor = '';});
    }
    map.current = instance;
    return () => {instance.remove(); map.current = null; setReady(false);};
  }, []);

  // markerMode is in the dependency list so choosing a view re-applies the
  // mode-driven paint/layout and toggles clustering. Passing the object (not
  // filters.markers) keeps the identity stable across renders that do not
  // change the view, because MARKER_MODES entries are module constants.
  useEffect(() => {syncLayers(map.current, overlay, markerMode);}, [ready, overlay, markerMode]);

  useEffect(() => {
    if (!ready || !map.current || appliedStyle.current === filters.basemap) return;
    appliedStyle.current = filters.basemap;
    map.current.setStyle(STYLES[filters.basemap], {diff: false});
  }, [filters.basemap, ready]);

  const fitSignature = `${overlay.summary.drawnLines}:${overlay.summary.drawnPoints}`;
  const lastFit = useRef('');
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    const all = [];
    for (const feature of overlay.lines.features) {
      for (const c of feature.geometry.coordinates) all.push(c);
    }
    for (const feature of overlay.points.features) {
      all.push(feature.geometry.coordinates);
    }
    if (!all.length) return;
    // Fit to the Philippine envelope only. A handful of out-of-bounds
    // coordinates — a transposed `24.8131`/`124.8131`, a chainage misparse where
    // lon == lat, two FMR axis swaps — stretched the span to lon [8.8, 129.8]
    // and centred the camera at 69°E, compressing the whole archipelago into a
    // smudge. Those points still plot (and carry their review issue); they just
    // do not decide where the national view looks. Falling back to every
    // coordinate keeps a filtered set that is *entirely* out of bounds visible
    // rather than framing an empty ocean.
    const framed = all.filter(([lon, lat]) => inPhilippineBounds(lon, lat));
    const coords = framed.length ? framed : all;
    const bounds = new LngLatBounds();
    for (const c of coords) bounds.extend(c);
    // Zoom cap must reach badge level for small result sets. A fixed cap of 9
    // left single-record filters (and any tight selection) rendering as a bare
    // dot, because badges only fade in at CLUSTER_MAX_ZOOM — the user filtered to
    // one project and could not see its grouping icon. Fewer points means the
    // bounds are small, so it is safe to zoom further without losing context.
    const maxZoom = coords.length <= 20 ? 14 : coords.length <= 500 ? 12 : 9;
    instance.fitBounds(bounds, {padding: 60, maxZoom, duration: 600});
  }, [ready, fitSignature, overlay]);

  const zoomToRecord = record => {
    const points = parsedPoints(record);
    // A single-point record still has a location worth centring on; requiring
    // two points made the Zoom button a no-op for most DPWH building records.
    if (!points.length || !map.current) return;
    const bounds = new LngLatBounds();
    for (const p of points) bounds.extend([p.longitude, p.latitude]);
    map.current.fitBounds(bounds, {padding: 80, maxZoom: 15, duration: 600});
  };

  return <section className="fmr-map" aria-label="Cross-dataset GPS map">
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Geolocation</p><h1>GPS-bearing budget records</h1>
      <p>Every scanned FY2027 dataset record with GPS text: dedicated FMR coordinate cells, coordinate-bearing DPWH titles, and the rare NIA printed pair. Lines join a record’s parsed points in source order; dots are individual coordinates. Interpretation rules and review issues follow the FMR coordinate grammar.</p></div></div>
    <ShareLink/>
    <div className="fmr-filters geo-filter-search">
      <label>Search<input type="search" placeholder="Title, record ID, amount or rule" value={filters.q || ''} onChange={e => setFilter('q', e.target.value)}/></label>
      <button type="button" onClick={clearFilters}>Clear filters</button>
    </div>
    <div className="geo-filter-bar" role="group" aria-label="Record filters">
      <FilterGroup filterKey="group" label="Group" options={facets.groups} selected={filters.group} onToggle={onToggle} onBulk={onBulk}/>
      <FilterGroup filterKey="change" label="Budget change" options={facets.changes} selected={filters.change} onToggle={onToggle} onBulk={onBulk}/>
      <FilterGroup filterKey="dataset" label="Dataset" options={facets.datasets} selected={filters.dataset} onToggle={onToggle} onBulk={onBulk}/>
      <FilterGroup filterKey="pap" label="DPWH PAP" options={facets.paps} selected={filters.pap} onToggle={onToggle} onBulk={onBulk}/>
      <FilterGroup filterKey="status" label="Parse status" options={facets.statuses} selected={filters.status} onToggle={onToggle} onBulk={onBulk}/>
    </div>
    <details className="fmr-method">
      <summary>Interpretation variation filters</summary>
      <div className="geo-filter-bar">
        <FilterGroup filterKey="kind" label="Fragment kind" options={facets.kinds} selected={filters.kind} onToggle={onToggle} onBulk={onBulk}/>
        <FilterGroup filterKey="rule" label="Interpretation rule" options={facets.rules} selected={filters.rule} onToggle={onToggle} onBulk={onBulk}/>
        <FilterGroup filterKey="issue" label="Review issue" options={facets.issues} selected={filters.issue} onToggle={onToggle} onBulk={onBulk}/>
      </div>
      <p className="fmr-muted">Rules record how printed text became coordinates (reordering, DMS conversion, hemisphere reading). Issues mark repair candidates and bound checks. Budget change comes from the unified DPWH comparison: unsupported insertion = House-only row, deletion = NEP-only row, adjustments = matched pairs whose amount moved. Other datasets have no comparison signal and appear under “No comparison data”. These are interpretation variations, not certified locations.</p>
    </details>
    <div className="fmr-result-bar">
      {/* The note is nested inside the counts span: `.fmr-result-bar>span`
          carries `margin-right:auto`, so a sibling span would be pushed away
          from the counts it qualifies. */}
      <span>{overlay.summary.records.toLocaleString()} records · {overlay.summary.drawnLines.toLocaleString()} lines · {overlay.summary.drawnPoints.toLocaleString()} points · {overlay.summary.withIssues.toLocaleString()} with issues
        {/* Out-of-envelope coordinates still plot and still carry their review
            issue; disclosing the count keeps the national framing honest about
            what the camera chose to exclude. */}
        {overlay.summary.outOfBounds > 0 && <span className="geo-bounds-note"
          title={`Outside Philippine orientation bounds (lat ${PHILIPPINE_BOUNDS.lat[0]}–${PHILIPPINE_BOUNDS.lat[1]}, lon ${PHILIPPINE_BOUNDS.lon[0]}–${PHILIPPINE_BOUNDS.lon[1]}). Still drawn, with a review-issue ring; excluded from the automatic camera fit.`}>
          · {overlay.summary.outOfBounds.toLocaleString()} outside PH bounds (plotted, not framed)</span>}
      </span>
      <span className="fmr-map-controls">
        {/* Segmented control rather than a dropdown: three mutually exclusive
            readings of the same points, and seeing all three at once is what
            makes the trade-off legible. aria-checked radiogroup semantics keep
            it usable without a mouse. */}
        <span className="geo-marker-modes" role="radiogroup" aria-label="Marker view">
          {MARKER_MODE_ORDER.map(key => {
            const spec = MARKER_MODES[key];
            const active = key === (filters.markers || DEFAULT_MARKER_MODE);
            return <button key={key} type="button" role="radio" aria-checked={active}
              className={active ? 'on' : ''} title={spec.hint}
              onClick={() => setFilter('markers', key)}>{spec.label}</button>;
          })}
        </span>
        <label>Basemap<select aria-label="Basemap style" value={filters.basemap || 'light'} onChange={e => setFilter('basemap', e.target.value)}>
        <option value="light">Light</option><option value="dark">Dark</option></select></label>
        {Object.entries(data.groups).map(([group, label]) => <span key={group} className="fmr-map-legend">
          <GroupLegendIcon group={group}/>
          <svg className="fmr-map-legend-icon geo-legend-line" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 32H56" stroke={GROUP_COLORS[group]} strokeWidth="10" strokeLinecap="round"/></svg>
          {label.split(' (')[0]}</span>)}
      </span></div>
    {/* Explains the encoding the group legend cannot. Which channels are
        actually on the map depends on the marker view, so the key follows the
        mode — describing cluster bubbles while clustering is off would be
        misleading, and vice versa. */}
    <div className="geo-cluster-key" role="note">
      <b>{markerMode.label}</b>
      {markerMode.cluster ? <>
        {/* A homogeneous bubble takes that grouping's colour, not a fixed hue —
            a single blue dot wrongly implied every one-grouping cluster is blue.
            Showing all four ties the bubble back to the group legend above it. */}
        <span className="geo-key-swatch">
          <span className="geo-key-dot-row">
            {GROUP_ORDER.map(group => <span key={group} className="geo-key-dot sm"
              style={{background: GROUP_COLORS[group]}}/>)}
          </span>
          One grouping (its colour)</span>
        <span className="geo-key-swatch"><span className="geo-key-dot"/>Mixed groupings</span>
        <span className="geo-key-swatch"><span className="geo-key-dot lg"/>Bubble size = member count</span>
        <span className="geo-key-swatch"><span className="geo-key-dot issue"/>Contains review issues</span>
        <span>Zoom in past level {CLUSTER_MAX_ZOOM} for individual markers · click a bubble to expand it</span>
      </> : <>
        <span className="geo-key-swatch">
          {markerMode.iconOpacity == null
            // Dots mode paints no sprite, so the key shows plain colour chips
            // rather than badge icons that are not actually on the map.
            ? <span className="geo-key-dot-row">
                {GROUP_ORDER.map(group => <span key={group} className="geo-key-dot sm"
                  style={{background: GROUP_COLORS[group]}}/>)}</span>
            : <span className="geo-key-icon-row">
                {GROUP_ORDER.map(group => <GroupLegendIcon key={group} group={group}/>)}
              </span>}
          {markerMode.iconOpacity == null ? 'Colour only — no icons in this view' : 'Icon shape + colour = grouping'}</span>
        <span className="geo-key-swatch"><span className="geo-key-dot issue"/>Contains review issues</span>
        <span>Every project drawn individually at all zoom levels</span>
      </>}
      <span className="geo-mode-hint">{markerMode.hint}</span>
    </div>
    <div className="fmr-map-shell">
      <div ref={container} className="fmr-map-canvas" role="application" aria-label="Interactive GPS record map"/>
      {failed && <p className="fmr-map-warning" role="alert">Basemap tiles failed to load: {failed}. Record overlays come from this site’s data and stay available once the style loads.</p>}
      {!ready && !failed && <p className="fmr-map-warning" role="status">Loading basemap…</p>}
      {selected?.record && <SelectionCard data={data} record={selected.record}
        onClose={() => setSelected(null)} onZoom={() => zoomToRecord(selected.record)}
        onPdf={ref => setPdfSource(ref)}/>}
    </div>
    {pdfSource && <Dialog label="GPS record PDF source" className="fmr-pdf-dialog" onClose={() => setPdfSource(null)}>
      <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={{url: siteUrl(pdfSource.pdf), document: pdfSource.label, title: pdfSource.note,
          page: pdfSource.page}} onClose={() => setPdfSource(null)}
          closeLabel="Close PDF" downloadOriginal/></Suspense></Dialog>}
    <p className="fmr-muted">Inventory, not geocode. Points are parsed from printed budget text with the FMR coordinate grammar; records outside Philippine orientation bounds keep their coordinates and carry a review issue. Lines connect a record’s points in source order — they are not surveyed alignments. DPWH corpora overlap by construction (leaves ⊂ comparison); counts are per source artifact.</p>
  </section>;
}
