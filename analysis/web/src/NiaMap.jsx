import React, {useEffect, useMemo, useRef, useState} from 'react';
import {LngLatBounds, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {routeHref, readRoute} from './routes.js';
import {siteUrl} from './data.js';
import {money, senateStatusLabels} from './niaModel.js';
import {locationFlagLabels} from './niaLocationModel.js';
import {
  consolidatedMapFeatures, consolidatedMapChains, consolidatedMapSummary, filterConsolidatedProjects,
  COLOR_MODE_ORDER, COLOR_MODES, DEFAULT_COLOR_MODE, resolveColorMode,
  WORKBOOK_STATUS_COLORS, SUBPROGRAM_COLORS, SUBPROGRAM_COLOR_FALLBACK,
  NIA_CONSOLIDATED_MAP_NOTE,
  NIA_MAP_OBJECT_OPTIONS, NIA_MAP_LAYER_HINTS,
  NIA_MAP_SUBPROGRAM_OPTIONS,
  DEFAULT_NIA_MAP_OBJECTS, DEFAULT_NIA_MAP_TYPES,
  defaultNiaMapTypesFor, niaMapTypeOptionsFor,
  readNiaMapObjects, niaMapObjectsParam, readNiaMapTypes, niaMapTypesParam,
  niaMapLayerCounts, preferredMapFocus,
} from './niaConsolidatedMap.js';
import NiaLocationAnalysis from './NiaLocationAnalysis.jsx';
import './Fmr.css';
import './Nia.css';
import './NiaMap.css';

setWorkerUrl(workerUrl);

const href = (key, params = {}) => routeHref(key, params, 'nia');
function navigate(route, patch) {
  const current = readRoute();
  const next = {...Object.fromEntries(current.params), ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = href(route.key, next);
}

const BASEMAP = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const POINTS = 'nia-geo-points';
const CHAINS = 'nia-geo-chains';
const HALO = 'nia-geo-halo';
const PSGC_HALO = 'nia-geo-psgc-halo';
const CLUSTER = 'nia-geo-clusters';
const CLUSTER_COUNT = 'nia-geo-cluster-count';
const UNCLUSTERED = 'nia-geo-unclustered';
const PSGC_UNCLUSTERED = 'nia-geo-psgc-unclustered';
const CHAIN_HALO = 'nia-geo-chain-halo';
const CHAIN_LINE = 'nia-geo-chain-line';
const PSGC_COUNT = 'nia-geo-psgc-count';
const PSGC_SQUARE = 'nia-geo-psgc-square';
const PH_BOUNDS = [[117.5, 5.5], [126.5, 18.5]];
// Zoom-driven marker radii, Congress-map style: small dots at national zoom so
// dense regions stay legible, larger when you zoom toward a province/city.
// `match` cannot wrap a zoom interpolate in MapLibre, so PSGC and title-GPS
// points get separate layers with their own ramps.
const GPS_RADIUS = ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4.5, 14, 6.5];
// Stacked squares need more room for the count digit; singles stay compact.
const PSGC_ICON_SIZE = ['interpolate', ['linear'], ['zoom'],
  5, ['case', ['>=', ['get', 'stack_count'], 2], 0.125, 0.075],
  10, ['case', ['>=', ['get', 'stack_count'], 2], 0.17, 0.105],
  14, ['case', ['>=', ['get', 'stack_count'], 2], 0.23, 0.14]];
const PSGC_COUNT_SIZE = ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 13, 14, 15];
const GPS_HALO_RADIUS = ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 6, 14, 8.5];
const PSGC_HALO_RADIUS = ['interpolate', ['linear'], ['zoom'],
  5, ['case', ['>=', ['get', 'stack_count'], 2], 9, 6],
  10, ['case', ['>=', ['get', 'stack_count'], 2], 12.5, 8],
  14, ['case', ['>=', ['get', 'stack_count'], 2], 16.5, 11]];
// Baked 128px square marker sprites (per color, with dark border) for the
// PSGC fallback layer — MapLibre symbols cannot draw shapes, and SDF icons
// cannot keep the crisp 2px border the design needs. Registered per name in
// map.on('load'); icon-image expressions reference the names.
const PSGC_ICON_PREFIX = 'nia-psgc-square-';
const PSGC_SQUARE_SPRITE = (() => {
  const cache = new Map();
  return color => {
    if (cache.has(color)) return cache.get(color);
    const size = 128, border = 10;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(border, border, size - 2 * border, size - 2 * border);
    ctx.fillStyle = color;
    ctx.fillRect(border * 2, border * 2, size - 4 * border, size - 4 * border);
    const data = ctx.getImageData(0, 0, size, size);
    cache.set(color, data);
    return data;
  };
})();

function psgcSquareIconName(color) {
  return PSGC_ICON_PREFIX + color.replace('#', '');
}

/** All palette colors so every color mode's icons exist before layers load. */
function psgcSquareIconColors() {
  return [...new Set([
    ...Object.values(SUBPROGRAM_COLORS),
    ...Object.values(WORKBOOK_STATUS_COLORS),
    SUBPROGRAM_COLOR_FALLBACK,
  ])];
}

