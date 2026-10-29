import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_COLORS, STATUS_LABELS, CHANGE_TYPE_LABELS, MULTI_FILTER_KEYS,
  parseMulti, serializeMulti, formatAmountPhp,
  filterRecords, parsedPoints, buildOverlay,
  variationRows, recordCodes, optionLists, recordHref, recordPdfSources,
  inPhilippineBounds, PHILIPPINE_BOUNDS,
} from './geoModel.js';

const record = (over = {}) => ({
  dataset: 'dpwh_comparison_2027', group: 'dpwh', record_id: 'r1',
  title: 'Road with pair (15.5, 121.5)', status: 'parsed', pap: 'BIP - Buildings',
  fields: [{field: 'title', status: 'parsed', fragment_kinds: ['paren_pair'], snippet: '(15.5, 121.5)',
    points: [{longitude: 121.5, latitude: 15.5, role: 'unspecified', rules: [], issues: [],
      source_fragment: '15.5, 121.5'}]}],
  ...over,
});

test('filters compose across dataset, group, status, codes, PAP and search', () => {
  const rows = [record(), record({dataset: 'hgab_fmr', group: 'fmr', record_id: 'r2', pap: ''}),
    record({status: 'hint_only', record_id: 'r3', fields: []})];
  assert.equal(filterRecords(rows, {}).length, 3);
  assert.equal(filterRecords(rows, {dataset: 'hgab_fmr'})[0].record_id, 'r2');
  assert.equal(filterRecords(rows, {group: 'dpwh'}).length, 2);
  assert.equal(filterRecords(rows, {status: 'parsed'}).length, 2);
  assert.equal(filterRecords(rows, {kind: 'paren_pair'}).length, 2);
  assert.equal(filterRecords(rows, {pap: 'BIP - Buildings'})[0].record_id, 'r1');
  assert.equal(filterRecords(rows, {pap: 'BIP - Buildings', dataset: 'hgab_fmr'}).length, 0);
  assert.equal(filterRecords(rows, {q: 'rango'}).length, 0);
  assert.equal(filterRecords(rows, {q: 'road pair'})[0].record_id, 'r1');
});

test('parsed points require finite lon/lat inside world bounds', () => {
  const row = record({fields: [{field: 'title', points: [
    {longitude: 121.5, latitude: 15.5}, {longitude: null, latitude: 16}, {longitude: 999, latitude: 10},
  ]}]});
  assert.equal(parsedPoints(row).length, 1);
});

test('overlay draws lines only for multi-point records and colours by group', () => {
  const rows = [record(), record({record_id: 'r2', fields: [{field: 'title', points: [
    {longitude: 121, latitude: 15, rules: ['hemisphere_interpreted'], issues: []},
    {longitude: 122, latitude: 16, rules: [], issues: ['outside_philippines_orientation_bounds']},
  ]}]})];
  const overlay = buildOverlay(rows, {datasets: [{id: 'dpwh_comparison_2027', group: 'dpwh'}]});
  assert.equal(overlay.lines.features.length, 1);
  assert.equal(overlay.points.features.length, 3);
  assert.equal(overlay.lines.features[0].properties.color, GROUP_COLORS.dpwh);
  assert.equal(overlay.points.features[2].properties.issues.length, 1);
  assert.equal(overlay.summary.drawnPoints, 3);
});

// The envelope mirrors the scanner's philippines_orientation_bounds and exists
// so the automatic camera fit cannot be hijacked by outliers. Without it, 12 of
// 9,827 points stretched the national view to lon [8.8, 129.8], centring the map
// at 69°E and compressing the archipelago into a smudge.
test('inPhilippineBounds matches the scanner envelope', () => {
  const {lat, lon} = PHILIPPINE_BOUNDS;
  assert.deepEqual(lat, [4, 22]);
  assert.deepEqual(lon, [116, 127]);
  // Interior points, and the corners themselves (inclusive bounds).
  assert.ok(inPhilippineBounds(121.5, 15.5), 'Manila is inside the envelope');
  assert.ok(inPhilippineBounds(lon[0], lat[0]), 'the envelope corner is inclusive');
  assert.ok(inPhilippineBounds(lon[1], lat[1]), 'the envelope corner is inclusive');
  // The four real outlier shapes found in the inventory.
  assert.ok(!inPhilippineBounds(8.8146, 24.8131), 'transposed lon/lat pair is outside');
  assert.ok(!inPhilippineBounds(10.6093, 10.6093), 'chainage misparse (lon == lat) is outside');
  assert.ok(!inPhilippineBounds(129.803, 15.6377), 'FMR axis swap east of Luzon is outside');
  assert.ok(!inPhilippineBounds(123.408, 1.8042), 'FMR axis swap south of Mindanao is outside');
  // Non-finite input must not throw or silently pass.
  assert.ok(!inPhilippineBounds(null, 15));
  assert.ok(!inPhilippineBounds(121, undefined));
  assert.ok(!inPhilippineBounds(NaN, NaN));
});

