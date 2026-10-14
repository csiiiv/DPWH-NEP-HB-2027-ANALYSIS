import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';
import {siteUrl} from './data.js';
import {
  GROUP_COLORS, STATUS_LABELS, FRAGMENT_KIND_LABELS, RULE_LABELS, ISSUE_LABELS,
  CHANGE_TYPE_OPTIONS, CHANGE_TYPE_LABELS, formatAmountPhp,
  filterRecords, parsedPoints, variationRows, recordPdfSources, recordHref,
} from './geoModel.js';
import './Fmr.css';
import './Geo.css';

const GeoMap = lazy(() => import('./GeoMap.jsx'));
const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const href = (key, params = {}) => routeHref(key, params, 'geo');
const paramsOf = route => Object.fromEntries(route.params);
function navigate(route, patch) {
  const next = {...paramsOf(route), ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = href(route.key, next);
}
function Dialog({label, onClose, children}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className="fmr-dialog" aria-label={label} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{label}</h2><button onClick={onClose}>Close</button></div>{children}</dialog>;
}

function Stat({label, value, detail}) {
  return <div className="fmr-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function Hero({title, children}) {
  return <section className="hero hero-compact"><p className="fmr-eyebrow">FY2027 · Geolocation</p><h1>{title}</h1>
    {children}<div className="hero-actions"><ShareLink/></div></section>;
}
function ScopeNote() {
  return <details className="fmr-method"><summary>Scope and evidence limits</summary>
    <p>This workspace visualizes the GPS inventory produced by <code>gps-analysis/scan_gps_inventory.py</code>: every
      record in the retained FY2027 datasets whose text includes coordinates. Pairs are parsed with the FMR coordinate
      grammar (decimal and DMS forms, hemisphere markers, axis labels, START/END spans), and every interpretation
      variation is recorded as a rule or a review issue.</p>
    <p>Inventory, not geocode: no PSGC or locality agreement is applied here, and the sources state no CRS. DPWH
      corpora overlap by construction (House leaves ⊂ comparison rows); counts are per source artifact. NIA and HFEP
      annexes print no coordinate column; their handful of hits are shown for completeness.</p>
    <a href={siteUrl('gps-analysis/README.md')}>Read the scanner methodology</a>
  </details>;
}
function GroupIcon({group}) {
  return <svg className="geo-group-icon" width="16" height="16" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M8 32H56" stroke={GROUP_COLORS[group]} strokeWidth="10" strokeLinecap="round"/></svg>;
}

function Home({data, route}) {
  const totals = data.totals;
  const groupRows = useMemo(() => {
    const grouped = data.datasets.reduce((acc, d) => {
      const group = acc[d.group] || (acc[d.group] = {group: d.group, label: data.groups[d.group],
        scanned: 0, records: 0, points: 0, datasets: 0});
      group.scanned += d.scanned; group.records += d.records; group.points += d.points; group.datasets += 1;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => b.records - a.records);
  }, [data]);
  const variations = useMemo(() => variationRows(data.records), [data]);
  const [records, setRecords] = useState(null);
  const [pdfSource, setPdfSource] = useState(null);
  const openGroup = group => setRecords({group, rows: filterRecords(data.records, {group: [group]})});

  const variationTable = (rows, title, note) => <section className="fmr-section"><h2>{title}</h2>
    <p>{note}</p>
    <SortableTable rows={rows} ariaLabel={title} initialSort={{key: 'count', direction: 'desc'}} columns={[
      {key: 'label', label: 'Variation', scope: 'row', render: r => <><strong>{r.label}</strong><small><code>{r.code}</code></small></>},
      {key: 'count', label: 'Records', align: 'num'},
      {key: 'share', label: 'Share of GPS records', align: 'num', value: r => r.count / totals.records_with_gps,
        render: r => `${(r.count / totals.records_with_gps * 100).toFixed(1)}%`},
    ]}/></section>;

  return <><Hero title="Geolocated budget records"><p>A cross-dataset view of every FY2027 record that prints GPS
    coordinates, grouped by source family, with the interpretation variations each grouping needs.</p></Hero>
    <div className="fmr-stats">
      <Stat label="Records scanned" value={totals.records_scanned.toLocaleString()} detail="Across 10 retained datasets"/>
      <Stat label="With GPS text" value={totals.records_with_gps.toLocaleString()} detail={`${(totals.records_with_gps / totals.records_scanned * 100).toFixed(1)}% of scanned`}/>
      <Stat label="Parsed points" value={totals.points_parsed.toLocaleString()} detail="lon/lat decimal degrees"/>
      <Stat label="Parsed cleanly" value={totals.parsed.toLocaleString()} detail={`${totals.parsed_with_issues} with issues · ${totals.unparsed_candidate} unparsed`}/>
    </div>
    <div className="fmr-result-bar"><a className="primary" href={href('map')}>Open the map →</a></div>
    <ScopeNote/>
    <section className="fmr-section geo-wide-table"><h2>Records with GPS by grouping</h2>
      <p>Each family of sources carries coordinates differently: FMR annexes print dedicated START/END cells; DPWH
        titles embed parenthetical pairs; NIA and HFEP print none. The map and tables interpret each grouping with the
        grammar proven on FMR coordinates.</p>
      <SortableTable rows={groupRows} ariaLabel="GPS records by grouping" initialSort={{key: 'records', direction: 'desc'}} columns={[
        {key: 'label', label: 'Grouping', scope: 'row', render: g => <span className="geo-group-label"><GroupIcon group={g.group}/>{g.label}</span>},
        {key: 'scanned', label: 'Records scanned', align: 'num'},
        {key: 'records', label: 'With GPS', align: 'num'},
        {key: 'share', label: 'GPS share', align: 'num', value: g => g.scanned ? g.records / g.scanned : 0,
          render: g => g.scanned ? `${(g.records / g.scanned * 100).toFixed(1)}%` : '—'},
        {key: 'points', label: 'Parsed points', align: 'num'},
        {key: 'explore', label: 'Explore', sortable: false, value: g => g.records, render: g => <button className="group-open" onClick={() => openGroup(g.group)}>Show {g.records} records</button>},
      ]}/></section>
    <section className="fmr-section geo-wide-table"><h2>DPWH records with GPS by PAP</h2>
      <p>The DPWH group splits further by program-of-works (PAP) label. BIP multipurpose-building titles carry a
        parenthetical pair by convention, which is why they dominate; the same PAP vocabulary is shared across the
        comparison, leaf, NEP-source and chainage artifacts, so a record can appear in several rows’ datasets.</p>
      <SortableTable rows={data.paps} ariaLabel="DPWH GPS records by PAP" initialSort={{key: 'records', direction: 'desc'}} columns={[
        {key: 'pap', label: 'PAP', scope: 'row', render: p => <button className="fmr-text-button"
          onClick={() => {window.location.hash = href('map', {pap: p.pap});}}>{p.pap}<small>{p.datasets.length} source artifacts</small></button>},
        {key: 'records', label: 'Records with GPS', align: 'num'},
        {key: 'points', label: 'Parsed points', align: 'num'},
        {key: 'issues', label: 'Flagged points', align: 'num'},
        {key: 'datasets', label: 'Source artifacts', align: 'num', value: p => p.datasets.length},
      ]}/></section>
    {variationTable(variations.kinds, 'How coordinates appear', 'Fragment kinds found across all GPS-bearing records; a record can carry several.')}
    {variationTable(variations.rules, 'Interpretation rules applied', 'Every transformation from printed text to numeric pairs, ranked by how often the scanner applied it.')}
    {variationTable(variations.issues, 'Review issues', 'Text that needed judgement or failed a check. These queue the same kind of review the FMR coordinates received.')}
    {records && <Dialog label="Grouping records" onClose={() => {setRecords(null); setPdfSource(null);}}>
      <h3>{data.groups[records.group]}</h3>
      <p>{records.rows.length} records · {records.rows.reduce((s, r) => s + parsedPoints(r).length, 0)} parsed points</p>
      <SortableTable rows={records.rows} ariaLabel="GPS records" pageSize={50} columns={[
        {key: 'title', label: 'Record', scope: 'row', render: r =>
          <button className="fmr-text-button"
            onClick={() => {window.location.hash = href('map', {dataset: r.dataset});}}>
            {r.title}<small>{r.record_id} · {r.dataset}</small></button>},
        {key: 'amount', label: 'Amount', align: 'num', value: r => r.amount ?? -1,
          render: r => formatAmountPhp(r.amount) || <span className="fmr-muted">—</span>},
        {key: 'change', label: 'Budget change', value: r => r.change_type || 'none',
          render: r => r.change_type
            ? <span className={`fmr-badge change-${r.change_type}`}>{CHANGE_TYPE_LABELS[r.change_type] || r.change_type}</span>
            : <span className="fmr-muted">No comparison data</span>},
        {key: 'status', label: 'Status', render: r => STATUS_LABELS[r.status] || r.status},
        {key: 'points', label: 'Points', align: 'num', value: r => parsedPoints(r).length},
        {key: 'evidence', label: 'Evidence', sortable: false, value: r => recordPdfSources(r, data.documents).length,
          render: r => {
            const refs = recordPdfSources(r, data.documents);
            if (!refs.length) return <span className="fmr-muted">—</span>;
            return <span className="geo-evidence-buttons">{refs.map((ref, i) =>
              <button key={`${ref.document}-${i}`} className="fmr-text-button" onClick={() => setPdfSource(ref)}>
                {ref.label.split('·')[0].trim()} p. {ref.page}</button>)}</span>;}},
      ]}/></Dialog>}
    {pdfSource && <Dialog label="GPS record PDF source" className="fmr-pdf-dialog" onClose={() => setPdfSource(null)}>
      <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={{url: siteUrl(pdfSource.pdf), document: pdfSource.label, title: pdfSource.note,
          page: pdfSource.page}} onClose={() => setPdfSource(null)}
          closeLabel="Close PDF" downloadOriginal/></Suspense></Dialog>}
  </>;
}

export default function GeoApp({initialData = null} = {}) {
  const [route, setRoute] = useState(() => readRoute()), [data, setData] = useState(initialData), [error, setError] = useState('');
  useEffect(() => {const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);}, []);
  useEffect(() => {if (initialData) return; const controller = new AbortController();
    fetch(siteUrl('gps-analysis/data/gps_workbench.json'), {signal: controller.signal}).then(r => {
      if (!r.ok) throw Error(`Source data request failed (${r.status})`); return r.json();
    }).then(d => {if (d.schema_version !== 1) throw Error('Unsupported geolocation dataset'); setData(d);})
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);}); return () => controller.abort();}, []);
  useEffect(() => {document.title = `${route.key === 'map' ? 'Map' : 'Home'} · Geolocation FY2027`;}, [route.key]);
  return <><a className="fmr-skip" href="#geo-content" onClick={e => {e.preventDefault(); document.getElementById('geo-content')?.focus();}}>Skip to content</a>
    <WorkbenchHeader route={route.key} workspace="geo"/><main id="geo-content" tabIndex={-1} className="shell fmr-main">
      {error ? <div role="alert"><h1>Geolocation sources could not load</h1><p>{error}</p>
        <button onClick={() => window.location.reload()}>Reload</button></div>
        : !data ? <p role="status">Loading geolocation sources…</p>
        : route.key === 'map' ? <Suspense fallback={<p role="status">Loading map…</p>}><GeoMap data={data} route={route}/></Suspense>
        : <Home data={data} route={route}/>}
    </main><footer className="shell fmr-footer"><span>FY2027 · Geolocation inventory</span>
      <a href={siteUrl('gps-analysis/README.md')}>Scanner methodology</a></footer></>;
}
