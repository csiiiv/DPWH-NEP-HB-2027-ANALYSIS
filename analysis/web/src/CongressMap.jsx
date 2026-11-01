import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {loadData, siteUrl} from './data.js';
import {routeHref} from './routes.js';
import ShareLink from './ShareLink.jsx';
import {districtLensCounts} from './congressModel.js';
import {fmrPrintedMapOverlay, DISTRICT_SEGMENT_CLASSES, REPAIR_COLOR} from './fmrSegmentOverlay.js';
import {MPB_POINT_CLASSES, MPB_BOX_ICON_IMAGE, ensureMpbBoxIcon,
  ensureMpbBadgeIcons, ensureMpbTotalBadgeIcons} from './mpbSegmentOverlay.js';
import {
  colorDistrictFeatures, decorateDistrictIds, districtIdBridge,
  mpbNationalMapOverlay, districtCardId, mpbUnmappedDistrictBadges,
  mpbUnmappedBadgeViews, mpbUnmappedClassTotals,
  CONGRESS_MAP_OBJECT_OPTIONS, DEFAULT_CONGRESS_MAP_OBJECTS,
  CONGRESS_MAP_TYPE_OPTIONS, DEFAULT_CONGRESS_MAP_TYPES,
  readCongressMapObjects, congressMapObjectsParam,
  readCongressMapTypes, congressMapTypesParam,
  enabledCongressMapCategories, congressMapCategoryFilter,
} from './congressMapModel.js';
import './CongressMap.css';
import './Fmr.css';

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const DISTRICTS = 'congress-map-districts';
const DISTRICTS_FILL = 'congress-map-districts-fill';
const DISTRICTS_LINE = 'congress-map-districts-line';
const FMR_LINES = 'congress-map-fmr-lines';
const FMR_POINTS = 'congress-map-fmr-points';
const FMR_HALO = 'congress-map-fmr-halo';
const FMR_LINE = 'congress-map-fmr-line';
const FMR_POINT = 'congress-map-fmr-point';
const FMR_LINKS = 'congress-map-fmr-repair-links';
const FMR_LINK = 'congress-map-fmr-repair-link';
const FMR_CORRECTED = 'congress-map-fmr-corrected';
const FMR_CORRECTED_POINT = 'congress-map-fmr-corrected-point';
const MPB_LINES = 'congress-map-mpb-lines';
const MPB_LINE_HALO = 'congress-map-mpb-line-halo';
const MPB_LINE = 'congress-map-mpb-line';
const MPB_POINTS = 'congress-map-mpb-points';
const MPB_POINT = 'congress-map-mpb-point';
const MPB_UNMAPPED = 'congress-map-mpb-unmapped';
const MPB_BADGE = 'congress-map-mpb-badge';
const MPB_UNMAPPED_TOTAL = 'congress-map-mpb-unmapped-total';
const MPB_BADGE_TOTAL = 'congress-map-mpb-badge-total';

const MARKER_LAYERS = [FMR_LINE, FMR_POINT, FMR_LINK, FMR_CORRECTED_POINT, MPB_LINE, MPB_POINT];
const OBJECT_LAYERS = {
  districts: [DISTRICTS_FILL, DISTRICTS_LINE],
  fmr: [FMR_HALO, FMR_LINE, FMR_POINT],
  fmr_repairs: [FMR_LINK, FMR_CORRECTED_POINT],
  mpb: [MPB_LINE_HALO, MPB_LINE, MPB_POINT],
  mpb_unmapped: [MPB_BADGE, MPB_BADGE_TOTAL],
};
const emptyFc = () => ({type: 'FeatureCollection', features: []});

