import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import fs from "node:fs";
import { sortedCards, parseCardSort, districtSeats, fmrRows, fmrExplorerRow, mpbExplorerRow } from "./congressModel.js";
import { locationCards, cardRows } from "./congressModel.js";
import { buildFmrRedFlags } from "./fmrRedFlags.js";

/** Render-level guards for the #congress workspace.
 *
 * congressModel.test.js and congressIndex.test.js cover the data layer — the
 * card figures, row-ID pinning and tie-outs. This file covers what only
 * breaks at render time: a sort control whose options never reach the model,
 * a gated dataset whose explanation dialog can never open, a tab strip that
 * loses its current page one level down, or an explorer that shows a fake
 * "0 of 0 records" while its payload is still loading.
 *
 * It follows relationsViewRender.test.js (vite ssrLoadModule +
 * renderToStaticMarkup). The committed index is required, matching the other
 * congress test files: card figures are meaningless without it.
 */

const DATA = new URL("../../data/", import.meta.url);
const INDEX = "congress_district_index_2027.json";
const LOCATION_INDEX = "location_district_index_2027.json";
const FMR_INDEX = "fmr_legislative_index_2027.json";
const MPB_INDEX = "mpb_legislative_index_2027.json";
const FMR_DETAIL = new URL("../../../other-analysis/data/fmr_workbench.json", import.meta.url);
// The index is derived (predev/prebuild, gitignored); the drawer test also
// reads the comparison payload, so guard on both.
const haveIndex = fs.existsSync(new URL(INDEX, DATA)) &&
  fs.existsSync(new URL("comparison_projects_2027.json", DATA));
const skip = haveIndex ? false : { skip: "congress datasets not built — run predev/prebuild" };
const skipLocation = haveIndex && fs.existsSync(new URL(LOCATION_INDEX, DATA))
  ? false : { skip: "location-lens dataset not built — run predev/prebuild" };
const skipFmr = haveIndex && fs.existsSync(new URL(FMR_INDEX, DATA)) && fs.existsSync(FMR_DETAIL)
  ? false : { skip: "FMR legislative datasets not built — run predev/prebuild" };
const skipMpb = haveIndex && fs.existsSync(new URL(MPB_INDEX, DATA))
  ? false : { skip: "MPB legislative dataset not built — run predev/prebuild" };

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, DATA), "utf8"));

// SortableTable and ShareLink read location during render; provide the
// browser globals static markup expects. navigator is assigned only when
// absent: Node >= 22 ships it as a getter-only global, and re-assigning
// (even x = x ?? fallback) throws "which has only a getter".
globalThis.location = new URL("http://localhost/#congress");
globalThis.window = globalThis;
if (!globalThis.navigator) {
  globalThis.navigator = {clipboard: {writeText: async () => {}}};
}

const route = (key, params = "") => ({key, params: new URLSearchParams(params)});

