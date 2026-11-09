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
        <h2 id="first-visit-disclaimer-title">Important notes about this budget analysis</h2>
        <p id="first-visit-disclaimer-intro">
          This is <strong>independent, unofficial analysis</strong> of Philippine budget documents.
          It is not a government website.
        </p>
        <ul>
          <li><strong>Comparisons are provisional.</strong> Matches, insertions, deletions,
            rankings and red flags are leads for review, not proof of wrongdoing or of
            who requested a project.</li>
          <li><strong>Figures can be incomplete or incorrect.</strong> Check amounts and
            findings against the linked source documents before quoting or sharing.</li>
          <li><strong>Budgeted does not mean spent.</strong> Allocations do not establish
            that money was released or that a project was completed.</li>
        </ul>
        <p className="first-visit-disclaimer-note">
          When sharing findings, include the source, budget stage and relevant limitations.
        </p>
      </div>
      <div className="first-visit-disclaimer-actions">
        <button type="button" className="first-visit-disclaimer-continue"
          onClick={continueToSite}>I understand — continue</button>
        <a href="#disclaimer">Read full disclaimer and methods</a>
      </div>
      <p className="first-visit-disclaimer-storage">
        This notice is shown once per browser unless it changes. Your acknowledgement is
        stored only in this browser.
      </p>
    </dialog>
  );
}