test('overlay tags every point inBounds and counts the outliers', () => {
  const rows = [record(), record({record_id: 'r2', fields: [{field: 'title', points: [
    {longitude: 8.8146, latitude: 24.8131, issues: ['outside_philippines_orientation_bounds']},
    {longitude: 121, latitude: 15},
  ]}]})];
  const overlay = buildOverlay(rows, {datasets: [{id: 'dpwh_comparison_2027', group: 'dpwh'}]});
  assert.equal(overlay.summary.drawnPoints, 3);
  assert.equal(overlay.summary.outOfBounds, 1, 'the transposed pair must be counted');
  const flagged = overlay.points.features.find(f => !f.properties.inBounds);
  assert.equal(flagged.properties.recordId, 'r2');
  // Outliers stay plotted — they are genuine parse results and the review issue
  // is the finding — so they must remain in the feature collection.
  assert.ok(overlay.points.features.some(f => f.properties.inBounds === false));
  assert.equal(overlay.points.features.filter(f => f.properties.inBounds).length, 2);
});

test('overlay reports zero outliers when everything is in bounds', () => {
  const overlay = buildOverlay([record()],
    {datasets: [{id: 'dpwh_comparison_2027', group: 'dpwh'}]});
  assert.equal(overlay.summary.outOfBounds, 0);
  assert.ok(overlay.points.features.every(f => f.properties.inBounds));
});

test('variation rows rank interpretation rules and issues with counts', () => {
  const rows = [record(), record({fields: [{field: 'title', points: [
    {longitude: 121, latitude: 15, rules: ['hemisphere_interpreted'], issues: []}]}]})];
  const v = variationRows(rows);
  assert.equal(v.kinds[0].code, 'paren_pair');
  assert.equal(v.rules.find(r => r.code === 'hemisphere_interpreted').count, 1);
  assert.deepEqual(v.issues, []);
});

test('recordCodes dedupes codes across fields; option lists count and label', () => {
  const row = record({fields: [
    {fragment_kinds: ['paren_pair'], points: [{rules: ['a'], issues: ['b']}]},
    {fragment_kinds: ['paren_pair'], points: [{rules: ['a'], issues: ['c']}]},
  ]});
  assert.deepEqual(recordCodes(row, 'kinds'), ['paren_pair']);
  assert.deepEqual(recordCodes(row, 'rules'), ['a']);
  assert.deepEqual(recordCodes(row, 'issues'), ['b', 'c']);
  const lists = optionLists([row], {datasets: [{id: 'dpwh_comparison_2027', label: 'DPWH', records: 1}]});
  assert.equal(lists.rules[0].count, 1);
  assert.equal(lists.datasets[0].label, 'DPWH');
  assert.equal(STATUS_LABELS.parsed_with_issues, 'Parsed with issues');
});

const documents = [
  {key: 'house-projects', label: 'House 2nd reading · Volume I-C', pdf: 'HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf', pages: 942},
  {key: 'nep', label: 'DBM NEP · Volume II-B (retained OCR)', pdf: 'pdfs/NEP-2027-VOLUME-2B_OCR.pdf', pages: 722},
];

test('recordHref maps each referencing convention to its workspace URL', () => {
  // Comparison row → DPWH Compare view record param.
  assert.equal(recordHref({link: {workspace: 'dpwh', route: 'compare', node: 'house-reading:9497'}}),
    '#compare?record=house-reading%3A9497&view=projects');
  // Tree node → node param, keeping extra route params (House I-C reading).
  assert.equal(recordHref({link: {workspace: 'dpwh', route: 'house', node: 'c0191',
    params: {view: 'projects', reading: 'second'}}}),
    '#house?view=projects&reading=second&node=c0191');
  // Annex workspaces use their prefix and node param.
  assert.equal(recordHref({link: {workspace: 'fmr', route: 'house', node: 'ib:p667:r5'}}),
    '#fmr/house?node=ib%3Ap667%3Ar5');
  assert.equal(recordHref({link: null}), null);
});

test('recordPdfSources keeps refs with a valid page inside the document', () => {
  const row = {sources: [
    {document: 'house-projects', pdf_page: 119},
    {document: 'nep', pdf_page: 9999},        // beyond the document
    {document: 'nep'},                        // derived unit without a page
    {document: 'unknown-doc', pdf_page: 5},   // not previewable
  ]};
  const refs = recordPdfSources(row, documents);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].page, 119);
  assert.equal(refs[0].pdf, 'HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf');
});

test('multi-select filters match any selected value and treat empty as all', () => {
  const rows = [record(), record({dataset: 'hgab_fmr', group: 'fmr', record_id: 'r2'}),
    record({status: 'hint_only', record_id: 'r3', fields: []})];
  // Empty selection keeps everything; one value narrows; several union.
  assert.equal(filterRecords(rows, {group: []}).length, 3);
  assert.equal(filterRecords(rows, {group: ['fmr']}).length, 1);
  assert.equal(filterRecords(rows, {group: ['fmr', 'dpwh']}).length, 3);
  assert.equal(filterRecords(rows, {status: ['parsed', 'hint_only']}).length, 3);
  assert.equal(filterRecords(rows, {dataset: ['hgab_fmr'], status: ['parsed']}).length, 1);
  // A legacy single string still matches by equality, never by substring.
  assert.equal(filterRecords(rows, {group: 'fmr'}).length, 1);
  assert.equal(filterRecords(rows, {group: 'f'}).length, 0, 'string "f" must not substring-match "fmr"');
  assert.equal(filterRecords(rows, {group: 'dpwh'}).length, 2);
});

