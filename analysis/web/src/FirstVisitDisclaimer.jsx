import React, {useEffect, useRef, useState} from 'react';
import {openModalDialog} from './modalLifecycle.js';
import {acknowledgeDisclaimer, disclaimerAcknowledged} from './disclaimerGate.js';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Shared across all workspaces, so a single choice covers routes opened later.
// The full disclaimer is always readable without an acknowledgement.
export default function FirstVisitDisclaimer({active = true}) {
  const [acknowledged, setAcknowledged] = useState(
    () => typeof window === 'undefined' || disclaimerAcknowledged(browserStorage()),
  );
  const dialogRef = useRef(null);
  const show = active && !acknowledged;

  useEffect(() => {
    if (!show) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    return openModalDialog(dialog);
  }, [show]);

  if (!show) return null;
  const continueToSite = () => {
    acknowledgeDisclaimer(browserStorage());
    setAcknowledged(true);
  };

  return (
    <dialog ref={dialogRef} className="first-visit-disclaimer"
      aria-labelledby="first-visit-disclaimer-title"
      aria-describedby="first-visit-disclaimer-intro"
      onCancel={event => event.preventDefault()}>
      <div className="first-visit-disclaimer-body">
        <p className="first-visit-disclaimer-eyebrow">Before you explore</p>
        <h2 id="first-visit-disclaimer-title">An independent reading of the national budget</h2>
        <p id="first-visit-disclaimer-intro">
          This website provides independent, open-source analysis of Philippine national
          budget documents to help the public understand and scrutinize how public funds
          are allocated.
        </p>
        <p>Before using the data, please understand the following:</p>
        <ol className="first-visit-disclaimer-points">
          <li>
            <strong>Independent, not official</strong>
            <p>This is not a government website. Our analyses are independent and do not
              represent the official findings, positions, or endorsements of any
              government agency, legislator, or public official.</p>
          </li>
          <li>
            <strong>Check the original sources</strong>
            <p>While we strive for accuracy, data extraction, automated processing,
              project matching, and interpretation can contain errors or omissions.
              Figures may also change as new information or corrections become
              available. Always verify important findings against the linked
              official documents.</p>
          </li>
          <li>
            <strong>Flags are questions, not conclusions</strong>
            <p>Insertions, deletions, budget changes, red flags, and other classifications
              are analytical observations that warrant further review. They do not, on
              their own, establish wrongdoing, corruption, or irregularity.</p>
          </li>
          <li>
            <strong>Location does not establish responsibility</strong>
            <p>A project appearing under a legislative district, government office, or
              geographic area does not mean a particular legislator or official requested,
              inserted, approved, or controlled it. Geographic and administrative
              associations should not be mistaken for personal attribution.</p>
          </li>
          <li>
            <strong>Budgets are not expenditures</strong>
            <p>The amounts presented generally represent proposed or approved allocations
              at particular stages of the budget process. They do not necessarily
              reflect funds released, money spent, or projects implemented or completed.</p>
          </li>
          <li>
            <strong>Share responsibly</strong>
            <p>We encourage public scrutiny and independent verification. When citing or
              sharing findings, include the relevant budget stage, source documents,
              and date or dataset version. Preserve important qualifications and avoid
              presenting preliminary findings as established facts.</p>
          </li>
        </ol>
        <section className="first-visit-disclaimer-review" aria-label="Help improve the analysis">
          <h3>Help improve the analysis</h3>
          <p>Our work is open to public review and correction. If you find an error,
            inconsistency, or missing information, we encourage you to report it
            with supporting evidence.</p>
          <div className="first-visit-disclaimer-links">
            <a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/issues"
              target="_blank" rel="noopener noreferrer">Report an issue</a>
            <a href="#disclaimer">Read the full disclaimer</a>
          </div>
        </section>
      </div>
      <div className="first-visit-disclaimer-actions">
        <button type="button" className="first-visit-disclaimer-continue"
          onClick={continueToSite}>I understand — continue</button>
      </div>
      <p className="first-visit-disclaimer-storage">
        Your acknowledgement is saved in this browser only. You will not need to
        acknowledge this notice again unless it is updated.
      </p>
    </dialog>
  );
}