function psgcSquareIconExpr(colorMode) {
  if (colorMode === 'status') {
    return ['match', ['get', 'status'],
      'both_funded', psgcSquareIconName(WORKBOOK_STATUS_COLORS.both_funded),
      'house_insertion', psgcSquareIconName(WORKBOOK_STATUS_COLORS.house_insertion),
      'house_zeroed', psgcSquareIconName(WORKBOOK_STATUS_COLORS.house_zeroed),
      psgcSquareIconName(WORKBOOK_STATUS_COLORS.unfunded)];
  }
  const entries = Object.entries(SUBPROGRAM_COLORS)
    .map(([key, color]) => [key, psgcSquareIconName(color)]).flat();
  return ['match', ['get', 'subprogram'], ...entries,
    psgcSquareIconName(SUBPROGRAM_COLOR_FALLBACK)];
}

const MARKER_MODES = {
  clusters: {label: 'Clusters', cluster: true,
    hint: 'Nearby markers group into bubbles; click a bubble to expand.'},
  points: {label: 'All points', cluster: false,
    hint: 'Every marker drawn small; markers grow as you zoom in.'},
};
const MARKER_MODE_ORDER = ['clusters', 'points'];
// Default to every marker drawn: with clustering, national view hides most
// points inside bubbles and point clicks expand clusters instead of opening
// the project details dialog.
const DEFAULT_MARKER_MODE = 'points';

function resolveMarkerMode(value) {
  return MARKER_MODES[value] ? value : DEFAULT_MARKER_MODE;
}

function circleColorExpr(colorMode) {
  if (colorMode === 'status') {
    return ['match', ['get', 'status'],
      'both_funded', WORKBOOK_STATUS_COLORS.both_funded,
      'house_insertion', WORKBOOK_STATUS_COLORS.house_insertion,
      'house_zeroed', WORKBOOK_STATUS_COLORS.house_zeroed,
      WORKBOOK_STATUS_COLORS.unfunded];
  }
  return ['match', ['get', 'subprogram'],
    ...Object.entries(SUBPROGRAM_COLORS).flat(),
    SUBPROGRAM_COLOR_FALLBACK];
}

function StatusDot({subtypeId, colorMode, shape = 'dot'}) {
  const color = colorMode === 'subprogram'
    ? (SUBPROGRAM_COLORS[subtypeId] || SUBPROGRAM_COLOR_FALLBACK)
    : (WORKBOOK_STATUS_COLORS[subtypeId] || '#64748b');
  return <i className={`nia-layer-key-dot${shape === 'square' ? ' is-square' : ''}`}
    aria-hidden="true" style={{background: color}}/>;
}

function LayerSwatch({id}) {
  if (id === 'title_gps') {
    return <i className="nia-layer-swatch nia-layer-swatch-dot" aria-hidden="true"
      style={{background: SUBPROGRAM_COLORS['Establishment of Pump Irrigation']}}/>;
  }
  return <i className="nia-layer-swatch nia-layer-swatch-square" aria-hidden="true"/>;
}

