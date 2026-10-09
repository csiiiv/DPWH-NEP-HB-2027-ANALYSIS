"""Reference comparisons keep identity, allocation scope and metadata distinct."""
import sys
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'builders'))
from crosscheck_gab_reference import compare_projects, inputs


def record(id, amount=10, region='NCR', office='DEO A'):
    return {'id': id, 'title': 'Construction of Road', 'program': 'Network Development Program',
            'region': region, 'office': office, 'amount_php': amount, 'pdf_page': 10}


class ReferenceCrosscheckTests(unittest.TestCase):
    def test_amount_change_is_a_disagreement_not_an_unmatched_project(self):
        result = compare_projects([record('n')], [record('e', 15)])
        self.assertEqual(result['unique_pairs'], 1)
        self.assertEqual(result['same_amount_pairs'], 0)
        self.assertEqual(result['amount_disagreements'][0]['native_minus_external_php'], -5)
        self.assertEqual(result['native_unmatched_rows'], 0)

    def test_region_difference_is_not_silently_paired(self):
        result = compare_projects([record('n')], [record('e', region='Nationwide')])
        self.assertEqual(result['unique_pairs'], 0)
        self.assertEqual(result['native_unmatched_rows'], 1)
        self.assertEqual(result['external_unmatched_rows'], 1)

    def test_ambiguous_keys_do_not_consume_any_duplicate(self):
        result = compare_projects([record('n1'), record('n2')], [record('e')])
        self.assertEqual(result['unique_pairs'], 0)
        self.assertEqual(result['ambiguous_shared_keys'], 1)
        self.assertEqual(result['native_unmatched_php'], 20)
        self.assertEqual(result['external_unmatched_php'], 10)

    def test_missing_offices_and_conflicting_offices_remain_separate(self):
        for native, external, status in [('DEO A', '', 'external_missing'), ('', 'DEO A', 'native_missing'), ('DEO A', 'DEO B', 'differs')]:
            with self.subTest(status=status):
                result = compare_projects([record('n', office=native)], [record('e', office=external)])
                self.assertEqual(result['same_amount_pairs'], 1)
                self.assertEqual(result['office_status_counts'], {status: 1})
                self.assertEqual(len(result['office_disagreements']), int(status == 'differs'))

    def test_changed_download_is_rejected_before_parsing_or_network_access(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / 'appropriations.parquet').write_bytes(b'wrong snapshot')
            with self.assertRaisesRegex(ValueError, 'External input hash mismatch'):
                inputs(cache)


if __name__ == '__main__':
    unittest.main()
