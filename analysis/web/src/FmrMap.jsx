import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {siteUrl} from './data.js';
import {routeHref} from './routes.js';
import {
  comparisonFilterLabels, comparisonRows, flagLabel, flagWhy, formatKm, money, methodLabels, pctChange,
  provenanceOptionLists, signedMoney, signedPct, statusLabels,
} from './fmrModel.js';
import {CoordinateProvenance} from './FmrProvenance.jsx';
import {
  STAGE_COLORS, PAIRED_COLOR, HUB_COLOR, INCREASE_COLOR, DECREASE_COLOR,
  MULTI_SEGMENT_COLOR, MARKER_RADIUS, COORD_BASIS_OPTIONS,
  MAP_OBJECT_OPTIONS, DEFAULT_MAP_OBJECTS,
  buildMapOverlay, filterOverlayByObjects, stackForFeature,
} from './fmrMapModel.js';
import './FmrMap.css';
import './Fmr.css';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};
const SOURCE_ID = 'fmr-segments';
const POINTS_ID = 'fmr-segment-points';
const HUBS_ID = 'fmr-shared-hubs';
const INC_ID = 'fmr-pair-increases';
const DEC_ID = 'fmr-pair-decreases';
const MULTI_ID = 'fmr-multi-segments';
const LINE_ID = 'fmr-segments-line';
const HALO_ID = 'fmr-segments-halo';
const DOT_ID = 'fmr-segments-dot';
const HUB_LAYER = 'fmr-shared-hub';
const INC_LAYER = 'fmr-pair-increase';
const DEC_LAYER = 'fmr-pair-decrease';
const MULTI_LAYER = 'fmr-multi-segment';

const MARKER_PAINT = {
  'circle-radius': MARKER_RADIUS,
  'circle-opacity': 0.95,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 2.2,
};
const INC_ICON = 'fmr-arrow-up';
const DEC_ICON = 'fmr-arrow-down';
const ARROW_ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, 0.85, 12, 1.15];

/** Filled chevron arrow with white stroke for MapLibre symbol layers. */
function arrowIconImage(direction, fill) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const tipY = direction === 'up' ? 10 : 54;
  const baseY = direction === 'up' ? 50 : 14;
  const wing = 22;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx + wing, baseY);
  ctx.lineTo(cx + 8, baseY);
  ctx.lineTo(cx + 8, direction === 'up' ? 56 : 8);
  ctx.lineTo(cx - 8, direction === 'up' ? 56 : 8);
  ctx.lineTo(cx - 8, baseY);
  ctx.lineTo(cx - wing, baseY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.stroke();
  return {
    width: size,
    height: size,
    data: new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer),
  };
}

function ensureArrowIcons(instance) {
  if (!instance.hasImage(INC_ICON)) instance.addImage(INC_ICON, arrowIconImage('up', INCREASE_COLOR));
  if (!instance.hasImage(DEC_ICON)) instance.addImage(DEC_ICON, arrowIconImage('down', DECREASE_COLOR));
}

const COORDINATE_OPTIONS = [
  ['normalized', 'Normalized'],
  ['needs_review', 'Needs review'],
  ['interpreted', 'Interpreted / flagged'],
  ['multi', 'Multiple segments'],
];
const COORD_SIDE_OPTIONS = [
  ['nep', 'NEP side'],
  ['house', 'House side'],
  ['both', 'Both sides'],
];
const CANDIDATE_STATUS_OPTIONS = Object.entries(comparisonFilterLabels)
  .filter(([k]) => !['increased', 'decreased', 'unchanged'].includes(k));
const FILTER_DEFAULTS = {
  q: '', region: '', status: '', coordinate: '', direction: '', method: '',
  coord_side: '', extraction: '', rule: '', review_flag: '', text_basis: '',
  coordBasis: 'reviewed',
};

function parseCoords(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed;} catch { /* keep */ }
  }
  return fallback;
}

function midpointCollection(collection) {
  return {
    type: 'FeatureCollection',
    features: collection.features.map(f => {
      const coords = parseCoords(f.properties.trueCoordinates, f.geometry.coordinates);
      const a = coords[0], b = coords[coords.length - 1];
      return {
        type: 'Feature', id: f.id, properties: f.properties,
        geometry: {type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]},
      };
    }),
  };
}

