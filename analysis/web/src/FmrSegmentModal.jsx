import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {STAGE_COLORS} from './fmrMapModel.js';
import {fmrRecordMapOverlay} from './fmrSegmentOverlay.js';

setWorkerUrl(workerUrl);

const BASEMAP = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const LINES = 'congress-fmr-record-lines';
const POINTS = 'congress-fmr-record-points';
const HALO = 'congress-fmr-record-halo';
const HOUSE = 'congress-fmr-record-house';
const NEP = 'congress-fmr-record-nep';
const DOTS = 'congress-fmr-record-dots';
const money = value => Number.isFinite(value)
  ? `₱${Math.round(value).toLocaleString('en-PH')}` : '—';

function addOverlay(instance, overlay) {
  if (!instance.getSource(LINES)) instance.addSource(LINES, {type: 'geojson', data: overlay.lines});
  if (!instance.getSource(POINTS)) instance.addSource(POINTS, {type: 'geojson', data: overlay.points});
  if (!instance.getLayer(HALO)) instance.addLayer({
    id: HALO, type: 'line', source: LINES,
    paint: {'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.82},
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  if (!instance.getLayer(HOUSE)) instance.addLayer({
    id: HOUSE, type: 'line', source: LINES,
    filter: ['==', ['get', 'stage'], 'house'],
    paint: {'line-color': STAGE_COLORS.house, 'line-width': 6, 'line-opacity': 0.9},
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  // A narrower dashed NEP line keeps both stages visible when exact candidate
  // geometry overlaps: the House line remains visible through each dash gap.
  if (!instance.getLayer(NEP)) instance.addLayer({
    id: NEP, type: 'line', source: LINES,
    filter: ['==', ['get', 'stage'], 'nep'],
    paint: {'line-color': STAGE_COLORS.nep, 'line-width': 3.5,
      'line-dasharray': [2, 1.5], 'line-opacity': 1},
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  if (!instance.getLayer(DOTS)) instance.addLayer({
    id: DOTS, type: 'circle', source: POINTS,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': 5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    },
  });
}

function fitOverlay(instance, overlay) {
  const coordinates = [
    ...overlay.lines.features.flatMap(feature => feature.geometry.coordinates),
    ...overlay.points.features.map(feature => feature.geometry.coordinates),
  ];
  if (!coordinates.length) return;
  if (coordinates.length === 1) {
    instance.jumpTo({center: coordinates[0], zoom: 14});
    return;
  }
  const bounds = new LngLatBounds();
  for (const coordinate of coordinates) bounds.extend(coordinate);
  instance.fitBounds(bounds, {padding: 55, maxZoom: 15, duration: 0});
}

export default function FmrSegmentModal({record, onClose}) {
  const dialog = useRef(null);
  const container = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const overlay = useMemo(() => fmrRecordMapOverlay(record), [record]);
  const drawable = overlay.lines.features.length || overlay.points.features.length;
  const fullMapParams = record.status === 'paired'
    ? {pair: record.id}
    : {project: overlay.stages[0]?.project.id};

  useEffect(() => openModalDialog(dialog.current), []);
  useEffect(() => {
    if (!container.current || !drawable) return undefined;
    let loaded = false;
    const instance = new MapLibreMap({
      container: container.current,
      style: BASEMAP,
      center: [122.5, 12.5],
      zoom: 5.2,
      attributionControl: {compact: true},
    });
    instance.addControl(new NavigationControl({showCompass: false}), 'top-right');
    instance.addControl(new ScaleControl({unit: 'metric'}), 'bottom-left');
    instance.on('load', () => {
      loaded = true;
      addOverlay(instance, overlay);
      fitOverlay(instance, overlay);
      instance.resize();
      setReady(true);
    });
    instance.on('error', event => {
      const message = event?.error?.message;
      if (message && !loaded) setError(String(message));
    });
    map.current = instance;
    return () => {instance.remove(); map.current = null;};
  }, [record.id]);

  return <dialog ref={dialog} className="fmr-dialog congress-fmr-map-dialog"
    aria-label={`FMR segment map for ${record.title}`}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <div><p className="fmr-eyebrow">Reviewed source coordinates</p><h2>FMR segment map</h2></div>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <h3>{record.title}</h3>
    <div className="congress-fmr-map-legend">
      {overlay.stages.map(({key, label, project, color}) => <span key={key}>
        <i style={{background: color}} />
        <strong>{label}</strong> · {project.segment_count ?? project.segments?.length ?? 0} section(s)
        {' '}· {money(project.amount_php)}
      </span>)}
    </div>
    {drawable ? <div className="congress-fmr-map-shell">
      <div ref={container} className="congress-fmr-map-canvas" role="application"
        aria-label="Interactive FMR segment overlay" />
      {!ready && !error && <p className="fmr-map-warning" role="status">Loading segment map…</p>}
      {error && <p className="fmr-map-warning" role="alert">The basemap could not load: {error}</p>}
    </div> : <p role="status" className="congress-fmr-map-empty">
      This source record has no complete segment or retained point geometry to draw.</p>}
    <p className="fmr-muted">Solid blue shows House geometry; dashed teal shows NEP geometry.
      Dots are retained reviewed source points. Segment lines show straight endpoint connections,
      not surveyed road alignment.</p>
    <div className="fmr-dialog-actions">
      <a className="secondary" href={routeHref('map', fullMapParams, 'fmr')}>Open in the full FMR map →</a>
      <button type="button" className="primary" onClick={onClose}>Close map</button>
    </div>
  </dialog>;
}
