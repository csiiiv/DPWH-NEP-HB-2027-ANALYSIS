"""Accounting/freshness checks and conservative source matching regressions."""
import sys
import unittest
from pathlib import Path

from build_current_pages import project_matches, region, normalized, scope_key

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_current_pages import validate_current_pages


def allocation(id, title='Construction of Road at Barangay Mabini, Sample City', amount=10000000, reg='Region III', zone='local'):
    return {'id': id, 'title': title, 'amount_php': amount, 'region': reg,
            'zone': zone, 'program': 'Network Development Program', 'pap_id': 'p262:r1'}


class CurrentPageTests(unittest.TestCase):
    def test_committed_pages_have_current_inputs_and_valid_accounting(self):
        data = validate_current_pages()
        self.assertEqual(data['summary']['house_balanced_paps'], 38)
        self.assertEqual(data['summary']['reviewed_pairs'], 0)
        for row in data['projects']:
            if row['status'] == 'exact_candidate':
                self.assertEqual(normalized(row['house']['title']), normalized(row['nep']['title']))
                self.assertEqual(scope_key(row['house']), scope_key(row['nep']))
            for suggestion in row.get('candidates', []):
                self.assertEqual(scope_key(row['house']), scope_key(suggestion['nep']))

    def test_unique_title_pair_does_not_require_equal_amount(self):
        rows = project_matches([allocation('h', amount=12000000)], [allocation('n')])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['status'], 'exact_candidate')
        self.assertEqual(rows[0]['delta_php'], 2000000)

    def test_duplicate_exact_keys_are_not_greedily_consumed(self):
        rows = project_matches([allocation('h1'), allocation('h2')], [allocation('n')])
        self.assertEqual([r['status'] for r in rows].count('exact_candidate'), 0)
        self.assertEqual([r['status'] for r in rows].count('ambiguous'), 2)
        self.assertEqual([r['status'] for r in rows].count('nep_unmatched'), 1)

    def test_region_and_local_fap_boundaries_are_preserved(self):
        for other in [allocation('n', reg='Region IV-A'), allocation('n', zone='fap')]:
            rows = project_matches([allocation('h')], [other])
            self.assertEqual({r['status'] for r in rows}, {'house_unmatched', 'nep_unmatched'})
        self.assertEqual(region('Region Ⅳ-A'), 'Region IV-A')
        self.assertEqual(region('Nationwide'), 'Nationwide')
        self.assertEqual(region('BARMM'), 'Nationwide')

    def test_fuzzy_shortlist_ties_are_ordered_by_source_id(self):
        h = allocation('h', title='Construction of Road at Barangay Mabini, Sample City Segment A')
        ns = [allocation(f'n{i:02}', title=f'Construction of Road at Barangay Mabini, Sample City Segment {i}') for i in range(30)]
        def suggestions(source):
            row = next(r for r in project_matches([h], source) if r['status'] == 'fuzzy_candidate')
            return [c['nep']['id'] for c in row['candidates']]
        self.assertEqual(suggestions(ns), suggestions(list(reversed(ns))))

    def test_fuzzy_suggestions_do_not_consume_or_certify_source_rows(self):
        rows = project_matches([allocation('h', title='Construction of Road at Barangay Mabini, Sample City Segment 2')],
                               [allocation('n', title='Construction of Road at Barangay Mabini, Sample City Segment 1')])
        self.assertEqual({r['status'] for r in rows}, {'fuzzy_candidate', 'nep_unmatched'})
        suggestion = next(r for r in rows if r['status'] == 'fuzzy_candidate')
        self.assertGreaterEqual(suggestion['candidates'][0]['confidence'], .85)
        self.assertNotIn('delta_php', suggestion)


if __name__ == '__main__':
    unittest.main()