function NiaMapLayersPanel({
  objects, onChangeObjects, types, onChangeTypes, onShowAll,
  colorMode, onChangeColor, markerMode, onChangeMarkers, onResetView,
  layerCounts,
}) {
  const [open, setOpen] = useState(true);
  const toggle = id => onChangeObjects({...objects, [id]: !objects[id]});
  const toggleType = (objectId, subtypeId) => onChangeTypes({
    ...types,
    [objectId]: {...types[objectId], [subtypeId]: !types[objectId]?.[subtypeId]},
  });
  const activeCount = NIA_MAP_OBJECT_OPTIONS.filter(([id]) => objects[id]).length;
  const subtypeOptions = niaMapTypeOptionsFor(colorMode);
  const subtypeNoun = colorMode === 'subprogram' ? 'sub-program' : 'status';

  return <div className={`nia-map-panel ${open ? 'is-open' : ''}`}>
    <div className="nia-map-panel-head">
      <button type="button" className="nia-map-panel-toggle" aria-expanded={open}
        aria-label={`Layers ${activeCount} of ${NIA_MAP_OBJECT_OPTIONS.length}`}
        onClick={() => setOpen(value => !value)}>
        <strong>Layers</strong>
        <span>{activeCount}/{NIA_MAP_OBJECT_OPTIONS.length}</span>
      </button>
      <div className="nia-map-panel-quick">
        <div className="nia-map-color-modes" role="group" aria-label="Color by">
          {COLOR_MODE_ORDER.map(key =>
            <button key={key} type="button"
              className={colorMode === key ? 'is-active' : ''}
              aria-pressed={colorMode === key}
              title={COLOR_MODES[key].hint}
              onClick={() => onChangeColor(key)}>{COLOR_MODES[key].label}</button>)}
        </div>
        <div className="nia-marker-modes" role="radiogroup" aria-label="Marker view">
          {MARKER_MODE_ORDER.map(key => {
            const active = key === markerMode;
            return <button key={key} type="button" role="radio" aria-checked={active}
              className={active ? 'on' : ''} title={MARKER_MODES[key].hint}
              onClick={() => onChangeMarkers(key)}>
              {MARKER_MODES[key].label}
            </button>;
          })}
        </div>
        <button type="button" className="nia-map-reset" onClick={onResetView}>Reset</button>
      </div>
    </div>
    {open && <div className="nia-map-panel-body">
      <ul className="nia-layer-list" aria-label="Map layers">
        {NIA_MAP_OBJECT_OPTIONS.map(([id, label]) =>
          <li key={id} className={objects[id] ? 'is-on' : 'is-off'}>
            <label className="nia-layer-row" title={NIA_MAP_LAYER_HINTS[id]}>
              <LayerSwatch id={id}/>
              <span className="nia-layer-copy">
                <strong>{label}</strong>
                <small>{NIA_MAP_LAYER_HINTS[id]}</small>
              </span>
              <input type="checkbox" checked={Boolean(objects[id])}
                aria-label={label}
                onChange={() => toggle(id)}/>
            </label>
            {objects[id] && <ul className="nia-layer-key" aria-label={`${label} ${subtypeNoun} toggles`}>
              {subtypeOptions.map(([subtypeId, subtypeLabel]) => {
                const checked = Boolean(types?.[id]?.[subtypeId]);
                const count = layerCounts?.[id]?.[subtypeId];
                return <li key={subtypeId} className={checked ? 'is-on' : 'is-off'}>
                  <label className="nia-layer-type">
                    <StatusDot subtypeId={subtypeId} colorMode={colorMode}
                      shape={id === 'psgc' ? 'square' : 'dot'}/>
                    <span>{subtypeLabel}</span>
                    {count && <em>{count.projects.toLocaleString('en-PH')}
                      {count.markers !== count.projects ? ` · ${count.markers.toLocaleString('en-PH')} pts` : ''}</em>}
                    <input type="checkbox" checked={checked}
                      aria-label={`${label}: ${subtypeLabel}`}
                      onChange={() => toggleType(id, subtypeId)}/>
                  </label>
                </li>;
              })}
              {id === 'title_gps' && colorMode === 'status' &&
                <li className="nia-layer-key-note">
                  House insertions almost never print title GPS — use PSGC to see them.
                </li>}
              {id === 'psgc' &&
                <li className="nia-layer-key-note">
                  Fallback only: rows whose titles print coordinates stay on Title GPS, so the two layers never double-plot one line.
                </li>}
            </ul>}
          </li>)}
      </ul>
      <div className="nia-layer-actions">
        <button type="button" onClick={() => onShowAll(
          {...DEFAULT_NIA_MAP_OBJECTS},
          defaultNiaMapTypesFor(colorMode))}>Show all</button>
        <button type="button" onClick={() => onChangeObjects(Object.fromEntries(
          NIA_MAP_OBJECT_OPTIONS.map(([id]) => [id, false])))}>
          Hide all</button>
      </div>
    </div>}
  </div>;
}

function NiaMapHover({hover}) {
  if (!hover) return null;
  return <aside className="nia-map-hover" role="status">
    <strong>{hover.title}</strong>
    <span>{hover.subprogram}{hover.category ? ` · ${hover.category}` : ''}</span>
    <span>{[hover.barangay, hover.municipality, hover.province].filter(Boolean).join(', ') || hover.region}</span>
    <span>{hover.status_label || senateStatusLabels[hover.status] || hover.status}
      {hover.amount != null && hover.amount !== '' ? ` · ${money(Number(hover.amount))}` : ''}</span>
    <span className="fmr-muted">{hover.kind === 'title_gps'
      ? `Title GPS${hover.role ? ` · ${hover.role}` : ''}${Number(hover.site_count) > 1 ? ` · ${hover.site_count} sites on this line` : ''}`
      : `PSGC ${hover.psgc || '—'} · ${hover.anchor === 'municipality' ? 'municipality centroid' : 'barangay centroid'}${Number(hover.stack_count) > 1 ? ` · ${hover.stack_count} rows share this point` : ''}`}</span>
    {hover.flags && <span className="nia-flag-note">Flags: {hover.flags.split(';').map(f => locationFlagLabels[f] || f).join(', ')}</span>}
  </aside>;
}

/**
 * One MapLibre instance for either the inline shell or the full-window dialog.
 * URL-driven layer/color/marker state is shared; each mount owns its own map.
 */