/** Render one exported sub-view to static markup via vite's SSR loader. */
async function render(name, props) {
  const server = await createServer({
    root: new URL("..", import.meta.url).pathname,
    cacheDir: new URL(`../node_modules/.vite-tests/${process.pid}`, import.meta.url).pathname,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const mod = await server.ssrLoadModule("/src/CongressApp.jsx");
    const Component = mod[name];
    assert.ok(Component, `CongressApp.jsx does not export ${name}`);
    return renderToStaticMarkup(React.createElement(Component, props));
  } finally {
    await server.close();
  }
}

const districtLine = (card) =>
  card.districts.map((district) => district.displayName).join(" · ");

/** The grid's card filter, replicated: search matches seats, ledger names and
 * the card label (see Districts' `visible` memo). Used to reproduce a live
 * search's exact card set for the summary modal test. */
const matches = (card, needle) => {
  const seats = districtSeats(card);
  return seats.some((seat) => [seat.districtName, seat.representative, seat.jurisdiction,
    seat.officialSeat, ...seat.candidates].some((value) =>
    value && String(value).toLowerCase().includes(needle))) ||
    card.ledger_names.some((name) => name.toLowerCase().includes(needle)) ||
    card.card_label?.toLowerCase().includes(needle);
};

test("the card grid renders from the index alone, with every sort option offered", skip, async () => {
  const index = read(INDEX);
  const html = await render("Districts", {index, route: route("home")});

  // One article per card, each with its tier badge — no tier ever prints raw.
  const articles = html.match(/<article class="congress-card /g) ?? [];
  assert.equal(articles.length, index.cards.length);
  assert.ok(html.includes("congress-card tier-A"));
  assert.ok(html.includes("congress-card tier-B"));
  assert.ok(html.includes("congress-card tier-none"));
  assert.doesNotMatch(html, /tier-undefined|tier-null|\[object/);

  // The DEO lens consistently leads with office names for both one-district
  // Tier A cards and shared Tier B cards. Representatives remain seat details.
  const tierA = index.cards.find((card) => card.tier === "A");
  const tierB = index.cards.find((card) => card.tier === "B");
  assert.ok(tierA?.offices[0]?.name);
  assert.ok(tierB?.offices[0]?.name);
  assert.ok(html.includes(`>${tierA.offices[0].name}</button>`));
  assert.ok(html.includes(`>${tierB.offices[0].name}</button>`));
  assert.ok(html.includes(tierA.districts[0].representative.name));
  assert.doesNotMatch(html, />\d+ representatives · undivided range<\/button>/);

  // The sort controls are two decisions: every option key is offered, and the
  // direction select labels itself by what the measure sorts (records or
  // amounts) rather than a bare ascending/descending.
  for (const label of ["HGAB3 amount", "NEP amount", "Unsupported insertion records",
    "Deletion records", "Adjusted pairs", "All records on the card", "District name (A→Z)"]) {
    assert.ok(html.includes(label), `sort option missing: ${label}`);
  }
  // Direction labels follow the active measure, so each kind needs its own render.
  assert.ok(html.includes("Largest amount first"));
  assert.ok(html.includes("Smallest amount first"));
  const records = await render("Districts", {index, route: route("home", "sort=rows")});
  assert.ok(records.includes("Most records first"));
  assert.ok(records.includes("Fewest records first"));

  // Portraits resolve to the packaged WebP set, never to a raw roster JPEG.
  const portraits = html.match(/src="[^"]*congress_portraits\/[^"]+\.webp"/g) ?? [];
  assert.ok(portraits.length > 100, `expected portraits on most cards, saw ${portraits.length.length ?? portraits.length}`);
  assert.doesNotMatch(html, /photos\/[^"]+\.jpg/);

  // A ₱0 card explains itself rather than showing empty buckets.
  const noneCard = index.cards.find((card) => card.tier === "none");
  assert.ok(html.includes(noneCard.tier_note.slice(0, 40)));

  // The residual share the hero states matches the index.
  assert.ok(html.includes("Unattributable"));
  assert.ok(html.includes(index.counts.districts.toLocaleString("en-PH")));
});

test("the grid order follows the URL sort params, both directions, every key", skip, async () => {
  const index = read(INDEX);
  // The regression this guards: the view once called sortedCards() without the
  // parsed sort, silently degrading every option to the HGAB3-descending
  // default. Rendering with URL params proves the pipeline params → view →
  // model actually moves the cards.
  const cases = [
    {sort: "rows", dir: "asc"},
    {sort: "rows", dir: "desc"},
    {sort: "insertions", dir: "desc"},
    {sort: "deletions", dir: "asc"},
    {sort: "nep_php", dir: "asc"},
    {sort: "district", dir: "asc"},
  ];
  for (const {sort, dir} of cases) {
    const html = await render("Districts", {index, route: route("home", `sort=${sort}&dir=${dir}`)});
    const order = [...html.matchAll(/<p class="congress-district">([^<]*)<\/p>/g)]
      .map((match) => match[1]);
    assert.equal(order.length, index.cards.length, `${sort} ${dir} lost cards`);
    const expected = sortedCards(index.cards, parseCardSort(sort, dir)).map(districtLine);
    // HTML-escape only affects &<>"' — display names carry none of those.
    assert.deepEqual(order, expected, `${sort} ${dir}: grid order does not follow the URL`);
  }
});

test("gated datasets stay clickable so their explanation dialog can open", skip, async () => {
  const index = read(INDEX);
  const card = index.cards.find((entry) => entry.tier === "A" && entry.rows > 0);
  const html = await render("District", {index, detail: null, route: route("district", `district=${card.id}`)});

  // Gated chips stay real buttons — a disabled button can never fire the click
  // that opens the not-attributable dialog, which made it dead code. The gate
  // is carried by a class and the chip's own label, not by disabledness.
  const disabled = html.match(/<button[^>]*\sdisabled[^>]*>/g) ?? [];
  assert.equal(disabled.length, 0, `rendered ${disabled.length} disabled buttons`);
  assert.equal((html.match(/congress-dataset gated/g) ?? []).length, 3,
    "exactly HFEP, FMR and NIA are gated");
  // Every gated chip states why it is gated.
  assert.equal((html.match(/>not attributable</g) ?? []).length, 3);
  // The active chip is DPWH by default…
  assert.match(html, /class="congress-dataset active"[^>]*>\s*DPWH/);
  // …and stays highlighted even when the URL carries a garbage dataset param,
  // because the chip compares against the resolved dataset, not the raw param.
  const bogus = await render("District", {index, detail: null,
    route: route("district", `district=${card.id}&dataset=bogus`)});
  assert.match(bogus, /class="congress-dataset active"[^>]*>\s*DPWH/);
});

test("the explorer hero renders from the index while the payload is still loading", skip, async () => {
  const index = read(INDEX);
  const card = index.cards.find((entry) => entry.tier === "A" && entry.rows > 10);
  const seats = districtSeats(card);
  const html = await render("District", {index, detail: null, route: route("district", `district=${card.id}`)});

  // The hero and the six headline stats come from the committed index, so the
  // page is useful before — and even without — the 50 MB payload.
  assert.ok(html.includes(seats[0].representative));
  assert.ok(html.includes("Total NEP"));
  assert.ok(html.includes("Total HGAB"));
  // Not a fake "0 of 0 records": the count the index knows is stated.
  assert.ok(html.includes(`This card holds ${card.rows.toLocaleString("en-PH")} records`));
  assert.doesNotMatch(html, /0 of 0 records/);
  assert.ok(html.includes("Loading the comparison payload"));
});

test("the location explorer shows the evidence that assigned each project", skipLocation, async () => {
  const index = read(INDEX);
  const locationIndex = read(LOCATION_INDEX);
  const detail = read("comparison_projects_2027.json");
  const card = locationIndex.cards.find((entry) =>
    Object.values(entry.row_ids).flat().includes("house-reading:2410"));
  assert.ok(card, "Nangcaon location card is missing");

  const html = await render("District", {index, locationIndex, detail, lens: "location",
    route: route("district", `district=${encodeURIComponent(card.id)}&lens=location&tableView=full`)});
  const simple = await render("District", {index, locationIndex, detail, lens: "location",
    route: route("district", `district=${encodeURIComponent(card.id)}&lens=location`)});
  assert.match(simple, /aria-pressed="true">Simple<\/button>/);
  assert.ok(!simple.includes('>Assignment basis</span>'));
  assert.ok(!simple.includes('>Title PSGC location</span>'));
  assert.ok(!simple.includes('>Chainage</span>'));
  assert.ok(simple.includes('Source page'));
  assert.match(html, /aria-pressed="true">Full<\/button>/);
  assert.ok(html.includes("Assignment basis"));
  assert.ok(html.includes("Title location + printed DEO"));
  assert.ok(html.includes("Misamis Oriental 2nd District Engineering Office"));
  assert.ok(html.includes("Barangay Nangcaon"));
});

test("a failed payload shows a scoped error, never a blank workspace", skip, async () => {
  const index = read(INDEX);
  const card = index.cards.find((entry) => entry.tier === "A" && entry.rows > 0);
  const html = await render("District", {index, detail: null,
    detailError: "Could not load comparison_projects_2027.json (504).",
    route: route("district", `district=${card.id}`)});

  // The scoped error renders inside the explorer section…
  assert.ok(html.includes("congress-detail-error"));
  assert.ok(html.includes("The project records could not load"));
  assert.ok(html.includes("504"));
  // …the hero above it still stands…
  assert.ok(html.includes(districtSeats(card)[0].representative));
  // …and the card figures are explicitly declared unaffected.
  assert.ok(html.includes("unaffected"));
});

test("an unknown district id degrades to a friendly not-found page", skip, async () => {
  const index = read(INDEX);
  const html = await render("District", {index, detail: null,
    route: route("district", "district=leg:atlantis:1st")});
  assert.ok(html.includes("District not found"));
  assert.ok(html.includes("leg:atlantis:1st"));
  assert.ok(html.includes('href="#congress/home"'), "must link back to the grid");
});

test("the Show summary button is offered on both lens grids, opening a tied-out movements table", skip, async () => {
  const index = read(INDEX);
  for (const [key, props] of [
    ["home", {index, route: route("home")}],
    ["location", {index, route: route("location"), lens: "location", locationIndex: read(LOCATION_INDEX)}],
    ["fmr", {index, route: route("fmr"), lens: "fmr", fmrIndex: read(FMR_INDEX)}],
  ]) {
    const html = await render("Districts", props);
    // The button sits in the controls row, on every lens…
    assert.ok(html.includes(">Show summary</button>"), `${key}: button missing`);
    // …and stays a real button so the modal can open (the gated-dataset rule).
    assert.doesNotMatch(html, /Show summary[^>]*disabled/);
  }
});

test("the FMR grid offers an all-districts export that other lenses do not", skipFmr, async () => {
  const index = read(INDEX);
  const fmr = await render("Districts", {index, fmrIndex: read(FMR_INDEX), lens: "fmr",
    route: route("fmr")});
  assert.ok(fmr.includes(">Export all districts…</button>"),
    "FMR grid must offer the full-lens export");
  // Other lenses keep the grid light — they never promise a full-row download.
  const home = await render("Districts", {index, route: route("home")});
  assert.ok(!home.includes("Export all districts"), "DEO grid must not offer FMR export");
});

test("the FMR legislative grid and explorer expose assignment evidence", skipFmr, async () => {
  const index = read(INDEX);
  const fmrIndex = read(FMR_INDEX);
  const detail = JSON.parse(fs.readFileSync(FMR_DETAIL, "utf8"));
  const grid = await render("Districts", {index, fmrIndex, lens: "fmr", route: route("fmr")});
  assert.ok(grid.includes("Farm-to-market roads by legislative district"));
  assert.ok(grid.includes("House only"));
  assert.ok(grid.includes("FMR → LEG"));

  const card = fmrIndex.cards.find(entry =>
    entry.row_ids.insertions.length === 0 && entry.row_ids.deletions.length === 0 &&
    entry.row_ids.increased.length + entry.row_ids.reduced.length + entry.row_ids.unchanged.length > 5);
  assert.ok(card, 'no paired-only FMR district card is available for the source-link render test');
  const html = await render("District", {index, fmrIndex, detail, lens: "fmr",
    route: route("district", `district=${encodeURIComponent(card.id)}&lens=fmr&tableView=full`)});
  assert.ok(html.includes("Assignment basis"));
  assert.ok(html.includes("candidate stages"));
  assert.ok(html.includes("default source-analysis screens"));
  assert.ok(html.includes(">View map</button>"));
  assert.ok(html.includes(">View all segments</button>"));

  // The default table page can change as assignment rules move rows between
  // cards. Render a known paired row's drawer to prove both physical source
  // documents remain disclosed without coupling the assertion to pagination.
  const pairedId = [...card.row_ids.increased, ...card.row_ids.reduced, ...card.row_ids.unchanged][0];
  const paired = fmrRows(detail).find(row => row.id === pairedId);
  const drawer = await render("RecordDrawer", {
    record: fmrExplorerRow(paired, fmrIndex.row_resolution[pairedId]),
    onPdf: () => {}, onClose: () => {},
  });
  assert.ok(drawer.includes("HB 10858 · 2nd reading · Vol I-B (FMR annex)"));
  assert.ok(drawer.includes("NEP 2027 · FMR schedule"));

  const analysis = Object.fromEntries(["house", "nep"].map(stage => [stage,
    new Map(buildFmrRedFlags(detail, stage).rows.map(row => [row.id, row]))]));
  const reviewRow = fmrRows(detail).find(row => row.title ===
    "Construction of NRJ, Soysoyan-Ballay-Tawangan-Lusod Proper FMR, Kabayan, Benguet");
  const reviewDrawer = await render("RecordDrawer", {
    record: fmrExplorerRow(reviewRow, fmrIndex.row_resolution[reviewRow.id], analysis),
    onPdf: () => {}, onMap: () => {}, onClose: () => {},
  });
  assert.ok(reviewDrawer.includes("FMR source-analysis evidence"));
  assert.ok(reviewDrawer.includes("Long endpoint span"));
  assert.ok(reviewDrawer.includes("Coordinate/title province disagreement"));
  assert.ok(reviewDrawer.includes("Longest section: 14.87 km"));
  assert.ok(reviewDrawer.includes("#fmr/analysis?view=red_flags"));
  assert.ok(reviewDrawer.includes(">Show project map</button>"));
  assert.ok(!reviewDrawer.includes("openstreetmap.org"));

  // A corrected coordinate discloses its provenance in the drawer: the flag
  // chip, the per-stage evidence list and a link into the source record.
  const correctedRow = fmrRows(detail).find(row => row.id === "pair:nep_fmr:p18:r15:ib:p685:r5");
  assert.ok(correctedRow, "Tampac I comparison row missing");
  const correctedDrawer = await render("RecordDrawer", {
    record: fmrExplorerRow(correctedRow, fmrIndex.row_resolution[correctedRow.id]),
    onPdf: () => {}, onMap: () => {}, onClose: () => {},
  });
  assert.ok(correctedDrawer.includes("Coordinate correction applied"));
  assert.ok(correctedDrawer.includes("Coordinate corrections applied"));
  assert.ok(correctedDrawer.includes("Off-by-one-digit repair accepted"));
  assert.ok(correctedDrawer.includes("nep_fmr:p18:r15"));
  assert.ok(correctedDrawer.includes("#fmr/nep?node=nep_fmr%3Ap18%3Ar15"));
  assert.ok(correctedDrawer.includes("provenance, not an open problem"));
  // Provenance is a first-class dimension: the correction badge sits in the
  // drawer's meta chips, and the analytic-flags list stays warning-only.
  assert.match(correctedDrawer, /class="fmr-badge provenance"[^>]*>Coordinate correction applied</);
  assert.ok(!correctedDrawer.includes('<li>Coordinate correction applied</li>'));
});

test("the FMR explorer exposes provenance as its own column and filter", skipFmr, async () => {
  const index = read(INDEX);
  const fmrIndex = read(FMR_INDEX);
  const detail = JSON.parse(fs.readFileSync(FMR_DETAIL, "utf8"));
  // Nueva Ecija 1st carries both correction variants: the accepted digit
  // repair (Tampac I) and the image-reviewed OCR transcription (Valeriana).
  const html = await render("District", {index, fmrIndex, detail, lens: "fmr",
    route: route("district", "district=fmr%3Adistrict%3Aleg%3Anueva-ecija%3A1st&lens=fmr")});

  // The dedicated column and filter select appear once the census is nonzero…
  assert.ok(html.includes("All provenance"), "provenance filter default option missing");
  assert.ok(html.includes("Coordinate correction applied (2)"),
    "provenance filter must count both corrected rows on Nueva Ecija 1st");
  const headers = html.match(/<th[^>]*>.*?<\/th>/gs) ?? [];
  assert.ok(headers.some(th => th.includes(">Provenance<")),
    "provenance column header missing from the explorer table");

  // …and filtering by provenance narrows to the corrected rows only, without
  // touching the analytic-flag filter.
  const filtered = await render("District", {index, fmrIndex, detail, lens: "fmr",
    route: route("district", "district=fmr%3Adistrict%3Aleg%3Anueva-ecija%3A1st&lens=fmr&provenance=coordinate_correction_applied")});
  assert.ok(filtered.includes("2 of "), "provenance filter must narrow the row count");
  assert.ok(filtered.includes('value="coordinate_correction_applied" selected'),
    "provenance select must hold the active filter");
  assert.ok(filtered.includes("Corrected · House+NEP"),
    "provenance cell must name the amended stages");
});

test("the summary modal lists one row per card with NEP, amended and increase, then totals", skipLocation, async () => {
  const locationIndex = read(LOCATION_INDEX);
  // The same “manila 3rd” search the live view runs. The modal is URL state
  // (?summary=1 rides with the filters), so rendering the grid route with
  // both params must produce the modal over the filtered set — the full
  // share-link pipeline, not a direct component render.
  const html = await render("Districts", {index: read(INDEX), locationIndex, lens: "location",
    route: route("location", "q=manila+3rd&summary=1")});

  // The modal is open, scoped to the search…
  assert.ok(html.includes("congress-summary"));
  assert.ok(html.includes("\u201Cmanila 3rd\u201D"));
  // Allocation-table headers, sample-format vocabulary.
  for (const header of ["District / City", "Representative", "NEP", "Amended (HGAB3)", "Increase"]) {
    assert.ok(html.includes(header), `header missing: ${header}`);
  }
  // One row per surviving card — its district line prints.
  const cards = locationCards(locationIndex).filter(card => matches(card, "manila 3rd"));
  assert.ok(cards.length > 1, "expected multiple cards for the manila 3rd search");
  const {districtSeats} = await import("./congressModel.js");
  for (const card of cards) {
    const seats = districtSeats(card);
    const name = card.location_tier === "deo" && card.card_label ? card.card_label
      : card.location_tier === "region" ? card.region
      : seats.length ? seats.map(seat => seat.districtName).join(" · ")
      : card.card_label ?? card.id;
    assert.ok(html.includes(name), `row missing for ${card.id}`);
  }
  // The TOTAL row and the three tiles from the sample format.
  assert.ok(html.includes(`Total · ${cards.length} cards`));
  for (const tile of ["Original NEP", "Amended (HGAB3)", "Net increase"]) {
    assert.ok(html.includes(tile), `tile missing: ${tile}`);
  }
  // The tie-out is declared.
  assert.ok(html.includes("Totals are exact sums of the cards above."));
});

test("closing the summary modal clears the URL param without touching the filters", skip, async () => {
  // Rendering with the param proves the modal opens from a shared link;
  // closing emits setFilter({summary: null}) which navigates the param away
  // while q/tier/sort stay. The navigate contract is covered by routes tests;
  // here we assert the grid keeps its filtered card set alongside the modal.
  const index = read(INDEX);
  const html = await render("Districts", {index,
    route: route("home", "q=road&summary=1")});
  assert.ok(html.includes("congress-summary"));
  // Filters survive the modal being open — the modal scopes them, not replaces.
  assert.ok((html.match(/<article class="congress-card /g) ?? []).length < index.cards.length);
});

test("a search filter narrows the grid and the count status says so", skip, async () => {
  const index = read(INDEX);
  const needle = districtSeats(index.cards[0])[0].representative.split(" ")[0];
  const html = await render("Districts", {index, route: route("home", `q=${encodeURIComponent(needle)}`)});
  const articles = html.match(/<article class="congress-card /g) ?? [];
  assert.ok(articles.length < index.cards.length, "a search must narrow the grid");
  assert.ok(articles.length >= 1);
  assert.ok(html.includes(`${articles.length} of ${index.cards.length} cards`));
  // Every surviving card matches the needle in some searchable field.
  const order = [...html.matchAll(/<p class="congress-district">([^<]*)<\/p>/g)].map((m) => m[1]);
  const expected = sortedCards(index.cards.filter((card) => {
    const seats = districtSeats(card);
    return seats.some((seat) => [seat.districtName, seat.representative, seat.jurisdiction,
      seat.officialSeat, ...seat.candidates].some((value) =>
      value && String(value).toLowerCase().includes(needle.toLowerCase()))) ||
      card.ledger_names.some((name) => name.toLowerCase().includes(needle.toLowerCase()));
  }), parseCardSort(undefined, undefined)).map(districtLine);
  assert.deepEqual(order, expected);
});

test("the record drawer renders flags, PDF deep-links and title coordinate provenance", skip, async () => {
  const index = read(INDEX);
  // A row that exercises the drawer's richest paths: both stages, chainage and
  // a coordinate printed in the title.
  const rows = sortedCards(index.cards, {key: "rows", direction: "desc"});
  const {congressRows, indexRowsById, cardRows, explorerRow} =
    await import("./congressModel.js");
  const {suggestedCounterparts} = await import("./suggestedCounterparts.js");
  const detail = read("comparison_projects_2027.json");
  const prepared = congressRows(detail);
  const byId = indexRowsById(prepared);
  const counterparts = suggestedCounterparts(prepared);
  let chosen = null;
  for (const card of rows) {
    for (const row of cardRows(card, byId)) {
      const view = explorerRow(row, {counterparts});
      if (view.house && view.nep && view.pdf.length >= 2 && view.coordinates?.some((entry) => entry.from_title)) {
        chosen = view;
        break;
      }
    }
    if (chosen) break;
  }
  assert.ok(chosen, "no row carries both stages, two PDF pages and a title coordinate");

  const html = await render("RecordDrawer", {record: chosen, onPdf: () => {}, onClose: () => {}});
  // Identity and the bucket label, never a raw bucket key.
  assert.ok(html.includes(chosen.title.slice(0, 30)));
  assert.ok(html.includes(chosen.statusLabel));
  // Flags list, diff-tag badges, both stages' amounts and the signed delta.
  for (const label of chosen.flagLabels.slice(0, 3)) assert.ok(html.includes(label));
  assert.ok(html.includes("HGAB3 − NEP"));
  // PDF buttons cite their document volume and page, never a bare page number.
  assert.ok((html.match(/p\. \d+/g) ?? []).length >= 2, "each stage's page button must render");
  for (const ref of chosen.pdf) {
    assert.ok(html.includes(ref.documentLabel),
      `drawer must name the document volume for ${ref.kind}: ${ref.documentLabel}`);
    assert.ok(html.includes(`${ref.documentLabel} · p. ${ref.page}`),
      `page button must cite document + page for ${ref.kind}`);
  }
  // A title-printed coordinate is disclosed as source evidence, with the OSM link.
  assert.ok(html.includes("Printed in the title:"));
  assert.ok(html.includes("reported as source evidence"));
  assert.ok(html.includes("openstreetmap.org"));
  // Chainage section renders whichever sides the row carries.
  assert.ok(html.includes("Chainage"));
});

test("the export modal offers both scopes and formats, defaulting to Simple CSV", skip, async () => {
  const html = await render("ExportModal", {
    rows: Array.from({length: 73}, (_, i) => ({id: `row:${i}`, title: `Project ${i}`})),
    meta: {lens: "location", card: "location:title_psgc:leg:dinagat-islands:lone",
      filters: {q: null, bucket: null, flag: null}},
    onClose: () => {},
  });

  // One radio per scope and per format, all inside the reusable dialog shell.
  assert.ok(html.includes("fmr-dialog congress-export"));
  assert.ok(html.includes("Export these projects"));
  for (const label of ["Simple", "Full", "CSV", "JSON"])
    assert.ok(html.includes(`>${label}</strong>`), `option ${label} must render`);

  // The stated row count is the filtered set the download will contain.
  assert.ok(html.includes("<strong>73</strong>"));

  // Defaults: Simple is pre-selected, so the action button names it.
  assert.ok(html.includes("Download Simple CSV"), "default choice is Simple CSV");
  // React emits `checked=""` ahead of the value, so read each radio's own tag.
  const checked = [...html.matchAll(/<input[^>]*checked=""[^>]*value="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(checked, ["simple", "csv"], "Simple and CSV start selected");

  // Each option explains what it contains, so the choice is not a guess.
  assert.ok(html.includes("each side\u2019s source page"), "Simple hint names the split citation");
  assert.ok(html.includes("source record ids"), "Full hint names the extra provenance");

  // An inactive-filter export says what it downloads; no filter claim is invented.
  assert.ok(!html.includes("with your search, bucket and flag filters applied"));
  const filteredHtml = await render("ExportModal", {
    rows: [{id: "row:1"}],
    meta: {lens: "deo", card: "deo:x", filters: {q: "road", bucket: "paired", flag: null}},
    onClose: () => {},
  });
  assert.ok(filteredHtml.includes("with your search, bucket and flag filters applied"),
    "an active filter must be disclosed before download");
});

test("legislative card faces lead with the district, not the representative", skipFmr, async () => {
  const index = read(INDEX);
  const fmrIndex = read(FMR_INDEX);

  const grid = await render("Districts", {index, fmrIndex, lens: "fmr", route: route("fmr")});
  // Every FMR card is one district: its h3 is the title-cased district name…
  const headings = [...grid.matchAll(/class="congress-card-open"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(headings.some((h) => /\(First District\)/.test(h)), "district headings render");
  assert.ok(headings.includes("Ilocos Norte (First District)"), "official caps render as Title Case");
  // …the representative is demoted to a sub-line, never the heading.
  assert.ok(grid.includes("congress-card-sub"), "rep sub-line renders on the card face");
  const repHeadings = headings.filter((h) => /, [A-Z]\./.test(h));
  assert.deepEqual(repHeadings, [], "no representative name remains a card heading");
  // The eyebrow announces what the lens is, so the heading needs no context.
  assert.ok(grid.includes(">FMR legislative district<"));

  // The explorer h1 follows the same rule, with the rep in the secondary line.
  const card = fmrIndex.cards[0];
  const page = await render("District", {index, fmrIndex, detail: null, lens: "fmr",
    route: route("district", `district=${encodeURIComponent(card.id)}&lens=fmr`)});
  assert.match(page, /<h1>Ilocos Norte \(First District\)<\/h1>/);
  assert.ok(page.includes(card.districts[0].representative.name),
    "the representative stays visible below the heading");
});

test("the MPB grid renders from the MPB index with its own lens copy", skipMpb, async () => {
  const index = read(INDEX);
  const mpbIndex = read(MPB_INDEX);
  const grid = await render("Districts", {index, mpbIndex, lens: "mpb", route: route("mpb")});

  // One article per MPB card (district cards plus region catch-alls).
  const articles = grid.match(/<article class="congress-card /g) ?? [];
  assert.equal(articles.length, locationCards(mpbIndex).length);
  // The hero states the reuse contract: placement is the committed location
  // lens, so the two tabs cannot disagree about a row.
  assert.ok(grid.includes("Multi-purpose buildings by legislative district"));
  assert.ok(grid.includes("reuses the Districts (Legislative) resolution"));
  assert.ok(grid.includes(">MPB legislative district<"));
  // MPB-specific stats tiles.
  assert.ok(grid.includes("Districts with MPBs"));
  assert.ok(grid.includes("Mapped buildings"));
  // The grid offers the all-districts export — the comparison payload is
  // fetched only when the button is clicked, so the button itself must render
  // from the index alone.
  assert.ok(grid.includes(">Export all districts…</button>"),
    "MPB grid must offer the cross-district export");
  // The tier filter offers the MPB vocabulary, never a raw basis key.
  for (const label of ["Title PSGC → LEG", "DEO → LEG", "Multi-district DEO", "Region", "Unassigned"])
    assert.ok(grid.includes(label), `tier option missing: ${label}`);
  // No tier ever prints raw.
  assert.doesNotMatch(grid, /tier-undefined|tier-null|\[object/);
});

test("the MPB explorer maps La Union 1st's buildings and discloses scope", skipMpb, async () => {
  const index = read(INDEX);
  const mpbIndex = read(MPB_INDEX);
  const detail = read("comparison_projects_2027.json");
  const card = locationCards(mpbIndex).find(entry => entry.id === "mpb:title_psgc:leg:la-union:1st");
  assert.ok(card, "La Union 1st MPB card is missing");

  const html = await render("District", {index, mpbIndex, detail, lens: "mpb",
    route: route("district", `district=${encodeURIComponent(card.id)}&lens=mpb&tableView=full`)});
  // Bucket labels follow the MPB vocabulary.
  assert.ok(html.includes("House only"));
  assert.ok(html.includes("NEP only"));
  // The lens explanation states scope + reuse + point-map evidence policy.
  assert.ok(html.includes("BIP multi-purpose building programme line"));
  assert.ok(html.includes("reused verbatim"));
  assert.ok(html.includes("printed evidence, not a surveyed position"));
  // Rows with retained points offer the map; the card offers all buildings.
  assert.ok(html.includes(">View map</button>"));
  assert.ok(html.includes(">View all buildings</button>"));
  // The reuse disclosure also names the assignment basis column.
  assert.ok(html.includes("Assignment basis"));

  // A mapped row's drawer carries the scope rule and the printed point.
  const sevilla = cardRows(card, mpbRowsById(detail)).find(row => row.id === "house-reading:11076");
  assert.ok(sevilla, "Sevilla multi-purpose building row missing");
  const view = mpbExplorerRow(sevilla, mpbIndex.row_scope[sevilla.id],
    mpbIndex.row_points[sevilla.id], mpbIndex.row_resolution[sevilla.id], mpbIndex.row_psgc[sevilla.id]);
  const drawer = await render("RecordDrawer", {record: view, onPdf: () => {}, onMap: () => {}, onClose: () => {}});
  assert.ok(drawer.includes(sevilla.title.slice(0, 30)));
  assert.ok(drawer.includes("BIP MPB programme line + MPB title"),
    "the drawer must disclose which scope rule admitted the row");
});

test("the MPB point modal renders the legend, counts and empty state", skipMpb, async () => {
  const mpbIndex = read(MPB_INDEX);
  const detail = read("comparison_projects_2027.json");
  const card = locationCards(mpbIndex).find(entry => entry.id === "mpb:title_psgc:leg:la-union:1st");
  const views = cardRows(card, mpbRowsById(detail))
    .map(row => mpbExplorerRow(row, mpbIndex.row_scope[row.id],
      mpbIndex.row_points[row.id], mpbIndex.row_resolution[row.id], mpbIndex.row_psgc[row.id]));

  const server = await createServer({
    root: new URL("..", import.meta.url).pathname,
    cacheDir: new URL(`../node_modules/.vite-tests/${process.pid}-mpb`, import.meta.url).pathname,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const mod = await server.ssrLoadModule("/src/MpbPointsModal.jsx");
    const modal = renderToStaticMarkup(React.createElement(mod.default, {
      label: "La Union (First District)", records: views, onSelectRecord: () => {}, onClose: () => {},
    }));
    assert.ok(modal.includes("All mapped buildings"));
    assert.ok(modal.includes("House only"));
    assert.ok(modal.includes("Matched pair"));
    // The legend counts points and rows separately.
    assert.ok(modal.includes("point(s)"));
    assert.ok(modal.includes("project row(s)"));
    assert.ok(modal.includes("Click any point or same-title link to open its project evidence"));
    assert.ok(modal.includes("printed title evidence, not surveyed positions"));

    // The record form prints the single-building copy, and a pointless record
    // falls back to the explicit empty state instead of a blank canvas.
    const withPoints = views.find(view => view.mpbPoints.length);
    const single = renderToStaticMarkup(React.createElement(mod.default, {
      label: withPoints.title, record: withPoints, onClose: () => {},
    }));
    assert.ok(single.includes("Building location"));

    const bare = renderToStaticMarkup(React.createElement(mod.default, {
      label: "No coordinates", record: {id: "x", title: "No coordinates", house_php: 1, mpbPoints: []},
      onClose: () => {},
    }));
    assert.ok(bare.includes("no retained title coordinate to draw"));
  } finally {
    await server.close();
  }
});

/** Index the comparison payload the way District's prepare memo does. */
function mpbRowsById(detail) {
  const rows = detail.projects ?? detail;
  return new Map(rows.map(row => [row.id, row]));
}
