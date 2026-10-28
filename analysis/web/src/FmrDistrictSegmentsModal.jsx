import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {DISTRICT_SEGMENT_CLASSES, fmrDistrictMapOverlay} from './fmrSegmentOverlay.js';

setWorkerUrl(workerUrl);

const BASEMAP = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const LINES = 'congress-fmr-district-lines';
const POINTS = 'congress-fmr-district-points';
const HALO = 'congress-fmr-district-halo';
const LINE_LAYER = 'congress-fmr-district-line';
const POINT_LAYER = 'congress-fmr-district-point';

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
  instance.fitBounds(bounds, {padding: 55, maxZoom: 13, duration: 0});
}

function addOverlay(instance, overlay, onSelectRecord) {
  instance.addSource(LINES, {type: 'geojson', data: overlay.lines});
  instance.addSource(POINTS, {type: 'geojson', data: overlay.points});
  instance.addLayer({
    id: HALO, type: 'line', source: LINES,
    paint: {'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.72},
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  instance.addLayer({
    id: LINE_LAYER, type: 'line', source: LINES,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 5.5, 14, 8],
      'line-opacity': 0.92,
    },
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  instance.addLayer({
    id: POINT_LAYER, type: 'circle', source: POINTS,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5, 14, 7],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.94,
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

export default function FmrDistrictSegmentsModal({label, records, onSelectRecord, onClose}) {
  const dialog = useRef(null);
  const container = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const overlay = useMemo(() => fmrDistrictMapOverlay(records), [records]);
  const drawable = overlay.lines.features.length || overlay.points.features.length;

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
      addOverlay(instance, overlay, onSelectRecord);
      fitOverlay(instance, overlay);
      instance.resize();
      setReady(true);
    });
    instance.on('error', event => {
      const message = event?.error?.message;
      if (message && !loaded) setError(String(message));
    });
    return () => instance.remove();
  }, [records]);

  return <dialog ref={dialog} className="fmr-dialog congress-fmr-map-dialog"
    aria-label={`All FMR segments for ${label}`}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <div><p className="fmr-eyebrow">FMR (Legislative) · district footprint</p>
        <h2>All project segments</h2></div>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <h3>{label}</h3>
    <div className="congress-fmr-map-legend" aria-label="Segment status legend">
      {Object.entries(DISTRICT_SEGMENT_CLASSES).map(([category, style]) => {
        const counts = overlay.counts[category];
        return <span key={category}>
          <i style={{background: style.color}} />
          <strong>{style.label}</strong> · {counts.records.toLocaleString('en-PH')} project row(s)
          {' '}· {counts.segments.toLocaleString('en-PH')} source segment(s)
        </span>;
      })}
    </div>
    <p className="fmr-muted congress-fmr-map-instruction">Click any segment or point to open its
      project evidence. Matched means a House–NEP comparison candidate; it does not certify project identity.</p>
    {drawable ? <div className="congress-fmr-map-shell">
      <div ref={container} className="congress-fmr-map-canvas" role="application"
        aria-label={`Interactive FMR segment overlay for ${label}`} />
      {!ready && !error && <p className="fmr-map-warning" role="status">Loading district segments…</p>}
      {error && <p className="fmr-map-warning" role="alert">The basemap could not load: {error}</p>}
    </div> : <p role="status" className="congress-fmr-map-empty">
      These project rows have no complete segments or retained point geometry to draw.</p>}
    <p className="fmr-muted">Lines are straight connections between reviewed source endpoints,
      not surveyed road alignments. Allocations remain counted once per source project regardless
      of segment count.</p>
    <div className="fmr-dialog-actions">
      <button type="button" className="primary" onClick={onClose}>Close map</button>
    </div>
  </dialog>;
}
