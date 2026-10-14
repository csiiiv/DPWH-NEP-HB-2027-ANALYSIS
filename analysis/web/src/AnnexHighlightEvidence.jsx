import React from 'react';
import {money, signedMoney} from './fmrModel.js';
import './AnnexHighlightEvidence.css';

export function HighlightAction({card, onOpen}) {
  return <button type="button" className="annex-highlight-open" aria-haspopup="dialog" onClick={onOpen}>{card.actionLabel} →</button>;
}
export function HighlightSummary({card}) {
  const format = m => m.format === 'signed' ? signedMoney(m.value) : m.format === 'money' ? money(m.value)
    : typeof m.value === 'number' ? m.value.toLocaleString('en-PH') : m.value;
  return <><section className="annex-highlight-metrics" aria-label="Highlight key figures">{card.metrics.map(m =>
    <article className="fmr-stat" key={m.label}><span>{m.label}</span><strong>{format(m)}</strong></article>)}</section>
    <p className="muted">Key figures use the full retained scope of this finding.</p>
    <div className="fmr-story-facts"><h3>What to examine</h3><dl>
      <div><dt>Evidence basis</dt><dd>{card.takeaway}</dd></div>
      <div><dt>Investigation question</dt><dd>{card.prompt}</dd></div>
    </dl></div><p className="annex-evidence-limit">{card.limit}</p></>;
}