function syncLayers(instance, overlay) {
  if (!instance || !instance.isStyleLoaded()) return;
  const {lines, hubs, increases, decreases, multis} = overlay;
  const points = midpointCollection(lines);
  const ensure = (id, spec) => {if (!instance.getSource(id)) instance.addSource(id, spec); else instance.getSource(id).setData(spec.data);};
  ensure(SOURCE_ID, {type: 'geojson', data: lines, generateId: false});
  ensure(POINTS_ID, {type: 'geojson', data: points, generateId: false});
  ensure(HUBS_ID, {type: 'geojson', data: hubs, generateId: false});
  ensure(INC_ID, {type: 'geojson', data: increases, generateId: false});
  ensure(DEC_ID, {type: 'geojson', data: decreases, generateId: false});
  ensure(MULTI_ID, {type: 'geojson', data: multis || {type: 'FeatureCollection', features: []}, generateId: false});
  if (!instance.getLayer(HALO_ID)) {
    instance.addLayer({
      id: HALO_ID, type: 'line', source: SOURCE_ID,
      paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 6, 12, 11], 'line-opacity': 0.7},
      layout: {'line-cap': 'round', 'line-join': 'round'},
    });
  }
  if (!instance.getLayer(LINE_ID)) {
    instance.addLayer({
      id: LINE_ID, type: 'line', source: SOURCE_ID,
      paint: {'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 8, 3.2, 12, 6], 'line-opacity': 0.95},
      layout: {'line-cap': 'round', 'line-join': 'round'},
    });
  }
  if (!instance.getLayer(DOT_ID)) {
    instance.addLayer({
      id: DOT_ID, type: 'circle', source: POINTS_ID,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.2, 7, 2.2, 9, 0],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.85, 8, 0.55, 9, 0],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 0],
      },
    });
  }
  ensureArrowIcons(instance);
  const circleMarkers = [
    [HUB_LAYER, HUBS_ID, HUB_COLOR],
    [MULTI_LAYER, MULTI_ID, MULTI_SEGMENT_COLOR],
  ];
  for (const [layerId, sourceId, color] of circleMarkers) {
    if (!instance.getLayer(layerId)) {
      instance.addLayer({
        id: layerId, type: 'circle', source: sourceId,
        paint: {'circle-color': color, ...MARKER_PAINT},
      });
    }
  }
  const arrowMarkers = [
    [INC_LAYER, INC_ID, INC_ICON],
    [DEC_LAYER, DEC_ID, DEC_ICON],
  ];
  for (const [layerId, sourceId, icon] of arrowMarkers) {
    if (!instance.getLayer(layerId)) {
      instance.addLayer({
        id: layerId, type: 'symbol', source: sourceId,
        layout: {
          'icon-image': icon,
          'icon-size': ARROW_ICON_SIZE,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {'icon-opacity': 0.95},
      });
    }
  }
}

function Dialog({label, onClose, children, className = ''}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>{children}</dialog>;
}

function previewSource(source, title) {
  return {url: siteUrl(source.source_pdf), document: source.source_pdf.split('/').pop(), title, page: source.pdf_page};
}

function projectById(data, id) {
  if (!id) return null;
  return data.stages.nep.projects.find(p => p.id === id) || data.stages.house.projects.find(p => p.id === id) || null;
}

function MatchBadge({kind}) {
  if (kind === 'paired') return <span className="fmr-badge interpreted">{statusLabels.paired}</span>;
  if (kind === 'house_only') return <span className="fmr-badge review">{statusLabels.house_only}</span>;
  if (kind === 'nep_only') return <span className="fmr-badge review">{statusLabels.nep_only}</span>;
  return <span className="fmr-badge balanced">Single source</span>;
}

