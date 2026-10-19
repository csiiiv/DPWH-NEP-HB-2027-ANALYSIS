import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {barComparisonModel, layoutBarChart, sortBars, splitCentralOffice, sumBars, collapseBars, SEGMENTS, SIDES} from './barComparison.js';
import {REVISIONS} from './revisionMatrix.js';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
// The built catalog may be absent in CI; fall back to a synthetic payload with
// identical invariants (groups rebuild both ledgers, gross changes preserved).
const built = (() => {try {return read('budget_flow_sources_2027.json');} catch {return null;}})();
const payload = () => ({schema_version: 1,
  dataset: {key: 'test', label: 'Test dataset', defaultGrouping: 'region', scope: 'Test scope',
    count_unit: 'comparison rows', house_note: 'House test', caveat: 'Test caveat'},
  stages: {nep: {amount_php: 100}, third: {amount_php: 130}}, totals: {rows: 5},
  categories: [
    {class: 'insertion', rows: 1, nep_php: 0, third_php: 50},
    {class: 'unchanged', rows: 1, nep_php: 30, third_php: 30},
    {class: 'increased', rows: 1, nep_php: 20, third_php: 35},
    {class: 'reduced', rows: 1, nep_php: 40, third_php: 15},
    {class: 'deletion', rows: 1, nep_php: 10, third_php: 0},
  ],
  groupings: {region: {key: 'region', label: 'Region', plural: 'regions', basis: 'Recorded region.', groups: [
    {id: 'R1', label: 'Region I', rows: 3, classes: [
      {class: 'unchanged', rows: 1, nep_php: 30, third_php: 30},
      {class: 'increased', rows: 1, nep_php: 20, third_php: 35},
      {class: 'deletion', rows: 1, nep_php: 10, third_php: 0}]},
    {id: 'R2', label: 'Region II', rows: 2, classes: [
      {class: 'insertion', rows: 1, nep_php: 0, third_php: 50},
      {class: 'reduced', rows: 1, nep_php: 40, third_php: 15}]},
  ]}}});

test('bar model pairs NEP and HGAB per group with per-class side amounts', () => {
  const model = barComparisonModel(payload(), 'region');
  assert.deepEqual(model.bars.map(b => [b.id, b.nep, b.hgab]), [['R1', 60, 65], ['R2', 40, 65]]);
  const r2 = model.bars[1].classes;
  assert.equal(r2.insertion.nep, 0);
  assert.equal(r2.insertion.hgab, 50);
  assert.equal(r2.reduced.nep, 40);
  assert.equal(r2.reduced.hgab, 15);
  assert.equal(model.totals.nep, 100);
  assert.equal(model.totals.hgab, 130);
  assert.ok(model.dataset.house_note);
});

test('segment vocabulary keeps the shared class order and revision colors', () => {
  assert.deepEqual(SEGMENTS.map(s => s.key), ['unchanged', 'increased', 'reduced', 'deletion', 'insertion']);
  for (const segment of SEGMENTS) {
    const source = REVISIONS.find(r => r.key === segment.key);
    assert.equal(segment.color, source.color);
    assert.equal(segment.label, source.label);
  }
  assert.deepEqual(SIDES.map(s => s.key), ['nep', 'hgab']);
});

test('sort keeps largest-NEP order or numeric-aware label order without dropping bars', () => {
  const bars = [
    {id: 'b', label: 'Region X', nep: 5, hgab: 9},
    {id: 'a', label: 'Region II', nep: 8, hgab: 2},
    {id: 'c', label: 'Region I', nep: 8, hgab: 7},
  ];
  assert.deepEqual(sortBars(bars, 'nep').map(b => b.id), ['c', 'a', 'b']);
  assert.deepEqual(sortBars(bars, 'label').map(b => b.label), ['Region I', 'Region II', 'Region X']);
  // Inputs stay untouched.
  assert.deepEqual(bars.map(b => b.id), ['b', 'a', 'c']);
});

test('sort ranks by HGAB or absolute net change with stable tie-breaks', () => {
  const bars = [
    {id: 'a', label: 'A', nep: 10, hgab: 11},
    {id: 'b', label: 'B', nep: 4, hgab: 12},
    {id: 'c', label: 'C', nep: 9, hgab: 5},
    {id: 'd', label: 'D', nep: 2, hgab: 2},
  ];
  assert.deepEqual(sortBars(bars, 'hgab').map(b => b.id), ['b', 'a', 'c', 'd']);
  // |delta|: A +1, B +8, C −4, D 0 → B, C, A, D.
  assert.deepEqual(sortBars(bars, 'delta').map(b => b.id), ['b', 'c', 'a', 'd']);
});

