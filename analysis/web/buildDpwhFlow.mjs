import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {matchesProgram} from './src/model.js';
import {buildNepHierarchy, buildHgab3Hierarchy} from './src/nepHierarchy.js';

// Three-stage membership flow for the DPWH experiments alluvial: how every
// comparison row participates in NEP, HGAB2 and HGAB3. Counts are the flow
// unit — membership is conserved row-for-row, money is not (NEP-to-House
// adjustments change amounts within pairs). Built from the same retained
// comparison payload as the Overview; ledger ties are asserted so the
// aggregate can never silently drift from the published figures.
function fail(message) {throw new Error(`DPWH flow: ${message}`);}
const sum = (rows, pick) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

export function buildDpwhFlow(payload, headline = null) {
  const rows = payload.projects;
  const sides = ['nep', 'second', 'third'];
  const has = row => sides.map(side => Boolean(row[side]));
  // Eight membership strata (nep, second, third); empty strata drop out.
  const strata = new Map();
  for (const row of rows) {
    const key = has(row).join('/');
    const stratum = strata.get(key) ?? {key, rows: 0, nep_php: 0, second_php: 0, third_php: 0};
    stratum.rows += 1;
    for (const side of sides) if (row[side]) stratum[`${side}_php`] += row[side].amount_php ?? 0;
    strata.set(key, stratum);
  }
  const list = [...strata.values()].sort((a, b) => b.rows - a.rows);
  // Ledger ties: strata must rebuild each stage ledger exactly, and — when
  // the caller passes the published Overview headlines — match them too, so
  // the check anchors externally instead of only re-deriving from the input.
  const ledger = side => sum(rows, row => row[side]?.amount_php ?? 0);
  for (const side of sides) {
    const rebuilt = list.reduce((t, s) => t + s[`${side}_php`], 0);
    if (rebuilt !== ledger(side)) fail(`${side} strata do not rebuild the stage ledger`);
  }
  if (headline) {
    const expected = {nep: headline.sources.nep.amount_php, second: headline.sources.second.amount_php, third: headline.sources.third.amount_php};
    for (const side of sides) if (ledger(side) !== expected[side]) fail(`${side} ledger drifts from the published headline`);
  }
  // Stage-side records (ungrouped count) tie to the Overview headlines when
  // the payload carries them; otherwise the row count is the stated grain.
  const total = rows.length;
  // Revision-category rollup: each row classed once by the workspace's
  // five-group vocabulary (membership decides insertion/deletion; the
  // signed House−NEP delta decides increased/reduced/unchanged), with
  // per-reading amounts. Category sums rebuild every stage ledger — the
  // same invariant, now across category × reading.
  const rowClass = row => {
    const nep = Boolean(row.nep), hgab = Boolean(row.third);
    if (nep && hgab) {
      const delta = row.house_minus_nep_php ?? 0;
      return delta > 0 ? 'increased' : delta < 0 ? 'reduced' : 'unchanged';
    }
    if (!nep && hgab) return 'insertion';
    if (nep && !hgab) return 'deletion';
    return null;
  };
  const cats = new Map();
  // The grouping layer is separate from the revision taxonomy. Initially
  // use retained program/category labels; other dimensions can emit the
  // same groups × classes contract without changing the five-stage view.
  const groups = new Map();
  for (const row of rows) {
    const cls = rowClass(row);
    if (!cls) continue;
    const cat = cats.get(cls) ?? {class: cls, rows: 0, nep_php: 0, second_php: 0, third_php: 0};
    cat.rows += 1;
    for (const side of sides) if (row[side]) cat[`${side}_php`] += row[side].amount_php ?? 0;
    cats.set(cls, cat);
    const fap = matchesProgram(row, 'fap');
    const id = fap ? 'fap' : row.program || '(Unassigned category)';
    const group = groups.get(id) ?? {id, label: fap ? 'Foreign-assisted projects (FAPs)' : id, rows: 0, classes: new Map()};
    group.rows++;
    const cell = group.classes.get(cls) ?? {class: cls, rows: 0, nep_php: 0, third_php: 0};
    cell.rows++;
    cell.nep_php += row.nep?.amount_php ?? 0;
    cell.third_php += row.third?.amount_php ?? 0;
    group.classes.set(cls, cell);
    groups.set(id, group);
  }
  for (const side of sides) {
    const rebuilt = [...cats.values()].reduce((t, c) => t + c[`${side}_php`], 0);
    if (rebuilt !== ledger(side)) fail(`${side} category rollup does not rebuild the stage ledger`);
  }
  const summary = {
    schema_version: 1,
    fiscal_year: 2027,
    grain: 'comparison rows',
    stages: Object.fromEntries(sides.map(side => [side, {rows: rows.filter(r => r[side]).length, amount_php: ledger(side)}])),
    strata: list.map(({key, rows, nep_php, second_php, third_php}) =>
      ({key, rows, nep_php, second_php, third_php})),
    categories: [...cats.values()].sort((a, b) => b.rows - a.rows),
    groupings: {category: {key: 'category', label: 'Category', basis: 'FAPs separated by source zone; other records grouped by retained program label',
      groups: [...groups.values()].map(g => ({...g, classes: [...g.classes.values()]}))}},
    totals: {rows: total},
    nep_hierarchy: buildNepHierarchy(rows),
    hgab3_hierarchy: buildHgab3Hierarchy(rows),
  };
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = new URL('../data/comparison_projects_2027.json', import.meta.url);
  const overview = new URL('../data/comparison_overview_2027.json', import.meta.url);
  const raw = readFileSync(source);
  const payload = JSON.parse(raw);
  // Anchor the build against the published Overview headlines.
  const summary = buildDpwhFlow(payload, JSON.parse(readFileSync(overview)).headlines);
  const sha = createHash('sha256').update(raw).digest('hex');
  summary.provenance = {source: 'comparison_projects_2027.json', sha256: sha,
    input_sha256: payload.input_sha256, versions: 'DBM NEP → HGAB 3rd reading', unit: 'PHP'};
  writeFileSync(new URL('../data/dpwh_flow_2027.json', import.meta.url), JSON.stringify(summary) + '\n');
  process.stdout.write(`DPWH flow built: ${summary.totals.rows} rows, ${summary.strata.length} strata (input sha256 ${sha.slice(0, 12)})\n`);
}
