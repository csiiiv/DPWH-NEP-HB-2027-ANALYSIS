import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import fs from "node:fs";
import { sortedCards, parseCardSort, districtSeats } from "./congressModel.js";

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
const haveIndex = fs.existsSync(new URL(INDEX, DATA));
const skip = haveIndex ? false : { skip: "congress index not built — run predev/prebuild" };

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, DATA), "utf8"));

// SortableTable and ShareLink read location during render; provide the
// browser globals static markup expects.
globalThis.location = new URL("http://localhost/#congress");
globalThis.window = globalThis;
globalThis.navigator = globalThis.navigator ?? {clipboard: {writeText: async () => {}}};

const route = (key, params = "") => ({key, params: new URLSearchParams(params)});

/** Render one exported sub-view to static markup via vite's SSR loader. */
async function render(name, props) {
  const server = await createServer({
    root: new URL("..", import.meta.url).pathname,
    server: { middlewareMode: true },
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

  // The sort controls are two decisions: every option key is offered, and the
  // direction select labels itself by what the measure sorts (records or
  // amounts) rather than a bare ascending/descending.
  for (const label of ["HGAB3 amount", "NEP amount", "Insertion records",
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

test("the record drawer renders flags, PDF deep-links and the title coordinate caveat", skip, async () => {
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
  // PDF buttons cite their stage label and page.
  assert.ok((html.match(/p\. \d+/g) ?? []).length >= 2, "each stage's page button must render");
  // A title-printed coordinate is disclosed as not geocoded, with the OSM link.
  assert.ok(html.includes("Printed in the title:"));
  assert.ok(html.includes("not geocoded"));
  assert.ok(html.includes("openstreetmap.org"));
  // Chainage section renders whichever sides the row carries.
  assert.ok(html.includes("Chainage"));
});
