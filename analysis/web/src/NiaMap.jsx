import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {routeHref, readRoute} from './routes.js';
import {comparisonFilterLabels, money, statusLabels} from './niaModel.js';
import {locationFlagLabels, NIA_LOCATION_NOTE} from './niaLocationModel.js';
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
const HALO = 'nia-geo-halo';
const CLUSTER = 'nia-geo-clusters';
const CLUSTER_COUNT = 'nia-geo-cluster-count';
const UNCLUSTERED = 'nia-geo-unclustered';
const STATUS_COLORS = {
  paired: '#0e7490', house_only: '#b45309', nep_only: '#7c3aed', changed: '#be123c',
};
const PH_BOUNDS = [[117.5, 5.5], [126.5, 18.5]];

/** Point map over the AI-assisted geolocation layer (barangay/municipality anchors). */
export default function NiaMap({data, route}) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(null);
  const filter = route.params.get('filter') || 'located';
  const statusFilter = route.params.get('status') || 'all';
  const anchorFilter = route.params.get('anchor') || 'all';

  const records = data.geolocation?.records || [];
  const comparisonById = useMemo(() => {
    const map = new Map();
    for (const row of data.comparison || []) map.set(row.id, row);
    return map;
  }, [data]);

  const points = useMemo(() => records.filter(r => r.coordinates
    && (filter !== 'flagged' || (r.flags || []).length > 0)
    && (statusFilter === 'all' || (comparisonById.get(r.id)?.status || '').startsWith(statusFilter === 'changed' ? 'paired' : statusFilter))
    && (statusFilter !== 'changed' || (comparisonById.get(r.id)?.delta_php || 0) !== 0)
    && (anchorFilter === 'all' || r.coordinate_anchor === anchorFilter)
  ), [records, filter, statusFilter, anchorFilter, comparisonById]);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: points.map(r => {
      const row = comparisonById.get(r.id);
      return {
        type: 'Feature',
        geometry: {type: 'Point', coordinates: r.coordinates},
        properties: {
          id: r.id,
          title: row?.house?.title || row?.nep?.title || r.id,
          barangay: r.barangay, municipality: r.municipality, province: r.province,
          status: row?.status || 'unknown', delta_php: row?.delta_php ?? null,
          anchor: r.coordinate_anchor, flags: (r.flags || []).join(';'),
          amount: row?.house?.amount_php ?? row?.nep?.amount_php ?? null,
          psgc: r.psgc,
        },
      };
    }),
  }), [points, comparisonById]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new MapLibreMap({container: container.current, style: BASEMAP,
      bounds: PH_BOUNDS, fitBoundsOptions: {padding: 40}});
    mapRef.current = map;
    map.addControl(new NavigationControl({showCompass: false}));
    map.addControl(new ScaleControl());
    map.on('error', e => setError(e.error?.message || 'Map error'));
    map.on('load', () => {
      map.addSource(POINTS, {type: 'geojson', data: geojson, cluster: true,
        clusterRadius: 26, clusterMaxZoom: 9});
      map.addLayer({id: CLUSTER, type: 'circle', source: POINTS, filter: ['has', 'point_count'],
        paint: {'circle-color': '#0e7490', 'circle-opacity': 0.82,
          'circle-radius': ['step', ['get', 'point_count'], 11, 5, 15, 15, 20, 50, 26]}});
      map.addLayer({id: CLUSTER_COUNT, type: 'symbol', source: POINTS, filter: ['has', 'point_count'],
        layout: {'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12},
        paint: {'text-color': '#ffffff'}});
      map.addLayer({id: HALO, type: 'circle', source: POINTS, filter: ['!', ['has', 'point_count']],
        paint: {'circle-color': '#ffffff', 'circle-opacity': 0.7, 'circle-radius': 7}});
      map.addLayer({id: UNCLUSTERED, type: 'circle', source: POINTS, filter: ['!', ['has', 'point_count']],
        paint: {'circle-color': ['match', ['get', 'status'],
          'paired', STATUS_COLORS.paired, 'house_only', STATUS_COLORS.house_only,
          'nep_only', STATUS_COLORS.nep_only, STATUS_COLORS.changed],
          'circle-radius': 5.5, 'circle-stroke-width': 1.4, 'circle-stroke-color': '#ffffff'}});
      for (const layer of [UNCLUSTERED, CLUSTER]) {
        map.on('mouseenter', layer, e => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features[0];
          if (layer === UNCLUSTERED) setHover(f.properties);
        });
        map.on('mouseleave', layer, () => {map.getCanvas().style.cursor = ''; setHover(null);});
      }
      map.on('click', CLUSTER, e => {
        const clusterId = e.features[0].properties.cluster_id;
        map.getSource(POINTS).getClusterExpansionZoom(clusterId).then(zoom =>
          map.easeTo({center: e.features[0].geometry.coordinates, zoom}));
      });
      setReady(true);
    });
    return () => {map.remove(); mapRef.current = null;};
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource(POINTS);
    if (source && ready) source.setData(geojson);
  }, [geojson, ready]);

  const summary = data.geolocation?.summary || {};
  return <div className="fmr-section nia-map">
    <h2>NIA project map</h2>
    <p className="fmr-muted">{NIA_LOCATION_NOTE}</p>
    <div className="nia-map-controls">
      <label>Location <select value={filter} onChange={e => navigate(route, {filter: e.target.value})}>
        <option value="located">Located rows</option>
        <option value="flagged">Rows with review flags</option>
      </select></label>
      <label>Status <select value={statusFilter} onChange={e => navigate(route, {status: e.target.value})}>
        <option value="all">All statuses</option>
        {Object.entries(comparisonFilterLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Anchor <select value={anchorFilter} onChange={e => navigate(route, {anchor: e.target.value})}>
        <option value="all">All anchors</option>
        <option value="barangay">Barangay centroid</option>
        <option value="municipality">Municipality centroid</option>
      </select></label>
      <span className="fmr-muted">{points.length} of {summary.records || records.length} rows plotted ·
        {' '}{summary.located || 0} located ({summary.located_pct || 0}%) · {summary.unlocated || 0} unlocated</span>
    </div>
    <div className="nia-map-shell">
      <div ref={container} className="nia-map-canvas" role="region" aria-label="NIA project location map"/>
      {!ready && !error && <p className="fmr-map-warning" role="status">Loading map…</p>}
      {error && <p className="fmr-map-warning" role="alert">The basemap could not load: {error}</p>}
    </div>
    <div className="nia-map-legend" aria-label="Status legend">
      {[['paired', 'Candidate pair'], ['house_only', 'House only'], ['nep_only', 'NEP only']].map(([k, label]) =>
        <span key={k}><i style={{background: STATUS_COLORS[k]}}/>{label}</span>)}
      <span className="fmr-muted">Clustered points group nearby projects; click to expand.</span>
    </div>
    {hover && <aside className="nia-map-hover" role="status">
      <strong>{hover.title}</strong>
      <span>{[hover.barangay, hover.municipality, hover.province].filter(Boolean).join(', ')}</span>
      <span>{statusLabels[hover.status] || hover.status}{hover.amount ? ` · ${money(hover.amount)}` : ''}</span>
      {hover.flags && <span className="nia-flag-note">Flags: {hover.flags.split(';').map(f => locationFlagLabels[f] || f).join(', ')}</span>}
      <span className="fmr-muted">PSGC {hover.psgc} · {hover.anchor === 'municipality' ? 'municipality centroid' : 'barangay centroid'}</span>
    </aside>}
    <NiaLocationAnalysis data={data}/>
  </div>;
}
