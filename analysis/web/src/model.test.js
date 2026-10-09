import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, metric, compare, selectRows, officeOptions, officeLabels, NO_OFFICE } from "./model.js";
test("sort deltas require a paired prior amount; zero baselines have no percent", () => {
  assert.equal(metric(10, null, "delta"), null);
  assert.equal(metric(10, 0, "percent"), null);
  assert.equal(metric(15, 10, "delta"), 5);
  assert.equal(metric(15, 10, "percent"), 50);
  assert.equal(metric(null, 10, "total"), null);
  assert.equal(metric(0, 10, "delta"), -10);
});
test("unknown values remain last in both directions", () => {
  for (const direction of [1, -1])
    assert.deepEqual(
      [null, 3, 1].sort((a, b) => compare(a, b, direction)),
      direction === 1 ? [1, 3, null] : [3, 1, null],
    );
});
test("filter and sort full result before pagination, preserving exact pesos", () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({
    title: `Road ${i}`,
    region: i % 2 ? "NCR" : "CAR",
    nep: { amount_php: 1000 },
    house: { amount_php: 1000 + i },
  }));
  const sorted = selectRows(rows, {
    region: "NCR",
    column: "2",
    mode: "delta",
    direction: -1,
  });
  assert.equal(sorted.length, 60);
  assert.equal(sorted[0].title, "Road 119");
  assert.equal(sorted[49].title, "Road 21");
  assert.equal(rows[0].title, "Road 0");
});
test("House PAP printed controls take precedence over extracted coverage", () => {
  const rows = [
    {
      label: "A",
      nep_php: 100,
      house_control_php: 200,
      house_extract_php: 1000,
    },
    {
      label: "B",
      nep_php: 100,
      house_control_php: null,
      house_extract_php: 250,
    },
  ];
  assert.equal(
    selectRows(rows, { tab: "paps", column: "2", mode: "delta" })[0].label,
    "A",
  );
});
test("display units and signed amounts preserve thousands convention", () => {
  assert.equal(amount(1000), "₱1.000K");
  assert.equal(amount(-1000000), "−₱1.000M");
  assert.equal(amount(null), "—");
});

test("listing gaps sort numerically by amount and page, or by region", () => {
  const rows = [
    { title: "A", amount_php: 200, pdf_page: 100, region: "NCR" },
    { title: "B", amount_php: 100, pdf_page: 9, region: "CAR" },
  ];
  assert.equal(
    selectRows(rows, { tab: "gaps", column: "amount", direction: -1 })[0].title,
    "A",
  );
  assert.equal(
    selectRows(rows, { tab: "gaps", column: "pdf_page" })[0].title,
    "B",
  );
  assert.equal(
    selectRows(rows, { tab: "gaps", column: "region" })[0].title,
    "B",
  );
});

test("office filter matches recorded counterparts but excludes fuzzy suggestions", () => {
  const a = "Albay 1st District Engineering Office";
  const b = "Albay 2nd District Engineering Office";
  const rows = [
    {title: "Paired", region: "Region V", house: {office: a, region: "Region V"}, nep: {office: b, region: "Region V"}},
    {title: "Suggested", region: "Region V", house: {office: b, region: "Region V"}, suggestions: [{nep: {office: a}}]},
    {title: "API", region: "Region V", api: {office: a, region: "Region V"}},
    {title: "Unknown", region: "Region V", house: {office: ""}, nep: {office: null}},
  ];
  assert.deepEqual(selectRows(rows, {office: a}).map(r => r.title), ["API", "Paired"]);
  assert.deepEqual(selectRows(rows, {office: NO_OFFICE}).map(r => r.title), ["Unknown"]);
  assert.deepEqual(officeLabels(rows[0]), [`House: ${a}`, `NEP: ${b}`]);
  assert.equal(officeOptions(rows).filter(o => o.value === a).length, 1);
});
test("region office options preserve numeric order and scope assignments to their source", () => {
  const rows = [
    {title: "Different regions", region: "Region V", house: {office: "Office 10", region: "Region V"}, nep: {office: "Office 2", region: "NCR"}},
    {title: "Flat gap", region: "Region V", office: "Office 2"},
    {title: "Unknown", region: "Region V", house: {office: "", region: "Region V"}},
  ];
  assert.deepEqual(officeOptions(rows, "Region V").map(o => o.value), ["Office 2", "Office 10", NO_OFFICE]);
  assert.deepEqual(selectRows(rows, {region: "Region V", office: "Office 2"}).map(r => r.title), ["Flat gap"]);
});
test("office selection filters the full result before sorting and pagination", () => {
  const rows = Array.from({length: 130}, (_, i) => ({
    title: `Road ${i}`, house: {office: i % 2 ? "DEO A" : "DEO B", amount_php: i}, nep: {amount_php: 0},
  }));
  const selected = selectRows(rows, {office: "DEO A", column: "2", direction: -1});
  assert.equal(selected.length, 65);
  assert.equal(selected[0].house.amount_php, 129);
  assert.equal(selected[49].house.amount_php, 31);
});

test("reading tables filter both offices and sort 3rd minus 2nd numerically", () => {
  const rows = [
    {title: "Changed", region: "NCR", second: {office: "DEO A", amount_php: 10}, third: {office: "DEO A", amount_php: 30}, delta_php: 20},
    {title: "Third only", region: "NCR", second: null, third: {office: "DEO A", amount_php: 5}, delta_php: 5},
  ];
  assert.deepEqual(selectRows(rows, {tab: "readings", office: "DEO A", column: "reading_delta", direction: -1}).map(r => r.title), ["Changed", "Third only"]);
  assert.deepEqual(officeLabels(rows[0]), ["House 2nd: DEO A", "House 3rd: DEO A"]);
});
