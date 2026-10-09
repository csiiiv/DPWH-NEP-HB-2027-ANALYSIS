import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import verificationTemplate from "../../viewers/source_verification.template.html?raw";
import treeTemplate from "../../viewers/nep_tree_viewer.template.html?raw";
import comparisonTemplate from "../../viewers/current_dashboard.template.html?raw";
import verificationCss from "../../viewers/source_verification.css?raw";
import { mountVerification } from "./workspaces/verification.js";
import { mountTree } from "./workspaces/tree.js";
import { mountHouseComparison } from "./workspaces/houseComparison.js";
import { mountBudgetDisplay } from "./workspaces/budgetDisplay.js";
import { loadData, repo, siteUrl, treeSourceReference, retainedAssetUrl, sourceDocument } from "./data.js";
import { legacyRoutes, routeHref, routes, readRoute } from "./routes.js";
const PdfPreview = lazy(() => import("./PdfPreview.jsx"));

// Keep the established review controllers in a scoped React-owned workspace.
// No iframe, inline script execution, or global controller state is required.
function scopedCss(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const convert = (rules) => [...rules].map(rule => {
    if (rule.type === CSSRule.STYLE_RULE) {
      const selectors = rule.selectorText.split(",").map(selector => {
        const value = selector.trim().replace(/^(?:html|body|:root)(?=$|[\s:.#])/g, ".retained-view");
        return value.startsWith(".retained-view") ? value : ".retained-view " + value;
      });
      return `${selectors.join(",")}{${rule.style.cssText}}`;
    }
    if (rule.cssRules) return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${convert(rule.cssRules)}}`;
    return rule.cssText;
  }).join("\n");
  return convert(sheet.cssRules);
}

function mount(root, template, route, payloads, onSourceSelection, onPdfSlot) {
  const parsed = new DOMParser().parseFromString(template, "text/html");
  const css = [...parsed.querySelectorAll("style")].map(s => s.textContent).join("\n") +
    (['house', 'nep', 'transparency'].includes(route.key) ? verificationCss : "");
  parsed.querySelectorAll("script, nav.page-tabs").forEach(e => e.remove());
  parsed.querySelectorAll("main").forEach(e => {
    const section = parsed.createElement("section");
    [...e.attributes].forEach(a => section.setAttribute(a.name, a.value));
    section.append(...e.childNodes); e.replaceWith(section);
  });
  root.innerHTML = parsed.body.innerHTML;
  const style = document.createElement("style");
  style.textContent = scopedCss(css); root.prepend(style);
  if (route.key === "house" || route.key === "nep") {
    const workspace = root.querySelector("#workspace");
    const column = document.createElement("div");
    column.className = "tree-evidence-column";
    column.append(root.querySelector(".tree"), root.querySelector("#details"));
    const slot = document.createElement("aside");
    slot.className = "tree-pdf-pane";
    slot.setAttribute("aria-label", "Tree source PDF");
    workspace.append(column, slot);
    onPdfSlot(slot);
  }
  const handlers = [];
  const localDocument = {
    getElementById: id => root.querySelector(`[id="${CSS.escape(id)}"]`),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: tag => document.createElement(tag),
    createDocumentFragment: () => document.createDocumentFragment(),
    get activeElement() { return document.activeElement; },
    body: root, head: root,
    addEventListener(type, fn, options) { root.addEventListener(type, fn, options); handlers.push([type, fn, options]); },
  };
  const localWindow = {
    SITE_CONFIG: { sourcePdf: sourceDocument("nep").url },
    location: { hash: route.params.get("view") === "review" ? "#review" : "" },
    matchMedia: window.matchMedia.bind(window),
    onSourceSelection,
  };
  let budget, destroyController;
  if (['house', 'nep', 'transparency'].includes(route.key)) {
    root.querySelector("h1").textContent = route.key === "house" ? "House GAB — source hierarchy" : route.key === "nep" ? "DBM NEP — source hierarchy" : payloads[0].title;
    mountVerification(localDocument, {
      onSourceSelection, initialNode: route.params.get("node"),
      reviewMode: route.params.get("view") === "review", matchMedia: window.matchMedia.bind(window),
      downloadUrl: retainedAssetUrl,
    }, payloads[0]);
  } else {
    budget = mountBudgetDisplay(localDocument);
    if (route.key === "nep-detail") destroyController = mountTree(localDocument, localWindow, budget.api, payloads[0], { review: payloads[1].records, repairs: payloads[2].repairs });
    else mountHouseComparison(localDocument, localWindow, budget.api, payloads[0]);
  }
  const rewrite = () => {
    root.querySelectorAll("a[href], img[src]").forEach(element => {
      const attr = element.tagName === "IMG" ? "src" : "href", value = element.getAttribute(attr);
      if (!value || /^(?:https?:|blob:|data:)/.test(value)) return;
      if (value.startsWith("#") && routes[readRoute(value).key]) return;
      const [path, fragment] = value.split("#"), filename = path.split("/").pop();
      let next;
      if (legacyRoutes[filename]) next = routeHref(legacyRoutes[filename], fragment ? (fragment === "review" ? { view: "review" } : { section: fragment }) : {});
      else if (!path) next = routeHref(route.key, { section: fragment });
      else if (path.endsWith(".md")) next = repo + (path.includes("docs/") ? "analysis/docs/" : "analysis/") + filename;
      else if (filename === "fy2027-combined.json") next = siteUrl("analysis/fy2027-combined.json");
      else if (path.includes("HB_BUDGET/")) next = siteUrl("HB_BUDGET/" + filename) + (fragment ? "#" + fragment : "");
      else if (path.includes("source_review_evidence/")) next = siteUrl("analysis/source_review_evidence/" + path.split("source_review_evidence/")[1]);
      else next = siteUrl("analysis/" + filename);
      if (next !== value) element.setAttribute(attr, next);
    });
  };
  rewrite();
  const observer = new MutationObserver(rewrite);
  observer.observe(root, { subtree: true, childList: true });
  const section = route.params.get("section");
  if (section) localDocument.getElementById(section)?.scrollIntoView();
  return () => {
    observer.disconnect(); budget?.destroy(); destroyController?.();
    handlers.forEach(([type, fn, options]) => root.removeEventListener(type, fn, options));
    root.replaceChildren();
  };
}

export default function SourceWorkspace({ route }) {
  const host = useRef(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [source, setSource] = useState(null), [pdfSlot, setPdfSlot] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); let dispose;
    const keys = {house: 'hb', nep: 'nep', transparency: 'dpwh_nep_api'};
    const files = keys[route.key] ? [`verification_${keys[route.key]}.json`] : route.key === "nep-detail" ?
      ["nep_2027_tree.json", "nep_2027_native_amount_review.json", "nep_2027_tree_validation.json"] : ["source_comparison_2027.json"];
    setLoading(true); setError(""); setSource(null); setPdfSlot(null);
    Promise.all(files.map(name => loadData(name, controller.signal))).then(payloads => {
      if (controller.signal.aborted) return;
      const selectSource = (node, { reveal = false } = {}) => {
        setSource(treeSourceReference(route.key, node));
        if (reveal) host.current.querySelector(".tree-pdf-pane")?.scrollIntoView({ block: "start", behavior: "instant" });
      };
      dispose = mount(host.current, keys[route.key] ? verificationTemplate : route.key === "nep-detail" ? treeTemplate : comparisonTemplate, route, payloads, selectSource, setPdfSlot);
      setLoading(false);
    }).catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });
    return () => { controller.abort(); dispose?.(); };
  }, [route.key, route.params.toString()]);
  return <>{loading && <p role="status">Loading source workspace…</p>}{error && <p role="alert">{error}</p>}
    <div className={`retained-view ${["house", "nep"].includes(route.key) ? "with-tree-pdf" : ""}`} ref={host} />
    {pdfSlot && createPortal(source ? <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
      <PdfPreview source={source} onClose={() => setSource(null)} />
    </Suspense> : <div className="pdf-empty"><h2>Source PDF</h2><p>Select a tree item with a recorded PDF page to preview it.</p></div>, pdfSlot)}
    </>;
}
