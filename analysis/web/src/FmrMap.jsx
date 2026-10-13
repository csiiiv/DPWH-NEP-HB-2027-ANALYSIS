import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Map as MapLibreMap, NavigationControl, ScaleControl, LngLatBounds, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {openModalDialog} from './modalLifecycle.js';
import {siteUrl} from './data.js';
import {routeHref, readRoute} from './routes.js';
import ShareLink from './ShareLink.jsx';
import {readMapState, patchMapParams, mapObjectsParam} from './fmrMapRoute.js';
import {buildFmrRedFlags, RED_FLAG_RULES, RED_FLAG_MEASUREMENT_NOTE} from './fmrRedFlags.js';
import {
  comparisonFilterLabels, comparisonRows, flagLabel, flagWhy, formatKm, money, methodLabels, pctChange,
  provenanceOptionLists, signedMoney, signedPct, statusLabels,
} from './fmrModel.js';
import {CoordinateProvenance} from './FmrProvenance.jsx';
import {
  STAGE_COLORS, PAIRED_COLOR, HUB_COLOR, INCREASE_COLOR, DECREASE_COLOR,
  MULTI_SEGMENT_COLOR, RED_FLAG_COLOR, COORD_BASIS_OPTIONS,
  MAP_OBJECT_OPTIONS, DEFAULT_MAP_OBJECTS,
  buildMapOverlay, filterOverlayByObjects, stackForFeature, drawableSegments, pointCoordinates,
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
const FLAGS_ID = 'fmr-review-flags';
const LINE_ID = 'fmr-segments-line';
const HALO_ID = 'fmr-segments-halo';
const DOT_ID = 'fmr-segments-dot';
const HUB_LAYER = 'fmr-shared-hub';
const INC_LAYER = 'fmr-pair-increase';
const DEC_LAYER = 'fmr-pair-decrease';
const MULTI_LAYER = 'fmr-multi-segment';
const INSERTION_LAYER = 'fmr-house-only-insertion';
const NEP_LAYER = 'fmr-nep-only';
const PAIRED_LAYER = 'fmr-paired';
const FLAG_LAYER = 'fmr-review-flag';

// Match the original circle diameters: 11px, 18px, and 26px at zooms 4, 8, 12.
const MARKER_ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 4, 11 / 52, 8, 18 / 52, 12, 26 / 52];
const ICONS = {nep: 'fmr-trash', house: 'fmr-peso', paired: 'fmr-linked', shared: 'fmr-shared',
  increase: 'fmr-arrow-up', decrease: 'fmr-arrow-down', flag: 'fmr-red-flag', review: 'fmr-review-search'};
const countIcon = count => `fmr-segment-count-${count}`;
const circlePath = (x, y, r) => `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`;

/** The legend and MapLibre sprites share the same artwork. */
function markerArtwork(kind, count = 3) {
  const shape = (d, fill, stroke = '#ffffff', width = 3, halo = false) => ({d, fill, stroke, width, halo});
  if (kind === 'house') return {shapes: [], text: '₱', color: STAGE_COLORS.house, fontSize: 52, outline: true};
  if (kind === 'nep') return {shapes: [
    shape('M17 22H47L44 55H20Z', STAGE_COLORS.nep),
    shape('M12 18H52M24 17V10H40V17', 'none', STAGE_COLORS.nep, 5, true),
    shape('M27 29V47M37 29V47', 'none', '#ffffff', 3),
  ]};
  if (kind === 'paired') return {shapes: [
    shape('M28 35L20 43A9 9 0 0 1 7 30L20 17A9 9 0 0 1 33 30', 'none', PAIRED_COLOR, 6, true),
    shape('M36 29L44 21A9 9 0 0 1 57 34L44 47A9 9 0 0 1 31 34M23 41L41 23', 'none', PAIRED_COLOR, 6, true),
  ]};
  if (kind === 'shared') return {shapes: [
    shape('M16 15H48L32 49Z', 'none', HUB_COLOR, 5, true),
    ...[[16,15],[48,15],[32,49]].map(([x,y]) => shape(circlePath(x,y,8), HUB_COLOR)),
  ]};
  if (kind === 'multi') return {shapes: [shape(circlePath(32,32,25), MULTI_SEGMENT_COLOR)],
    text: String(count), color: '#ffffff', fontSize: String(count).length > 2 ? 24 : 34};
  if (kind === 'review') return {shapes:[shape(circlePath(27,26,17), 'none', '#0369a1', 6, true), shape('M40 39L57 56', 'none', '#0369a1', 7, true)]};
  if (kind === 'flag') return {shapes: [
    shape('M14 56V9', 'none', RED_FLAG_COLOR, 5, true),
    shape('M17 10H53L43 22L53 34H17Z', RED_FLAG_COLOR),
  ]};
  return {shapes: [shape(kind === 'increase'
    ? 'M32 8L54 46H40V56H24V46H10Z'
    : 'M32 56L54 18H40V8H24V18H10Z', kind === 'increase' ? INCREASE_COLOR : DECREASE_COLOR)]};
}