function applyLayerFilters(instance, objects, types) {
  if (!instance?.getStyle()) return;
  const setVisible = (layerId, on) => {
    if (instance.getLayer(layerId)) {
      instance.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none');
    }
  };
  const setFilter = (layerId, filter) => {
    if (instance.getLayer(layerId)) instance.setFilter(layerId, filter);
  };

  for (const layerId of OBJECT_LAYERS.districts) setVisible(layerId, objects.districts);

  const fmrOn = Boolean(objects.fmr);
  const fmrFilter = congressMapCategoryFilter(enabledCongressMapCategories(types, 'fmr'));
  for (const layerId of OBJECT_LAYERS.fmr) {
    setVisible(layerId, fmrOn);
    if (fmrOn) setFilter(layerId, fmrFilter);
  }

  setVisible(FMR_LINK, objects.fmr_repairs && types?.fmr_repairs?.link);
  setVisible(FMR_CORRECTED_POINT, objects.fmr_repairs && types?.fmr_repairs?.point);

  const mpbOn = Boolean(objects.mpb);
  const mpbFilter = congressMapCategoryFilter(enabledCongressMapCategories(types, 'mpb'));
  for (const layerId of OBJECT_LAYERS.mpb) {
    setVisible(layerId, mpbOn);
    if (mpbOn) setFilter(layerId, mpbFilter);
  }
  const unmappedOn = Boolean(objects.mpb_unmapped);
  const unmappedTypes = types?.mpb_unmapped ?? {};
  const stackOn = unmappedOn && (unmappedTypes.house_only || unmappedTypes.nep_only
    || unmappedTypes.paired);
  const totalOn = unmappedOn && Boolean(unmappedTypes.total);
  setVisible(MPB_BADGE, stackOn);
  setVisible(MPB_BADGE_TOTAL, totalOn);
  // Nudge the red total square aside when class chips are also drawn so the
  // two badges at a district centroid do not bury each other.
  if (instance.getLayer(MPB_BADGE_TOTAL)) {
    instance.setLayoutProperty(MPB_BADGE_TOTAL, 'icon-offset', stackOn ? [22, 0] : [0, 0]);
  }
}

async function loadJson(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.json();
}

function fitPhilippines(instance) {
  instance?.fitBounds(new LngLatBounds([117, 5], [127, 19]), {padding: 40, duration: 600});
}

function DistrictPanel({feature, fmrIndex, mpbIndex, onClose}) {
  const p = feature.properties;
  const districtId = p.district_id;
  const fmrCard = districtCardId(fmrIndex, districtId);
  const mpbCard = districtCardId(mpbIndex, districtId);
  // Same census as the explorer's district page: every row on the lens card
  // counts (with or without coordinates), mapped share shown alongside.
  const lensCounts = useMemo(
    () => districtLensCounts(fmrIndex, mpbIndex, districtId), [fmrIndex, mpbIndex, districtId]);
  return <aside className="congress-map-info" role="region" aria-label="Selected district">
    <div className="congress-map-info-head">
      <span className="fmr-eyebrow">{p.region}</span>
      <button className="fmr-map-close" type="button" onClick={onClose} aria-label="Close district panel">×</button>
    </div>
    <h2>{p.jurisdiction} · {p.district_label}</h2>
    {p.representative && <p className="congress-map-rep">Rep. {p.representative}</p>}
    <p className="fmr-muted congress-map-note">
      Legislative district polygon from the PSGC2LEG viz build. Markers on the map are
      FMR segment endpoints (printed GPS) and MPB title coordinates.
    </p>
    {(lensCounts?.fmr.cardId || lensCounts?.mpb.cardId) && <div className="congress-lens-counts">
      {lensCounts.fmr.cardId && <a href={routeHref('district',
        {district: lensCounts.fmr.cardId, lens: 'fmr'}, 'congress')}
        title="Open the FMR legislative card for this district">
        <strong>FMR</strong>
        <span>{lensCounts.fmr.rows.toLocaleString('en-PH')} records</span>
        {lensCounts.fmr.rows > 0 &&
          <small>{lensCounts.fmr.mapped.toLocaleString('en-PH')} with printed geometry</small>}
      </a>}
      {lensCounts.mpb.cardId && <a href={routeHref('district',
        {district: lensCounts.mpb.cardId, lens: 'mpb'}, 'congress')}
        title="Open the MPB legislative card for this district">
        <strong>MPB</strong>
        <span>{lensCounts.mpb.rows.toLocaleString('en-PH')} records</span>
        {lensCounts.mpb.rows > 0 &&
          <small>{lensCounts.mpb.mapped.toLocaleString('en-PH')} with title coordinates</small>}
      </a>}
    </div>}
    <div className="congress-map-actions">
      {fmrCard && <a className="primary"
        href={routeHref('district', {district: fmrCard, lens: 'fmr'}, 'congress')}>
        FMR legislative card →</a>}
      {mpbCard && <a
        href={routeHref('district', {district: mpbCard, lens: 'mpb'}, 'congress')}>
        MPB legislative card →</a>}
      {districtId && <a
        href={routeHref('district', {district: `location:title_psgc:${districtId}`, lens: 'location'}, 'congress')}>
        Districts (Legislative) card →</a>}
    </div>
  </aside>;
}

const DEFAULT_FILL_ALPHA = 0.10;

function parseFillAlpha(params) {
  const raw = params?.get?.('fill');
  if (raw == null || raw === '') return DEFAULT_FILL_ALPHA;
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return DEFAULT_FILL_ALPHA;
  return Math.min(1, Math.max(0, pct / 100));
}