test('Central Office split isolates centrally-managed groups and keeps sums exact', () => {
  const bars = [
    {id: 'Central Office', label: 'Central Office', nep: 100, hgab: 90, rows: 7, classes: {}},
    {id: 'NCR', label: 'NCR', nep: 3, hgab: 4, rows: 2, classes: {}},
    {id: 'Region I', label: 'Region I', nep: 1, hgab: 2, rows: 1, classes: {}},
  ];
  const {visible, hidden} = splitCentralOffice(bars);
  assert.deepEqual(visible.map(b => b.id), ['NCR', 'Region I']);
  assert.deepEqual(hidden.map(b => b.id), ['Central Office']);
  assert.deepEqual(sumBars(hidden), {nep: 100, hgab: 90, rows: 7, delta: -10});
  assert.deepEqual(sumBars(visible), {nep: 4, hgab: 6, rows: 3, delta: 2});
  // A dataset without a Central Office group hides nothing.
  assert.deepEqual(splitCentralOffice([{id: 'NCR', label: 'NCR'}]).hidden, []);
});

test('top-N collapse folds the tail into Others and keeps both ledgers conserved', () => {
  const cell = (nep, hgab) => ({unchanged: {rows: 1, nep, hgab}});
  const bars = [
    {id: 'a', label: 'A', nep: 50, hgab: 60, rows: 2, classes: cell(50, 60)},
    {id: 'b', label: 'B', nep: 30, hgab: 25, rows: 1, classes: cell(30, 25)},
    {id: 'c', label: 'C', nep: 12, hgab: 9, rows: 1, classes: cell(12, 9)},
    {id: 'd', label: 'D', nep: 5, hgab: 4, rows: 1, classes: cell(5, 4)},
  ];
  const {kept, others, rollup} = collapseBars(bars, {top: 2, plural: 'branches'});
  assert.deepEqual(kept.map(b => b.id), ['a', 'b']);
  assert.equal(others.id, '__others__');
  assert.equal(others.label, 'Others (2 branches)');
  assert.equal(others.nep, 17);
  assert.equal(others.hgab, 13);
  assert.equal(others.rows, 2);
  assert.equal(others.classes.unchanged.nep, 17);
  assert.equal(others.classes.unchanged.hgab, 13);
  assert.deepEqual(rollup.members.map(m => m.id), ['c', 'd']);
  // The drawn set (kept + Others) rebuilds the full ledgers.
  assert.deepEqual(sumBars([...kept, others]), sumBars(bars));
  // No collapse when every group already fits; invalid tops are ignored.
  assert.deepEqual(collapseBars(bars, {top: 10}).others, null);
  assert.deepEqual(collapseBars(bars, {top: 0}).others, null);
  assert.deepEqual(collapseBars(bars, {top: 4}).others, null);
});

test('top-N collapse preserves per-class gross changes from folded groups', () => {
  const bars = [
    {id: 'a', label: 'A', nep: 10, hgab: 20, rows: 2, classes: {increased: {rows: 1, nep: 10, hgab: 20}}},
    {id: 'b', label: 'B', nep: 8, hgab: 4, rows: 1, classes: {reduced: {rows: 1, nep: 8, hgab: 4}}},
    {id: 'c', label: 'C', nep: 2, hgab: 5, rows: 1, classes: {insertion: {rows: 1, nep: 0, hgab: 5}}},
    {id: 'd', label: 'D', nep: 1, hgab: 0, rows: 1, classes: {deletion: {rows: 1, nep: 1, hgab: 0}}},
  ];
  const {others} = collapseBars(bars, {top: 2, plural: 'branches'});
  // C + D fold in: their one-sided classes survive with exact side amounts.
  assert.deepEqual(others.classes.insertion, {rows: 1, nep: 0, hgab: 5});
  assert.deepEqual(others.classes.deletion, {rows: 1, nep: 1, hgab: 0});
  assert.equal(others.nep, 3);
  assert.equal(others.hgab, 5);
  // One shared revision cell per class: the rolled-up Others draws exactly
  // like any native group.
  assert.equal(others.classes.insertion.hgab - others.classes.insertion.nep, 5);
});

