import React, {useEffect, useMemo, useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {money} from './congressModel.js';
import {MPB_POINT_CLASSES, mpbApproxSwatchBackground} from './mpbSegmentOverlay.js';

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

function placeLabel(cluster) {
  const parts = [
    cluster.barangay,
    cluster.municipality || cluster.name,
    cluster.province,
  ].filter(Boolean);
  // Deduplicate adjacent repeats (municipality-level markers set name = municipality).
  return parts.filter((part, index) => part !== parts[index - 1]).join(', ')
    || cluster.name
    || cluster.psgcCode
    || 'PSGC place';
}

/**
 * List modal for a PSGC-centroid approximate MPB marker. One row per collapsed
 * project at that barangay/municipality; Open full hands off to RecordDrawer.
 */
export default function MpbApproxClusterModal({
  cluster, recordsById, onOpenRecord, onPdf, onClose,
}) {
  const rows = useMemo(() => {
    const ids = cluster?.rowIds ?? [];
    return ids.map(id => recordsById.get(id)).filter(Boolean);
  }, [cluster, recordsById]);

  if (!cluster) return null;
  const level = cluster.level === 'barangay' ? 'Barangay'
    : cluster.level === 'city' ? 'City' : 'Municipality';
  const category = cluster.category;
  const categoryColor = MPB_POINT_CLASSES[category]?.color ?? MPB_APPROX_ACCENT;

  return <Dialog
    label={`MPB approx. · ${placeLabel(cluster)}`}
    className="congress-approx-cluster-dialog"
    onClose={onClose}>
    <p className="fmr-eyebrow">PSGC centroid · not printed title GPS</p>
    <p className="congress-approx-cluster-meta">
      <span className="congress-layer-key-approx" aria-hidden="true"
        style={{background: mpbApproxSwatchBackground(category, categoryColor)}}/>
      <span>{level} centroid · {rows.length.toLocaleString('en-PH')} project
        {rows.length === 1 ? '' : 's'}</span>
      {cluster.psgcCode && <code>{cluster.psgcCode}</code>}
    </p>
    <p className="fmr-muted">Anchored at the 2023 PSA polygon centroid for this place.
      Amounts and PDF pages come from the comparison row; open a record for the
      full evidence drawer.</p>
    <p className="congress-approx-cluster-warning" role="note">
      <i className="congress-note-alert" aria-hidden="true"/>
      <span><strong>Avoid double counting:</strong> these records have no
        title-printed coordinates, so each one is <em>also</em> counted on this
        district’s “MPB without coordinates” badge. Add amounts from either
        this modal or the badge’s record list — never both — for the same
        district.</span>
    </p>

    {rows.length === 0
      ? <p role="status">Comparison rows for this marker are still loading…</p>
      : <div className="congress-approx-cluster-table-wrap">
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
              {rows.map(record =>
                <tr key={record.id}>
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
                </tr>)}
            </tbody>
          </table>
        </div>}
  </Dialog>;
}