function ReviewFlagChips({projects}) {
  const entries = projects.flatMap(({side, project}) =>
    (project?.review_flags || []).map(flag => ({side, flag, project})));
  if (!entries.length) return null;
  return <div className="fmr-map-flags" aria-label="Open coordinate review flags">
    {entries.map(({side, flag}) => {
      const tip = `${flagWhy(flag)} (${flag})`;
      return <span key={`${side}:${flag}`} className="fmr-map-flag" title={tip} tabIndex={0} aria-label={`${side}: ${flagLabel(flag)}. ${flagWhy(flag)}`}>
        <span className="fmr-map-flag-side">{side}</span>
        {flagLabel(flag)}
      </span>;
    })}
  </div>;
}

function ObjectsFilter({objects, onChange}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const selected = MAP_OBJECT_OPTIONS.filter(([id]) => objects[id]).length;
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {if (root.current && !root.current.contains(e.target)) setOpen(false);};
    const onKey = e => {if (e.key === 'Escape') setOpen(false);};
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey);};
  }, [open]);
  const toggle = id => onChange({...objects, [id]: !objects[id]});
  return <div className="fmr-objects-filter" ref={root}>
    <span className="fmr-objects-label">Objects</span>
    <button type="button" className="fmr-objects-trigger" aria-haspopup="listbox" aria-expanded={open}
      onClick={() => setOpen(v => !v)}>
      {selected === MAP_OBJECT_OPTIONS.length ? 'All objects' : `${selected} of ${MAP_OBJECT_OPTIONS.length} selected`}
    </button>
    {open && <div className="fmr-objects-menu" role="listbox" aria-label="Map objects" aria-multiselectable="true">
      <div className="fmr-objects-actions">
        <button type="button" onClick={() => onChange({...DEFAULT_MAP_OBJECTS})}>Select all</button>
        <button type="button" onClick={() => onChange(Object.fromEntries(MAP_OBJECT_OPTIONS.map(([id]) => [id, false])))}>Clear</button>
      </div>
      {MAP_OBJECT_OPTIONS.map(([id, label]) => <label key={id} className="fmr-objects-option" role="option" aria-selected={objects[id]}>
        <input type="checkbox" checked={Boolean(objects[id])} onChange={() => toggle(id)}/>
        <span>{label}</span>
      </label>)}
    </div>}
  </div>;
}

