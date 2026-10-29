import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {STAGE_COLORS} from './fmrMapModel.js';
import {
  REPAIR_COLOR, fmrRecordMapOverlay, fmrRecordRepairOverlay, overlayFrameCoordinates,
} from './fmrSegmentOverlay.js';

setWorkerUrl(workerUrl);

const BASEMAP = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const LINES = 'congress-fmr-record-lines';
const POINTS = 'congress-fmr-record-points';
const HALO = 'congress-fmr-record-halo';
const HOUSE = 'congress-fmr-record-house';
const NEP = 'congress-fmr-record-nep';
const DOTS = 'congress-fmr-record-dots';
const REPAIR_LINES = 'congress-fmr-record-repair-lines';
const REPAIR_LINKS = 'congress-fmr-record-repair-links';
const REPAIR_DOTS = 'congress-fmr-record-repair-dots';
const REPAIR_LAYERS = [REPAIR_LINES, REPAIR_LINKS, REPAIR_DOTS];
const km = value => Number.isFinite(value)
  ? `${value.toLocaleString('en-PH', {maximumFractionDigits: 2})} km` : '—';
const money = value => Number.isFinite(value)
  ? `₱${Math.round(value).toLocaleString('en-PH')}` : '—';

function addOverlay(instance, overlay, repair) {
  if (!instance.getSource(LINES)) instance.addSource(LINES, {type: 'geojson', data: overlay.lines});
  if (!instance.getSource(POINTS)) instance.addSource(POINTS, {type: 'geojson', data: overlay.points});
  if (!instance.getSource(REPAIR_LINES)) {
    instance.addSource(REPAIR_LINES, {type: 'geojson', data: repair.lines});
  }
  if (!instance.getSource(REPAIR_LINKS)) {
    instance.addSource(REPAIR_LINKS, {type: 'geojson', data: repair.connectors});
  }
  if (!instance.getSource(REPAIR_DOTS)) {
    instance.addSource(REPAIR_DOTS, {type: 'geojson', data: repair.printedPoints});
  }
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
  // Printed (pre-repair) section twin, drawn over the corrected line so the
  // original reading stays legible without hiding what was accepted.
  if (!instance.getLayer(REPAIR_LINES)) instance.addLayer({
    id: REPAIR_LINES, type: 'line', source: REPAIR_LINES,
    paint: {'line-color': REPAIR_COLOR, 'line-width': 3, 'line-opacity': 0.9,
      'line-dasharray': [2.5, 1.5]},
    layout: {'line-cap': 'round', 'line-join': 'round'},
  });
  // Dashed connector from each printed position to its accepted position.
  if (!instance.getLayer(REPAIR_LINKS)) instance.addLayer({
    id: REPAIR_LINKS, type: 'line', source: REPAIR_LINKS,
    paint: {'line-color': REPAIR_COLOR, 'line-width': 2, 'line-opacity': 0.85,
      'line-dasharray': [1.5, 1.5]},
    layout: {'line-cap': 'round'},
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
  if (!instance.getLayer(REPAIR_DOTS)) instance.addLayer({
    id: REPAIR_DOTS, type: 'circle', source: REPAIR_DOTS,
    paint: {
      'circle-color': REPAIR_COLOR,
      'circle-radius': 5.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    },
  });
}

function setFrame(instance, coordinates) {
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
  const [showPrinted, setShowPrinted] = useState(true);
  const [includePrintedInFrame, setIncludePrintedInFrame] = useState(false);
  const overlay = useMemo(() => fmrRecordMapOverlay(record), [record]);
  const repair = useMemo(() => fmrRecordRepairOverlay(record), [record]);
  const drawable = overlay.lines.features.length || overlay.points.features.length;
  const fullMapParams = record.status === 'paired'
    ? {pair: record.id}
    : {project: overlay.stages[0]?.project.id};
  // Fitting the printed twin by default would shrink a repaired 0.67 km section
  // to a speck when its printed reading sits ~1000 km away, so the frame follows
  // the corrected geometry until the reviewer asks for the full displacement.
  const frame = useMemo(() => overlayFrameCoordinates(overlay, repair,
    {includePrinted: includePrintedInFrame}), [overlay, repair, includePrintedInFrame]);

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
      addOverlay(instance, overlay, repair);
      setFrame(instance, frame);
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

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    for (const layer of REPAIR_LAYERS) {
      if (instance.getLayer(layer)) {
        instance.setLayoutProperty(layer, 'visibility', showPrinted ? 'visible' : 'none');
      }
    }
  }, [showPrinted, ready]);

  const refit = useCallback(() => {
    if (map.current && ready) setFrame(map.current, frame);
  }, [frame, ready]);

  useEffect(() => {refit();}, [refit]);

  const repairs = repair.stages.flatMap(stage => stage.points.map(point => ({...point, stage})));
  const maxShift = repairs.reduce((max, point) => Math.max(max, point.shiftKm ?? 0), 0);

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
      {repair.hasRepairs && showPrinted && <span>
        <i style={{background: REPAIR_COLOR}} />
        <strong>Printed before repair</strong> · dashed, linked to the accepted position
      </span>}
    </div>
    {drawable ? <div className="congress-fmr-map-shell">
      <div ref={container} className="congress-fmr-map-canvas" role="application"
        aria-label="Interactive FMR segment overlay" />
      {!ready && !error && <p className="fmr-map-warning" role="status">Loading segment map…</p>}
      {error && <p className="fmr-map-warning" role="alert">The basemap could not load: {error}</p>}
    </div> : <p role="status" className="congress-fmr-map-empty">
      This source record has no complete segment or retained point geometry to draw.</p>}

    {repair.hasRepairs && <section className="congress-repair-panel">
      <h4>Accepted coordinate repair</h4>
      <p className="fmr-muted">This is a <strong>resolved</strong> source defect, not an open
        analytic flag: the printed reading was accepted as an off-by-one digit repair after it
        geocoded into the title locality, so the review flags it carried were cleared. The raw
        source text is unchanged; the printed value below is retained from it.</p>
      <table className="congress-record-table">
        <thead><tr><th scope="col">Stage</th><th scope="col">Point</th>
          <th scope="col">Printed</th><th scope="col">Accepted</th>
          <th scope="col">Point shift</th><th scope="col">Rule</th></tr></thead>
        <tbody>{repairs.map(point => <tr key={`${point.stage.key}:${point.pointId}`}>
          <td>{point.stage.label}</td>
          <td><code>{point.pointId}</code></td>
          <td>{point.before[1]}, {point.before[0]}</td>
          <td>{point.after[1]}, {point.after[0]}</td>
          <td>{km(point.shiftKm)}</td>
          <td><code>{point.rules.join(', ')}</code></td>
        </tr>)}</tbody>
      </table>
      <div className="congress-repair-controls">
        <label><input type="checkbox" checked={showPrinted}
          onChange={event => setShowPrinted(event.target.checked)} />
          Show printed (pre-repair) geometry</label>
        {maxShift > 5 && <button type="button" className="secondary"
          onClick={() => setIncludePrintedInFrame(value => !value)}>
          {includePrintedInFrame
            ? 'Fit corrected geometry only'
            : `Fit printed position too (${km(maxShift)} away)`}</button>}
        <a className="secondary"
          href={routeHref('map', {...fullMapParams, coordBasis: 'normalized'}, 'fmr')}>
          Compare on the full map (Normalized basis) →</a>
      </div>
      <p className="fmr-muted">Point shift is the straight-line distance a single endpoint moved,
        and differs from the endpoint-span figures quoted in the review docs, which measure the
        whole printed section. Both are straight-line distances, not road lengths.</p>
    </section>}

    <p className="fmr-muted">Solid blue shows House geometry; dashed teal shows NEP geometry.
      Dots are retained reviewed source points.
      {repair.hasRepairs && <> Red dashed geometry is the printed pre-repair reading, linked to
        the accepted position by a dashed connector.</>}
      {' '}Segment lines show straight endpoint connections, not surveyed road alignment.</p>
    <div className="fmr-dialog-actions">
      <a className="secondary" href={routeHref('map', fullMapParams, 'fmr')}>Open in the full FMR map →</a>
      <button type="button" className="primary" onClick={onClose}>Close map</button>
    </div>
  </dialog>;
}
