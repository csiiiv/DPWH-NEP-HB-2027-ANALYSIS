"""Relation-view regressions: states, findings and cross-sidecar integrity.

These views are harvested from source_comparison_2027 — they must never
contradict it, and they must never hide an ambiguity they claimed to carry.
Every test here locks a promise the sidecars make to a reader:

  * the manifest points at the input that was actually used (stale sidecars
    would silently describe an older comparison),
  * each row carries exactly one state and the census adds up,
  * shell labels are unique, so money is never pooled across PAP/region,
  * every shell a view can send a reader to is actually drillable,
  * every row id a finding cites can be resolved,
  * the overlap spectrum partitions measured pairs exactly once,
  * deltas the matcher withheld stay withheld.
"""

import hashlib
import json
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path[:0] = [
    str(Path(__file__).resolve().parents[1]),
    str(Path(__file__).resolve().parents[1] / 'builders'),
]
from paths import DATA  # noqa: E402
from build_group_relations import (  # noqa: E402
    BOOKED_KINDS, FINDING_TYPES, ROW_STATES, SIDE_CODE, STATE_CODE,
    _FINDING_ID_FIELDS, harvest, read,
)

SIDECARS = (
    'index', 'shells', 'ambiguity', 'twins', 'overlaps', 'states', 'findings',
)
# Fields in a finding payload that hold row ids, so resolution can be checked
# without re-listing them per finding type.
ID_FIELDS = _FINDING_ID_FIELDS


def load(name: str) -> dict:
    return json.loads((DATA / f'group_relations_{name}_2027.json').read_text())


class GroupRelationsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sidecars = {name: load(name) for name in SIDECARS}
        cls.index = cls.sidecars['index']
        cls.summary = cls.index['summary']
        cls.comparison = read('source_comparison_2027.json')
        cls.records = cls.comparison['projects']

    # --- provenance -----------------------------------------------------
    def test_manifest_digest_matches_the_input_it_describes(self):
        """A sidecar rebuilt from an older comparison must not pass silently."""
        digest = hashlib.sha256(
            (DATA / 'source_comparison_2027.json').read_bytes()).hexdigest()
        for name in SIDECARS:
            manifest = self.sidecars[name].get('manifest', {})
            stated = (manifest.get('input_sha256')
                      or manifest.get('inputs', {}).get('source_comparison_2027.json'))
            if stated:
                self.assertEqual(digest, stated, f'{name} sidecar is stale')
        self.assertEqual(
            digest, self.index['manifest']['inputs']['source_comparison_2027.json'])

    def test_generator_digest_matches_the_builder_on_disk(self):
        digest = hashlib.sha256(
            (Path(__file__).resolve().parents[1] / 'builders'
             / 'build_group_relations.py').read_bytes()).hexdigest()
        self.assertEqual(digest, self.index['manifest']['generator']['sha256'])

    # --- harvest must not invent or lose rows ---------------------------
    def test_states_cover_every_comparison_row_exactly_once(self):
        """Row coverage comes from the source, not from a re-implementation."""
        ids = set()
        for rec in self.records:
            for side in ('house', 'nep'):
                row = rec.get(side)
                if row and row.get('id') is not None:
                    ids.add(row['id'])
        nodes, _shells, _edges, _twins, _overlaps, states = harvest(self.records)
        self.assertEqual(ids, set(states), 'harvest dropped or invented rows')
        self.assertEqual(len(nodes), len(states))
        self.assertEqual(len(states), self.summary['rows_stated'])
        self.assertEqual(len(states), len(self.sidecars['states']['rows']))

    def test_edge_kinds_only_use_status_values_the_matcher_emits(self):
        """Harvest reuses matcher statuses; it must not fabricate relations."""
        statuses = {rec.get('status') for rec in self.records}
        from build_group_relations import ATTACHED_STATUSES, _EDGE_FROM_STATUS
        self.assertEqual(set(_EDGE_FROM_STATUS), set(ATTACHED_STATUSES))
        for status in ATTACHED_STATUSES:
            self.assertIn(status, statuses,
                          f'builder expects status {status!r} the matcher never emits')

    # --- state taxonomy -------------------------------------------------
    def test_every_row_carries_exactly_one_known_state(self):
        names = self.sidecars['states']['states']
        self.assertEqual(list(ROW_STATES), names)
        self.assertEqual({s: i for i, s in enumerate(names)}, STATE_CODE)
        self.assertEqual(['house', 'nep'], self.sidecars['states']['sides'])
        for rid, entry in self.sidecars['states']['rows'].items():
            self.assertEqual(2, len(entry), f'{rid} is not [state, side]')
            code, side_code = entry
            self.assertIn(code, STATE_CODE.values(), f'{rid} has an unknown state')
            self.assertIn(side_code, SIDE_CODE.values(), f'{rid} has an unknown side')

    def test_state_census_agrees_with_the_per_row_map(self):
        census = self.summary['state_census']
        self.assertEqual(set(census), set(ROW_STATES))
        counted = Counter(code for code, _ in self.sidecars['states']['rows'].values())
        per_side = Counter()
        for code, side_code in self.sidecars['states']['rows'].values():
            per_side[(code, side_code)] += 1
        for i, name in enumerate(ROW_STATES):
            entry = census[name]
            self.assertEqual(entry['rows'], counted[i], name)
            self.assertEqual(entry['house_rows'], per_side[(i, SIDE_CODE['house'])], name)
            self.assertEqual(entry['nep_rows'], per_side[(i, SIDE_CODE['nep'])], name)
            self.assertEqual(entry['house_rows'] + entry['nep_rows'], entry['rows'], name)
        self.assertEqual(sum(e['rows'] for e in census.values()),
                         self.summary['rows_stated'])

    def test_unmatched_states_only_ever_land_on_their_own_side(self):
        """An insertion candidate is a House row; a deletion candidate is NEP.

        Mixing these would mislabel the direction of a proposed change, which
        is the one thing a reader must not be misled about.
        """
        census = self.summary['state_census']
        self.assertEqual(census['unmatched_insertion']['nep_rows'], 0)
        self.assertEqual(census['unmatched_deletion']['house_rows'], 0)
        self.assertEqual(census['twin_cross_referenced']['house_rows'],
                         census['twin_cross_referenced']['nep_rows'])

    def test_states_are_order_independent(self):
        """The ranked state machine must not depend on record order.

        A more informative state always outranks a weaker one, so shuffling
        the input cannot change any row's final state.
        """
        import random
        _nodes, _shells, _edges, _twins, _overlaps, forward = harvest(self.records)
        shuffled = list(self.records)
        random.Random(20270101).shuffle(shuffled)
        _n2, _s2, _e2, _t2, _o2, backward = harvest(shuffled)
        self.assertEqual({k: v['state'] for k, v in forward.items()},
                         {k: v['state'] for k, v in backward.items()})

    # --- shell identity -------------------------------------------------
    def test_shell_labels_are_unique(self):
        """Colliding labels would pool money across different PAP/region."""
        _nodes, shells, _edges, _twins, _overlaps, _states = harvest(self.records)
        from build_group_relations import _shell_label
        labels = [_shell_label(k) for k in shells]
        self.assertEqual(len(labels), len(set(labels)),
                         'shell labels collide — distinct shells would merge')
        self.assertEqual(len(shells), self.summary['shells'])

    def test_roster_shells_carry_their_own_key_fields(self):
        for label, row in self.sidecars['shells']['shells'].items():
            self.assertEqual(label, row['shell'])
            self.assertEqual(row['amount_gap_php'],
                             row['house_amount_php'] - row['nep_amount_php'], label)
            self.assertGreaterEqual(row['edges'], 0, label)

    # --- drillability ---------------------------------------------------
    def test_every_referenced_shell_is_drillable(self):
        """No view may send a reader to a shell that cannot be opened."""
        roster = set(self.sidecars['shells']['shells'])
        referenced = (
            {row['shell'] for row in self.index['shells']}
            | {f['shell'] for f in self.sidecars['findings']['findings'] if f.get('shell')}
            | {row['shell'] for row in self.sidecars['ambiguity']['shells']}
            | {t['shell'] for t in self.sidecars['twins']['twins'] if t.get('shell')}
            | {o['shell'] for o in self.sidecars['overlaps']['pairs'] if o.get('shell')}
        )
        self.assertEqual(set(), referenced - roster,
                         'a finding or view points at a shell missing from the roster')

    def test_state_detail_shells_are_all_in_the_roster(self):
        roster = set(self.sidecars['shells']['shells'])
        detailed = {v['shell'] for v in self.sidecars['states']['detail'].values()}
        self.assertEqual(set(), detailed - roster)

    def test_edges_only_join_nodes_that_are_present(self):
        nodes = self.sidecars['shells']['nodes']
        for edge in self.sidecars['shells']['edges']:
            self.assertIn(edge['house'], nodes)
            self.assertIn(edge['nep'], nodes)
            self.assertIn(edge['kind'], self.index['manifest']['edge_kinds'])

    # --- findings -------------------------------------------------------
    def test_findings_declare_known_types_and_resolve_their_evidence(self):
        states_rows = self.sidecars['states']['rows']
        findings = self.sidecars['findings']['findings']
        self.assertEqual(list(FINDING_TYPES), self.sidecars['findings']['types'])
        counts = Counter(f['type'] for f in findings)
        self.assertEqual(counts, Counter(self.sidecars['findings']['counts']))
        self.assertEqual(sum(counts.values()), len(findings))
        for ftype, count in self.summary['finding_counts'].items():
            self.assertEqual(counts.get(ftype, 0), count, ftype)
        self.assertEqual(sum(self.summary['finding_counts'].values()), len(findings))
        for finding in findings:
            self.assertIn(finding['type'], FINDING_TYPES)
            self.assertGreaterEqual(finding['amount_at_stake_php'], 0)
            for field in ID_FIELDS:
                value = finding.get(field)
                if value is None:
                    continue
                ids = value if isinstance(value, (list, tuple)) else [value]
                for rid in ids:
                    self.assertIn(str(rid), states_rows,
                                  f'{finding["type"]} cites unresolvable row {rid}')

    def test_findings_are_sorted_by_priority_then_money(self):
        order = {t: i for i, t in enumerate(FINDING_TYPES)}
        findings = self.sidecars['findings']['findings']
        keys = [(order[f['type']], -f['amount_at_stake_php']) for f in findings]
        self.assertEqual(keys, sorted(keys))

    def test_committed_with_rivals_actually_names_a_committed_row(self):
        """This is the finding that admits the views can disagree — it must be
        backed by a row the matcher really committed, not an open candidate."""
        states = self.sidecars['states']['rows']
        rivals = [f for f in self.sidecars['findings']['findings']
                  if f['type'] == 'committed_with_rivals']
        for finding in rivals:
            self.assertTrue(finding['committed_nodes'], finding['shell'])
            for rid in finding['committed_nodes']:
                code = states[str(rid)][0]
                self.assertIn(ROW_STATES[code], ('committed_attached', 'review_attached'))
            for rid, state in finding['rival_states'].items():
                self.assertIn(state, set(ROW_STATES) | {'unseen'})
        open_only = [f for f in self.sidecars['findings']['findings']
                     if f['type'] == 'competing_candidates']
        for finding in open_only:
            self.assertEqual([], finding['committed_nodes'], finding['shell'])

    def test_shell_amount_gap_findings_have_rows_on_both_sides(self):
        """A one-sided shell is just unmatched supply, already in the census.

        Emitting a gap finding for it would bury the two-sided cases where an
        attachment failed to explain a real difference.
        """
        gaps = [f for f in self.sidecars['findings']['findings']
                if f['type'] == 'shell_amount_gap']
        self.assertTrue(gaps)
        for finding in gaps:
            self.assertGreater(finding['house_rows'], 0, finding['shell'])
            self.assertGreater(finding['nep_rows'], 0, finding['shell'])
            self.assertNotEqual(0, finding['amount_at_stake_php'], finding['shell'])
            self.assertEqual(finding['amount_at_stake_php'],
                             abs(finding['house_amount_php'] - finding['nep_amount_php']))

    def test_unsupplied_findings_name_rows_that_were_not_consumed(self):
        states = self.sidecars['states']['rows']
        consumed = {ROW_STATES.index(s) for s in
                    ('committed_attached', 'review_attached')}
        leftovers = [f for f in self.sidecars['findings']['findings']
                     if f['type'] == 'unsupplied_shell']
        for finding in leftovers:
            self.assertIn(finding['unsupplied_side'], ('house', 'nep'))
            self.assertTrue(finding['unsupplied_ids'], finding['shell'])
            for rid in finding['unsupplied_ids']:
                self.assertNotIn(states[str(rid)][0], consumed,
                                 f'{rid} is attached yet reported unsupplied')
            self.assertEqual(sorted(finding['unsupplied_ids']),
                             sorted(finding['unsupplied_states']))

    # --- deltas the matcher withheld stay withheld ----------------------
    def test_zero_overlap_pairs_withhold_the_delta(self):
        zero = [f for f in self.sidecars['findings']['findings']
                if f['type'] == 'zero_overlap_attached']
        self.assertTrue(zero)
        for finding in zero:
            self.assertFalse(finding['delta_booked'])
            self.assertEqual(0.0, finding['overlap_ratio'])
        self.assertEqual(len(zero), self.summary['zero_overlap_pairs'])
        self.assertEqual(sum(f['amount_at_stake_php'] for f in zero),
                         self.summary['zero_overlap_gross_abs_delta_php'])

    def test_segment_scope_edges_are_never_counted_as_booked(self):
        kinds = self.summary['edge_kinds']
        self.assertNotIn('segment_scope', BOOKED_KINDS)
        self.assertIn('segment_scope', kinds)
        self.assertEqual(kinds['segment_scope'], self.summary['zero_overlap_pairs'])

    def test_overlap_spectrum_partitions_measured_pairs_exactly_once(self):
        spectrum = self.index['overlap_spectrum']
        pairs = self.sidecars['overlaps']['pairs']
        self.assertEqual(self.summary['measured_pairs'], len(pairs))
        self.assertEqual(sum(b['pairs'] for b in spectrum), len(pairs))
        # Half-open buckets: replay the partition and confirm each pair lands
        # in exactly one bucket, with no gap and no double count.
        for pair in pairs:
            ratio = pair['overlap_ratio']
            hits = [b['bucket'] for b in spectrum if _in_bucket(b, ratio)]
            self.assertEqual(1, len(hits), f'{ratio} bucketed {hits}')
        self.assertEqual(sum(b['pairs'] for b in spectrum
                             if b['bucket'].startswith('zero')),
                         self.summary['zero_overlap_pairs'])

    def test_overlap_pairs_are_all_attached_chainage_bearing_rows(self):
        booked = set(BOOKED_KINDS) | {'segment_scope'}
        for pair in self.sidecars['overlaps']['pairs']:
            self.assertIn(pair['kind'], booked)
            self.assertGreaterEqual(pair['overlap_ratio'], 0.0)

    # --- twins ----------------------------------------------------------
    def test_twins_are_cross_referenced_not_paired(self):
        twins = self.sidecars['twins']['twins']
        self.assertEqual(len(twins), self.summary['twin_pairs'])
        self.assertEqual(self.summary['twin_pairs'],
                         self.summary['finding_counts']['cross_pap_twin'])
        census = self.summary['state_census']['twin_cross_referenced']
        self.assertEqual(census['rows'], 2 * len(twins))
        nodes = self.sidecars['twins']['nodes']
        states = self.sidecars['states']['rows']
        twin_state = ROW_STATES.index('twin_cross_referenced')
        for twin in twins:
            self.assertIn(twin['house'], nodes)
            self.assertIn(twin['nep'], nodes)
            self.assertEqual(twin['amount_php'],
                             nodes[twin['house']]['amount_php'])
            self.assertEqual(nodes[twin['house']]['amount_php'],
                             nodes[twin['nep']]['amount_php'],
                             'twins must carry equal amounts to be plausible')
            self.assertNotEqual(nodes[twin['house']]['pap_id'],
                                nodes[twin['nep']]['pap_id'],
                                'same-PAP duplicates are duplicate_key, not twins')
            for rid in (twin['house'], twin['nep']):
                self.assertEqual(twin_state, states[str(rid)][0],
                                 f'{rid} is cross-referenced but not in the twin state')
            # Neither side may also be booked as an attachment.
            for rid in (twin['house'], twin['nep']):
                self.assertNotIn(states[str(rid)][0],
                                 (ROW_STATES.index('committed_attached'),
                                  ROW_STATES.index('review_attached')))

    # --- ambiguity ------------------------------------------------------
    def test_competing_nodes_really_have_several_candidates(self):
        """Degrees are per shell, so the check must be per shell too.

        An edge is stamped with the shell that anchored it; a row shared
        across shells has a higher global degree than the one the shell
        reports. Comparing global degree to competing_degrees would be
        comparing two different quantities.
        """
        degree = Counter()
        for edge in self.sidecars['shells']['edges']:
            degree[(edge['shell'], edge['house'])] += 1
            degree[(edge['shell'], edge['nep'])] += 1
        shells = self.sidecars['ambiguity']['shells']
        self.assertEqual(len(shells), self.summary['competing_shells'])
        self.assertEqual(len(shells), self.sidecars['ambiguity']['manifest']['shells'])
        for row in shells:
            self.assertTrue(row['competing_ids'], row['shell'])
            self.assertEqual(row['competing_nodes'], len(row['competing_ids']))
            for rid in row['competing_ids']:
                seen = degree[(row['shell'], rid)]
                self.assertGreaterEqual(seen, 2,
                                        f'{rid} reported competing with {seen} edge(s)')
                self.assertEqual(seen, row['competing_degrees'][rid],
                                 f'{rid} degree is not reproducible from the sidecar')
                self.assertIn(rid, row['nodes'], 'competing node has no body')

    def test_every_edge_is_stamped_with_a_rostered_shell(self):
        """The stamp is what makes per-shell degrees recomputable client-side."""
        roster = self.sidecars['shells']['shells']
        for edge in self.sidecars['shells']['edges']:
            self.assertIn('shell', edge)
            self.assertIn(edge['shell'], roster)
        # And the stamped edges reproduce each shell's reported edge count.
        per_shell = Counter(e['shell'] for e in self.sidecars['shells']['edges'])
        for label, row in roster.items():
            self.assertEqual(per_shell.get(label, 0), row['edges'], label)

    # --- index honesty --------------------------------------------------
    def test_index_declares_roster_truncation_instead_of_implying_completeness(self):
        shown = len(self.index['shells'])
        total = self.summary['multi_edge_shells']
        if shown < total:
            truncation = self.index.get('shells_truncated')
            self.assertTrue(truncation, 'index roster truncated without saying so')
            self.assertEqual(shown, truncation['shown'])
            self.assertEqual(total, truncation['total'])
            self.assertEqual('group_relations_shells_2027.json',
                             truncation['full_roster_in'])
        else:
            self.assertEqual(shown, total)
        for row in self.index['shells']:
            self.assertGreater(row['edges'], 1, 'index roster must be multi-edge')

    def test_edge_kind_counts_add_up_to_the_edge_total(self):
        kinds = self.summary['edge_kinds']
        self.assertEqual(sum(kinds.values()), self.summary['edges'])
        self.assertEqual(set(kinds), set(self.index['manifest']['edge_kinds']))

    def test_index_alone_can_paint_the_state_census(self):
        """The Relations view paints States from the index, without fetching
        the 2.2 MB per-row overlay — so the index must be self-sufficient:
        counts per state, per-side splits, amounts, the prose that explains
        each state, and the note explaining how states are ranked."""
        census = self.summary['state_census']
        self.assertEqual(set(census), set(ROW_STATES))
        for state, entry in census.items():
            for field in ('rows', 'amount_php', 'house_rows', 'nep_rows'):
                self.assertIn(field, entry, f'{state} census is missing {field}')
                self.assertIsInstance(entry[field], int, f'{state}.{field}')
            self.assertEqual(entry['house_rows'] + entry['nep_rows'],
                             entry['rows'], f'{state} sides do not rebuild rows')
        self.assertEqual(sum(e['rows'] for e in census.values()),
                         self.summary['rows_stated'],
                         'census rows do not rebuild rows_stated')
        self.assertTrue(self.index.get('states_note', '').strip(),
                        'index must carry the note the States tab quotes')
        # One wording, quoted in two places: a literal in each would drift.
        self.assertEqual(self.index['states_note'],
                         self.sidecars['states']['note'])

    def test_index_definitions_match_the_overlay_definitions(self):
        """Both payloads quote the same STATE_INFO object; a client rendering
        from either must show identical prose."""
        self.assertEqual(self.index['state_definitions'],
                         self.sidecars['states']['state_definitions'])

    def test_definitions_ship_with_every_taxonomy_the_ui_renders(self):
        """Labels must not be re-invented client-side, or drift from intent."""
        self.assertEqual(set(self.index['state_definitions']), set(ROW_STATES))
        self.assertEqual(set(self.index['finding_definitions']), set(FINDING_TYPES))
        self.assertEqual(set(self.sidecars['states']['state_definitions']),
                         set(ROW_STATES))
        self.assertEqual(set(self.sidecars['findings']['type_definitions']),
                         set(FINDING_TYPES))
        # Every definition must be non-empty prose, so the UI can render the
        # explanation next to the label instead of inventing its own wording.
        for text in list(self.index['state_definitions'].values()) + \
                list(self.index['finding_definitions'].values()):
            self.assertTrue(text and text.strip())
        # Node bodies carry exactly the fields a reader needs to open the row
        # elsewhere; extra fields would bloat every sidecar that embeds them.
        allowed = {'id', 'side', 'title', 'amount_php', 'program', 'pap',
                   'pap_id', 'zone', 'region', 'office', 'pdf_page'}
        for node in self.sidecars['shells']['nodes'].values():
            self.assertEqual(set(node), allowed)

    def test_region_rollup_accounts_for_every_shell_exactly_once(self):
        """Recompute the rollup from the harvested shells and compare.

        The rollup spans ALL shells, not just the drillable roster, so this
        is checked against a fresh harvest rather than against another
        sidecar that shares the same arithmetic.
        """
        nodes, shells, edges, _twins, _overlaps, _states = harvest(self.records)
        from build_group_relations import _shell_stats
        rows = [_shell_stats(s, edges, nodes) for s in shells.values()]
        expected: dict[str, dict] = {}
        for r in rows:
            name = r['region'] or 'No recorded region'
            e = expected.setdefault(name, {'shells': 0, 'edges': 0,
                                           'multi_edge_shells': 0,
                                           'competing_shells': 0,
                                           'house_amount_php': 0,
                                           'nep_amount_php': 0,
                                           'competing_amount_php': 0})
            e['shells'] += 1
            e['edges'] += r['edges']
            e['house_amount_php'] += r['house_amount_php']
            e['nep_amount_php'] += r['nep_amount_php']
            if r['edges'] > 1:
                e['multi_edge_shells'] += 1
            if r['competing_nodes']:
                e['competing_shells'] += 1
                e['competing_amount_php'] += abs(r['amount_gap_php'])

        actual = {e['region']: e for e in self.index['region_summary']}
        self.assertEqual(set(expected), set(actual))
        for name, want in expected.items():
            got = actual[name]
            for field, value in want.items():
                self.assertEqual(value, got[field], f'{name}.{field}')

        summary = self.summary
        self.assertEqual(sum(e['shells'] for e in actual.values()), summary['shells'])
        self.assertEqual(sum(e['edges'] for e in actual.values()), summary['edges'])
        self.assertEqual(sum(e['multi_edge_shells'] for e in actual.values()),
                         summary['multi_edge_shells'])
        self.assertEqual(sum(e['competing_shells'] for e in actual.values()),
                         summary['competing_shells'])
        self.assertEqual(sum(e['house_amount_php'] for e in actual.values()),
                         summary['house_amount_php'])
        self.assertEqual(sum(e['nep_amount_php'] for e in actual.values()),
                         summary['nep_amount_php'])

    def test_sidecar_sizes_stay_bounded_for_lazy_loading(self):
        """The index is fetched first, so it must stay small; heavy payloads
        are split out and loaded on demand."""
        sizes = {name: (DATA / f'group_relations_{name}_2027.json').stat().st_size
                 for name in SIDECARS}
        self.assertLess(sizes['index'], 1_000_000, 'index too heavy for a first fetch')
        self.assertLess(sizes['twins'], 200_000)
        self.assertLess(sizes['overlaps'], 2_000_000)
        self.assertLess(sizes['ambiguity'], 2_000_000)
        self.assertLess(sizes['findings'], 5_000_000)
        self.assertLess(sizes['states'], 5_000_000)
        self.assertLess(sizes['shells'], 15_000_000)
        self.assertEqual(set(sizes), set(SIDECARS))


def _in_bucket(bucket: dict, ratio: float) -> bool:
    """Replay the builder's half-open bucket rule for one measured ratio."""
    lo, hi, include_hi = bucket.get('lo'), bucket.get('hi'), bucket.get('include_hi')
    if lo is None and hi is None:
        return ratio == 0.0
    if hi is None:
        return ratio >= lo
    return lo < ratio <= hi if include_hi else lo < ratio < hi


if __name__ == '__main__':
    unittest.main()