test('change-type filter buckets comparison traces and exposes non-comparison data', () => {
  const rows = [
    record({record_id: 'ins', change_type: 'insertion', amount: 96208000}),
    record({record_id: 'del', change_type: 'deletion', amount: 120535000}),
    record({record_id: 'up', change_type: 'adjustment_increased', amount: 39865000}),
    record({record_id: 'down', change_type: 'adjustment_decreased', amount: 13838000}),
    record({record_id: 'same', change_type: 'no_change', amount: 89314000}),
    record({record_id: 'fmr', dataset: 'hgab_fmr', group: 'fmr', change_type: null, amount: 15000000}),
  ];
  assert.equal(filterRecords(rows, {change: ['insertion']}).map(r => r.record_id).join(), 'ins');
  assert.equal(filterRecords(rows, {change: ['deletion']}).map(r => r.record_id).join(), 'del');
  // Both adjustment directions selected at once.
  assert.equal(filterRecords(rows, {change: ['adjustment_increased', 'adjustment_decreased']}).length, 2);
  // Records without a comparison signal stay reachable via the 'none' bucket.
  assert.equal(filterRecords(rows, {change: ['none']}).map(r => r.record_id).join(), 'fmr');
  // Combining buckets unions them; the change label is human-readable.
  assert.equal(filterRecords(rows, {change: ['insertion', 'no_change']}).length, 2);
  assert.equal(CHANGE_TYPE_LABELS.insertion, 'Unsupported insertion (House-only)');
  assert.equal(CHANGE_TYPE_LABELS.none, 'No comparison data');
  assert.ok(MULTI_FILTER_KEYS.includes('change'));
});

test('optionLists counts change types including the no-comparison bucket', () => {
  const rows = [record({change_type: 'insertion'}), record({record_id: 'r2', change_type: 'insertion'}),
    record({record_id: 'r3', dataset: 'hgab_fmr', group: 'fmr', change_type: null})];
  const lists = optionLists(rows, {datasets: [{id: 'dpwh_comparison_2027', label: 'DPWH', records: 2}]});
  assert.equal(lists.changes.find(c => c.value === 'insertion').count, 2);
  assert.equal(lists.changes.find(c => c.value === 'none').count, 1);
  assert.equal(lists.changes.find(c => c.value === 'none').label, 'No comparison data');
});

test('overlay features carry amount and change type for map-side use', () => {
  const row = record({amount: 96208000, change_type: 'insertion'});
  const overlay = buildOverlay([row], {datasets: [{id: 'dpwh_comparison_2027', group: 'dpwh'}]});
  assert.equal(overlay.points.features[0].properties.amount, 96208000);
  assert.equal(overlay.points.features[0].properties.changeType, 'insertion');
});

test('parseMulti and serializeMulti round-trip URL filter state', () => {
  assert.deepEqual(parseMulti(''), []);
  assert.deepEqual(parseMulti(null), []);
  assert.deepEqual(parseMulti('insertion'), ['insertion']);
  assert.deepEqual(parseMulti('fmr|dpwh'), ['fmr', 'dpwh']);
  assert.equal(serializeMulti([]), '');
  assert.equal(serializeMulti(['fmr', 'dpwh']), 'fmr|dpwh');
  assert.equal(serializeMulti(parseMulti('insertion|deletion')), 'insertion|deletion');
  // A legacy single-value link still parses into one selection.
  assert.deepEqual(parseMulti('dpwh_comparison_2027'), ['dpwh_comparison_2027']);
});

test('formatAmountPhp renders whole pesos and stays null without an amount', () => {
  assert.equal(formatAmountPhp(96208000), '₱96,208,000');
  assert.equal(formatAmountPhp(0), '₱0');
  assert.equal(formatAmountPhp(1500000.6), '₱1,500,001');
  assert.equal(formatAmountPhp(null), null);
  assert.equal(formatAmountPhp(undefined), null);
  assert.equal(formatAmountPhp('not a number'), null);
});

test('search matches the formatted amount shown on the record card', () => {
  const rows = [record({record_id: 'a', amount: 96208000}), record({record_id: 'b', amount: 5000000})];
  assert.equal(filterRecords(rows, {q: '96,208,000'})[0].record_id, 'a');
  assert.equal(filterRecords(rows, {q: '₱96,208,000'})[0].record_id, 'a');
  assert.equal(filterRecords(rows, {q: '5000000'})[0].record_id, 'b');
  assert.equal(filterRecords(rows, {q: '96208000'})[0].record_id, 'a');
});
