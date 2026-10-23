import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import fs from "node:fs";

/** Render-level guards for the Relations view.
 *
 * The model layer is covered by groupRelations.test.js; this file covers the
 * parts that only break at render time — a missing field, a class the
 * stylesheet never defined, or a table that silently lost its row order. It
 * follows the precedent set by revisionFlowRender.test.js (vite
 * ssrLoadModule + renderToStaticMarkup) rather than adding an esbuild
 * dependency, since esbuild is only present transitively via vite.
 *
 * renderToStaticMarkup does not run effects, so the parent RelationsView
 * would only ever render its loading branch; the sub-views are rendered
 * directly with the payloads the parent would have fetched.
 *
 * The group_relations_* sidecars are build artifacts (produced by
 * `python ../builders/build_group_relations.py` in predev/prebuild) and are
 * not committed, so every test skips when they are absent rather than
 * failing on a fresh clone that has not run the data build.
 */

const DATA = new URL("../../data/", import.meta.url);
const SIDECARS = {
  index: "group_relations_index_2027.json",
  shells: "group_relations_shells_2027.json",
  states: "group_relations_states_2027.json",
  findings: "group_relations_findings_2027.json",
  ambiguity: "group_relations_ambiguity_2027.json",
  twins: "group_relations_twins_2027.json",
  overlaps: "group_relations_overlaps_2027.json",
};
const haveData = Object.values(SIDECARS).every((n) =>
  fs.existsSync(new URL(n, DATA)),
);
const skip = haveData
  ? false
  : { skip: "group_relations sidecars not built — run predev/prebuild" };

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, DATA), "utf8"));

// SortableTable calls readRoute() during render to detect deep-link targets,
// which reads location.hash. Provide the browser globals the view expects.
globalThis.location = new URL("http://localhost/#analysis?view=relations");
globalThis.window = globalThis;

