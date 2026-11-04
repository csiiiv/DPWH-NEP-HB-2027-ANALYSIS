import React, {useEffect, useRef, useState} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {downloadExplorer} from './explorerExport.js';

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
 * Export chooser: scope (Simple/Full) × format (CSV/JSON) for explorer rows.
 * Simple is the reviewer's shortlist; Full is everything the explorer holds,
 * including per-side source records. Both split HGAB3 and NEP page citations.
 * `intro`/`dialogLabel` override the single-card copy for multi-card / map
 * exports. Shared by the district explorer, FMR/MPB grid, and map Sources /
 * district-panel export buttons.
 */
export default function ExportModal({
  rows, meta, onClose, intro = null, dialogLabel = 'Export these projects',
  scopeOptions = null, formatOptions = null, onDownload = downloadExplorer,
}) {
  const [scope, setScope] = useState('simple');
  const [format, setFormat] = useState('csv');
  const scopes = scopeOptions ?? [
    ['simple', 'Simple', 'Title, bucket, match status, flags, region, program, both offices, both amounts, delta, and each side’s source page.'],
    ['full', 'Full', meta?.lens === 'mpb'
      ? 'Everything Simple has plus MPB scope rule, assignment basis, PAP, source record ids, PDF pages and links, reading status, match basis, trace, chainage and coordinates.'
      : 'Everything Simple has plus assignment basis, PAP, source record ids, PDF pages and links, reading status, match basis, trace, chainage and coordinates.'],
  ];
  const formats = formatOptions ?? [['csv', 'CSV', 'Spreadsheet. Opens in Excel with the same headings as the table.'],
    ['json', 'JSON', 'Structured. Keeps provenance, filters and nested source citations.']];
  const choose = (options, value, setValue, name) => <div className="congress-export-choice">
    {options.map(([key, label, hint]) => <label key={key}
      className={value === key ? 'congress-export-option selected' : 'congress-export-option'}>
      <input type="radio" name={name} value={key} checked={value === key}
        onChange={() => setValue(key)} />
      <span><strong>{label}</strong><small>{hint}</small></span></label>)}</div>;

  return <Dialog label={dialogLabel} className="congress-export" onClose={onClose}>
    {intro ?? <p className="fmr-muted">Downloads all <strong>{rows.length.toLocaleString('en-PH')}</strong> rows
      currently in this table{Object.values(meta.filters ?? {}).some(value => value)
        ? ', with your search, bucket and flag filters applied' : ''}. Amounts are in Philippine pesos.
      Source columns cite each ledger side separately and link straight to the page.</p>}
    <h3>What to include</h3>
    {choose(scopes, scope, setScope, 'export-scope')}
    <h3>File format</h3>
    {choose(formats, format, setFormat, 'export-format')}
    <div className="fmr-dialog-actions">
      <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="primary" onClick={() => {
        onDownload(rows, {...meta, scope}, format);
        onClose();
      }}>Download {scope === 'simple' ? 'Simple' : 'Full'} {format.toUpperCase()}</button>
    </div>
  </Dialog>;
}