function fillOpacityExpression(base) {
  const hover = Math.min(1, base + 0.18);
  const selected = Math.min(1, base + 0.25);
  return ['case',
    ['boolean', ['feature-state', 'selected'], false], selected,
    ['boolean', ['feature-state', 'hover'], false], hover,
    base];
}

function syncLayers(instance, districts, fmrOverlay, mpbOverlay, fillAlpha = DEFAULT_FILL_ALPHA,
  objects = DEFAULT_CONGRESS_MAP_OBJECTS, types = DEFAULT_CONGRESS_MAP_TYPES,
  mpbBadges = null) {
  if (!instance?.getStyle()) return;
  const ensure = (id, data) => {
    if (!instance.getSource(id)) instance.addSource(id, {type: 'geojson', data, generateId: true});
    else instance.getSource(id).setData(data);
  };

  ensure(DISTRICTS, districts || emptyFc());
  ensure(FMR_LINES, fmrOverlay?.lines || emptyFc());
  ensure(FMR_POINTS, fmrOverlay?.points || emptyFc());
  ensure(FMR_LINKS, fmrOverlay?.connectors || emptyFc());
  ensure(FMR_CORRECTED, fmrOverlay?.correctedPoints || emptyFc());
  ensure(MPB_LINES, mpbOverlay?.lines || emptyFc());
  ensure(MPB_POINTS, mpbOverlay?.points || emptyFc());
  const unmappedViews = mpbUnmappedBadgeViews(mpbBadges, types);
  ensure(MPB_UNMAPPED, unmappedViews.stack);
  ensure(MPB_UNMAPPED_TOTAL, unmappedViews.total);
  ensureMpbBadgeIcons(instance,
    unmappedViews.stack.features.map(f => f.properties.unmappedByClass));
  ensureMpbTotalBadgeIcons(instance,
    unmappedViews.total.features.map(f => f.properties.unmapped));

  if (!instance.getLayer(DISTRICTS_FILL)) {
    instance.addLayer({
      id: DISTRICTS_FILL, type: 'fill', source: DISTRICTS,
      paint: {
        'fill-color': ['string', ['get', 'color'], '#cccccc'],
        'fill-opacity': fillOpacityExpression(fillAlpha),
      },
    });
    instance.addLayer({
      id: DISTRICTS_LINE, type: 'line', source: DISTRICTS,
      paint: {
        'line-color': ['case',
          ['boolean', ['feature-state', 'selected'], false], '#111827',
          ['boolean', ['feature-state', 'hover'], false], '#111827',
          '#ffffff'],
        'line-width': ['case',
          ['boolean', ['feature-state', 'selected'], false], 2.2,
          ['boolean', ['feature-state', 'hover'], false], 1.6,
          0.8],
        'line-opacity': 0.95,
      },
    });
  } else {
    instance.setPaintProperty(DISTRICTS_FILL, 'fill-opacity', fillOpacityExpression(fillAlpha));
  }

  if (!instance.getLayer(FMR_HALO)) {
    instance.addLayer({
      id: FMR_HALO, type: 'line', source: FMR_LINES,
      paint: {'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7},
      layout: {'line-cap': 'round', 'line-join': 'round'},
    });
    instance.addLayer({
      id: FMR_LINE, type: 'line', source: FMR_LINES,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 3.5, 14, 6],
        'line-opacity': 0.92,
      },
      layout: {'line-cap': 'round', 'line-join': 'round'},
    });
    instance.addLayer({
      id: FMR_POINT, type: 'circle', source: FMR_POINTS,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4.5, 14, 6.5],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
        'circle-opacity': 0.95,
      },
    });
    instance.addLayer({
      id: FMR_LINK, type: 'line', source: FMR_LINKS,
      paint: {
        'line-color': REPAIR_COLOR,
        'line-width': 2,
        'line-opacity': 0.85,
        'line-dasharray': [1.5, 1.5],
      },
      layout: {'line-cap': 'round'},
    });
    instance.addLayer({
      id: FMR_CORRECTED_POINT, type: 'circle', source: FMR_CORRECTED,
      paint: {
        'circle-color': REPAIR_COLOR,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5, 14, 7],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.4,
        'circle-opacity': 0.95,
      },
    });
    ensureMpbBoxIcon(instance);
    instance.addLayer({
      id: MPB_LINE_HALO, type: 'line', source: MPB_LINES,
      paint: {
        'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.7,
        'line-dasharray': [1.2, 1.4],
      },
      layout: {'line-cap': 'butt', 'line-join': 'round'},
    });
    instance.addLayer({
      id: MPB_LINE, type: 'line', source: MPB_LINES,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.4, 10, 2.4, 14, 3.5],
        'line-opacity': 0.9,
        'line-dasharray': [1.2, 1.4],
      },
      layout: {'line-cap': 'butt', 'line-join': 'round'},
    });
    instance.addLayer({
      id: MPB_POINT, type: 'symbol', source: MPB_POINTS,
      layout: {
        'icon-image': MPB_BOX_ICON_IMAGE,
        // Match FMR circle diameters (radius 2.5/4.5/6.5 → ~5/9/13 px on a 64px sprite).
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.09, 10, 0.15, 14, 0.22],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': 1,
      },
    });
    instance.addLayer({
      id: MPB_BADGE, type: 'symbol', source: MPB_UNMAPPED,
      layout: {
        'icon-image': ['concat', 'mpb-unmapped-badge-',
          ['get', 'house_only'], '-',
          ['get', 'nep_only'], '-',
          ['get', 'paired']],
        // Sprite content is 36-70% of the 128px canvas (1-3 tiers). Country
        // view stays compact; zoomed-in ramps higher so stacked counts are
        // readable at district scale. Larger than point boxes: it is a
        // district-level summary, not a building.
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.32, 10, 0.65, 14, 1.1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          0.92],
      },
    });
    instance.addLayer({
      id: MPB_BADGE_TOTAL, type: 'symbol', source: MPB_UNMAPPED_TOTAL,
      layout: {
        'icon-image': ['concat', 'mpb-unmapped-total-', ['get', 'unmapped']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.32, 10, 0.65, 14, 1.1],
        'icon-offset': [0, 0],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          0.92],
      },
    });
  }
  applyLayerFilters(instance, objects, types);
}