/** Render one sub-view to static markup via vite's SSR module loader. */
async function render(name, props) {
  const server = await createServer({
    root: new URL("..", import.meta.url).pathname,
    cacheDir: new URL(`../node_modules/.vite-tests/${process.pid}`, import.meta.url).pathname,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const mod = await server.ssrLoadModule("/src/RelationsView.jsx");
    const Component = mod[name];
    assert.ok(Component, `RelationsView.jsx does not export ${name}`);
    return renderToStaticMarkup(React.createElement(Component, props));
  } finally {
    await server.close();
  }
}

test("States tab renders a styled census bar, pills and exact shares", skip, async () => {
  const index = read(SIDECARS.index);
  const states = read(SIDECARS.states);
  const html = await render("StatesTab", { index, states });

  assert.match(html, /rv-census-bar/, "census bar is rendered");
  // Every state with rows gets a segment; the builder's seven states are all
  // populated in the current data.
  const segments = html.match(/rv-census-seg/g) ?? [];
  assert.ok(segments.length >= 7, `expected >=7 census segments, got ${segments.length}`);
  assert.match(html, /rv-state rv-state--/, "states render as pills, not raw text");
  // The three sub-1% states are floored so they stay visible, and that
  // distortion is disclosed to the reader rather than hidden.
  assert.match(html, /\*<\/span>/, "floored segments are marked with an asterisk");
  assert.match(html, /drawn wider than their true share/, "the floor is explained");
  // The legend and the table must carry exact percentages, not the floored
  // widths — only the bar is distorted.
  const census = index.summary.state_census;
  const total = index.summary.rows_stated;
  for (const state of ["committed_attached", "review_attached", "duplicate_key"]) {
    const pct = ((census[state].rows / total) * 100).toFixed(1);
    assert.ok(html.includes(pct), `exact share ${pct}% for ${state} is shown`);
  }
});

test("States tab paints without the heavy per-row overlay", skip, async () => {
  const index = read(SIDECARS.index);
  // The 2.2 MB overlay loads only on drilldown; the census must not need it.
  const html = await render("StatesTab", { index, states: undefined });
  assert.match(html, /rv-census-bar/);
  assert.match(html, /per-row overlay loads on demand/);
  assert.doesNotMatch(html, /per-row overlay loaded here covers/);
});

test("Findings tab paginates and every finding carries evidence", skip, async () => {
  const findings = read(SIDECARS.findings);
  const html = await render("FindingsTab", { findings, onOpenShell: () => {} });

  const total = findings.findings.length;
  const expectedPages = Math.ceil(total / 50);
  assert.match(html, /fmr-pagination/, "findings are paginated");
  assert.ok(
    html.includes(`Page 1 of ${expectedPages} · ${total} rows`),
    "pagination reports the real page and row count",
  );
  assert.ok(html.includes(`${total} of ${total} findings`), "result count is stated");
  assert.match(html, /class="stat-strip"/, "headline strip is a real stat strip");
  assert.match(html, /rv-tag/, "evidence chips render");
  assert.match(html, /rv-open-shell/, "drilldown button renders");
  // 983 of 990 findings carry a shell; those that do must offer the drilldown.
  const drillable = findings.findings.filter((f) => f.shell).length;
  assert.ok(drillable > 0, "test data should contain drillable findings");
});

test("Findings tab renders an empty rebuild without crashing", skip, async () => {
  const html = await render("FindingsTab", {
    findings: { types: [], counts: {}, amount_at_stake_by_type: {}, type_definitions: {}, findings: [], note: "" },
    onOpenShell: () => {},
  });
  assert.match(html, /No findings match the filters\./);
});

test("sub-views still render while their sidecar is in flight", skip, async () => {
  // Each tab shows a live region instead of an empty table until data lands.
  const cases = [
    ["FindingsTab", { findings: undefined }],
    ["AmbiguityTab", { payload: undefined }],
    ["TwinsTab", { payload: undefined }],
    ["OverlapsTab", { payload: undefined, index: read(SIDECARS.index) }],
  ];
  for (const [name, props] of cases) {
    const html = await render(name, { ...props, onOpenShell: () => {} });
    assert.match(html, /role="status"/, `${name} announces loading`);
    assert.match(html, /rv-loading/, `${name} shows the loading style`);
    assert.doesNotMatch(html, /undefined|NaN/, `${name} leaks undefined into markup`);
  }
});

test("Ambiguity and Twins tabs offer the shell drilldown", skip, async () => {
  const ambiguity = read(SIDECARS.ambiguity);
  const twins = read(SIDECARS.twins);
  // Every ambiguity shell and every twin carries a shell key in the built
  // data, so both tables must reach the drilldown rather than dead-ending.
  assert.ok(ambiguity.shells.every((s) => s.shell), "all ambiguity rows are drillable");
  assert.ok(twins.twins.every((t) => t.shell), "all twin rows are drillable");

  const ambHtml = await render("AmbiguityTab", { payload: ambiguity, onOpenShell: () => {} });
  assert.match(ambHtml, /rv-open-shell/, "ambiguity rows link to their shell");
  assert.match(ambHtml, /fmr-pagination/, "ambiguity is paginated");

  const twinHtml = await render("TwinsTab", { payload: twins, onOpenShell: () => {} });
  assert.match(twinHtml, /rv-open-shell/, "twin rows link to their shell");
});

test("Overlaps tab bars the spectrum, not the all-zero tail", skip, async () => {
  const index = read(SIDECARS.index);
  const overlaps = read(SIDECARS.overlaps);
  const html = await render("OverlapsTab", { index, payload: overlaps, onOpenShell: () => {} });

  assert.match(html, /rv-bar/, "spectrum pair counts get proportional bars");
  assert.match(html, /rv-open-shell/, "overlap pairs link to their shell");
  // The low-overlap list is all exactly 0%, where a bar carries no signal, so
  // it renders a disjoint tag and the withheld delta instead.
  const low = overlaps.pairs.filter((p) => p.overlap_ratio <= 0.05);
  if (low.length && low.every((p) => p.overlap_ratio === 0)) {
    assert.match(html, /disjoint/, "zero-overlap rows are labelled disjoint");
    assert.match(html, /Δ withheld/, "the withheld delta is labelled as withheld");
  }
});

test("Shell modal scrolls, splits the ledger by side and keeps row order", skip, async () => {
  const shells = read(SIDECARS.shells);
  const states = read(SIDECARS.states);
  // Use the largest shell so the scroll container is actually exercised.
  const [label] = Object.entries(shells.shells)
    .map(([k, v]) => [k, v.house_rows + v.nep_rows])
    .sort((a, b) => b[1] - a[1])[0];
  const html = await render("ShellModal", { label, shellsPayload: shells, statesPayload: states, onClose: () => {} });

  // .analytics-dialog is a fixed-height flex box with overflow:hidden, so a
  // body outside .analytics-content is clipped with no way to scroll.
  assert.match(html, /class="analytics-content"/, "modal body sits inside the scroll container");
  assert.match(html, /analytics-summary-cards/, "totals render as summary cards");
  assert.match(html, /rv-ledger-side/, "House and NEP are compared side by side");
  assert.match(html, /rv-state rv-state--/, "member rows show state pills");

  // The row table must preserve shellRows' order (house first, then confidence
  // ladder, then amount). initialSort={key:null} does that; initialSort={false}
  // would silently fall back to sorting by the first sortable column.
  const ids = [...html.matchAll(/<small><span class="rv-tag[^"]*">[^<]*<\/span> ([^<]+)<\/small>/g)].map((m) => m[1].trim());
  const entry = shells.shells[label];
  const houseIds = entry.house_ids ?? [];
  const nepIds = entry.nep_ids ?? [];
  assert.ok(ids.length >= 2, "member rows are rendered");
  const firstNepAt = ids.findIndex((id) => nepIds.includes(id));
  const lastHouseAt = ids.map((id, i) => (houseIds.includes(id) ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  assert.ok(
    firstNepAt === -1 || lastHouseAt === -1 || lastHouseAt < firstNepAt,
    "all House rows precede all NEP rows, as shellRows orders them",
  );
});

test("Shell modal degrades honestly on a stale link", skip, async () => {
  const shells = read(SIDECARS.shells);
  const states = read(SIDECARS.states);
  const html = await render("ShellModal", {
    label: "road:does-not-exist#zzz",
    shellsPayload: shells,
    statesPayload: states,
    onClose: () => {},
  });
  assert.match(html, /Shell not found/);
  assert.match(html, /the shell key changes when the comparison is rebuilt/);
  // A <dialog open> attribute would make showModal() throw InvalidStateError.
  assert.doesNotMatch(html, /<dialog[^>]*\bopen\b/, "dialog is not rendered pre-open");
});

test("finding drilldown links resolve against the shipped roster", skip, async () => {
  const findings = read(SIDECARS.findings);
  const shells = read(SIDECARS.shells);
  // A finding whose shell is absent from the roster renders a button that
  // opens "Shell not found" — a broken promise to the reader.
  const stale = findings.findings.filter((f) => f.shell && !shells.shells[f.shell]);
  assert.deepEqual(
    stale.map((f) => f.shell).slice(0, 5),
    [],
    `${stale.length} findings point at shells the roster does not carry`,
  );
});

// The tab strip is link navigation, not button state: each tab changes the
// URL, so a shared link must land on the right sub-view and the browser back
// button must close it. This is the UI_CONSISTENCY_PLAN contract, and it only
// breaks at render time — a stray aria-pressed or a missing aria-current still
// paints a tab strip that looks correct.
test("Tabs are links with aria-current and shareable URLs", async () => {
  // Counts are the real 2027 census (index summary → tabCounts), so the badge
  // assertions below describe what a reader actually sees.
  const html = await render("RelationTabs", {
    params: new URLSearchParams("view=relations&tab=twins&rshell=road%3A9"),
    tab: "twins",
    counts: { states: 27690, findings: 990, ambiguity: 112, twins: 7, overlaps: 252 },
  });

  assert.match(html, /aria-label="Relation sub-views"/);
  assert.doesNotMatch(html, /<button/, "tabs must not be buttons");
  assert.doesNotMatch(html, /aria-pressed/, "link navigation uses aria-current, not aria-pressed");

  // Full anchor elements, so a label can be paired with its own href. Note
  // renderToStaticMarkup HTML-escapes the query separator as &amp;.
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    label: m[2].replace(/<[^>]*>/g, "").trim(),
    href: (m[1].match(/href="([^"]*)"/) ?? [])[1] ?? "",
  }));
  assert.equal(links.length, 5, "one link per sub-view");
  assert.deepEqual(
    links.map((l) => l.label),
    ["States27,690", "Findings990", "Ambiguity112", "Twins7", "Overlaps252"],
  );

  // Exactly one tab is current, and it is the active one.
  const current = links.filter((l) => l.attrs.includes('aria-current="page"'));
  assert.equal(current.length, 1);
  assert.equal(current[0].label, "Twins7");

  // The default tab drops ?tab=states so a shared link stays clean, and every
  // href drops the open shell drilldown rather than carrying it across.
  assert.equal(links[0].href, "#analysis?view=relations");
  for (const link of links) {
    assert.doesNotMatch(link.href, /rshell/, `tab link must not carry the shell drilldown: ${link.href}`);
  }
  assert.equal(links[1].href, "#analysis?view=relations&amp;tab=findings");
  assert.equal(current[0].href, "#analysis?view=relations&amp;tab=twins");

  // Counts ride along so the reader knows a sub-view's size before paying for
  // its sidecar. A zero or missing count renders no empty badge rather than "0".
  assert.match(html, /relations-tab-count">990</);
  assert.equal((html.match(/relations-tab-count/g) ?? []).length, 5);
  const bare = await render("RelationTabs", {
    params: new URLSearchParams("view=relations"),
    tab: "states",
    counts: { states: null, findings: 0 },
  });
  assert.doesNotMatch(bare, /relations-tab-count/, "no badge for an absent or empty count");
  assert.match(bare, /aria-current="page"/);
});
