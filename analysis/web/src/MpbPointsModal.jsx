import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {
  MPB_POINT_CLASSES, MPB_BOX_ICON_IMAGE, ensureMpbBoxIcon,
  mpbRecordMapOverlay, mpbDistrictMapOverlay, mpbOverlayFrame,
} from './mpbSegmentOverlay.js';

setWorkerUrl(workerUrl);

const BASEMAP = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const LINES = 'congress-mpb-lines';
const LINE_HALO = 'congress-mpb-line-halo';
const LINE_LAYER = 'congress-mpb-line';
const POINTS = 'congress-mpb-points';
const POINT_LAYER = 'congress-mpb-point';
const emptyFc = () => ({type: 'FeatureCollection', features: []});

function fitOverlay(instance, coordinates) {
  if (!coordinates.length) return;
  if (coordinates.length === 1) {
    instance.jumpTo({center: coordinates[0], zoom: 14});
    return;
  }
  const bounds = new LngLatBounds();
  for (const coordinate of coordinates) bounds.extend(coordinate);
  instance.fitBounds(bounds, {padding: 55, maxZoom: 13, duration: 0});
}

function addOverlay(instance, overlay, onSelectRecord) {
  ensureMpbBoxIcon(instance);
  instance.addSource(LINES, {type: 'geojson', data: overlay.lines || emptyFc()});
  instance.addSource(POINTS, {type: 'geojson', data: overlay.points});
  instance.addLayer({
    id: LINE_HALO, type: 'line', source: LINES,
    paint: {
      'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.72,
      'line-dasharray': [1.2, 1.4],
    },
    layout: {'line-cap': 'butt', 'line-join': 'round'},
  });
  instance.addLayer({
    id: LINE_LAYER, type: 'line', source: LINES,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 3.5, 14, 5],
      'line-opacity': 0.9,
      'line-dasharray': [1.2, 1.4],
    },
    layout: {'line-cap': 'butt', 'line-join': 'round'},
  });
  instance.addLayer({
    id: POINT_LAYER, type: 'symbol', source: POINTS,
    layout: {
      'icon-image': MPB_BOX_ICON_IMAGE,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.09, 10, 0.15, 14, 0.22],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': 1,
    },
  });
  const openRecord = event => {
    const recordId = event.features?.[0]?.properties?.recordId;
    if (recordId) onSelectRecord(recordId);
  };
  for (const layer of [LINE_LAYER, POINT_LAYER]) {
    instance.on('click', layer, openRecord);
    instance.on('mouseenter', layer, () => {instance.getCanvas().style.cursor = 'pointer';});
    instance.on('mouseleave', layer, () => {instance.getCanvas().style.cursor = '';});
  }
}

/**
 * Point map over retained MPB title coordinates. `record` renders one
 * explorer row's points; `records` renders a whole card's buildings with a
 * click-through into the row's evidence drawer. When one title prints several
 * coordinates, a thin line joins those same-title points west→east so the path
 * stays non-self-intersecting — never between unrelated buildings. Dots remain
 * printed title evidence, not surveyed positions.
 */
export default function MpbPointsModal({label, record = null, records = null, onSelectRecord,
  onClose}) {
  const dialog = useRef(null);
  const container = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const overlay = useMemo(() => record
    ? mpbRecordMapOverlay(record)
    : mpbDistrictMapOverlay(records ?? []), [record, records]);
  const drawable = overlay.points.features.length > 0;
  const frame = useMemo(() => mpbOverlayFrame(overlay), [overlay]);
  const key = record?.id ?? 'card';

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
      addOverlay(instance, overlay, onSelectRecord ?? (() => {}));
      fitOverlay(instance, frame);
      instance.resize();
      setReady(true);
    });
    instance.on('error', event => {
      const message = event?.error?.message;
      if (message && !loaded) setError(String(message));
    });
    return () => instance.remove();
  }, [key]);

  const counts = overlay.counts
    ?? {paired: {records: 0, points: 0}, house_only: {records: 0, points: 0}, nep_only: {records: 0, points: 0}};
  const withIssues = overlay.points.features.filter(feature =>
    (feature.properties.issues ?? []).length > 0).length;

  return <dialog ref={dialog} className="fmr-dialog congress-fmr-map-dialog congress-mpb-map-dialog"
    aria-label={`MPB map for ${label}`}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <div><p className="fmr-eyebrow">MPB (Legislative) · printed title coordinates</p>
        <h2>{record ? 'Building location' : 'All mapped buildings'}</h2></div>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <h3>{label}</h3>
    <div className="congress-fmr-map-legend" aria-label="Point status legend">
      {Object.entries(MPB_POINT_CLASSES).map(([category, style]) => {
        const entry = counts[category] ?? {records: 0, points: 0};
        return <span key={category}>
          <i style={{background: style.color}} />
          <strong>{style.label}</strong> · {entry.records.toLocaleString('en-PH')} project row(s)
          {' '}· {entry.points.toLocaleString('en-PH')} point(s)
        </span>;
      })}
    </div>
    <p className="fmr-muted congress-fmr-map-instruction">
      {record
        ? 'Each dot is a coordinate pair printed in the project title and parsed by the geolocation scan. Multiple pairs in the same title are joined west to east.'
        : 'Click any point or same-title link to open its project evidence. '}
      Points are printed title evidence, not surveyed positions; rows without a printed
      coordinate stay in the table and are simply not drawn.</p>
    {drawable ? <div className="congress-fmr-map-shell">
      <div ref={container} className="congress-fmr-map-canvas" role="application"
        aria-label={`Interactive MPB point overlay for ${label}`} />
      {!ready && !error && <p className="fmr-map-warning" role="status">Loading building map…</p>}
      {error && <p className="fmr-map-warning" role="alert">The basemap could not load: {error}</p>}
    </div> : <p role="status" className="congress-fmr-map-empty">
      This {record ? 'project row has' : 'card\'s rows have'} no retained title coordinate to draw.</p>}
    <p className="fmr-muted">{withIssues > 0 &&
      `${withIssues.toLocaleString('en-PH')} retained point(s) carry parse issues — open the record for the evidence. `}
      Matched pair means both amount stages are present on the comparison row; it does not certify
      project identity. Allocations stay counted once per row regardless of how many points it prints.</p>
    <div className="fmr-dialog-actions">
      <button type="button" className="primary" onClick={onClose}>Close map</button>
    </div>
  </dialog>;
}
