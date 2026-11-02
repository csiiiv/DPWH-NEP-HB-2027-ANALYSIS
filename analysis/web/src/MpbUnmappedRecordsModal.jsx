import React, {useEffect, useMemo, useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {money} from './congressModel.js';
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

function RecordRow({record, onOpenRecord, onPdf}) {
  return <tr>
    <th scope="row">
      <span className="congress-approx-cluster-title">{record.title}</span>
      <small className="fmr-muted"><code>{record.id}</code>
        {record.bucketLabel ? ` · ${record.bucketLabel}` : ''}</small>
    </th>
    <td className="num">{record.nep_php != null ? money(record.nep_php) : '—'}</td>
    <td className="num">{record.house_php != null ? money(record.house_php) : '—'}</td>
    <td>
      {(record.pdf ?? []).length
        ? <div className="congress-pdf-buttons">
            {record.pdf.map(ref =>
              <button key={`${record.id}-${ref.kind}-${ref.page}`}
                type="button" className="source-link"
                onClick={() => onPdf?.(ref)}>
                {ref.documentLabel ?? ref.label} · p. {ref.page}
              </button>)}
          </div>
        : <span className="fmr-muted">—</span>}
    </td>
    <td>
      <button type="button" className="primary"
        onClick={() => onOpenRecord?.(record.id)}>
        Open full
      </button>
    </td>
  </tr>;
}

/**
 * List modal for an "MPB without coordinates" district badge. One row per
 * record the district owns that prints no title GPS — including records the
 * PSGC-approx layer visualizes at centroids (they are the same population:
 * rows without printed coordinates; the two layers deliberately overlap).
 */
export default function MpbUnmappedRecordsModal({
  district, rowsByClass, recordsById, onOpenRecord, onPdf, onClose,
}) {
  const groups = useMemo(() => {
    if (!rowsByClass) return [];
    return Object.entries(MPB_POINT_CLASSES)
      .map(([id, style]) => ({id, style, records:
        (rowsByClass[id] ?? []).map(rid => recordsById.get(rid)).filter(Boolean)}))
      .filter(group => group.records.length > 0);
  }, [rowsByClass, recordsById]);

  if (!district) return null;
  const total = groups.reduce((sum, group) => sum + group.records.length, 0);

  return <Dialog
    label={`MPB without coordinates · ${district.districtLabel ?? district.districtId}`}
    className="congress-approx-cluster-dialog"
    onClose={onClose}>
    <p className="fmr-eyebrow">No title-printed GPS in the source documents</p>
    <p className="congress-approx-cluster-meta">
      <span className="congress-layer-key-badge" aria-hidden="true">Σ</span>
      <span>{total.toLocaleString('en-PH')} record{total === 1 ? '' : 's'} ·
        {' '}{district.districtLabel ?? district.districtId}</span>
    </p>
    <p className="fmr-muted">
      These records carry no decimal coordinates in their title text. Some are
      drawn on the <strong>MPB approx. (PSGC)</strong> layer at barangay /
      municipality centroids — that is an estimated placement, not printed GPS.
      Each record appears on exactly one row here even if it also has an approx
      marker; district totals count distinct records, so nothing is
      double-counted.
    </p>

    <p className="congress-approx-cluster-warning" role="note">
      <i className="congress-note-alert" aria-hidden="true"/>
      <span><strong>Avoid double counting:</strong> some of these records are
        also drawn as <strong>MPB approx. (PSGC)</strong> markers with their
        own per-place record lists. Every record here appears exactly once in
        this list, and national totals dedupe by record id — but if you tally
        a district by hand, use <em>either</em> this badge list <em>or</em>
        its approx markers, never both.</span>
    </p>

    {groups.length === 0
      ? <p role="status">Comparison rows for this badge are still loading…</p>
      : groups.map(group =>
        <div key={group.id} className="congress-approx-cluster-table-wrap">
          <h3 className="congress-approx-cluster-group">
            <i className="congress-layer-key-mark congress-layer-key-box"
              aria-hidden="true" style={{background: group.style.color}}/>
            {group.style.label}
            <small className="fmr-muted">
              {group.records.length.toLocaleString('en-PH')}
            </small>
          </h3>
          <table className="congress-record-table congress-approx-cluster-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col" className="num">NEP amount</th>
                <th scope="col" className="num">HGAB3 amount</th>
                <th scope="col">PDF page sources</th>
                <th scope="col">Open full</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map(record =>
                <RecordRow key={record.id} record={record}
                  onOpenRecord={onOpenRecord} onPdf={onPdf}/>)}
            </tbody>
          </table>
        </div>)}
  </Dialog>;
}
