import React from "react";

export function DisclaimerSummary() {
  return (
    <p className="fmr-notice">
      <strong>Disclaimer.</strong> This is an independent, unofficial analysis of
      retained FY2027 budget sources. Links from government or third-party sites
      do not themselves imply endorsement or official review. Project pairings
      and unsupported insertion, deletion, and amount-change classifications are provisional
      review leads; unmatched rows alone do not establish a legislative change or wrongdoing. Reconciliation results and exceptions are documented per
      dataset, and balanced totals do not certify individual matches. Results
      may change following source corrections, extraction repairs, or revised
      matching rules. Verify quoted figures against the cited source edition
      and retain the dataset version. <a href="#disclaimer">Read the full methods and limitations →</a>
    </p>
  );
}

export default function DisclaimerFooter() {
  return (
    <footer className="shell disclaimer-footer" aria-label="Analysis disclaimer">
      <p>
        Independent, unofficial analysis. Project pairings and unsupported insertion/deletion
        classifications are provisional review leads. Verify quoted figures
        against the cited source edition and dataset version.{" "}
        <a href="#disclaimer">Methods and limitations →</a>
      </p>
    </footer>
  );
}
