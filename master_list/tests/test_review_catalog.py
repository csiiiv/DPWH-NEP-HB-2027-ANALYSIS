"""Validate the review contract independently of the generated corpus."""
from copy import deepcopy
import unittest

from master_list.scripts.review_catalog import (
    load_catalog, validate_catalog, validate_location_status, validate_review_flags,
)


class ReviewCatalog(unittest.TestCase):
    def setUp(self):
        self.catalog = load_catalog()
        self.flag = {
            'code': 'location_conflict', 'status': 'open',
            'evidence_refs': ['title_locality', 'coordinate_point:1'],
        }

    def validate(self, flags, events=()):
        validate_review_flags(flags, self.catalog,
                              evidence_ids={'title_locality', 'coordinate_point:1'},
                              review_event_ids=events)

    def test_catalog_has_shared_questions_and_explicit_status_domains(self):
        self.assertEqual(len(self.catalog['flags']), 6)
        for status in self.catalog['location_statuses']:
            validate_location_status(status, self.catalog)
        with self.assertRaises(ValueError):
            validate_location_status('response_received', self.catalog)
        with self.assertRaises(ValueError):
            self.validate([{**self.flag, 'status': 'partially_resolved'}])

    def test_open_and_empty_flags_are_valid_without_review_events(self):
        self.validate([])
        self.validate([self.flag])

    def test_catalog_validation_requires_complete_wording_and_known_version(self):
        changed = deepcopy(self.catalog)
        changed['version'] = 'review_catalog_v2'
        with self.assertRaises(ValueError):
            validate_catalog(changed)
        changed = deepcopy(self.catalog)
        del changed['flags']['location_conflict']['requested_information']
        with self.assertRaises(ValueError):
            validate_catalog(changed)
        changed = deepcopy(self.catalog)
        changed['interpretation'] = None
        with self.assertRaises(ValueError):
            validate_catalog(changed)

    def test_unknown_and_duplicate_flags_are_rejected(self):
        for flags in ([{**self.flag, 'code': 'allegation'}],
                      [{**self.flag, 'status': 'approved'}],
                      [self.flag, self.flag]):
            with self.subTest(flags=flags), self.assertRaises(ValueError):
                self.validate(flags)

    def test_evidence_references_must_exist_and_not_repeat(self):
        for refs in ([], ['missing'], ['title_locality', 'title_locality'], [None], 'title_locality'):
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                self.validate([{**self.flag, 'evidence_refs': refs}])
        with self.assertRaises(ValueError):
            validate_review_flags([self.flag], self.catalog, evidence_ids=[], review_event_ids=[])

    def test_noninitial_status_requires_recorded_event(self):
        for status in self.catalog['statuses']:
            if status == 'open':
                continue
            flag = {**self.flag, 'status': status}
            with self.subTest(status=status), self.assertRaises(ValueError):
                self.validate([flag])
            flag['review_event_refs'] = ['review:1']
            with self.assertRaises(ValueError):
                self.validate([flag])
            self.validate([flag], events={'review:1'})

    def test_catalog_cannot_disable_review_event_requirement(self):
        changed = deepcopy(self.catalog)
        changed['statuses']['resolved']['requires_review_event'] = False
        with self.assertRaises(ValueError):
            validate_catalog(changed)

    def test_shared_labels_rejected_and_validation_does_not_mutate_flags(self):
        original = deepcopy(self.flag)
        self.validate([self.flag])
        self.assertEqual(self.flag, original)
        self.validate([{**self.flag, 'detail': 'Specific source discrepancy.'}])
        for extra in ({'label': 'Repeated shared label'}, {'detail': ' '}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.validate([{**self.flag, **extra}])


if __name__ == '__main__':
    unittest.main()