function NiaMapStage({
  variant = 'inline',
  geojson, chains, colorMode, markerMode, clusterEnabled,
  objects, types, layerCounts,
  onChangeObjects, onChangeTypes, onShowAll,
  onChangeColor, onChangeMarkers, onResetLayers,
  onSelectProject = () => {},
  onExpand = null, onContract = null,
  stackLookup = null,
  focusProject = null,
}) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(null);
  const [stackPicker, setStackPicker] = useState(null);
  const geojsonRef = useRef(geojson);
  const chainsRef = useRef(chains);
  const colorModeRef = useRef(colorMode);
  const clusterEnabledRef = useRef(clusterEnabled);
  const selectProjectRef = useRef(onSelectProject);
  geojsonRef.current = geojson;
  chainsRef.current = chains;
  colorModeRef.current = colorMode;
  clusterEnabledRef.current = clusterEnabled;
  selectProjectRef.current = onSelectProject;

  useEffect(() => {
    if (!container.current || mapRef.current) return undefined;
    const map = new MapLibreMap({container: container.current, style: BASEMAP,
      bounds: PH_BOUNDS, fitBoundsOptions: {padding: 40}});
    mapRef.current = map;
    // Expose the instance for tests/URL-driven debugging.
    container.current._niaMap = map;
    map.addControl(new NavigationControl({showCompass: false}));
    map.addControl(new ScaleControl());
    map.on('error', e => setError(e.error?.message || 'Map error'));
    map.on('load', () => {
      map.addSource(POINTS, {type: 'geojson', data: geojsonRef.current,
        cluster: clusterEnabledRef.current, clusterRadius: 26, clusterMaxZoom: 9});
      // Multi-site chains: dashed join between one workbook line's title-GPS
      // points (FMR-style). Halo underneath, colored line on top.
      map.addSource(CHAINS, {type: 'geojson', data: chainsRef.current});
      // Register every palette square sprite before the symbol layer needs it.
      for (const color of psgcSquareIconColors()) {
        const name = psgcSquareIconName(color);
        if (!map.hasImage(name)) {
          map.addImage(name, PSGC_SQUARE_SPRITE(color));
        }
      }
      map.addLayer({id: CHAIN_HALO, type: 'line', source: CHAINS,
        paint: {'line-color': '#ffffff', 'line-opacity': 0.65,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 5, 14, 9]},
        layout: {'line-cap': 'round', 'line-join': 'round'}});
      map.addLayer({id: CHAIN_LINE, type: 'line', source: CHAINS,
        paint: {'line-color': circleColorExpr(colorModeRef.current),
          'line-opacity': 0.85, 'line-dasharray': [1.6, 1.4],
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.4, 10, 2.6, 14, 4.5]},
        layout: {'line-cap': 'butt', 'line-join': 'round'}});
      map.addLayer({id: CLUSTER, type: 'circle', source: POINTS, filter: ['has', 'point_count'],
        paint: {'circle-color': '#334155', 'circle-opacity': 0.78,
          'circle-radius': ['step', ['get', 'point_count'], 10, 5, 13, 15, 17, 50, 22]}});
      map.addLayer({id: CLUSTER_COUNT, type: 'symbol', source: POINTS, filter: ['has', 'point_count'],
        layout: {'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11},
        paint: {'text-color': '#ffffff'}});
      map.addLayer({id: HALO, type: 'circle', source: POINTS,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'kind'], 'title_gps']],
        paint: {'circle-color': '#ffffff', 'circle-opacity': 0.85,
          'circle-radius': GPS_HALO_RADIUS}});
      map.addLayer({id: PSGC_HALO, type: 'circle', source: POINTS,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'kind'], 'psgc']],
        paint: {'circle-color': '#ffffff', 'circle-opacity': 0.85,
          'circle-radius': PSGC_HALO_RADIUS}});
      map.addLayer({id: UNCLUSTERED, type: 'circle', source: POINTS,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'kind'], 'title_gps']],
        paint: {
          'circle-color': circleColorExpr(colorModeRef.current),
          'circle-radius': GPS_RADIUS,
          'circle-opacity': 0.95,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': '#ffffff',
        }});
      map.addLayer({id: PSGC_SQUARE, type: 'symbol', source: POINTS,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'kind'], 'psgc']],
        layout: {
          'icon-image': psgcSquareIconExpr(colorModeRef.current),
          'icon-size': PSGC_ICON_SIZE,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        }});
      map.addLayer({id: PSGC_COUNT, type: 'symbol', source: POINTS,
        filter: ['all', ['!', ['has', 'point_count']],
          ['==', ['get', 'kind'], 'psgc'], ['>=', ['get', 'stack_count'], 2]],
        layout: {
          'text-field': ['get', 'stack_count'],
          'text-size': PSGC_COUNT_SIZE,
        },
        paint: {'text-color': '#ffffff'}});
      for (const layerId of [UNCLUSTERED, PSGC_SQUARE, PSGC_COUNT, CLUSTER]) {
        map.on('mouseenter', layerId, e => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features[0];
          if (layerId !== CLUSTER) setHover(f.properties);
        });
        map.on('mouseleave', layerId, () => {map.getCanvas().style.cursor = ''; setHover(null);});
        map.on('click', layerId, e => {
          if (layerId === CLUSTER) {
        const clusterId = e.features[0].properties.cluster_id;
        map.getSource(POINTS).getClusterExpansionZoom(clusterId).then(zoom =>
          map.easeTo({center: e.features[0].geometry.coordinates, zoom}));
            return;
          }
          // Overlapping markers: a title-GPS dot at the same pixel is the
          // more precise plot — prefer it over a PSGC square hit so the
          // exact project opens. (Delegated events only carry features from
          // their own layer, so query the dot layer explicitly.)
          let props = e.features[0].properties;
          if (layerId === PSGC_SQUARE || layerId === PSGC_COUNT) {
            const gpsHit = map.queryRenderedFeatures(e.point, {layers: [UNCLUSTERED]})[0];
            if (gpsHit) props = gpsHit.properties;
          }
          // Stacked PSGC squares open a picker; single rows open directly.
          if (Number(props.stack_count) > 1) {
            setStackPicker({
              ids: String(props.stack_ids || props.id).split(',').filter(Boolean),
              point: e.point,
            });
            return;
          }
          selectProjectRef.current(props.id);
        });
      }
      setReady(true);
    });
    return () => {
      if (container.current) container.current._niaMap = null;
      map.remove(); mapRef.current = null; setReady(false);
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource(POINTS);
    if (source && ready) source.setData(geojson);
    const chainSource = mapRef.current?.getSource(CHAINS);
    if (chainSource && ready) chainSource.setData(chains);
  }, [geojson, chains, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer(UNCLUSTERED)) return;
    map.setPaintProperty(UNCLUSTERED, 'circle-color', circleColorExpr(colorMode));
    map.setLayoutProperty(PSGC_SQUARE, 'icon-image', psgcSquareIconExpr(colorMode));
    map.setPaintProperty(CHAIN_LINE, 'line-color', circleColorExpr(colorMode));
  }, [colorMode, ready]);

  useEffect(() => {
    const source = mapRef.current?.getSource(POINTS);
    if (!ready || typeof source?.setClusterOptions !== 'function') return;
    const current = source.getClusterOptions?.();
    if (!current || current.cluster !== clusterEnabled) {
      source.setClusterOptions({cluster: clusterEnabled});
    }
    setHover(null);
  }, [clusterEnabled, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !container.current) return undefined;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    map.resize();
    return () => observer.disconnect();
  }, [ready, variant]);

  // Focus the selected project: title GPS when present, else PSGC centroid.
  useEffect(() => {
    const map = mapRef.current;
    const focus = preferredMapFocus(focusProject);
    if (!ready || !map || !focus?.coordinates?.length) return;
    map.stop();
    if (focus.coordinates.length === 1) {
      map.easeTo({center: focus.coordinates[0], zoom: Math.max(map.getZoom(), 11), duration: 700});
      return;
    }
    const bounds = focus.coordinates.reduce(
      (box, coord, i) => (i ? box.extend(coord) : new LngLatBounds(coord, coord)),
      null);
    map.fitBounds(bounds, {padding: 80, maxZoom: 13, duration: 700});
  }, [ready, focusProject?.id]);

  const resetView = () => {
    mapRef.current?.fitBounds(PH_BOUNDS, {padding: 40, duration: 600});
    onResetLayers();
  };

  return <div className={`nia-map-shell is-${variant}`}>
    <div ref={container} className="nia-map-canvas" role="region" aria-label="NIA project location map"/>
    {!ready && !error && <p className="nia-map-warning" role="status">Loading map…</p>}
    {error && <p className="nia-map-warning" role="alert">The basemap could not load: {error}</p>}
    <NiaMapLayersPanel
      objects={objects} onChangeObjects={onChangeObjects}
      types={types} onChangeTypes={onChangeTypes}
      onShowAll={onShowAll}
      colorMode={colorMode}
      onChangeColor={onChangeColor}
      markerMode={markerMode}
      onChangeMarkers={onChangeMarkers}
      onResetView={resetView}
      layerCounts={layerCounts}
    />
    {onExpand && variant === 'inline' &&
      <button type="button" className="nia-map-expand" onClick={onExpand}>Full window ⤢</button>}
    {variant === 'full' && onContract &&
      <button type="button" className="nia-map-fullclose" onClick={onContract}>Exit full window ✕</button>}
    <NiaMapHover hover={hover}/>
    {stackPicker && <NiaMapStackDialog
      ids={stackPicker.ids}
      stackLookup={stackLookup}
      onClose={() => setStackPicker(null)}
      onSelectProject={selectProjectRef.current}/>}
  </div>;
}

