import React, {useEffect, useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {routeHref} from './routes.js';
import {money} from './fmrModel.js';
import {RED_FLAG_TIERS, RED_FLAG_DELTA_STATUSES, RED_FLAG_DELTA_STATUS_EXPLAINERS, flagTier, flagExplainer} from './fmrRedFlags.js';

export function FlagTag({id, label, tierMode=false, resolution, onExplain}) {
  const tier = flagTier(id);
  return <button type="button" className={`fmr-redflag-tag ${tierMode ? 'fmr-tier-'+tier : ''}`}
    aria-haspopup="dialog" aria-label={`Explain ${label || id}`} onClick={onExplain}>
    {tierMode && <small>{RED_FLAG_TIERS[tier].label} · </small>}{label || id}
    {resolution && resolution !== 'Open' && ' · resolved'}
  </button>;
}

// Guide-mode when no row is supplied; contextual evidence on a project or delta row.
export function FlagExplainerDialog({selection, config, onClose}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  const statusId = selection.statusId;
  const info = statusId ? null : flagExplainer(selection.id, config);
  const row = selection.row;
  const contextual = row?.flags?.find(f => f.id === selection.id);
  return <dialog ref={ref} className="fmr-dialog fmr-redflag-explainer" aria-label="Red flag explanation"
      onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="fmr-dialog-heading"><h2>{info ? info.label : RED_FLAG_DELTA_STATUSES[statusId]}</h2>
      <button type="button" onClick={onClose}>Close explanation</button></div>
    <p className="fmr-notice">Evidence class, not a severity score. Flags are review questions, not confirmed errors, fraud or wrongdoing.</p>
    {info ? <>
      <p><strong>Evidence class:</strong> {info.tierLabel}</p>
      <dl className="fmr-redflag-explainer-details">
        <dt>What it is</dt><dd>{info.whatItIs}</dd>
        <dt>How it is flagged (current thresholds)</dt><dd>{info.howFlagged}</dd>
        <dt>Why it matters</dt><dd>{info.whyItMatters}</dd>
        <dt>What it does not mean</dt><dd>{info.whatItDoesNotMean}</dd>
        <dt>Suggested review</dt><dd>{info.nextSteps}</dd>
        <dt>Related signals</dt><dd>{info.interplay}</dd>
      </dl>
      {row && <section className="fmr-provenance" aria-label="Flag context">
        <h3>Context for this row</h3>
        <p>{row.project?.title || row.title || row.id}</p>
        {row.project?.amount_php != null && <p>Source allocation: {money(row.project.amount_php)}</p>}
        {row.house_php != null && <p>House allocation: {money(row.house_php)}</p>}
        {row.da_php != null && <p>DA working-draft allocation: {money(row.da_php)}</p>}
        {contextual?.detail && <p><strong>Observed values:</strong> {contextual.detail}</p>}
        {row.region_key && <p>Region {row.region_key}</p>}
        {(row.excel_rows?.length || row.project?.source?.excel_row) && <p>DA Excel row(s): {row.excel_rows?.join(', ') || row.project.source.excel_row}</p>}
        {row.project?.source?.source_pdf && <p>Source: {row.project.source.source_pdf}, PDF p. {row.project.source.pdf_page}</p>}
        {row.house_id && <a href={routeHref('house',{node:row.house_id})}>Open House source</a>}
      </section>}
    </> : <p>{RED_FLAG_DELTA_STATUS_EXPLAINERS[statusId]}</p>}
  </dialog>;
}