function markerIconImage(kind, count) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = ctx.lineCap = 'round';
  const art = markerArtwork(kind, count);
  for (const {d, fill, stroke, width, halo} of art.shapes) {
    const path = new Path2D(d);
    if (halo) {ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width + 4; ctx.stroke(path);}
    if (fill !== 'none') {ctx.fillStyle = fill; ctx.fill(path);}
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(path);
  }
  if (art.text) {
    ctx.font = `bold ${art.fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (art.outline) {ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.strokeText(art.text, 32, 34);}
    ctx.fillStyle = art.color; ctx.fillText(art.text, 32, 34);
  }
  return {width: 64, height: 64, data: new Uint8Array(ctx.getImageData(0, 0, 64, 64).data.buffer)};
}

function MarkerIcon({kind, count}) {
  const art = markerArtwork(kind, count);
  return <svg className="fmr-map-legend-icon" viewBox="0 0 64 64" aria-hidden="true">
    {art.shapes.map(({d, fill, stroke, width, halo}, i) => <React.Fragment key={i}>
      {halo && <path d={d} fill="none" stroke="#ffffff" strokeWidth={width+4} strokeLinejoin="round" strokeLinecap="round"/>}
      <path d={d} fill={fill} stroke={stroke} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round"/>
    </React.Fragment>)}
    {art.text && <text x="32" y="34" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize={art.fontSize}
      fill={art.color} stroke={art.outline ? '#ffffff' : undefined} strokeWidth={art.outline ? 5 : undefined} paintOrder="stroke">{art.text}</text>}
  </svg>;
}

function ensureMarkerIcons(instance, multis) {
  for (const [kind, id] of Object.entries(ICONS)) {
    if (!instance.hasImage(id)) instance.addImage(id, markerIconImage(kind));
  }
  for (const count of new Set((multis?.features || []).map(f => f.properties.segmentCount))) {
    if (!instance.hasImage(countIcon(count))) instance.addImage(countIcon(count), markerIconImage('multi', count));
  }
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


function parseCoords(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed;} catch { /* keep */ }
  }
  return fallback;
}

function syncLayers(instance, overlay) {
  // The style can accept overlays while its basemap tiles are still loading.
  if (!instance?.getStyle()) return;
  const {lines, hubs, increases, decreases, multis, flags} = overlay;
  const points = overlay.markers || {type: 'FeatureCollection', features: []};
  const ensure = (id, spec) => {if (!instance.getSource(id)) instance.addSource(id, spec); else instance.getSource(id).setData(spec.data);};
  ensure(SOURCE_ID, {type: 'geojson', data: lines, generateId: false});
  ensure(POINTS_ID, {type: 'geojson', data: points, generateId: false});
  ensure(HUBS_ID, {type: 'geojson', data: hubs, generateId: false});
  ensure(INC_ID, {type: 'geojson', data: increases, generateId: false});
  ensure(DEC_ID, {type: 'geojson', data: decreases, generateId: false});
  ensure(MULTI_ID, {type: 'geojson', data: multis || {type: 'FeatureCollection', features: []}, generateId: false});
  ensure(FLAGS_ID, {type: 'geojson', data: flags || {type: 'FeatureCollection', features: []}, generateId: false});
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
      filter: ['==', ['get', 'matchKind'], 'single'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.2, 7, 2.2, 9, 0],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.85, 8, 0.55, 9, 0],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 0],
      },
    });
  }
  ensureMarkerIcons(instance, multis);
  const symbolMarkers = [
    [NEP_LAYER, POINTS_ID, ICONS.nep, ['==', ['get', 'matchKind'], 'nep_only']],
    [INSERTION_LAYER, POINTS_ID, ICONS.house, ['==', ['get', 'matchKind'], 'house_only']],
    [PAIRED_LAYER, POINTS_ID, ICONS.paired, ['==', ['get', 'matchKind'], 'paired']],
    [HUB_LAYER, HUBS_ID, ICONS.shared],
    [INC_LAYER, INC_ID, ICONS.increase],
    [DEC_LAYER, DEC_ID, ICONS.decrease],
    [MULTI_LAYER, MULTI_ID, ['concat', 'fmr-segment-count-', ['to-string', ['get', 'segmentCount']]], null, [22, 22]],
    [FLAG_LAYER, FLAGS_ID, ['case', ['==', ['get','objectKind'],'coordinate_review'], ICONS.review, ICONS.flag], null, [22, -24]],
  ];
  for (const [layerId, sourceId, icon, filter, offset = [0, 0]] of symbolMarkers) {
    if (!instance.getLayer(layerId)) {
      instance.addLayer({
        id: layerId, type: 'symbol', source: sourceId,
        ...(filter ? {filter} : {}),
        layout: {
          'icon-image': icon, 'icon-size': MARKER_ICON_SIZE, 'icon-offset': layerId === FLAG_LAYER ? ['case', ['==', ['get','objectKind'],'coordinate_review'], ['literal',[-22,-24]], ['literal',offset]] : offset,
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
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
  if (kind === 'red_flag') return <span className="fmr-badge review">Analytical red flags</span>;
  if (kind === 'coordinate_review') return <span className="fmr-badge review">Coordinate review</span>;
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
        <ObjectIcon object={id}/>
        <span>{label}</span>
      </label>)}
    </div>}
  </div>;
}

function ObjectIcon({object}) {
  const segmentColor = {nep_only: STAGE_COLORS.nep, house_only: STAGE_COLORS.house, paired: PAIRED_COLOR}[object];
  if (segmentColor) return <svg className="fmr-map-legend-icon" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M8 32H56" stroke={segmentColor} strokeWidth="10" strokeLinecap="round"/>
  </svg>;
  const kind = {nep_marker:'nep', house_marker:'house', paired_marker:'paired', shared_marker:'shared',
    pair_increase:'increase', pair_decrease:'decrease', multi_segment:'multi', red_flag:'flag', coordinate_review:'review'}[object];
  return <MarkerIcon kind={kind}/>;
}

function MapSelectionCard({data, feature, stack, stackIndex, onStack, onClose, onPdf, onProvenance, onZoom, reviewThresholds = {}}) {
  const p = feature.properties;
  const [detailsOpen,setDetailsOpen] = useState(false);
  useEffect(() => setDetailsOpen(false),[feature.id]);
  const paired = p.matchKind === 'paired' || ['paired','pair_increase','pair_decrease'].includes(p.objectKind);
  const sourceProjects = paired
    ? [{key:'nep',project:projectById(data,p.nepId)},{key:'house',project:projectById(data,p.houseId)}].filter(item => item.project)
    : [{key:p.stageKey || (p.houseId ? 'house' : 'nep'),project:projectById(data,p.projectId)}].filter(item => item.project);
  const thresholdKey = JSON.stringify(reviewThresholds);
  const assessments = useMemo(() => new Map(['nep','house'].flatMap(key => buildFmrRedFlags(data,key,{
    shortMeters:reviewThresholds.rf_short_m,longKm:reviewThresholds.rf_long_km,
    costMultiple:reviewThresholds.rf_cost_multiple,increasePercent:reviewThresholds.rf_increase_pct,
  }).rows.map(row => [row.id,row]))),[data,thresholdKey]);
  const findings = sourceProjects.flatMap(({key,project}) => (assessments.get(project.id)?.flags || [])
    .filter(flag => flag.id !== 'coordinate_review').map(flag => ({...flag,sourceKey:key,project})));
  const primaryProject = sourceProjects.find(item => item.key === 'house')?.project || sourceProjects[0]?.project;
  const titleLocation = primaryProject?.title_locality;
  const locality = [titleLocation?.municipality,titleLocation?.province].filter(Boolean).join(', ');
  const number = value => value == null ? 'Unavailable' : value.toLocaleString('en-PH',{maximumFractionDigits:1});
  const reviewCount = sourceProjects.reduce((count,{project}) => count + (project.review_flags || []).length,0);
  const needsReview = sourceProjects.some(({project}) => project.status === 'needs_review' || (project.review_flags || []).length);
  const primaryHref = paired && p.pairId ? routeHref('compare',{view:'projects',pair:p.pairId})
    : routeHref(sourceProjects[0]?.key || 'house',{node:p.projectId});
  const coords = parseCoords(p.trueCoordinates,feature.geometry.coordinates);
  const endpoints = Array.isArray(coords?.[0]) ? coords : [coords];
  return <>
    <aside className="fmr-map-info" role="region" aria-label="Selected map project">
      <div className="fmr-map-info-head"><span className="fmr-eyebrow">{paired ? 'Candidate pair' : data.stages[sourceProjects[0]?.key]?.label || p.stageLabel} · {p.regionKey}</span>
        <button className="fmr-map-close" type="button" onClick={onClose} aria-label="Close project selection">×</button></div>
      <h2 className="fmr-map-project-title">{p.houseTitle || p.title}</h2>
      <div className="fmr-map-project-meta"><MatchBadge kind={['red_flag','coordinate_review'].includes(p.objectKind) ? p.objectKind : paired ? 'paired' : p.matchKind}/>
        <span>{p.segmentIndex != null ? `Section ${p.segmentIndex}` : `${p.segmentCount ?? 0} section(s)`}{p.distanceKm != null ? ` · ${formatKm(p.distanceKm)} endpoint span` : ''}</span></div>
      {locality && <p className="fmr-map-locality"><strong>Location in title:</strong> {locality}</p>}
      <dl className="fmr-map-budget">
        {paired ? <><dt>NEP</dt><dd>{money(p.nepPhp)}</dd><dt>House</dt><dd>{money(p.housePhp)}</dd>
          <dt>Candidate change</dt><dd>{signedMoney(p.deltaPhp)} <small>{signedPct(pctChange(p.housePhp,p.nepPhp))}</small></dd></>
          : <><dt>Project allocation</dt><dd>{money(p.amountPhp)}</dd></>}
      </dl>
      <section className={`fmr-map-citizen-review ${findings.length || needsReview ? 'has-findings' : ''}`} aria-label="Reasons to examine this project">
        <h3>{findings.length || needsReview ? 'What deserves a closer look?' : 'What do the checks show?'}</h3>
        {findings.length > 0 && <ul>{findings.slice(0,3).map(flag => <li key={`${flag.project.id}:${flag.id}`}><strong>{paired ? `${flag.sourceKey==='house'?'House':'NEP'} · ` : ''}{RED_FLAG_RULES.find(rule=>rule.id===flag.id)?.label}</strong><p>{flag.detail}</p></li>)}</ul>}
        {needsReview && <div className="fmr-map-coordinate-summary"><strong>Unresolved coordinates · {reviewCount || 1} finding(s)</strong>
          {sourceProjects.flatMap(({key,project}) => (project.review_flags || []).map(flag => ({key,flag}))).slice(0,2).map(({key,flag}) => <p key={`${key}:${flag}`}>{paired ? `${key==='house'?'House':'NEP'}: ` : ''}{flagWhy(flag)}</p>)}
        </div>}
        {!findings.length && !needsReview && <p>No flags under these screening rules. This does not establish value for money or confirm project completion.</p>}
        {(findings.length > 3 || reviewCount > 2) && <button onClick={() => setDetailsOpen(true)}>See all {findings.length + reviewCount} findings &amp; evidence →</button>}
        {(findings.length > 0 || needsReview) && <p className="fmr-map-small-note">These are reasons to verify the source, project scope and location—not proof of waste or wrongdoing.</p>}
      </section>
      <section className="fmr-map-spending" aria-label="Project scale and allocation comparison">
        <h3>Project scale &amp; allocation</h3>
        {paired && <p className="fmr-map-small-note">{sourceProjects.map(({key,project}) => {const assessed=assessments.get(project.id);return `${key==='house'?'House':'NEP'}: ${assessed?.meters == null ? 'incomplete geometry' : `${number(assessed.meters)} m endpoint span`} across ${project.segment_count} section(s)`;}).join(' · ')}</p>}
        {sourceProjects.map(({key,project}) => {const assessed=assessments.get(project.id);return <div key={project.id} className="fmr-map-scale-source">
          {paired && <strong>{key==='house'?'House':'NEP'}</strong>}
          <dl>{!paired && <><dt>Whole-project endpoint span</dt><dd>{assessed?.meters == null ? 'Incomplete geometry' : `${number(assessed.meters)} m`}<small>{project.segment_count} section(s){assessed?.shortestMeters != null ? ` · shortest ${number(assessed.shortestMeters)} m` : ''}</small></dd></>}
            <dt>Allocation / endpoint meter</dt><dd>{assessed?.proxyPhpPerMeter == null ? 'Not calculated' : `${money(assessed.proxyPhpPerMeter)} / m`}</dd>
            <dt>Compared with peers</dt><dd>{assessed?.peerMultiple == null ? 'Unavailable' : `${number(assessed.peerMultiple)}× peer median`}
              {assessed?.peerMultiple != null && <small>{assessed.benchmark.scope} · {assessed.benchmark.count} eligible projects</small>}</dd>
          </dl>
          {assessed?.proxyPhpPerMeter == null && <p className="fmr-map-small-note">A reliable proxy needs complete, positive, resolved geometry without repeated sections.</p>}
        </div>})}
        <p className="fmr-map-small-note">{p.coordinateBasis==='normalized' ? 'Metrics use reviewed coordinates; the map shows pre-review coordinates. ' : ''}Straight-line endpoint spans, not measured road lengths. The per-meter figure is an allocation proxy, not construction cost; peers may have different scope or terrain.</p>
      </section>
      <p className="fmr-map-small-note"><strong>Budget record, not reported spending.</strong> Assessing value also needs the actual road scope, contractor, completion status and who benefits; those are not established by this annex.</p>
      <div className="fmr-map-quick-sources" aria-label="Check printed project allocations">{sourceProjects.map(({key,project}) => project.source && <button key={project.id} onClick={() => onPdf(previewSource(project.source,data.stages[key].label))}>Check {key==='house'?'House':'NEP'} PDF · p. {project.source.pdf_page}</button>)}</div>
      {stack.length > 1 && <div className="fmr-map-stack" aria-label="Overlapping projects at this location"><span>Project {stackIndex+1} of {stack.length}</span>
        <button disabled={stackIndex===0} onClick={() => onStack(stackIndex-1)}>Previous</button><button disabled={stackIndex>=stack.length-1} onClick={() => onStack(stackIndex+1)}>Next</button></div>}
      <div className="fmr-map-info-actions"><a className="primary" href={primaryHref}>{paired ? 'Open in Compare →' : 'Open source record →'}</a>
        <button onClick={() => onZoom(feature)}>Zoom to project</button><button onClick={() => setDetailsOpen(true)}>Details &amp; evidence</button></div>
    </aside>
    {detailsOpen && <Dialog label="Map project details" className="fmr-map-details-dialog" onClose={() => setDetailsOpen(false)}>
      <div className="fmr-dialog-heading"><h2>Project details &amp; evidence</h2><button onClick={() => setDetailsOpen(false)}>Close details</button></div>
      <div className="fmr-dialog-body">
        <h3>{p.houseTitle || p.title}</h3>
        {p.titleDiffers && <p><strong>NEP title:</strong> {p.nepTitle}</p>}
        {paired && <p>Provisional counterpart · {methodLabels[p.method] || p.method}. Verify project identity and scope in Compare.</p>}
        <section aria-label="Source documents"><h3>Source records</h3><div className="fmr-map-source-cards">{sourceProjects.map(({key,project}) => <article key={project.id}>
          <h4>{data.stages[key].label}</h4><p>{money(project.amount_php)} · {project.segment_count} section(s)</p><small>{project.id}</small>
          <div className="fmr-map-info-actions"><a href={routeHref(key,{node:project.id})}>Source tree →</a>
            {project.source && <button onClick={() => onPdf(previewSource(project.source,data.stages[key].label))}>PDF p. {project.source.pdf_page}</button>}
            <button onClick={() => onProvenance(project)}>Coordinate provenance</button></div>
        </article>)}</div></section>
        <section aria-label="Review findings"><h3>Review findings</h3>
          {needsReview && <><h4>Unresolved coordinates</h4><ReviewFlagChips projects={sourceProjects.map(({key,project}) => ({side:key==='house'?'House':'NEP',project}))}/></>}
          {findings.length > 0 ? <><p className="fmr-muted">{RED_FLAG_MEASUREMENT_NOTE} These are review leads, not determinations of impropriety.</p>
            <ul className="fmr-map-findings">{findings.map(flag => <li key={`${flag.project.id}:${flag.id}`}><strong>{flag.sourceKey==='house'?'House':'NEP'} · {RED_FLAG_RULES.find(rule => rule.id===flag.id)?.label}</strong><p>{flag.detail}</p></li>)}</ul>
            <div className="fmr-map-info-actions">{sourceProjects.map(({key,project}) => <a key={project.id} href={routeHref('analysis',{view:'red_flags',stage:key,rf_project:project.id,...reviewThresholds})}>Review {key==='house'?'House':'NEP'} in Analysis →</a>)}</div>
          </> : <p>No analytical leads under the current screening thresholds.</p>}
          {!needsReview && <p>No unresolved coordinate findings.</p>}
        </section>
        <details className="fmr-method"><summary>Selected map geometry</summary>
          <p>{p.coordinateBasis==='normalized'?'Normalized (before accepted digit repairs)':'Reviewed (accepted coordinate repairs)'}{p.offset ? ' · line display offset at a shared printed location' : ''}.</p>
          <p className="fmr-muted">Endpoint spans are straight-line distances. Project allocation is counted once across its sections.</p>
          <ol>{endpoints.map((point,index) => <li key={index}><code>{Array.isArray(point) ? point.map(value=>Number(value).toFixed(6)).join(', ') : 'Unavailable'}</code></li>)}</ol>
          <p>Province agreement and repair history are available in each source’s Coordinate provenance.</p>
        </details>
      </div>
    </Dialog>}
  </>;
}

export default function FmrMap({data, route}) {
  const routeKey = route?.params.toString() || '';
  const container = useRef(null);
  const map = useRef(null);
  const overlayRef = useRef({
    lines: {type: 'FeatureCollection', features: []},
    hubs: {type: 'FeatureCollection', features: []},
    increases: {type: 'FeatureCollection', features: []},
    decreases: {type: 'FeatureCollection', features: []},
    multis: {type: 'FeatureCollection', features: []},
    flags: {type: 'FeatureCollection', features: []},
  });
  const appliedStyle = useRef('light');
  const {filters,objects,style} = useMemo(() => readMapState(route?.params),[routeKey]);
  const updateRoute = patch => {
    const current = readRoute();
    const params = patchMapParams(current.params,patch);
    window.location.hash = routeHref('map',Object.fromEntries(params),'fmr');
  };
  const setStyle = value => updateRoute({basemap:value});
  const setObjects = value => updateRoute({objects:mapObjectsParam(value)});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [selected, setSelected] = useState(null);
  const [stackIndex, setStackIndex] = useState(0);
  const [pdfSource, setPdfSource] = useState(null);
  const [provenanceProject, setProvenanceProject] = useState(null);

  useEffect(() => {setSelected(null);setStackIndex(0);},[routeKey]);
  const setFilter = (key,value) => updateRoute({[key]:value});
  const clearFilters = () => {window.location.hash = routeHref('map',{},'fmr');setSelected(null);};

  const allProjects = useMemo(
    () => comparisonRows(data).flatMap(r => [r.nep, r.house].filter(Boolean)),
    [data],
  );
  const provenance = useMemo(() => provenanceOptionLists(allProjects), [allProjects]);
  const overlay = useMemo(() => filterOverlayByObjects(buildMapOverlay(data, filters), objects), [data, filters, objects]);
  overlayRef.current = overlay;
  const stack = selected ? stackForFeature(['red_flag','coordinate_review'].includes(selected.properties.objectKind) ? overlay.flags : overlay.selectionLines, selected) : [];
  const active = stack[stackIndex] || selected;
  const advancedOpen = ['direction', 'method', 'coord_side', 'extraction', 'rule', 'review_flag', 'text_basis']
    .some(k => filters[k]);

  const pickFeature = (hit, lines) => {
    if (hit.layer.id === FLAG_LAYER) return {type: 'Feature', id: hit.id, properties: hit.properties, geometry: hit.geometry};
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

    const pickLayers = [LINE_ID, DOT_ID, HUB_LAYER, INC_LAYER, DEC_LAYER, MULTI_LAYER, INSERTION_LAYER, NEP_LAYER, PAIRED_LAYER, FLAG_LAYER];
    const pick = e => {
      const hits = instance.queryRenderedFeatures(e.point, {layers: pickLayers});
      if (!hits.length) return;
      const feature = pickFeature(hits[0], overlayRef.current.selectionLines?.features || []);
      if (!feature) return;
      setSelected(feature);
      setStackIndex(0);
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
    for (const feature of overlay.flags?.features || []) {bounds.extend(feature.geometry.coordinates); count++;}
    for (const feature of overlay.markers?.features || []) {bounds.extend(feature.geometry.coordinates); count++;}
    if (count) instance.fitBounds(bounds, {padding: 60, maxZoom: 9, duration: 600});
  }, [ready, fitSignature, overlay]);

  useEffect(() => {
    if (!ready || (!filters.project && !filters.pair)) return;
    const feature = filters.focus === 'red_flag'
      ? overlay.flags.features.find(f => f.properties.objectKind === 'red_flag' && f.properties.projectId === filters.project)
      : overlay.selectionLines.features.find(f => !filters.project || [f.properties.projectId,f.properties.nepId,f.properties.houseId].includes(filters.project));
    setSelected(feature || overlay.flags.features[0] || null);setStackIndex(0);
  },[ready,overlay,filters.project,filters.pair,filters.focus]);

  const zoomToProject = feature => {
    const instance = map.current;
    if (!instance) return;
    const p = feature.properties;
    const paired = p.matchKind === 'paired' || ['paired','pair_increase','pair_decrease'].includes(p.objectKind);
    const ids = paired ? [p.nepId,p.houseId] : [p.projectId];
    const bounds = new LngLatBounds();
    let count = 0;
    for (const project of ids.map(id => projectById(data,id)).filter(Boolean)) {
      const segments = drawableSegments(project,filters.coordBasis);
      const coordinates = segments.length ? segments.flatMap(segment => segment.coordinates)
        : (project.points || []).map(point => pointCoordinates(point,filters.coordBasis)).filter(Boolean);
      for (const coordinate of coordinates) {
        if (coordinate.every(Number.isFinite) && Math.abs(coordinate[0])<=180 && Math.abs(coordinate[1])<=90) {bounds.extend(coordinate);count++;}
      }
    }
    if (!count) return;
    const width = container.current.clientWidth;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    instance.fitBounds(bounds,{padding:{top:60,bottom:60,left:60,right:mobile ? 60 : Math.min(450,width*.5)},maxZoom:15,duration:600});
    if (mobile) container.current.scrollIntoView({behavior:'smooth',block:'center'});
  };

  const select = (key, label, options) => options?.length ? <label>{label}<select aria-label={label} value={filters[key] || ''} onChange={e => setFilter(key, e.target.value)}>
    <option value="">All {label.toLowerCase()}</option>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label> : null;

  return <section className="fmr-map" aria-label="FMR segment map">
    <div className="fmr-page-title"><div><p className="fmr-eyebrow">FY2027 · Geographic view</p><h1>FMR segment map</h1>
      <p>Default geometry uses Reviewed coordinates (accepted digit repairs). Switch to Normalized to compare pre-review printed pairs. Distinct symbols identify source-only projects, candidate pairs, shared locations, segment counts, and unresolved review flags.</p></div></div>
    <ShareLink/>
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
    {(filters.project || filters.pair) && <p className="fmr-notice">Showing map records for {filters.project || filters.pair}. <button onClick={clearFilters}>Show all projects</button>{!overlay.lines.features.length && !overlay.flags.features.length && ' No mappable coordinates are available for this record.'}</p>}
    <div className="fmr-result-bar"><span>{overlay.summary.drawn.toLocaleString()} overlays · {overlay.summary.visible_markers.toLocaleString()} markers · {overlay.summary.paired.toLocaleString()} paired · {overlay.summary.offset.toLocaleString()} offset · {(overlay.summary.visible_hubs ?? overlay.summary.hubs).toLocaleString()} shared · {(overlay.summary.visible_increases ?? overlay.summary.increases).toLocaleString()} ↑ · {(overlay.summary.visible_decreases ?? overlay.summary.decreases).toLocaleString()} ↓ · {(overlay.summary.visible_multis ?? overlay.summary.multis).toLocaleString()} multi · {(overlay.summary.visible_flags ?? overlay.summary.flags).toLocaleString()} red flags · {(overlay.summary.visible_reviews ?? overlay.summary.reviews).toLocaleString()} unresolved reviews · {overlay.summary.candidates.toLocaleString()} candidates · {filters.coordBasis === 'normalized' ? 'normalized' : 'reviewed'}</span>
      <span className="fmr-map-controls"><label>Basemap<select aria-label="Basemap style" value={style} onChange={e => setStyle(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      {[['nep','NEP only'],['house','House-only insertion candidates'],['paired','Candidate pair'],['shared','Shared location'],
        ['increase','Increase'],['decrease','Decrease'],['multi','Segment count'],['flag','Analytical red flags'],['review','Unresolved review']].map(([kind,label]) =>
        <span key={kind} className="fmr-map-legend"><MarkerIcon kind={kind}/>{label}</span>)}
      </span></div>
    <div className="fmr-map-shell">
      <div ref={container} className="fmr-map-canvas" aria-label="Interactive FMR segment map" role="application"/>
      {failed && <p className="fmr-map-warning" role="alert">Basemap tiles failed to load: {failed}. Segment overlays come from this site’s data and stay available once the style loads.</p>}
      {!ready && !failed && <p className="fmr-map-warning" role="status">Loading basemap…</p>}
      {active && <MapSelectionCard
        reviewThresholds={Object.fromEntries(Object.entries(filters).filter(([key]) => key.startsWith('rf_')))} data={data} feature={active} stack={stack} stackIndex={stackIndex}
        onZoom={zoomToProject}
        onStack={setStackIndex}
        onClose={() => setSelected(null)}
        onPdf={setPdfSource}
        onProvenance={setProvenanceProject}
      />}
    </div>
    <p className="fmr-muted">Purple lines are exact-coordinate candidate pairs drawn once. Unmatched overlaps offset ~45&nbsp;m with a shared pair marker on the true midpoint. Reviewed is the accepted geometry (including PSGC-supported off-by-one digit repairs). Normalized undoes those repairs so you can compare the pre-review printed pairs. Numbered badges show the project’s segment count. Red flags show analytical review leads using the Analysis thresholds. Magnifying glasses identify unresolved coordinate reviews, including single-point records. Endpoint spans and allocation-per-meter proxies are screening measures, not measured road lengths or construction unit costs.</p>
    {overlay.summary.unmapped_flags > 0 && <p className="fmr-muted">{overlay.summary.unmapped_flags} flagged projects have no mappable coordinates; inspect their records in Analysis or the source review queue.</p>}

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
