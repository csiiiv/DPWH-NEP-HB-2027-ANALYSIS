import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAINAGE_FOCUS,
  CHAINAGE_MODUS,
  amountChangeBins,
  chainageAmendmentRows,
  chainageModus,
  filterChainageRows,
  modusSummary,
  perKmChangeBins,
  redFlagPerKm,
  summarizeChainage,
} from './chainageAnalysis.js';

test('chainage amendment rows expose length Δ and review flags', () => {
  const projects = [
    {
      id: 'c1',
      house_match: 'chainage_candidate',
      title: 'Quezon-Alabat-Perez Rd',
      program: 'Asset Preservation Program',
      region: 'IV-A',
      reason: 're-segmentation',
      nep: {
        amount_php: 10_000_000,
        chainages: [
          {from: 'K0020+328', to: 'K0020+582', length_m: 254},
        ],
      },
      third: {
        amount_php: 12_000_000,
        chainage_length_review: 'repaired_km_ocr',
        chainages: [
          {from: 'K0003+230', to: 'K0003+275', length_m: 45},
          {
            from: 'K0220+328', to: 'K0020+513', length_m: 185,
            length_review: 'repaired_km_ocr',
            length_from: 'K0020+328', length_to: 'K0020+513',
          },
        ],
      },
    },
    {
      id: 'p1',
      house_match: 'chainage_candidate',
      title: 'Libas Br.',
      nep: {
        amount_php: 1,
        chainages: [{point: true, from: 'K0096+090', to: 'K0096+090', meters_from: 96090, length_m: null}],
      },
      second: {
        amount_php: 1,
        chainages: [{point: true, from: 'K0095+075', to: 'K0095+075', meters_from: 95075, length_m: null}],
      },
    },
    {id: 'exact', house_match: 'exact_candidate', title: 'Other'},
  ];
  const rows = chainageAmendmentRows(projects);
  assert.equal(rows.length, 2);
  const alabat = rows.find(r => r.id === 'c1');
  assert.equal(alabat.length_review, 'repaired_km_ocr');
  assert.equal(alabat.budget_gap_php, 2_000_000);
  assert.equal(alabat.length_direction, 'down'); // 230 vs 254
  assert.match(alabat.house_spans, /K0020\+328 – K0020\+513 \(printed/);
  // Price per km: NEP 10M/0.254km, HGAB 12M/0.230km
  assert.ok(Math.abs(alabat.nep_per_km - 10_000_000/0.254) < 1);
  assert.ok(Math.abs(alabat.house_per_km - 12_000_000/0.230) < 1);
  assert.ok(alabat.per_km_delta > 0);
  assert.ok(alabat.per_km_pct > 0);
  const points = rows.find(r => r.id === 'p1');
  assert.equal(points.point_only, true);
  assert.equal(points.length_delta_m, null);
  assert.equal(points.nep_per_km, null);
  assert.equal(points.house_per_km, null);
  assert.equal(points.per_km_delta, null);

  const summary = summarizeChainage(rows);
  assert.equal(summary.rows, 2);
  assert.equal(summary.review, 1);
  assert.equal(summary.point_only, 1);
  assert.equal(filterChainageRows(rows, 'review').length, 1);
  assert.equal(filterChainageRows(rows, 'points').length, 1);
  assert.ok(CHAINAGE_FOCUS.review);
  // Rows carry their amendment modus; point-only rows stay unclassified.
  // Alabat: budget +20%, length −9.4% (flat in the deadband), rate +32% →
  // budget up · scope held · rate marked up.
  assert.equal(alabat.modus, 'gain_scope_hold');
  assert.equal(points.modus, null);
  assert.equal(filterChainageRows(rows, 'modus_gain_scope_hold').length, 1);
  assert.equal(filterChainageRows(rows, 'modus_hold_concentrate').length, 0);
});

test('per-km change bins split records by 25-point steps with red-flag slice', () => {
  const rows = [
    {per_km_pct: 5, house_php: 100, nep_php: 90},
    {per_km_pct: -30, house_php: 200, nep_php: 150},
    {per_km_pct: 80, house_php: 300, nep_php: 100},
    {per_km_pct: 260, house_php: 400, nep_php: 50},
    {per_km_pct: null, house_php: 50, nep_php: 50},
  ];
  const {bins, measurable, noLength, totalPhp} = perKmChangeBins(rows);
  assert.equal(measurable, 4);
  assert.equal(noLength, 1);
  assert.equal(totalPhp, 1000);
  assert.equal(bins[0].records, 1); // 5%
  assert.equal(bins[1].records, 1); // 30%
  assert.equal(bins[3].records, 1); // 80%
  assert.equal(bins[8].records, 1); // 260% clamps to 200+ bin
  assert.equal(bins[0].red_flag, false);
  assert.equal(bins[1].red_flag, true); // 25–50% fully above the 10% line
  assert.deepEqual(redFlagPerKm(rows).map(r => r.per_km_pct), [-30, 80, 260]);
  assert.deepEqual(redFlagPerKm(rows, 100).map(r => r.per_km_pct), [260]);
});

test('amount change bins are signed and clamped at both ends', () => {
  const rows = [
    {budget_gap_pct: -85, house_php: 10, nep_php: 100},   // −100 bin
    {budget_gap_pct: -30, house_php: 70, nep_php: 100},   // −25 bin
    {budget_gap_pct: 0, house_php: 100, nep_php: 100},    // 0 bin
    {budget_gap_pct: 45, house_php: 145, nep_php: 100},   // +25 bin
    {budget_gap_pct: 300, house_php: 400, nep_php: 100},  // clamps to 200+ bin
    {budget_gap_pct: null, house_php: 50, nep_php: 50},   // excluded
  ];
  const {bins, measurable, missing} = amountChangeBins(rows);
  assert.equal(measurable, 5);
  assert.equal(missing, 1);
  const byEdge = Object.fromEntries(bins.map(b => [b.edge, b]));
  assert.equal(bins.length, 13);
  assert.equal(byEdge[-100].records, 1);
  assert.equal(byEdge[-50].records, 1); // −30% falls in −50 to −25%
  assert.equal(byEdge[0].records, 1);
  assert.equal(byEdge[25].records, 1);
  assert.equal(byEdge[200].records, 1);
  assert.equal(byEdge[200].house_php, 400);
});

test('chainage modus classifies budget × scope × rate archetypes', () => {
  // row(budget, scope, rate) as pct deltas
  const row = (b, l, p) => ({budget_gap_pct: b, length_delta_pct_value: l, per_km_pct: p});
  // User's named archetypes
  assert.equal(chainageModus(row(-30, -30, 40)), 'compromise_concentration'); // cut, cut, marked up
  assert.equal(chainageModus(row(50, -30, 40)), 'gain_short_scope');          // up, cut, marked up
  // Budget-held signatures
  assert.equal(chainageModus(row(0, -30, 40)), 'hold_concentrate');
  assert.equal(chainageModus(row(0, 0, 0)), 'hold_hold');
  assert.equal(chainageModus(row(0, 40, -30)), 'hold_stretch');
  // Budget-up family
  assert.equal(chainageModus(row(50, 0, 40)), 'gain_scope_hold');
  assert.equal(chainageModus(row(50, 40, 0)), 'gain_scope_up');
  assert.equal(chainageModus(row(50, 40, -30)), 'gain_rate_cut');
  assert.equal(chainageModus(row(50, 40, 40)), 'gain_longer_cheap');
  // Budget-cut family
  assert.equal(chainageModus(row(-30, -30, 0)), 'hold_the_rate');
  assert.equal(chainageModus(row(-30, -30, -40)), 'cut_to_the_bone');
  assert.equal(chainageModus(row(-30, 40, -30)), 'cut_but_longer');
  assert.equal(chainageModus(row(-30, 40, 0)), 'cut_scope_up');
  // Flat scope variants fold into the same archetypes
  assert.equal(chainageModus(row(-30, 0, 40)), 'compromise_concentration');
  assert.equal(chainageModus(row(50, 0, -30)), 'gain_shorter_cheap');
  assert.equal(chainageModus(row(0, -30, -30)), 'cut_to_the_bone');
  assert.equal(chainageModus(row(0, -30, 0)), 'hold_short_scope');
  // Deadband-edge archetypes: one axis crossed, others flat
  assert.equal(chainageModus(row(0, 0, 40)), 'hold_rate_creep');
  assert.equal(chainageModus(row(0, 0, -40)), 'hold_rate_ebb');
  assert.equal(chainageModus(row(50, 0, 0)), 'gain_compound');
  assert.equal(chainageModus(row(0, 40, 0)), 'hold_scope_drift');
  // Deadband: ±10% is flat
  assert.equal(chainageModus(row(10, 10, 10)), 'hold_hold');
  assert.equal(chainageModus(row(-10, -10, -10)), 'hold_hold');
  // Unmeasurable rows stay unclassified
  assert.equal(chainageModus(row(null, -30, 40)), null);
  assert.equal(chainageModus({budget_gap_pct: -30}), null);
  const groups = modusSummary([
    {...row(-30, -30, 40), nep_php: 100, house_php: 70, budget_gap_php: -30},
    {...row(-30, -30, 40), nep_php: 200, house_php: 130, budget_gap_php: -70},
    {...row(0, 0, 0), nep_php: 500, house_php: 500, budget_gap_php: 0},
    {...row(null, 50, 50), nep_php: 1, house_php: 1, budget_gap_php: 0},
  ]).groups;
  assert.equal(groups.length, 2);
  assert.equal(groups[0].modus, 'compromise_concentration');
  assert.equal(groups[0].records, 2);
  assert.equal(groups[0].gap_php, -100);
  assert.equal(groups[0].median_budget_pct, -30); // upper-middle of [-70, -30]
  assert.equal(groups[0].median_scope_pct, -30);
  assert.equal(groups[0].median_rate_pct, 40);
  assert.ok(CHAINAGE_MODUS.gain_short_scope.hint);
});