/** Centered modal listing every workbook row under one stacked marker. */
function NiaMapStackDialog({ids, stackLookup, onClose, onSelectProject}) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!dialog.current) return undefined;
    const element = dialog.current;
    if (!element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (element.open) element.close();
      document.body.style.overflow = '';
    };
  }, []);
  const projects = (stackLookup ? ids.map(stackLookup).filter(Boolean) : []);
  return <dialog ref={dialog} className="fmr-dialog nia-stack-dialog"
    aria-label="Projects at this location"
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <h2>{ids.length} projects share this centroid</h2>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <div className="fmr-dialog-body">
      <p className="fmr-muted">PSGC centroid marker — click a row to open its project details.</p>
      <table className="nia-stack-table">
        <thead><tr>
          <th scope="col">Project</th>
          <th scope="col">Sub-program</th>
          <th scope="col">Status</th>
          <th scope="col" className="is-num">Amount</th>
        </tr></thead>
        <tbody>
          {projects.map(p =>
            <tr key={p.id}>
              <td>
                <button type="button" onClick={() => {onClose(); onSelectProject(p.id);}}>
                  {p.label}
                </button>
                <small className="nia-stack-row-id">{p.id}</small>
              </td>
              <td>{p.subprogram_label || p.subprogram_key || '—'}</td>
              <td>{senateStatusLabels[p.workbook_status] || p.workbook_status || '—'}</td>
              <td className="is-num">{(p.hgab_amount != null || p.nep_amount != null)
                ? money(Number(p.hgab_amount ?? p.nep_amount)) : '—'}</td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </dialog>;
}

/** Click-through details for one workbook row behind a map marker. */
function NiaMapProjectDialog({project, onClose}) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!dialog.current || !project) return undefined;
    const element = dialog.current;
    if (!element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (element.open) element.close();
      document.body.style.overflow = '';
    };
  }, [project?.id]);
  if (!project) return null;
  const gps = project.locations?.title_gps;
  const points = gps?.points || [];
  const psgc = project.locations?.psgc?.primary;
  const chainage = project.locations?.chainage;
  const amounts = [
    ['NEP', project.nep_amount], ['House GAB', project.hgab_amount],
    ['Agency submission', project.submission_amount],
  ].filter(([, v]) => v != null);
  const links = [];
  if (project.nep_id) links.push(['NEP record →', href('nep', {node: project.nep_id})]);
  if (project.house_id) links.push(['House record →', href('house', {node: project.house_id})]);
  if ((project.comparison_ids || []).length === 1) {
    links.push(['Pair evidence →', href('compare', {pair: project.comparison_ids[0]})]);
  }
  return <dialog ref={dialog} className="fmr-dialog nia-project-dialog"
    aria-label="NIA project details"
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <h2>{project.label}</h2>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <div className="fmr-dialog-body">
      <p className="nia-project-ids">
        <span className="nia-id">{project.id}</span>
        {project.submission_edited && <span> · submission edit {project.submission_edited}</span>}
        {' '}· workbook row {project.row}
      </p>
      <dl className="nia-project-facts">
        <div><dt>Program</dt><dd>{project.program_group || '—'}</dd></div>
        <div><dt>Sub-program</dt><dd>{project.subprogram_label || '—'}</dd></div>
        <div><dt>Category</dt><dd>{project.category || '—'}</dd></div>
        <div><dt>Workbook status</dt><dd>
          {senateStatusLabels[project.workbook_status] || project.workbook_status || '—'}</dd></div>
        {amounts.map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{money(Number(value))}</dd></div>)}
        <div><dt>Location</dt><dd>
          {[project.region, project.province].filter(Boolean).join(' · ') || '—'}</dd></div>
      </dl>
      <h3>Locations on the map</h3>
      {points.length > 0 && <>
        <p className="fmr-muted">Title GPS ({gps?.status || 'parsed'}) — decimal coordinates printed in
          the fixed/submission title.</p>
        <ul className="nia-project-sites">
          {points.map((pt, i) => <li key={i}>
            <span>Site {i + 1}{pt.role ? ` · ${pt.role}` : ''}</span>
            <code>{Number(pt.latitude).toFixed(6)}, {Number(pt.longitude).toFixed(6)}</code>
          </li>)}
        </ul>
      </>}
      {psgc?.coordinates && <>
        <p className="fmr-muted">PSGC centroid ({psgc.coordinate_anchor}) — {psgc.psgc || 'no code'}
          {psgc.barangay ? `, ${psgc.barangay}` : ''}{psgc.municipality ? `, ${psgc.municipality}` : ''}
          {psgc.province ? `, ${psgc.province}` : ''}.</p>
        <ul className="nia-project-sites">
          <li><span>Centroid</span>
            <code>{Number(psgc.coordinates[1]).toFixed(6)}, {Number(psgc.coordinates[0]).toFixed(6)}</code></li>
        </ul>
      </>}
      {!points.length && !psgc?.coordinates && <p className="fmr-muted">No plotted coordinates.</p>}
      {chainage && <>
        <p className="fmr-muted">Chainage from title — {chainage.spans.length} span
          {chainage.spans.length > 1 ? 's' : ''}{Number.isFinite(Number(chainage.length_m))
          ? `, ${(chainage.length_m / 1000).toLocaleString('en-PH', {maximumFractionDigits: 2})} km total` : ''}.</p>
        <ul className="nia-project-sites">
          {chainage.spans.map((span, i) => <li key={i}>
            <span>{span.kind} {span.from} → {span.to}</span>
            <code>{Number.isFinite(Number(span.length_m))
              ? `${Number(span.length_m).toLocaleString('en-PH')} m` : '—'}</code>
          </li>)}
          {Number.isFinite(Number(chainage.php_per_m)) &&
            <li>
              <span>Allocation / meter
                {chainage.php_per_m_basis === 'hgab' ? ' (House)'
                  : chainage.php_per_m_basis === 'nep' ? ' (NEP)' : ''}</span>
              <code>{money(Number(chainage.php_per_m))} / m</code>
            </li>}
        </ul>
        {Number.isFinite(Number(chainage.php_per_m)) &&
          <p className="fmr-muted">Printed allocation ÷ title chainage length — a screening proxy, not a construction unit cost.</p>}
      </>}
      {project.justification && <>
        <h3>Workbook justification</h3>
        <p className="nia-project-justification">{project.justification}</p>
      </>}
      {project.flags?.length > 0 && <>
        <h3>Location flags</h3>
        <ul className="nia-location-flags">
          {project.flags.map(flag => <li key={flag}>{locationFlagLabels[flag] || flag}</li>)}
        </ul>
      </>}
      {links.length > 0 && <p className="nia-project-links">
        {links.map(([label, target]) => <a key={target} href={target}>{label}</a>)}
      </p>}
      <p className="nia-project-title-full"><strong>Submission title:</strong> {project.submission_label || project.label}</p>
    </div>
  </dialog>;
}

