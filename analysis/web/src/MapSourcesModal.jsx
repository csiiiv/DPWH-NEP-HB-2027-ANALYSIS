import React, {useEffect, useMemo, useRef, useState} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {repo, siteUrl} from './data.js';
import {
  DISTRICT_SEGMENT_CLASSES, REPAIR_COLOR,
} from './fmrSegmentOverlay.js';
import {MPB_POINT_CLASSES} from './mpbSegmentOverlay.js';

function Dialog({label, onClose, className = '', children}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`.trim()}
    aria-label={label} onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <h2>{label}</h2>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    {children}
  </dialog>;
}

/**
 * Data sources + exports for the nationwide Legislative map (#congress/map).
 *
 * The map layers are built from five retained artifacts; this modal lists
 * each with its repository path and what it draws, then offers the same
 * explorer-row exports the FMR / MPB (Legislative) grids have — fetching the
 * heavy payloads on demand exactly like those grids do.
 */
export default function MapSourcesModal({
  fmrCounts, mpbCounts, repairCount, unmappedCounts, approxCounts,
  exportPopulations = null,
  onExport = () => {}, onClose,
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const sources = [
    {
      name: 'Legislative district polygons',
      file: 'PSGC2LEG/viz/leg_districts.geojson',
      note: 'Province-hued district fill; the base geography every marker sits on. Built by the PSGC2LEG viz pipeline.',
      link: `${repo}/blob/main/PSGC2LEG/viz/leg_districts.geojson`,
    },
    {
      name: 'FMR workbench geometry',
      file: 'other-analysis/data/fmr_workbench.json',
      note: `Segment lines and endpoints at the accepted reading${repairCount ? `, plus ${repairCount.toLocaleString('en-PH')} incorrect original positions kept as correction evidence` : ''}.`,
      link: `${repo}/blob/main/other-analysis/data/fmr_workbench.json`,
    },
    {
      name: 'MPB legislative index',
      file: 'analysis/data/mpb_legislative_index_2027.json',
      note: 'Title-printed GPS coordinates for multi-purpose building rows; the solid class-coloured boxes. The same index also drives the without-coordinates district badges.',
      link: `${repo}/blob/main/analysis/data/mpb_legislative_index_2027.json`,
    },
    {
      name: 'MPB PSGC approx supplement',
      file: 'analysis/data/mpb_psgc_approx_overlay_2027.json',
      note: 'PSGC-centroid approx. markers for rows without title GPS — not printed GPS; dashed styling discloses this. These same records also count on the without-coordinates badges: the two layers overlap on purpose (one record stays one record — no double counting).',
      link: `${repo}/blob/main/analysis/data/mpb_psgc_approx_overlay_2027.json`,
    },
    {
      name: 'Congress map id bridge',
      file: 'analysis/data/congress_district_map_2027.json',
      note: 'Bridges viz polygon ids to lens district cards, powering the info panel and card deep-links.',
      link: `${repo}/blob/main/analysis/data/congress_district_map_2027.json`,
    },
  ];

  const runExport = (kind, build) => {
    if (busy) return;
    setBusy(kind);
    setError('');
    build()
      .then(rows => onExport(kind, rows))
      .catch(event => setError(event.message))
      .finally(() => setBusy(''));
  };

  const exportFmr = () => runExport('fmr', async () => {
    const {fmrGridExportRows} = await import('./congressModel.js');
    const response = await fetch(siteUrl('other-analysis/data/fmr_workbench.json'));
    if (!response.ok) throw new Error(`Could not load the FMR comparison payload (${response.status}).`);
    const detail = await response.json();
    // The map draws from the lens index, so the export matches the map's
    // population — not the raw workbench.
    const {loadData} = await import('./data.js');
    const fmrIndex = await loadData('fmr_legislative_index_2027.json');
    return fmrGridExportRows(fmrIndex, detail);
  });

  const exportMpb = () => runExport('mpb', async () => {
    const {mpbGridExportRows} = await import('./congressModel.js');
    const {loadData} = await import('./data.js');
    const [mpbIndex, comparison] = await Promise.all([
      loadData('mpb_legislative_index_2027.json'),
      loadData('comparison_projects_2027.json'),
    ]);
    return mpbGridExportRows(mpbIndex, comparison);
  });

  return <Dialog label="Map data sources and exports" className="congress-map-sources"
    onClose={onClose}>
    <section className="congress-map-sources-list">
      <h3>Layers and their sources</h3>
      <ul>
        {sources.map(source => <li key={source.file}>
          <strong>{source.name}</strong>
          <a href={source.link} target="_blank" rel="noreferrer">
            <code>{source.file}</code></a>
          <p className="fmr-muted">{source.note}</p>
        </li>)}
      </ul>
      <p className="fmr-muted">
        Full catalog:{' '}
        <a href={`${repo}/blob/main/analysis/docs/congress_tab_data_sources.md`}
          target="_blank" rel="noreferrer">Congress tab data sources</a>
        {' '}— every layer, builder and packaging step.
      </p>
    </section>

    <section className="congress-map-sources-legend">
      <h3>Class colors on the map</h3>
      <ul className="congress-layer-key">
        {Object.entries(MPB_POINT_CLASSES).map(([id, style]) =>
          <li key={id}><i className="congress-layer-key-mark congress-layer-key-box"
            aria-hidden="true" style={{background: style.color}}/>
            <span>{DISTRICT_SEGMENT_CLASSES[id].label} / {style.label}</span></li>)}
        <li><i className="congress-layer-key-mark congress-layer-key-dot"
          aria-hidden="true" style={{background: REPAIR_COLOR}}/>
          <span>Incorrect original coordinate</span></li>
      </ul>
      {unmappedCounts?.total != null &&
        <p className="fmr-muted">
          Reading the MPB layers together: solid boxes = title-printed GPS;
          approx. markers = PSGC-centroid estimates for rows with no printed
          coordinates; district badges = <strong>all</strong> rows without title
          coordinates ({unmappedCounts.total.toLocaleString('en-PH')} distinct
          records). <strong>Double counting warning:</strong> approx rows are a
          subset of the badge population — using MPB approx data together with
          MPB without-coordinates data for the same district counts those
          records twice. Pick one layer per question; every record remains one
          record in exports and national totals.
        </p>}
    </section>

    <section className="congress-map-sources-export">
      <h3>Export the map's populations</h3>
      <p className="fmr-muted">Same explorer rows, columns and source-page links
        as the FMR (Legislative) and MPB (Legislative) tabs — every row the lens
        booked, including records without coordinates. Each button opens the
        shared export chooser so you can pick Simple or Full and CSV or JSON.</p>
      <div className="fmr-dialog-actions">
        <button type="button" className="secondary" onClick={exportFmr}
          disabled={Boolean(busy)}>
          {busy === 'fmr' ? 'Building FMR rows…'
            : `Export FMR data${exportPopulations?.fmr != null ? ` (${exportPopulations.fmr.toLocaleString('en-PH')} records)` : ''}`}
        </button>
        <button type="button" className="secondary" onClick={exportMpb}
          disabled={Boolean(busy)}>
          {busy === 'mpb' ? 'Building MPB rows…'
            : `Export MPB data${exportPopulations?.mpb != null ? ` (${exportPopulations.mpb.toLocaleString('en-PH')} records)` : ''}`}
        </button>
      </div>
      {error && <p role="alert" className="fmr-map-warning">{error}</p>}
    </section>
  </Dialog>;
}

/**
 * The sources button shared by the inline and full-window map stages. Sits at
 * the upper right, to the LEFT of the full-window control, matching the
 * existing float styling.
 */
export function MapSourcesButton({onOpen, variant = 'inline'}) {
  return <button type="button"
    className={`congress-map-sources-btn congress-map-sources-btn-${variant}`}
    onClick={onOpen}>Sources</button>;
}
