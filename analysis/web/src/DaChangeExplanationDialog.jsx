import React, {useEffect, useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {money} from './fmrModel.js';
import {routeHref} from './routes.js';
import {DA_CHANGE_TYPES, DA_CHANGE_CAVEAT} from './fmrDaCoherence.js';

const printable = value => value == null || value === '' ? 'Not recorded' : String(value);

export default function DaChangeExplanationDialog({row,onClose}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  const type = DA_CHANGE_TYPES[row.changeType] || DA_CHANGE_TYPES.other;
  const fromTitle = row.fromTitle || row.from?.from_title || row.from?.title;
  const toTitle = row.toTitle || row.proposed?.effective_title || row.proposed?.title;
  return <dialog ref={ref} className="fmr-dialog fmr-da-story-dialog" aria-label="DA change explanation"
    onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="fmr-dialog-heading">
      <h2>{type.label}</h2><button type="button" onClick={onClose}>Close DA explanation</button>
    </div>
    <p className="fmr-notice">{DA_CHANGE_CAVEAT}</p>
    <p>{type.description}</p>
    <div className="fmr-da-story-context">
      <h3>{row.title || 'DA source row'}</h3>
      <p>{row.narrative}</p>
      <dl>
        <dt>DA control number</dt><dd>{printable(row.control_no)}</dd>
        <dt>DA Excel row(s)</dt><dd>{row.excel_rows?.length ? row.excel_rows.join(', ') : 'Not recorded'}</dd>
        <dt>Source (FROM) title</dt><dd>{printable(fromTitle)}</dd>
        <dt>DA proposed title</dt><dd>{printable(toTitle)}</dd>
        <dt>FROM allocation</dt><dd>{row.fromAmountPhp == null ? 'Not recorded' : money(row.fromAmountPhp)}</dd>
        <dt>Proposed allocation</dt><dd>{row.toAmountPhp == null ? 'Not recorded' : money(row.toAmountPhp)}</dd>
        <dt>Original DA disposition</dt><dd>{printable(row.from?.disposition || row.disposition)}</dd>
        <dt>Basis for pairing</dt><dd>{printable(row.pairingBasis || 'No within-sheet replacement paired')}</dd>
        <dt>Audit flag summary</dt><dd>{printable(row.auditFlagsSummary)}</dd>
      </dl>
    </div>
    <section className="fmr-da-story-remark">
      <h3>DA's own explanation / remarks</h3>
      <p>{row.daRemark ? row.daRemark : 'No local DA remark recorded for this event.'}</p>
      <small>DA's own remark, not independently verified.</small>
    </section>
    <div className="fmr-redflag-links">
      {row.house_id && <a href={routeHref('house',{node:row.house_id})}>House printed source</a>}
      {row.nepCandidate?.id && <a href={routeHref('nep',{node:row.nepCandidate.id})}>Exact NEP title/amount candidate</a>}
      {row.id?.startsWith('pair:') && <a href={routeHref('compare',{view:'projects',pair:row.id})}>Open matching evidence</a>}
    </div>
  </dialog>;
}