test('layout segments share one scale and align across both bars', () => {
  const {bars} = barComparisonModel(payload(), 'region');
  const layout = layoutBarChart(bars, {width: 1000, labelWidth: 200, valueWidth: 200});
  assert.equal(layout.scale, (1000 - 200 - 200) / 65, 'the longest bar fills the usable width');
  const [r1, r2] = layout.rows;
  // Region I: unchanged, increased, deletion on NEP; unchanged, increased on HGAB.
  const r1nep = Object.fromEntries(r1.bars[0].segments.map(s => [s.key, s]));
  const r1hgab = Object.fromEntries(r1.bars[1].segments.map(s => [s.key, s]));
  assert.deepEqual(Object.keys(r1nep), ['unchanged', 'increased', 'deletion']);
  assert.deepEqual(Object.keys(r1hgab), ['unchanged', 'increased']);
  assert.equal(r1nep.unchanged.x, 200);
  assert.equal(r1nep.unchanged.width, 30 * layout.scale);
  assert.equal(r1hgab.unchanged.width, 30 * layout.scale);
  // Shared prefix: increased starts at the same x on both sides.
  assert.equal(r1nep.increased.x, r1hgab.increased.x);
  assert.equal(r1nep.increased.width, 20 * layout.scale);
  assert.equal(r1hgab.increased.width, 35 * layout.scale);
  // Deletion appears only on the NEP side, right after the shared prefix.
  assert.equal(r1nep.deletion.width, 10 * layout.scale);
  assert.equal(r1nep.deletion.x, r1nep.increased.x + r1nep.increased.width);
  // Region II: insertion only on HGAB (after reduced — one-sided classes last).
  const r2nep = Object.fromEntries(r2.bars[0].segments.map(s => [s.key, s]));
  const r2hgab = Object.fromEntries(r2.bars[1].segments.map(s => [s.key, s]));
  assert.deepEqual(Object.keys(r2nep), ['reduced']);
  assert.deepEqual(Object.keys(r2hgab), ['reduced', 'insertion']);
  assert.equal(r2hgab.reduced.x, 200);
  assert.equal(r2nep.reduced.width, 40 * layout.scale);
  assert.equal(r2hgab.reduced.width, 15 * layout.scale);
  assert.equal(r2hgab.insertion.x, 200 + 15 * layout.scale);
  assert.equal(r2hgab.insertion.width, 50 * layout.scale);
  // Side totals label after the last segment.
  assert.equal(r1.bars[0].total, 60);
  assert.ok(r1.bars[0].labelX >= r1.bars[0].endX);
});

test('layout scales a whole catalog and conserves both ledgers per side', () => {
  const catalog = built || {sources: [payload()]};
  for (const source of catalog.sources) {
    for (const key of Object.keys(source.groupings)) {
      const {bars, totals} = barComparisonModel(source, key);
      for (const order of ['nep', 'label']) {
        const layout = layoutBarChart(sortBars(bars, order));
        assert.ok(layout, `${source.dataset.key}/${key} layout`);
        for (const row of layout.rows) {
          for (const side of row.bars) {
            // Side segments rebuild that side's ledger…
            assert.equal(side.segments.reduce((sum, s) => sum + s.value, 0), side.total, 'side segments rebuild the side total');
            // …and every width is exactly value × scale (0 for absent classes).
            for (const segment of side.segments) {
              assert.ok(Math.abs(segment.width - segment.value * layout.scale) < 1e-6, 'width is value × scale');
              assert.ok(segment.x + segment.width <= layout.labelWidth + layout.usable + 1e-6, 'segments stay inside the track');
            }
          }
        }
        assert.equal(layout.rows.length, bars.length);
        assert.equal(layout.rows.reduce((sum, row) => sum + row.bars[0].total, 0), totals.nep);
        assert.equal(layout.rows.reduce((sum, row) => sum + row.bars[1].total, 0), totals.hgab);
      }
    }
  }
});

test('long labels wrap up to four lines and rows grow to fit them', () => {
  const long = 'Construction of Farm-to-Market Road from Barangay A to Barangay B via Sitio C Dike Section';
  const layout = layoutBarChart([{id: 'x', label: long, classes: {unchanged: {rows: 1, nep: 10, hgab: 10}}}]);
  assert.ok(layout.rows[0].lines.length <= 4, 'at most four label lines');
  assert.ok(layout.rows[0].lines.length >= 3, 'a long label actually wraps');
  assert.ok(layout.rows[0].labelYs.every(y => y > layout.rows[0].y && y < layout.rows[0].y + layout.rows[0].height));
  // The row is as tall as its label needs, and the bar block centers inside.
  const block = 2 * 15 + 3;
  assert.ok(layout.rows[0].height >= layout.rows[0].lines.length * 15);
  const [nep, hgab] = layout.rows[0].bars;
  const blockCenter = (nep.y + hgab.y + hgab.height) / 2;
  assert.ok(Math.abs(blockCenter - layout.rows[0].center) < 1e-9, 'NEP/HGAB pair centers on the row');
  assert.ok(hgab.y > nep.y, 'HGAB bar sits below NEP');
  assert.ok(layout.rows[0].height >= block, 'a wrapped row is never shorter than the bar block');
  // Short labels keep the compact single-block row height.
  const short = layoutBarChart([{id: 'a', label: 'A', classes: {unchanged: {rows: 1, nep: 10, hgab: 10}}}]);
  assert.equal(short.rows[0].lines.length, 1);
  assert.equal(short.rows[0].height, block);
});

test('empty and negative inputs are rejected before drawing', () => {
  assert.equal(layoutBarChart([]), null);
  assert.equal(layoutBarChart(null), null);
  assert.throws(() => layoutBarChart([{id: 'a', label: 'A', classes: {unchanged: {rows: 1, nep: 5, hgab: 5}}}], {width: 100, labelWidth: 80, valueWidth: 40}), /margins exceed/);
});
