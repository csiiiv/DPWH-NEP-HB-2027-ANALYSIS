import React, {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {loadData, siteUrl} from './data.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
import {money, moneyCompact, percent} from './congressModel.js';
import './CongressMap.css';

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};
const SOURCE_ID = 'congress-districts';
const FILL_LAYER = 'districts-fill';
const LINE_LAYER = 'districts-line';

/**
 * Choropleth metrics over the district polygons. `field` reads the map
 * artifact's per-feature properties; the ramps are runtime maplibre
 * expressions so switching metric never needs a data rebuild. Breaks are
 * quantile-ish hand values over the FY2027 distributions, kept far enough
 * apart to stay distinguishable at 0.78 fill opacity.
 */
const METRICS = [
  {key: 'located_house_php', label: 'District-assigned HGAB3 (layered lens)',
    field: 'located_house_php', colors: ['#c7e5c9', '#8fd09a', '#57b96f', '#2e9e52', '#187a3d']},
  {key: 'deo_house_php', label: 'DEO-attributed HGAB3 (DEO lens)',
    field: 'deo_house_php', colors: ['#cfe0f3', '#9cc2e8', '#6ba0d6', '#3d7cbf', '#1f5a9e']},
  {key: 'mismatch_rows', label: 'Office↔location mismatch rows (flagged)',
    field: 'mismatch_rows', colors: ['#fde8d2', '#fbd0a5', '#f7b06a', '#f08c3c', '#e06b12']},
];

// Even-step ramps keyed by the metric's own max, so the legend and the fill
// expression share one scale. Values are absolute ₱ thresholds per metric.
function breaksFor(metric, features) {
  const values = features.map(f => f.properties[metric.field]).filter(v => v > 0).sort((a, b) => a - b);
  if (!values.length) return [1, 1, 1, 1];
  const at = q => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

function colorExpression(metric, breaks) {
  const [f] = metric.field;
  return ['step', ['get', metric.field],
    '#eceff3', ...metric.colors.flatMap((color, i) =>
      i < breaks.length ? [breaks[i], color] : []).slice(0, 8), metric.colors[metric.colors.length - 1]];
}

function metricValue(metric, feature) {
  return feature.properties[metric.field] ?? 0;
}

function Dialog({label, onClose, children, className = ''}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label}
    onCancel={e => {e.preventDefault(); onClose();}}>{children}</dialog>;
}

/** Side panel for one clicked district: both lenses' figures and card links. */
function DistrictPanel({feature, lens, onClose}) {
  const p = feature.properties;
  const located = p.located_house_php > 0;
  const deo = p.deo_house_php > 0;
  return <aside className="congress-map-info" role="region" aria-label="Selected district">
    <div className="congress-map-info-head">
      <span className="fmr-eyebrow">{p.region}</span>
      <button className="fmr-map-close" type="button" onClick={onClose} aria-label="Close district panel">×</button>
    </div>
    <h2>{p.jurisdiction} · {p.district_label}</h2>
    {p.representative && <p className="congress-map-rep">Rep. {p.representative}</p>}
    <dl className="congress-map-figures">
      <dt>District-assigned HGAB3</dt>
      <dd>{located ? moneyCompact(p.located_house_php) : '—'}
        <small>{p.located_rows.toLocaleString('en-PH')} rows via title PSGC or DEO → LEG</small></dd>
      <dt>DEO-attributed HGAB3</dt>
      <dd>{deo ? moneyCompact(p.deo_house_php) : '—'}
        <small>{p.deo_rows.toLocaleString('en-PH')} rows on {p.deo_card_ids.length} office card{p.deo_card_ids.length > 1 ? 's' : ''}</small></dd>
      {p.mismatch_rows > 0 && <>
        <dt className="congress-map-flagged">Office↔location mismatch</dt>
        <dd className="congress-map-flagged">{p.mismatch_rows.toLocaleString('en-PH')} rows
          <small>DEO and geometry disagree; both readings kept, never overridden</small></dd>
      </>}
    </dl>
    <p className="fmr-muted congress-map-note">
      {located
        ? 'District-assigned rows use clean funded-section title locations supported by a usable DEO, coordinate, direct title hierarchy, or reviewed named site, or a one-to-one DEO fallback.'
        : 'No row resolved to this district; its money, if any, remains on a DEO, region or unassigned card.'}
    </p>
    <div className="congress-map-actions">
      {(p.location_card_ids ?? (p.location_card_id ? [p.location_card_id] : [])).map((id, i) =>
        <a key={id} className={i === 0 ? 'primary' : ''}
          href={routeHref('district', {district: id, lens: 'location'}, 'congress')}>
          Resolution card {i + 1} →</a>)}
      {p.deo_card_ids.length === 1 && <a
        href={routeHref('district', {district: p.deo_card_ids[0]}, 'congress')}>
        DEO-lens card →</a>}
      {p.deo_card_ids.length > 1 && p.deo_card_ids.map(id => <a key={id}
        href={routeHref('district', {district: id}, 'congress')}>
        DEO card {id.split(':').pop()} →</a>)}
    </div>
  </aside>;
}