const LAYER_HINTS = {
  districts: 'Province-hued legislative district polygons',
  fmr: 'Printed FMR segment lines and endpoints',
  fmr_repairs: 'Dashed links from printed GPS to accepted corrections',
  mpb: 'Multi-purpose building title coordinates',
  mpb_unmapped: 'Per-district count badges for rows printing no coordinate',
};

function LayerSwatch({id}) {
  if (id === 'districts') {
    return <i className="congress-layer-swatch congress-layer-swatch-fill" aria-hidden="true"
      style={{background: 'linear-gradient(135deg, #5b8def, #3aa76d)'}}/>;
  }
  if (id === 'fmr') {
    return <i className="congress-layer-swatch congress-layer-swatch-line" aria-hidden="true"
      style={{background: DISTRICT_SEGMENT_CLASSES.paired.color}}/>;
  }
  if (id === 'fmr_repairs') {
    return <i className="congress-layer-swatch congress-layer-swatch-dash" aria-hidden="true"
      style={{backgroundImage: `repeating-linear-gradient(90deg, ${REPAIR_COLOR} 0 4px, transparent 4px 7px)`}}/>;
  }
  if (id === 'mpb_unmapped') {
    // Mini stacked chip: same House/NEP/Pair colors and stacking order the
    // map badges use, without numbers at legend size.
    return <i className="congress-layer-swatch congress-layer-swatch-stack" aria-hidden="true">
      {Object.values(MPB_POINT_CLASSES).map(style =>
        <b key={style.label} style={{background: style.color}}/>,
      )}
    </i>;
  }
  return <i className="congress-layer-swatch congress-layer-swatch-box" aria-hidden="true"
    style={{background: MPB_POINT_CLASSES.paired.color}}/>;
}

