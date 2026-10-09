import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, metric, compare, selectRows } from "./model.js";
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