/** Legend entry swatches mirror the metric's ramp breaks. */
function Legend({metric, breaks, features}) {
  const max = Math.max(...features.map(f => metricValue(metric, f)), 1);
  return <div className="congress-map-legend" aria-label={`${metric.label} legend`}>
    {[0, ...breaks].map((lo, i) => {
      const hi = i < breaks.length ? breaks[i] : max;
      return <span key={i} className="congress-map-swatch">
        <i style={{background: metric.colors[i]}}/>
        {i === 0 ? '₱0' : moneyCompact(lo)}–{moneyCompact(hi)}
      </span>;
    })}
  </div>;
}

export default function CongressMap({route}) {
  const params = route?.params ?? new URLSearchParams();
  const lens = params.get('lens') === 'location' ? 'location' : 'deo';
  const metricKey = params.get('metric') || 'located_house_php';
  const metric = METRICS.find(m => m.key === metricKey) ?? METRICS[0];
  const style = params.get('basemap') === 'dark' ? 'dark' : 'light';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [ready, setReady] = useState(false);
  const container = useRef(null);
  const map = useRef(null);
  const appliedStyle = useRef('light');
  const appliedMetric = useRef(metric.key);
  const dataRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    loadData('congress_district_map_2027.json', controller.signal)
      .then(setData)
      .catch(event => {if (event.name !== 'AbortError') setError(event.message);});
    return () => controller.abort();
  }, []);

  const features = useMemo(() => data?.features ?? [], [data]);
  const breaks = useMemo(() => breaksFor(metric, features), [metric, features]);

  const updateRoute = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key); else next.set(key, value);
    }
    window.location.hash = routeHref('map', Object.fromEntries(next), 'congress');
  };

  // Deep link: ?district=<lens id> selects and flies to the district.
  useEffect(() => {
    if (!ready || !data) return;
    const wanted = params.get('district');
    if (!wanted) {setSelected(null); return;}
    const feature = features.find(f =>
      f.properties.district_id === wanted ||
      f.properties.location_card_id === wanted ||
      f.properties.deo_card_ids.includes(wanted));
    if (feature) {
      setSelected(feature);
      const bounds = new LngLatBounds();
      const walk = c => Array.isArray(c[0])
        ? c.forEach(walk)
        : bounds.extend(c);
      walk(feature.geometry.coordinates);
      if (bounds.isEmpty()) return;
      map.current?.fitBounds(bounds, {padding: 60, maxZoom: 10, duration: 600});
    }
  }, [ready, data, params.get('district')]);

  useEffect(() => {
    if (!container.current || map.current || error) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: STYLES.light,
      center: [122.5, 12.5],
      zoom: 5.2,
      attributionControl: {compact: true},
    });
    instance.addControl(new NavigationControl({showCompass: false}), 'top-right');
    instance.addControl(new ScaleControl({unit: 'metric'}), 'bottom-left');
    instance.on('error', e => setError(String(e?.error?.message ?? e)));
    const onStyle = () => {
      if (!dataRef.current || !instance.getStyle()) return;
      syncLayers(instance, dataRef.current, metricRef.current, breaksRef.current);
      setReady(true);
    };
    instance.on('load', onStyle);
    instance.on('style.load', onStyle);
    const pick = e => {
      const hits = instance.queryRenderedFeatures(e.point, {layers: [FILL_LAYER]});
      if (!hits.length) {setSelected(null); return;}
      // queryRenderedFeatures returns a clone; find the full feature for the panel.
      const full = (dataRef.current?.features ?? [])
        .find(f => f.properties.district_id === hits[0].properties.district_id);
      if (full) setSelected(full);
    };
    instance.on('click', FILL_LAYER, pick);
    instance.on('mousemove', FILL_LAYER, () => {
      const canvas = instance.getCanvas?.();
      if (canvas?.style) canvas.style.cursor = 'pointer';
    });
    instance.on('mouseleave', FILL_LAYER, () => {
      const canvas = instance.getCanvas?.();
      if (canvas?.style) canvas.style.cursor = '';
    });
    map.current = instance;
    return () => {instance.remove(); map.current = null; setReady(false);};
  }, []);

  // Keep refs current for the style-reload callback without re-subscribing.
  const metricRef = useRef(metric);
  const breaksRef = useRef(breaks);
  metricRef.current = metric;
  breaksRef.current = breaks;
  dataRef.current = data;

  useEffect(() => {
    if (!ready || !map.current) return;
    syncLayers(map.current, data, metric, breaks);
  }, [ready, data, metric, breaks]);

  useEffect(() => {
    if (!ready || !map.current || appliedStyle.current === style) return;
    appliedStyle.current = style;
    map.current.setStyle(STYLES[style], {diff: false});
  }, [style, ready]);

  const locatedTotal = useMemo(() =>
    features.reduce((total, f) => total + (f.properties.located_house_php ?? 0), 0), [features]);
  const deoTotal = useMemo(() =>
    features.reduce((total, f) => total + (f.properties.deo_house_php ?? 0), 0), [features]);
  const mismatchTotal = useMemo(() =>
    features.reduce((total, f) => total + (f.properties.mismatch_rows ?? 0), 0), [features]);

  if (error && !data) {
    return <section className="fmr-section" role="alert">
      <h1>District map could not load</h1><p>{error}</p>
      <button type="button" onClick={() => window.location.reload()}>Reload</button></section>;
  }

  return <section className="congress-map" aria-label="Congress district map">
    <div className="fmr-page-title">
      <div>
        <p className="fmr-eyebrow">FY2027 · Congress · District map</p>
        <h1>Where the budget documents place the work</h1>
        <p>The 254 legislative district polygons from the PSGC2LEG build, choroplethed by either
          lens: located money (title GPS and PSGC points inside the polygon) or DEO-attributed
          money (office → district through the crosswalk). A third metric highlights the
          {' '}{mismatchTotal.toLocaleString('en-PH')} office↔location mismatch rows — districts where
          the two lenses disagree, flagged rather than reconciled.</p>
      </div>
      <ShareLink/>
    </div>
    <div className="congress-controls">
      <label>Metric
        <select value={metric.key} onChange={e => updateRoute({metric: e.target.value === 'located_house_php' ? null : e.target.value})}>
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select></label>
      <label>Basemap
        <select value={style} onChange={e => updateRoute({basemap: e.target.value === 'light' ? null : e.target.value})}>
          <option value="light">Light</option><option value="dark">Dark</option>
        </select></label>
      <span role="status" className="congress-count">
        Located {moneyCompact(locatedTotal)} · DEO {moneyCompact(deoTotal)} across 254 districts</span>
      <button type="button" onClick={() => {setSelected(null); map.current?.fitBounds(
        new LngLatBounds([117, 5], [127, 19]), {padding: 40, duration: 600});}}>
        Reset view</button>
    </div>
    <div className="congress-map-shell">
      <div ref={container} className="congress-map-canvas" role="application"
        aria-label="Interactive legislative district choropleth"/>
      {!data && <p className="fmr-map-warning" role="status">Loading district geometry…</p>}
      {data && ready && <Legend metric={metric} breaks={breaks} features={features}/>}
      {selected && <DistrictPanel feature={selected} lens={lens} onClose={() => setSelected(null)}/>}
    </div>
    <p className="fmr-muted congress-map-note">
      District boundaries: PSGC2LEG municipal dissolves (2025 district composition). Located figures
      come from the location lens — title GPS points and PSGC representative points inside the
      polygon; corridor projects anchor at their named endpoints, so endpoint districts can read
      high. DEO figures are the office-lens attribution and are not split across a shared range.
      Neither lens claims a representative requested or controlled any project.
    </p>
  </section>;
}

function syncLayers(instance, data, metric, breaks) {
  if (!instance?.getStyle() || !data) return;
  if (!instance.getSource(SOURCE_ID)) {
    instance.addSource(SOURCE_ID, {type: 'geojson', data, generateId: true});
  }
  if (!instance.getLayer(FILL_LAYER)) {
    instance.addLayer({
      id: FILL_LAYER, type: 'fill', source: SOURCE_ID,
      paint: {
        'fill-color': colorExpression(metric, breaks),
        'fill-opacity': ['case',
          ['boolean', ['feature-state', 'selected'], false], 0.95,
          ['boolean', ['feature-state', 'hover'], false], 0.9,
          0.78],
      },
    });
    instance.addLayer({
      id: LINE_LAYER, type: 'line', source: SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.4, 12, 2.4],
        'line-opacity': 0.9,
      },
    });
  } else {
    instance.setPaintProperty(FILL_LAYER, 'fill-color', colorExpression(metric, breaks));
    instance.getSource(SOURCE_ID)?.setData(data);
  }
}
