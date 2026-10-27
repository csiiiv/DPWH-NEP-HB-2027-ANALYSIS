import React, { useEffect } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import notice from "../../../disclaimer/README.md?raw";
import { repo } from "./data.js";
import WorkbenchHeader from "./WorkbenchHeader.jsx";

// The Markdown remains readable on its own; its full-notice heading marks
// the boundary between the always-visible summary and the scrollable text.
const [summary, fullNotice] = notice.split("\n## Full disclaimer\n");

// Keep the public notice in one tracked source. Repository-relative evidence
// links must resolve on GitHub rather than against the deployed /app/ path.
function evidenceUrl(url) {
  if (url.startsWith("../")) return repo + url.slice(3);
  return defaultUrlTransform(url);
}

export default function DisclaimerApp() {
  useEffect(() => { document.title = "Disclaimer · FY2027 Budget Workbenches"; }, []);
  return (
    <>
      <a className="fmr-skip" href="#disclaimer-content" onClick={event => {
        event.preventDefault();
        document.getElementById("disclaimer-content")?.focus();
      }}>Skip to content</a>
      <WorkbenchHeader workspace="disclaimer" route="home" />
      <main id="disclaimer-content" tabIndex={-1} className="shell disclaimer-content">
        <div className="disclaimer-summary">
          <Markdown urlTransform={evidenceUrl}>{summary}</Markdown>
        </div>
        <section className="disclaimer-details">
          <h2 id="full-disclaimer-heading">Full disclaimer</h2>
          <p id="disclaimer-scroll-help">Scroll within the box to read the full methods and limitations.</p>
          <div className="disclaimer-scroll" role="region" aria-labelledby="full-disclaimer-heading"
            aria-describedby="disclaimer-scroll-help" tabIndex={0}>
            <Markdown urlTransform={evidenceUrl}>{fullNotice}</Markdown>
          </div>
        </section>
      </main>
    </>
  );
}