function LineKey({color, dashed = false}) {
  return <i className={`congress-layer-key-mark congress-layer-key-line${dashed ? ' is-dashed' : ''}`}
    aria-hidden="true"
    style={dashed
      ? {backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`}
      : {background: color}}/>;
}

function DotKey({color}) {
  return <i className="congress-layer-key-mark congress-layer-key-dot" aria-hidden="true"
    style={{background: color}}/>;
}

function BoxKey({color}) {
  return <i className="congress-layer-key-mark congress-layer-key-box" aria-hidden="true"
    style={{background: color}}/>;
}

function subtypeMark(objectId, subtypeId) {
  if (objectId === 'fmr') {
    return <LineKey color={DISTRICT_SEGMENT_CLASSES[subtypeId].color}/>;
  }
  if (objectId === 'mpb' || (objectId === 'mpb_unmapped' && subtypeId !== 'total')) {
    return <BoxKey color={MPB_POINT_CLASSES[subtypeId].color}/>;
  }
  if (objectId === 'mpb_unmapped' && subtypeId === 'total') {
    return <i className="congress-layer-key-mark congress-layer-key-badge" aria-hidden="true">Σ</i>;
  }
  if (subtypeId === 'link') return <LineKey color={REPAIR_COLOR} dashed/>;
  return <DotKey color={REPAIR_COLOR}/>;
}

function subtypeCount(objectId, subtypeId, fmrCounts, mpbCounts, repairCount, unmappedCounts) {
  if (objectId === 'fmr') return fmrCounts?.[subtypeId]?.segments;
  if (objectId === 'mpb') return mpbCounts?.[subtypeId]?.points;
  if (objectId === 'mpb_unmapped') return unmappedCounts?.[subtypeId];
  if (objectId === 'fmr_repairs' && subtypeId === 'point') return repairCount;
  return null;
}

function LayerTypeToggles({
  id, types, onToggleType, fmrCounts, mpbCounts, repairCount, unmappedCounts,
}) {
  const entries = CONGRESS_MAP_TYPE_OPTIONS[id];
  if (!entries?.length) return null;
  return <ul className="congress-layer-key" aria-label={`${id} type toggles`}>
    {entries.map(([subtypeId, label]) => {
      const checked = Boolean(types?.[id]?.[subtypeId]);
      const count = subtypeCount(id, subtypeId, fmrCounts, mpbCounts, repairCount, unmappedCounts);
      return <li key={subtypeId} className={checked ? 'is-on' : 'is-off'}>
        <label className="congress-layer-type">
          {subtypeMark(id, subtypeId)}
          <span>{label}</span>
          {count != null && <em>{count.toLocaleString('en-PH')}</em>}
          <input type="checkbox" checked={checked}
            aria-label={label}
            onChange={() => onToggleType(id, subtypeId)}/>
        </label>
      </li>;
    })}
    {id === 'mpb' &&
      <li className="congress-layer-key-note">
        <LineKey color={MPB_POINT_CLASSES.paired.color} dashed/>
        <span>Same-title links follow the building status color</span>
      </li>}
  </ul>;
}

function MapLayersPanel({
  objects, onChangeObjects, types, onChangeTypes,
  fillPct, onChangeFill, style, onChangeStyle, onResetView,
  fmrCounts = null, mpbCounts = null, repairCount = null, unmappedCounts = null,
}) {
  const [open, setOpen] = useState(true);
  const toggle = id => onChangeObjects({...objects, [id]: !objects[id]});
  const toggleType = (objectId, subtypeId) => onChangeTypes({
    ...types,
    [objectId]: {
      ...types[objectId],
      [subtypeId]: !types[objectId][subtypeId],
    },
  });
  const activeCount = CONGRESS_MAP_OBJECT_OPTIONS.filter(([id]) => objects[id]).length;

  return <div className={`congress-map-panel ${open ? 'is-open' : ''}`}>
    <div className="congress-map-panel-head">
      <button type="button" className="congress-map-panel-toggle" aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <strong>Layers</strong>
        <span>{activeCount}/{CONGRESS_MAP_OBJECT_OPTIONS.length}</span>
      </button>
      <div className="congress-map-panel-quick">
        <div className="congress-map-basemap" role="group" aria-label="Basemap">
          {[['light', 'Light'], ['dark', 'Dark']].map(([value, label]) =>
            <button key={value} type="button"
              className={style === value ? 'is-active' : ''}
              aria-pressed={style === value}
              onClick={() => onChangeStyle(value)}>{label}</button>)}
        </div>
        <button type="button" className="congress-map-reset" onClick={onResetView}>Reset</button>
      </div>
    </div>
    {open && <div className="congress-map-panel-body">
      <ul className="congress-layer-list" aria-label="Map layers">
        {CONGRESS_MAP_OBJECT_OPTIONS.map(([id, label]) =>
          <li key={id} className={objects[id] ? 'is-on' : 'is-off'}>
            <label className="congress-layer-row" title={LAYER_HINTS[id]}>
              <LayerSwatch id={id}/>
              <span className="congress-layer-copy">
                <strong>{label}</strong>
                <small>{LAYER_HINTS[id]}</small>
              </span>
              <input type="checkbox" checked={Boolean(objects[id])}
                aria-label={label}
                onChange={() => toggle(id)}/>
            </label>
            {id === 'districts' && objects.districts &&
              <div className="congress-layer-fill">
                <span>Fill opacity</span>
                <input type="range" min="0" max="100" step="5" value={fillPct}
                  aria-label="District fill opacity"
                  aria-valuetext={`${fillPct}%`}
                  onChange={event => onChangeFill(Number(event.target.value))}/>
                <em>{fillPct}%</em>
              </div>}
            {objects[id] && id !== 'districts' &&
              <LayerTypeToggles id={id} types={types} onToggleType={toggleType}
                fmrCounts={fmrCounts} mpbCounts={mpbCounts} repairCount={repairCount}
                unmappedCounts={unmappedCounts}/>}
          </li>)}
      </ul>
      <div className="congress-layer-actions">
        <button type="button" onClick={() => {
          onChangeObjects({...DEFAULT_CONGRESS_MAP_OBJECTS});
          onChangeTypes(structuredClone(DEFAULT_CONGRESS_MAP_TYPES));
        }}>Show all</button>
        <button type="button" onClick={() => onChangeObjects(Object.fromEntries(
          CONGRESS_MAP_OBJECT_OPTIONS.map(([id]) => [id, false])))}>
          Hide all</button>
      </div>
    </div>}
  </div>;
}

/**
 * One live map instance bound to a container div. The same stage component
 * can therefore mount twice — inline on the page and in the full-window
 * dialog — each with its own MapLibre instance sharing URL-driven state.
 */
function useCongressMapInstance(containerRef, error, syncRef, handlers) {
  const map = useRef(null);
  const hoverId = useRef(null);
  const [ready, setReady] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!containerRef.current || map.current || error) return undefined;
    const instance = new MapLibreMap({
      container: containerRef.current,
      style: STYLES.light,
      center: [122.5, 12.5],
      zoom: 5.2,
      attributionControl: {compact: true},
    });
    instance.addControl(new NavigationControl({showCompass: false}), 'bottom-right');
    instance.addControl(new ScaleControl({unit: 'metric'}), 'bottom-right');
    instance.on('error', e => handlersRef.current.onError?.(String(e?.error?.message ?? e)));

    const paint = () => {
      if (!instance.getStyle()) return;
      ensureMpbBoxIcon(instance);
      const payload = syncRef.current;
      if (payload) {
        syncLayers(instance, payload.districts, payload.fmrOverlay, payload.mpbOverlay,
          payload.fillAlpha, payload.objects, payload.types, payload.mpbBadges);
      }
      setReady(true);
    };
    instance.on('load', paint);
    instance.on('style.load', paint);

    const setCursor = value => {
      const canvas = instance.getCanvas?.();
      if (canvas?.style) canvas.style.cursor = value;
    };

    const pick = e => {
      const markers = instance.queryRenderedFeatures(e.point, {layers: MARKER_LAYERS});
      if (markers.length) {
        const recordId = markers[0].properties?.recordId;
        if (recordId) handlersRef.current.onSelectRecord?.(recordId);
        return;
      }
      // Catch-all badge (class stack or red total): open the district panel.
      const badges = instance.queryRenderedFeatures(e.point,
        {layers: [MPB_BADGE, MPB_BADGE_TOTAL]});
      if (badges.length) {
        const full = (syncRef.current?.districts?.features ?? [])
          .find(f => f.properties.district_id === badges[0].properties.districtId);
        if (full) handlersRef.current.onPickDistrict(full);
        return;
      }
      const hits = instance.queryRenderedFeatures(e.point, {layers: [DISTRICTS_FILL]});
      if (!hits.length) {
        handlersRef.current.onPickDistrict(null);
        return;
      }
      const full = (syncRef.current?.districts?.features ?? [])
        .find(f => f.properties.leg_id === hits[0].properties.leg_id);
      if (full) handlersRef.current.onPickDistrict(full);
    };
    instance.on('click', pick);

    instance.on('mousemove', DISTRICTS_FILL, e => {
      setCursor('pointer');
      const feature = e.features?.[0];
      if (!feature || feature.id == null) return;
      if (hoverId.current != null && hoverId.current !== feature.id) {
        instance.setFeatureState({source: DISTRICTS, id: hoverId.current}, {hover: false});
      }
      hoverId.current = feature.id;
      instance.setFeatureState({source: DISTRICTS, id: feature.id}, {hover: true});
      handlersRef.current.onHoverDistrict?.(feature.properties?.leg_id ?? null);
    });
    instance.on('mouseleave', DISTRICTS_FILL, () => {
      setCursor('');
      if (hoverId.current != null) {
        instance.setFeatureState({source: DISTRICTS, id: hoverId.current}, {hover: false});
        hoverId.current = null;
      }
      handlersRef.current.onHoverDistrict?.(null);
    });
    for (const layer of MARKER_LAYERS) {
      instance.on('mouseenter', layer, () => setCursor('pointer'));
      instance.on('mouseleave', layer, () => setCursor(''));
    }
    // Badge hover: class stack and red total both open the district panel.
    for (const layer of [MPB_BADGE, MPB_BADGE_TOTAL]) {
      instance.on('mouseenter', layer, () => setCursor('pointer'));
      instance.on('mouseleave', layer, () => setCursor(''));
    }

    map.current = instance;
    return () => {instance.remove(); map.current = null; setReady(false);};
  }, [error, containerRef, syncRef]);

  return [map, ready];
}

function MapStage({
  variant = 'inline', syncRef, style, fillAlpha, objects, types,
  districts, fmrOverlay, mpbOverlay, mpbBadges, markersPending,
  fmrIndex, mpbIndex, onSelectRecord, onExpand = null, onContract = null,
  objectsControls, typeControls, fillControl, styleControl,
  selectParam = null,
}) {
  const container = useRef(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const appliedStyle = useRef('light');
  const [map, ready] = useCongressMapInstance(container, false, syncRef, {
    onSelectRecord,
    onPickDistrict: setSelectedDistrict,
    onHoverDistrict: setHoveredId,
  });

  // A shareable selection (?select=<leg_id>) restores the district panel on
  // load. Clicking the map clears the param so the URL stays honest.
  useEffect(() => {
    if (selectedDistrict || !districts || !selectParam) return;
    const feature = districts.features.find(f => f.properties.leg_id === selectParam);
    if (feature) setSelectedDistrict(feature);
  }, [selectedDistrict, districts, selectParam]);

  useEffect(() => {
    if (!ready || !map.current) return;
    syncLayers(map.current, districts, fmrOverlay, mpbOverlay, fillAlpha, objects, types, mpbBadges);
  }, [ready, map, districts, fmrOverlay, mpbOverlay, fillAlpha, objects, types, mpbBadges]);

  useEffect(() => {
    if (!ready || !map.current || !container.current) return undefined;
    const instance = map.current;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    instance.resize();
    return () => observer.disconnect();
  }, [ready, map]);

  useEffect(() => {
    if (!ready || !map.current || appliedStyle.current === style) return;
    appliedStyle.current = style;
    map.current.setStyle(STYLES[style], {diff: false});
  }, [style, ready, map]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !districts) return;
    const wanted = selectedDistrict?.properties?.leg_id;
    const rendered = instance.querySourceFeatures(DISTRICTS)
      .find(f => f.properties?.leg_id === wanted);
    if (rendered?.id != null) {
      instance.setFeatureState({source: DISTRICTS, id: rendered.id}, {selected: true});
    }
    return () => {
      if (rendered?.id != null) {
        try {
          instance.setFeatureState({source: DISTRICTS, id: rendered.id}, {selected: false});
        } catch { /* source may have been rebuilt on style swap */ }
      }
    };
  }, [ready, map, districts, selectedDistrict]);

  const fmrSegmentCount = fmrOverlay.lines.features.length;
  const mpbPointCount = mpbOverlay.points.features.length;
  const repairCount = fmrOverlay.repairCount ?? 0;
  const unmappedCounts = useMemo(() => mpbUnmappedClassTotals(mpbBadges), [mpbBadges]);
  const unmappedTotal = unmappedCounts.total;
  const hoverLabel = hoveredId
    ? districts?.features.find(f => f.properties.leg_id === hoveredId)?.properties
    : null;

  return <div className={`congress-map-stage is-${variant}`}>
    <div ref={container} className="congress-map-canvas" role="application"
      aria-label="Interactive legislative districts with FMR and MPB markers"/>
    <MapLayersPanel
      objects={objects}
      onChangeObjects={objectsControls.set}
      types={types}
      onChangeTypes={typeControls.set}
      fillPct={Math.round(fillAlpha * 100)}
      onChangeFill={fillControl.set}
      style={style}
      onChangeStyle={styleControl.set}
      onResetView={() => {setSelectedDistrict(null); fitPhilippines(map.current);}}
      fmrCounts={fmrOverlay.counts}
      mpbCounts={mpbOverlay.counts}
      repairCount={repairCount}
      unmappedCounts={unmappedCounts}
    />
    {onExpand && variant === 'inline' &&
      <button type="button" className="congress-map-expand congress-map-expand-float"
        onClick={onExpand}>Full window ⤢</button>}
    {variant === 'full' &&
      <button type="button" className="congress-map-fullclose"
        onClick={onContract}>Exit full window ✕</button>}
    {!districts && <p className="fmr-map-warning" role="status">Loading district geometry…</p>}
    {hoverLabel && !selectedDistrict &&
      <p className="congress-map-hoverchip" role="status">
        {hoverLabel.jurisdiction} · {hoverLabel.district_label}
      </p>}
    {selectedDistrict &&
      <DistrictPanel feature={selectedDistrict} fmrIndex={fmrIndex} mpbIndex={mpbIndex}
        onClose={() => setSelectedDistrict(null)}/>}
    <div className="congress-map-status" role="status">
      {markersPending
        ? 'Loading FMR segments and MPB points…'
        : <>
            <span>{fmrSegmentCount.toLocaleString('en-PH')} FMR segments</span>
            <span>{mpbPointCount.toLocaleString('en-PH')} MPB points</span>
            {repairCount > 0 &&
              <span>{repairCount.toLocaleString('en-PH')} corrections</span>}
            {objects.mpb_unmapped && unmappedTotal > 0 &&
              <span>{unmappedTotal.toLocaleString('en-PH')} MPB rows without coordinates</span>}
          </>}
    </div>
  </div>;
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
  return <dialog ref={dialog} className="congress-map-fullscreen"
    onCancel={event => {event.preventDefault(); onClose();}}
    aria-label="Congress district map, full window">
    {children}
  </dialog>;
}

/**
 * Congress map tab: PSGC2LEG viz district polygons, nationwide FMR printed
 * segments (with dashed connectors to accepted corrections), and MPB title
 * points. Marker clicks bubble a recordId up to the parent RecordDrawer.
 * `full=1` opens the same map in a full-window dialog (its own instance,
 * shared URL-driven state).
 */
export default function CongressMap({
  route, fmrRecords = [], mpbRecords = [], fmrIndex = null, mpbIndex = null,
  onSelectRecord, selectedRecordId = null, markersPending = false,
}) {
  const params = route?.params ?? new URLSearchParams();
  const style = params.get('basemap') === 'dark' ? 'dark' : 'light';
  const fillAlpha = parseFillAlpha(params);
  const objects = useMemo(() => readCongressMapObjects(params), [params.get('objects')]);
  const types = useMemo(() => readCongressMapTypes(params), [params.get('types')]);
  const full = params.get('full') === '1';

  const [districts, setDistricts] = useState(null);
  const [error, setError] = useState('');

  const fmrOverlay = useMemo(() => fmrPrintedMapOverlay(fmrRecords), [fmrRecords]);
  const mpbOverlay = useMemo(() => mpbNationalMapOverlay(mpbRecords), [mpbRecords]);
  // Catch-all badges: MPB rows per district that print no title coordinate.
  const mpbBadges = useMemo(
    () => mpbUnmappedDistrictBadges(mpbIndex, districts), [mpbIndex, districts]);

  // Latest payload for whichever map instance (re)paints its basemap style.
  const syncRef = useRef(null);
  syncRef.current = {districts, fmrOverlay, mpbOverlay, fillAlpha, objects, types, mpbBadges};

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadJson(siteUrl('PSGC2LEG/viz/leg_districts.geojson'), controller.signal),
      loadJson(siteUrl('PSGC2LEG/viz/province_hues.json'), controller.signal),
      loadData('congress_district_map_2027.json', controller.signal),
    ]).then(([geojson, hues, mapArtifact]) => {
      const colored = colorDistrictFeatures(geojson, hues);
      const bridge = districtIdBridge(mapArtifact);
      setDistricts(decorateDistrictIds(colored, bridge));
    }).catch(event => {
      if (event.name !== 'AbortError') setError(event.message);
    });
    return () => controller.abort();
  }, []);

  const updateRoute = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key); else next.set(key, value);
    }
    window.location.hash = routeHref('map', Object.fromEntries(next), 'congress');
  };

  const objectsControls = {
    set: next => updateRoute({objects: congressMapObjectsParam(next)}),
  };
  const typeControls = {
    set: next => updateRoute({types: congressMapTypesParam(next)}),
  };
  const fillControl = {
    set: next => updateRoute({
      fill: next === Math.round(DEFAULT_FILL_ALPHA * 100) ? null : String(next),
    }),
  };
  const styleControl = {
    set: next => updateRoute({basemap: next === 'light' ? null : next}),
  };

  if (error && !districts) {
    return <section className="fmr-section" role="alert">
      <h1>District map could not load</h1><p>{error}</p>
      <button type="button" onClick={() => window.location.reload()}>Reload</button></section>;
  }

  const stageProps = {
    syncRef, style, fillAlpha, objects, types,
    districts, fmrOverlay, mpbOverlay, mpbBadges, markersPending,
    fmrIndex, mpbIndex, onSelectRecord,
    objectsControls, typeControls, fillControl, styleControl,
    selectParam: params.get('select'),
  };

  return <section className="congress-map" aria-label="Congress district map">
    <div className="congress-map-title">
      <div>
        <p className="fmr-eyebrow">FY2027 · Congress · Map</p>
        <h1>Where the documents place the work</h1>
      </div>
      <div className="congress-map-title-actions">
      <ShareLink/>
    </div>
    </div>
    {!full && <MapStage {...stageProps} variant="inline"
      onExpand={() => updateRoute({full: '1'})}/>}
    {full && <FullscreenMapDialog onClose={() => updateRoute({full: null})}>
      <MapStage {...stageProps} variant="full"
        onContract={() => updateRoute({full: null})}/>
    </FullscreenMapDialog>}
  </section>;
}