function FullscreenMapDialog({children, onClose}) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!dialog.current) return undefined;
    const element = dialog.current;
    element.showModal();
    document.body.style.overflow = 'hidden';
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      element.close();
      document.body.style.overflow = '';
    };
  }, []);
  return <dialog ref={dialog} className="nia-map-fullscreen"
    onCancel={event => {event.preventDefault(); onClose();}}
    aria-label="NIA project map, full window">
    {children}
  </dialog>;
}

/**
 * Point map over the consolidated Senate workbook dataset.
 * `embedded="preview"` is the stats-page location peek: same markers, no
 * full-window chrome and no project-details dialog — just focus the row.
 */
export default function NiaMap({data, route, embedded = false}) {
  const [consolidated, setConsolidated] = useState(data.consolidated || null);
  const [loadError, setLoadError] = useState('');
  const preview = embedded === 'preview' || embedded === true;

  const filter = route.params.get('filter') || 'located';
  const anchorFilter = route.params.get('anchor') || 'all';
  const full = !preview && route.params.get('full') === '1';
  const selectedId = preview ? null : route.params.get('project');
  const focusId = preview
    ? (route.params.get('mapProject') || route.params.get('project'))
    : route.params.get('project');
  const colorMode = resolveColorMode(route.params.get('color'));
  const objects = useMemo(
    () => readNiaMapObjects(route.params),
    [route.params.get('objects'), route.params.get('layer')]);
  const types = useMemo(
    () => readNiaMapTypes(route.params, colorMode),
    [route.params.get('types'), colorMode]);
  const markerMode = resolveMarkerMode(route.params.get('markers'));
  // Preview peeks at one project — clustering would hide the pin.
  const clusterEnabled = preview ? false : MARKER_MODES[markerMode].cluster;

  useEffect(() => {
    if (data.consolidated) {setConsolidated(data.consolidated); return;}
    const controller = new AbortController();
    fetch(siteUrl('analysis-nia/data/nia_consolidated.json'), {signal: controller.signal})
      .then(r => {if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json();})
      .then(payload => {setConsolidated(payload); setLoadError('');})
      .catch(err => {if (err.name !== 'AbortError') setLoadError(err.message || 'Failed to load consolidated dataset');});
    return () => controller.abort();
  }, [data]);

  const projects = consolidated?.projects || [];
  const focusProject = focusId ? projects.find(p => p.id === focusId) || null : null;
  const mapProjects = useMemo(() => {
    if (preview && focusProject) return [focusProject];
    return projects;
  }, [preview, focusProject, projects]);
  const layerCounts = useMemo(() => niaMapLayerCounts(mapProjects, colorMode), [mapProjects, colorMode]);
  const filtered = useMemo(() => filterConsolidatedProjects(mapProjects, {
    objects, types, filter: preview ? 'located' : filter, anchor: anchorFilter, dimension: colorMode,
  }), [mapProjects, objects, types, filter, anchorFilter, colorMode, preview]);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: consolidatedMapFeatures(filtered, objects, types, colorMode),
  }), [filtered, objects, types, colorMode]);
  const chains = useMemo(() => ({
    type: 'FeatureCollection',
    features: consolidatedMapChains(filtered, objects, types, colorMode),
  }), [filtered, objects, types, colorMode]);

  // Stacked PSGC squares carry one representative id plus the full member
  // list in stack_ids — count projects through both.
  const plottedProjects = useMemo(() => new Set(geojson.features.flatMap(
    f => (f.properties.stack_ids ? String(f.properties.stack_ids).split(',') : [f.properties.id]))).size, [geojson]);
  const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const summary = useMemo(() => consolidatedMapSummary(consolidated), [consolidated]);
  const selectedProject = selectedId
    ? projects.find(p => p.id === selectedId) || null
    : null;

  const setObjects = next => navigate(route, {
    objects: niaMapObjectsParam(next),
    layer: null,
  });
  const setTypes = next => navigate(route, {types: niaMapTypesParam(next, colorMode)});
  const setLayers = (nextObjects, nextTypes) => navigate(route, {
    objects: niaMapObjectsParam(nextObjects),
    types: niaMapTypesParam(nextTypes, colorMode),
    layer: null,
  });
  const resetLayers = () => navigate(route, {
    objects: null, types: null, layer: null, color: null, markers: null,
    filter: null, anchor: null, status: null,
  });

  const stageProps = {
    geojson, chains, colorMode, markerMode, clusterEnabled,
    objects, types, layerCounts,
    onChangeObjects: setObjects,
    onChangeTypes: setTypes,
    onShowAll: setLayers,
    // Switching the color dimension swaps the subtype toggle set, so stale
    // tokens for the old dimension must not linger in the URL.
    onChangeColor: key => navigate(route, {
      color: key === DEFAULT_COLOR_MODE ? null : key,
      types: null,
    }),
    onChangeMarkers: key => navigate(route, {markers: key === DEFAULT_MARKER_MODE ? null : key}),
    onResetLayers: resetLayers,
    // Preview stays on the location peek — marker clicks must not open the
    // full project dialog over the stats explore flow.
    onSelectProject: preview ? () => {} : id => navigate(route, {project: id}),
    stackLookup: id => projectsById.get(id) || null,
    focusProject: preview ? focusProject : selectedProject,
  };
  const closeProject = () => navigate(route, {project: null});

  if (preview) {
    const basis = preferredMapFocus(focusProject);
    return <div className="nia-map nia-map-preview">
      {focusProject && <p className="nia-map-preview-caption">
        <strong>{focusProject.label}</strong>
        {basis?.label ? <> · {basis.label}</> : null}
        {' · '}{geojson.features.length.toLocaleString('en-PH')} marker{geojson.features.length === 1 ? '' : 's'}
      </p>}
      {loadError && <p className="fmr-map-warning" role="alert">Consolidated dataset unavailable: {loadError}</p>}
      {!loadError && !focusProject && focusId &&
        <p className="fmr-map-warning" role="alert">Project {focusId} not found in the consolidated map dataset.</p>}
      <NiaMapStage {...stageProps} variant="inline"/>
    </div>;
  }

  return <div className="fmr-section nia-map">
    <h2>NIA project map</h2>
    <p className="fmr-muted">{NIA_CONSOLIDATED_MAP_NOTE}</p>
    <div className="nia-map-controls">
      <label>Coverage <select aria-label="Location coverage" value={filter}
        onChange={e => navigate(route, {filter: e.target.value})}>
        <option value="located">Located projects</option>
        <option value="flagged">Flagged projects</option>
      </select></label>
      <label>PSGC anchor <select aria-label="PSGC anchor" value={anchorFilter}
        onChange={e => navigate(route, {anchor: e.target.value})} disabled={!objects.psgc}>
        <option value="all">All anchors</option>
        <option value="barangay">Barangay centroid</option>
        <option value="municipality">Municipality centroid</option>
      </select></label>
      <span className="fmr-muted">
        {plottedProjects.toLocaleString()} projects · {geojson.features.length.toLocaleString()} markers ·
        {' '}{summary.with_title_gps} with title GPS · {summary.with_psgc_centroid} with PSGC ·
        {' '}{COLOR_MODES[colorMode].hint}
      </span>
    </div>
    {loadError && <p className="fmr-map-warning" role="alert">Consolidated dataset unavailable: {loadError}</p>}
    {!full && <NiaMapStage {...stageProps} variant="inline"
      onExpand={() => navigate(route, {full: '1'})}/>}
    {full && <>
      <p className="nia-map-full-placeholder" role="status">
        Map open in full window.
        {' '}<button type="button" className="nia-map-full-return"
          onClick={() => navigate(route, {full: null})}>Return to page</button>
      </p>
      <FullscreenMapDialog onClose={() => navigate(route, {full: null})}>
        <NiaMapStage {...stageProps} variant="full"
          onContract={() => navigate(route, {full: null})}/>
      </FullscreenMapDialog>
    </>}
    <div className="nia-map-legend" aria-label="Map color legend">
      {colorMode === 'status'
        ? [['both_funded', 'Both funded'], ['house_insertion', 'House insertion'],
          ['house_zeroed', 'NEP zeroed'], ['unfunded', 'Unfunded']].map(([k, label]) =>
          <span key={k}><i style={{background: WORKBOOK_STATUS_COLORS[k]}}/>{label}</span>)
        : Object.entries(SUBPROGRAM_COLORS).map(([k, color]) =>
          <span key={k}><i style={{background: color}}/>{k.replace('Establishment of ', '')}</span>)}
      {objects.title_gps && objects.psgc &&
        <span className="fmr-muted">● title GPS · ▣ PSGC (number = rows at that centroid)</span>}
      {objects.title_gps &&
        <span className="fmr-muted">Dashed line = one line's multiple sites</span>}
      <span className="fmr-muted">{MARKER_MODES[markerMode].hint}</span>
    </div>
    <NiaMapProjectDialog project={selectedProject} onClose={closeProject}/>
    <NiaLocationAnalysis data={data}/>
  </div>;
}
