import React, { useEffect } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import notice from "../../../disclaimer/README.md?raw";
import { repo } from "./data.js";
import WorkbenchHeader from "./WorkbenchHeader.jsx";

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
        <Markdown urlTransform={evidenceUrl}>{notice}</Markdown>
      </main>
    </>
  );
}