function MapSelectionCard({data, feature, stack, stackIndex, onStack, onClose, onPdf, onProvenance, onShowNepTitle, showNepTitle}) {
  const p = feature.properties;
  const paired = p.matchKind === 'paired' || p.objectKind === 'paired' || p.objectKind === 'pair_increase' || p.objectKind === 'pair_decrease';
  const house = projectById(data, p.houseId);
  const nep = projectById(data, p.nepId);
  const solo = !paired ? projectById(data, p.projectId) : null;
  const reviewProjects = paired
    ? [{side: 'NEP', project: nep}, {side: 'House', project: house}].filter(r => r.project)
    : [{side: p.stageLabel || (p.stageKey === 'house' ? 'House' : 'NEP'), project: solo || house || nep}].filter(r => r.project);
  const primaryHref = paired && p.pairId
    ? routeHref('compare', {view: 'projects', pair: p.pairId})
    : routeHref(p.stageKey === 'house' || house ? 'house' : 'nep', {node: p.projectId});
  const trueCoords = parseCoords(p.trueCoordinates, feature.geometry.coordinates);
  const endpoints = Array.isArray(trueCoords?.[0])
    ? trueCoords.map(c => c.map(v => Number(v).toFixed(6)).join(', ')).join(' ↔ ')
    : '—';

  return <aside className="fmr-map-info" role="dialog" aria-label="Segment details">
    <div className="fmr-map-info-head">
      <strong>{showNepTitle && p.nepTitle ? p.nepTitle : (p.houseTitle || p.title)}</strong>
      <MatchBadge kind={paired ? 'paired' : p.matchKind}/>
    </div>
    {p.titleDiffers && !showNepTitle && <button type="button" className="fmr-map-chip" onClick={onShowNepTitle}>NEP title differs</button>}
    {showNepTitle && p.titleDiffers && <p className="fmr-muted">Showing NEP title. House title: {p.houseTitle}</p>}
    <ReviewFlagChips projects={reviewProjects}/>
    <small>{p.regionKey}{p.segmentIndex != null ? ` · Segment ${p.segmentIndex}` : ''}
      {p.segmentCount > 1 ? ` · ${p.segmentCount} segments` : ''}
      {p.distanceKm != null ? ` · ${formatKm(p.distanceKm)}` : ''}
      {p.coordinateBasis === 'normalized' ? ' · normalized (pre-review)' : ' · reviewed'}
      {p.offset ? ' · display offset (shared printed location marked)' : ''}
      {paired && p.method ? ` · ${methodLabels[p.method] || p.method}` : ''}
      {p.objectKind === 'pair_increase' ? ' · amount increase' : ''}
      {p.objectKind === 'pair_decrease' ? ' · amount decrease' : ''}
      {p.objectKind === 'multi_segment' ? ' · multi-segment project' : ''}</small>

    {stack.length > 1 && <div className="fmr-map-stack" aria-label="Overlapping projects at this location">
      <span>{stackIndex + 1} of {stack.length} at this printed location</span>
      <button type="button" disabled={stackIndex === 0} onClick={() => onStack(stackIndex - 1)}>Previous</button>
      <button type="button" disabled={stackIndex >= stack.length - 1} onClick={() => onStack(stackIndex + 1)}>Next</button>
    </div>}

    <dl>
      {paired ? <>
        <dt>NEP allocation</dt><dd>{money(p.nepPhp)}</dd>
        <dt>House allocation</dt><dd>{money(p.housePhp)}</dd>
        <dt>Paired difference</dt><dd>{signedMoney(p.deltaPhp)} · {signedPct(pctChange(p.housePhp, p.nepPhp))}</dd>
      </> : <>
        <dt>Allocation</dt><dd>{money(p.amountPhp)}</dd>
        <dt>Stage</dt><dd>{p.stageLabel}</dd>
      </>}
      <dt>Printed endpoints</dt><dd>{endpoints}</dd>
      <dt>Coordinates</dt><dd>{[p.nepStatus, p.houseStatus].filter(Boolean).map(s => s === 'needs_review' ? 'Needs review' : 'Normalized').join(' · ') || (p.status === 'needs_review' ? 'Needs review' : 'Normalized')}</dd>
      {(house || nep) && <><dt>PSGC vs title</dt><dd>{[house, nep].filter(Boolean).map(proj => proj.location_agreement?.replaceAll('_', ' ') || '—').join(' · ')}</dd></>}
    </dl>

    <div className="fmr-map-info-actions">
      <a className="primary" href={primaryHref}>{paired ? 'Open in Compare →' : 'Open in source tree →'}</a>
      {paired && <>
        <a href={routeHref('nep', {node: p.nepId})}>NEP tree</a>
        <a href={routeHref('house', {node: p.houseId})}>House tree</a>
      </>}
      {nep?.source && <button type="button" onClick={() => onPdf(previewSource(nep.source, 'DBM NEP'))}>NEP PDF p. {nep.source.pdf_page}</button>}
      {house?.source && <button type="button" onClick={() => onPdf(previewSource(house.source, 'House GAB'))}>House PDF p. {house.source.pdf_page}</button>}
      {!paired && projectById(data, p.projectId)?.source && <button type="button" onClick={() => onPdf(previewSource(projectById(data, p.projectId).source, p.stageLabel))}>PDF p. {projectById(data, p.projectId).source.pdf_page}</button>}
      {nep && <button type="button" onClick={() => onProvenance(nep)}>NEP provenance</button>}
      {house && <button type="button" onClick={() => onProvenance(house)}>House provenance</button>}
      {!paired && !nep && !house && projectById(data, p.projectId) && <button type="button" onClick={() => onProvenance(projectById(data, p.projectId))}>Provenance</button>}
      <button type="button" onClick={onClose}>Close</button>
    </div>
  </aside>;
}

