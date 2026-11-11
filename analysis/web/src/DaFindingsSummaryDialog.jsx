import React, {useEffect, useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {money} from './fmrModel.js';
import {DA_CHANGE_TYPES} from './fmrDaCoherence.js';
import {RED_FLAG_DELTA_STATUSES, RED_FLAG_RULES} from './fmrRedFlags.js';

const ruleLabels = Object.fromEntries(RED_FLAG_RULES.map(rule => [rule.id, rule.label]));
const flagList = entries => !entries.length ? <p className="fmr-muted">None in this subset.</p>
  : <ul className="fmr-da-summary-flags">{entries.map(({id, count}) =>
    <li key={id}><strong>{count.toLocaleString()}</strong> {ruleLabels[id] || id}</li>)}</ul>;

export default function DaFindingsSummaryDialog({summary, filteredNote, onClose}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  const {corrections} = summary;
  return <dialog ref={ref} className="fmr-dialog fmr-da-summary-dialog" aria-label="House to DA findings summary"
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading">
      <h2>Findings and corrections summary</h2>
      <button type="button" onClick={onClose}>Close summary</button>
    </div>
    <p className="fmr-notice">{summary.caveat}</p>
    {filteredNote && <p role="status">{filteredNote}</p>}
    <p>
      <strong>{summary.rowCount.toLocaleString()}</strong> flagged House→DA rows in this subset.
      House allocation on these rows: <strong>{money(summary.housePhp)}</strong>
      {summary.daPhp ? <> · DA draft allocation: <strong>{money(summary.daPhp)}</strong></> : null}.
      Cleared under DA: <strong>{summary.lifecycle.cleared.toLocaleString()}</strong>;
      still flagged: <strong>{summary.lifecycle.persisted.toLocaleString()}</strong>;
      new under DA: <strong>{summary.lifecycle.new.toLocaleString()}</strong>;
      DA-described corrections: <strong>{corrections.count.toLocaleString()}</strong>.
    </p>

    <section className="fmr-da-summary-block" aria-label="Flag lifecycle">
      <h3>Flag lifecycle</h3>
      <dl className="fmr-da-summary-grid">
        {Object.entries(RED_FLAG_DELTA_STATUSES).map(([id, label]) =>
          <React.Fragment key={id}>
            <dt>{label}</dt>
            <dd>{(summary.statusCounts[id] || 0).toLocaleString()}</dd>
          </React.Fragment>)}
      </dl>
    </section>

    <section className="fmr-da-summary-block" aria-label="DA change stories">
      <h3>DA change stories in this subset</h3>
      <dl className="fmr-da-summary-grid">
        {Object.entries(DA_CHANGE_TYPES).map(([id, meta]) =>
          <React.Fragment key={id}>
            <dt>{meta.label}</dt>
            <dd>{(summary.changeCounts[id] || 0).toLocaleString()}</dd>
          </React.Fragment>)}
      </dl>
    </section>

    <section className="fmr-da-summary-block" aria-label="Flag movements">
      <h3>Most common flag movements</h3>
      <div className="fmr-da-summary-columns">
        <div><h4>Cleared under DA</h4>{flagList(summary.clearedFlags)}</div>
        <div><h4>Still flagged</h4>{flagList(summary.persistedFlags)}</div>
        <div><h4>New on DA</h4>{flagList(summary.newFlags)}</div>
      </div>
    </section>

    <section className="fmr-da-summary-block" aria-label="DA-described corrections">
      <h3>DA-described corrections</h3>
      <p>
        {corrections.count.toLocaleString()} row{corrections.count === 1 ? '' : 's'} with a DA remark
        describing a title or coordinate correction
        ({corrections.withRemark.toLocaleString()} with local remark text).
        These are DA self-reports, not certified fixes.
        {corrections.count > 0 && <> House {money(corrections.housePhp)} · DA {money(corrections.daPhp)}.</>}
      </p>
      {corrections.count > 0 && <dl className="fmr-da-summary-grid">
        {Object.entries(RED_FLAG_DELTA_STATUSES).filter(([id]) => corrections.statusCounts[id])
          .map(([id, label]) => <React.Fragment key={id}>
            <dt>{label}</dt><dd>{corrections.statusCounts[id].toLocaleString()}</dd>
          </React.Fragment>)}
      </dl>}
      {corrections.count > 0 && <div className="fmr-da-summary-columns">
        <div><h4>Flags cleared on corrections</h4>{flagList(corrections.clearedFlags)}</div>
        <div><h4>Flags still open on corrections</h4>{flagList(corrections.persistedFlags)}</div>
        <div><h4>Flags new on corrections</h4>{flagList(corrections.newFlags)}</div>
      </div>}
    </section>
  </dialog>;
}