export default function FmrMap({data}) {
  const container = useRef(null);
  const map = useRef(null);
  const overlayRef = useRef({
    lines: {type: 'FeatureCollection', features: []},
    hubs: {type: 'FeatureCollection', features: []},
    increases: {type: 'FeatureCollection', features: []},
    decreases: {type: 'FeatureCollection', features: []},
    multis: {type: 'FeatureCollection', features: []},
  });
  const appliedStyle = useRef('light');
  const [style, setStyle] = useState('light');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [objects, setObjects] = useState({...DEFAULT_MAP_OBJECTS});
  const [selected, setSelected] = useState(null);
  const [stackIndex, setStackIndex] = useState(0);
  const [showNepTitle, setShowNepTitle] = useState(false);
  const [pdfSource, setPdfSource] = useState(null);
  const [provenanceProject, setProvenanceProject] = useState(null);

  const setFilter = (key, value) => setFilters(prev => ({...prev, [key]: value}));
  const clearFilters = () => {
    setFilters({...FILTER_DEFAULTS});
    setObjects({...DEFAULT_MAP_OBJECTS});
    setSelected(null);
  };

  const allProjects = useMemo(
    () => comparisonRows(data).flatMap(r => [r.nep, r.house].filter(Boolean)),
    [data],
  );
  const provenance = useMemo(() => provenanceOptionLists(allProjects), [allProjects]);
  const overlay = useMemo(() => filterOverlayByObjects(buildMapOverlay(data, filters), objects), [data, filters, objects]);
  overlayRef.current = overlay;
  const stack = selected ? stackForFeature(overlay.lines, selected) : [];
  const active = stack[stackIndex] || selected;
  const advancedOpen = ['direction', 'method', 'coord_side', 'extraction', 'rule', 'review_flag', 'text_basis']
    .some(k => filters[k]);

  const pickFeature = (hit, lines) => {
    if (hit.layer.id === HUB_LAYER) {
      return lines.find(f => f.properties.hubKey === hit.properties.hubKey);
    }
    if (hit.layer.id === MULTI_LAYER) {
      return lines.find(f => f.properties.projectId === hit.properties.projectId)
        || {
          type: 'Feature',
          id: hit.id,
          properties: hit.properties,
          geometry: hit.geometry,
        };
    }
    if (hit.layer.id === INC_LAYER || hit.layer.id === DEC_LAYER) {
      return lines.find(f => f.properties.pairId === hit.properties.pairId && f.properties.objectKind === 'paired')
        || lines.find(f => f.properties.segmentId === hit.properties.segmentId);
    }
    return lines.find(f => f.id === hit.id
      || f.properties.segmentId === hit.properties.segmentId
      || String(f.id) === String(hit.properties.segmentId));
  };

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: STYLES.light,
      center: [122.5, 12.5],
      zoom: 5.2,
      attributionControl: {compact: true},
    });
    instance.addControl(new NavigationControl({showCompass: false}), 'top-right');
    instance.addControl(new ScaleControl({unit: 'metric'}), 'bottom-left');
    const onLoad = () => {
      syncLayers(instance, overlayRef.current);
      setReady(true);
    };
    const onStyle = () => syncLayers(instance, overlayRef.current);
    instance.on('load', onLoad);
    instance.on('style.load', onStyle);
    instance.on('error', e => setFailed(String(e?.error?.message ?? e)));

    const pickLayers = [LINE_ID, DOT_ID, HUB_LAYER, INC_LAYER, DEC_LAYER, MULTI_LAYER];
    const pick = e => {
      const hits = instance.queryRenderedFeatures(e.point, {layers: pickLayers});
      if (!hits.length) return;
      const feature = pickFeature(hits[0], overlayRef.current.lines.features);
      if (!feature) return;
      setSelected(feature);
      setStackIndex(0);
      setShowNepTitle(false);
    };
    for (const id of pickLayers) {
      instance.on('click', id, pick);
      instance.on('mouseenter', id, () => {instance.getCanvas().style.cursor = 'pointer';});
      instance.on('mouseleave', id, () => {instance.getCanvas().style.cursor = '';});
    }
    map.current = instance;
    return () => {instance.remove(); map.current = null; setReady(false);};
  }, []);

  useEffect(() => {
    if (!ready || !map.current || appliedStyle.current === style) return;
    appliedStyle.current = style;
    map.current.setStyle(STYLES[style], {diff: false});
  }, [style, ready]);

  useEffect(() => {
    syncLayers(map.current, overlay);
  }, [ready, overlay]);

  const fitSignature = `${overlay.summary.drawn}:${JSON.stringify(filters)}:${JSON.stringify(objects)}`;
  const lastFit = useRef('');
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    const bounds = new LngLatBounds();
    let count = 0;
    for (const feature of overlay.lines.features) {
      for (const c of parseCoords(feature.properties.trueCoordinates, feature.geometry.coordinates)) {bounds.extend(c); count++;}
    }
    if (count) instance.fitBounds(bounds, {padding: 60, maxZoom: 9, duration: 600});
  }, [ready, fitSignature, overlay]);

  const select = (key, label, options) => options?.length ? <label>{label}<select aria-label={label} value={filters[key] || ''} onChange={e => setFilter(key, e.target.value)}>
    <option value="">All {label.toLowerCase()}</option>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label> : null;

  return <section className="fmr-map" aria-label="FMR segment map">
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Geographic view</p><h1>FMR segment map</h1>
      <p>Default geometry uses Reviewed coordinates (accepted digit repairs). Switch to Normalized to compare pre-review printed pairs. Unmatched overlaps are offset; markers share one size.</p></div></div>
    <div className="fmr-filters">
      <label>Search<input type="search" placeholder="Title, place, source ID or flag" value={filters.q} onChange={e => setFilter('q', e.target.value)}/></label>
      <label>Region<select value={filters.region} onChange={e => setFilter('region', e.target.value)}>
        <option value="">All regions</option>{data.regions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <ObjectsFilter objects={objects} onChange={setObjects}/>
      <label>Coordinates<select aria-label="Coordinate basis" value={filters.coordBasis} onChange={e => setFilter('coordBasis', e.target.value)}>
        {COORD_BASIS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {select('status', 'Candidate status', CANDIDATE_STATUS_OPTIONS)}
      {select('coordinate', 'Coordinate status', COORDINATE_OPTIONS)}
      <button type="button" onClick={clearFilters}>Clear filters</button>
    </div>
    <details className="fmr-method" open={advancedOpen || undefined}>
      <summary>Provenance and advanced filters</summary>
      <div className="fmr-filters">
        {select('direction', 'Amount direction', [['increased', 'Increased pairs'], ['decreased', 'Decreased pairs'], ['unchanged', 'Unchanged pairs']])}
        {select('method', 'Match method', Object.entries(methodLabels))}
        {select('coord_side', 'Source side', COORD_SIDE_OPTIONS)}
        {select('extraction', 'Extraction flag', provenance.extraction)}
        {select('rule', 'Interpretation rule', provenance.rules)}
        {select('review_flag', 'Remaining review flag', provenance.review)}
        {select('text_basis', 'Coordinate text basis', provenance.text_basis)}
      </div>
      <p className="fmr-muted">Provenance filters match the selected source side (default: either side). Candidate identity and coordinate interpretation are separate checks — same ledger as Compare → project records.</p>
    </details>
    <div className="fmr-result-bar"><span>{overlay.summary.drawn.toLocaleString()} overlays · {overlay.summary.paired.toLocaleString()} paired · {overlay.summary.offset.toLocaleString()} offset · {(overlay.summary.visible_hubs ?? overlay.summary.hubs).toLocaleString()} shared · {(overlay.summary.visible_increases ?? overlay.summary.increases).toLocaleString()} ↑ · {(overlay.summary.visible_decreases ?? overlay.summary.decreases).toLocaleString()} ↓ · {(overlay.summary.visible_multis ?? overlay.summary.multis).toLocaleString()} multi · {overlay.summary.candidates.toLocaleString()} candidates · {filters.coordBasis === 'normalized' ? 'normalized' : 'reviewed'}</span>
      <span className="fmr-map-controls"><label>Basemap<select aria-label="Basemap style" value={style} onChange={e => setStyle(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <span className="fmr-map-legend"><i style={{background: STAGE_COLORS.nep}}/> NEP only</span>
      <span className="fmr-map-legend"><i style={{background: STAGE_COLORS.house}}/> House only</span>
      <span className="fmr-map-legend"><i style={{background: PAIRED_COLOR}}/> Paired</span>
      <span className="fmr-map-legend"><i style={{background: HUB_COLOR, borderRadius: '50%', width: 10, height: 10}}/> Shared</span>
      <span className="fmr-map-legend"><span className="fmr-map-legend-arrow" style={{color: INCREASE_COLOR}} aria-hidden="true">▲</span> Increase</span>
      <span className="fmr-map-legend"><span className="fmr-map-legend-arrow" style={{color: DECREASE_COLOR}} aria-hidden="true">▼</span> Decrease</span>
      <span className="fmr-map-legend"><i style={{background: MULTI_SEGMENT_COLOR, borderRadius: '50%', width: 10, height: 10}}/> Multi-segment</span>
      </span></div>
    <div className="fmr-map-shell">
      <div ref={container} className="fmr-map-canvas" aria-label="Interactive FMR segment map" role="application"/>
      {failed && <p className="fmr-map-warning" role="alert">Basemap tiles failed to load: {failed}. Segment overlays come from this site’s data and stay available once the style loads.</p>}
      {!ready && !failed && <p className="fmr-map-warning" role="status">Loading basemap…</p>}
      {active && <MapSelectionCard
        data={data} feature={active} stack={stack} stackIndex={stackIndex}
        onStack={setStackIndex}
        onClose={() => {setSelected(null); setShowNepTitle(false);}}
        onPdf={setPdfSource}
        onProvenance={setProvenanceProject}
        onShowNepTitle={() => setShowNepTitle(true)}
        showNepTitle={showNepTitle}
      />}
    </div>
    <p className="fmr-muted">Purple lines are exact-coordinate candidate pairs drawn once. Unmatched overlaps offset ~45&nbsp;m with a shared pair marker on the true midpoint. Reviewed is the accepted geometry (including PSGC-supported off-by-one digit repairs). Normalized undoes those repairs so you can compare the pre-review printed pairs. Multi-segment markers sit at the centroid of a project’s drawable sections.</p>

    {pdfSource && <Dialog label="FMR PDF source" className="fmr-pdf-dialog" onClose={() => setPdfSource(null)}>
      <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={pdfSource} onClose={() => setPdfSource(null)} closeLabel="Close PDF" downloadOriginal/>
      </Suspense>
    </Dialog>}
    {provenanceProject && <Dialog label="Coordinate provenance" className="fmr-provenance-dialog" onClose={() => setProvenanceProject(null)}>
      <div className="fmr-dialog-heading"><h2>{provenanceProject.title}</h2><button type="button" onClick={() => setProvenanceProject(null)}>Close</button></div>
      <div className="fmr-dialog-body">
        <CoordinateProvenance project={provenanceProject}/>
        {provenanceProject.psgc?.length > 0 && <div className="fmr-psgc">
          <h3>PSGC administrative location</h3>
          <p className="fmr-muted">{provenanceProject.location_agreement?.replaceAll('_', ' ')}
            {provenanceProject.title_locality ? ` · Title: ${[provenanceProject.title_locality.municipality, provenanceProject.title_locality.province].filter(Boolean).join(', ')}` : ''}</p>
          <table className="fmr-psgc-table"><caption className="sr-only">PSGC points</caption>
            <thead><tr><th scope="col">Point</th><th scope="col">Coordinates</th><th scope="col">PSGC location</th><th scope="col">Verdict</th></tr></thead>
            <tbody>{provenanceProject.psgc.map(pt => <tr key={`${pt.point_id}-${pt.kind || 'printed'}`} className={pt.kind === 'candidate_repair' ? 'fmr-psgc-repair' : undefined}>
              <td>{pt.point_id.split(':').slice(-1)[0]}{pt.kind === 'candidate_repair' ? ' · repair' : ''}</td>
              <td><code>{pt.coordinates ? pt.coordinates.join(', ') : '—'}</code></td>
              <td>{pt.where || pt.note || '—'}</td>
              <td>{pt.verdict}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </Dialog>}
  </section>;
}
