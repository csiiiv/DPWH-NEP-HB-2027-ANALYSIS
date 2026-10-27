"""Verify reference resolution and the generated table ledger."""
from collections import Counter
import base64
import csv
import gzip
import json
import io
from pathlib import Path
import sys
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from build_viewer import category, reference, digest, comparison_groups, review_suggestions_view, RecordPacketWriter, context_score_view, compact_assessments, cleaned_row_view, cleaned_bundle_evidence
from locations import SCORE_METHOD


class Viewer(unittest.TestCase):
    def test_offline_evidence_payload_loads_in_bounded_complete_packets(self):
        html = (ROOT / 'master_list/index.html').read_text()
        encoded = re.search(r'<script id="embedded-data" type="application/octet-stream">([^<]+)</script>', html).group(1)
        binary = base64.b64decode(encoded)
        counts, totals = Counter(), Counter()
        row_count = group_count = header_count = 0
        with gzip.open(io.BytesIO(binary), 'rt', encoding='utf-8') as stream:
            for line in stream:
                self.assertLess(len(line), 64 * 1024 * 1024, 'Packet exceeds the bounded browser loading contract')
                packet = json.loads(line)
                if 'rows' in packet:
                    self.assertEqual(set(packet), {'rows'})
                    self.assertLessEqual(len(packet['rows']), 256)
                    for r in packet['rows']:
                        row_count += 1
                        counts[r['dataset']] += 1
                        totals[r['dataset']] += r['value']
                        self.assertIn('interpretation', r)
                        pool = r['scoreAssessments']
                        refs = [r['contextScore']['bestAssessment']]
                        if r['contextScore']['proposal']:
                            refs.append(r['contextScore']['proposal']['scoreAssessment'])
                        refs.extend(s.get('scoreAssessment') for s in r['suggestions'])
                        refs.extend(c.get('score_assessment') for c in r['interpretation']['candidates'])
                        refs.extend(p.get('scoreAssessment') for p in r['cleaned']['locations'])
                        self.assertTrue(all(key in pool for key in refs if key is not None))
                elif 'groups' in packet:
                    self.assertEqual(set(packet), {'groups'})
                    self.assertLessEqual(len(packet['groups']), 256)
                    group_count += len(packet['groups'])
                else:
                    header_count += 1
                    self.assertIn('datasets', packet)
        audit = json.loads((ROOT / 'master_list/data/audit.json').read_text())
        self.assertEqual(header_count, 1)
        self.assertEqual(row_count, audit['records'])
        self.assertEqual(group_count, audit['processing_dataset']['comparison_groups'])
        for ds, entry in audit['datasets'].items():
            self.assertEqual(counts[ds], entry['records'])
            self.assertEqual(totals[ds], entry['amount_php'])

    def test_record_packets_bound_loading_and_preserve_complete_json(self):
        import tempfile
        bundles = [{'record': {'record_id': f'test:{i}', 'title': '</script>',
                               'implementing_office': 'Camarines Sur 4th District Engineering Office'},
                    'location_interpretation': {'candidates': list(range(500))}}
                   for i in range(65)]
        with tempfile.TemporaryDirectory() as tmp:
            writer = RecordPacketWriter(Path(tmp))
            keys = [writer.add(b) for b in bundles]
            writer.flush()
            self.assertEqual(keys[:64], ['0000'] * 64)
            self.assertEqual(keys[64], '0001')
            decoded = []
            for path in sorted((Path(tmp) / 'record_details').glob('*.js')):
                match = re.fullmatch(r'window.masterRecordPacketLoaded\("(\d+)","([A-Za-z0-9+/=]+)"\);\n', path.read_text())
                self.assertIsNotNone(match)
                data = gzip.decompress(base64.b64decode(match[2])).decode()
                decoded.extend(json.loads(line) for line in data.splitlines())
            self.assertEqual(decoded, bundles)

    def test_retained_record_packets_include_every_full_observation_and_profile(self):
        manifest = json.loads((ROOT / 'master_list/data/viewer_manifest.json').read_text())
        from build_location_interpretations import load_profiles
        profiles, _ = load_profiles()
        from cleaned_release import read_rows, DIRECTORY as CLEANED
        cleaned = read_rows(CLEANED / 'observations.jsonl.gz')
        evidence = read_rows(CLEANED / 'evidence.jsonl.gz')
        count = 0
        with gzip.open(ROOT / 'master_list/data/projects.jsonl.gz', 'rt') as master:
            for name in sorted(k for k in manifest['output_sha256'] if k.startswith('record_details/')):
                path = ROOT / 'master_list/data' / name
                self.assertEqual(digest(path), manifest['output_sha256'][name])
                encoded = re.fullmatch(r'window.masterRecordPacketLoaded\("(\d+)","([A-Za-z0-9+/=]+)"\);\n', path.read_text())[2]
                payload = gzip.decompress(base64.b64decode(encoded))
                self.assertLessEqual(len(payload), 16 * 1024 * 1024)
                lines = payload.splitlines()
                self.assertLessEqual(len(lines), 64)
                for line in lines:
                    bundle = json.loads(line)
                    self.assertEqual(bundle['record'], json.loads(next(master)))
                    self.assertEqual(bundle['location_interpretation'], next(profiles))
                    self.assertEqual(bundle['cleaned_record'], next(cleaned))
                    self.assertEqual(cleaned_bundle_evidence(bundle), next(evidence))
                    count += 1
            self.assertEqual(master.read(), '')
            self.assertIsNone(next(profiles, None))
            self.assertIsNone(next(cleaned, None))
            self.assertIsNone(next(evidence, None))
        self.assertEqual(count, manifest['records'])
        self.assertEqual(count, manifest['record_details']['records'])

    def test_review_suggestions_join_full_profiles_with_contexts(self):
        from master_list.tests.test_location_interpretations import catalog
        from build_location_interpretations import Interpreter
        engine = Interpreter(catalog())
        record = dict(record_id='test:1', dataset='test', record_kind='project',
                      title_clean='Road, Santa Maria, Carmen South Province',
                      source_region='Region I', implementing_office='North Province Office')
        record['location'] = engine.matcher.match(record['title_clean'])
        profile = engine.assess(record)
        views = review_suggestions_view(profile, [], engine.matcher.rows)
        candidate = next(s for s in views if s['code'] == 'b3')
        self.assertIsNone(candidate['supportScore'])
        self.assertEqual(candidate['assessment']['printed_province'], 'conflicts')
        self.assertEqual(candidate['assessment']['office_context'], 'agrees')
        self.assertEqual(candidate['assessment']['region'], 'agrees')
        self.assertIn('named locality and parent', candidate['origins'])
        self.assertIn('santa maria', candidate['wording'])

    def test_context_support_view_keeps_master_and_trial_scores_separate(self):
        from master_list.tests.test_context_scoring import ContextScoring
        fixture = ContextScoring(); fixture.setUp()
        profile = fixture.run_score()
        view = context_score_view(profile, fixture.engine.matcher.rows)
        self.assertEqual(view['best_support_score'], 7)
        self.assertEqual(view['proposal']['code'], 'b1')
        self.assertEqual(view['dimensions']['spatial'], 6)
        self.assertEqual(view['trial_status'], 'ready_for_trial')
        self.assertEqual(view['bestAssessment']['scope_fit']['whole_project_extent'], 'not_assessed')
        self.assertEqual(view['bestAssessment']['evidence_quality']['coordinates']['state'], 'parsed')
        self.assertEqual(view['ambiguity']['state'], 'single_candidate')

    def test_cleaned_view_displays_selected_support_without_summing_locations(self):
        from copy import deepcopy
        from master_list.tests import test_cleaned_dataset as fixtures
        fixture=fixtures.CleanedDataset();fixture.setUp()
        row,_=fixture.clean(fixture.record(),fixture.coordinate('b1'))
        before=deepcopy(row)
        view=cleaned_row_view(row)
        self.assertEqual(view['selectedSupport'],7)
        self.assertEqual(view['locations'][0]['scope'],'observed_coordinate_points')
        self.assertEqual(row,before)
        other=deepcopy(row['location_resolution']['selected_locations'][0])
        other['candidate_support']['support_score']=3
        row['location_resolution']['selected_locations'].append(other)
        self.assertEqual(cleaned_row_view(row)['selectedSupport'],3)
        other['candidate_support']=None
        self.assertIsNone(cleaned_row_view(row)['selectedSupport'])
        row['location_resolution']['selected_locations']=[]
        self.assertIsNone(cleaned_row_view(row)['selectedSupport'])

    def test_compact_payload_shares_assessments_without_mutating_views(self):
        from copy import deepcopy
        from master_list.tests import test_context_scoring as fixtures
        fixture=fixtures.ContextScoring();fixture.setUp()
        profile=fixture.run_score()
        view=context_score_view(profile,fixture.engine.matcher.rows)
        assessment=view['bestAssessment']
        row={'contextScore':view,'suggestions':[{'code':'b1','scoreAssessment':assessment}],
             'interpretation':{'candidates':[{'code':'b1','score_assessment':assessment}]},
             'cleaned':{'locations':[{'code':'b1','scoreAssessment':assessment}]}}
        before=deepcopy(row)
        packed=compact_assessments(row)
        self.assertEqual(row,before)
        self.assertEqual(packed['scoreAssessments'],{'b1':assessment})
        self.assertEqual(packed['contextScore']['bestAssessment'],'b1')
        self.assertEqual(packed['contextScore']['proposal']['scoreAssessment'],'b1')
        self.assertEqual(packed['suggestions'][0]['scoreAssessment'],'b1')
        self.assertEqual(packed['interpretation']['candidates'][0]['score_assessment'],'b1')
        self.assertEqual(packed['cleaned']['locations'][0]['scoreAssessment'],'b1')

    def test_manifest_pins_cleaned_release_and_shared_vocabulary(self):
        manifest=json.loads((ROOT/'master_list/data/viewer_manifest.json').read_text())
        cleaned=json.loads((ROOT/'master_list/data/cleaned/manifest.json').read_text())
        self.assertEqual(manifest['cleaned_release']['counts'],cleaned['counts'])
        for name in ['manifest.json',*cleaned['output_sha256']]:
            path='master_list/data/cleaned/'+name
            self.assertEqual(manifest['input_sha256'][path],digest(ROOT/path))

    def test_compact_payload_rejects_inconsistent_scores_for_one_candidate(self):
        row={'contextScore':{'best_candidate_code':'b1','bestAssessment':{'support_score':7},'proposal':None},
             'suggestions':[{'code':'b1','scoreAssessment':{'support_score':99}}],
             'interpretation':{'candidates':[]}}
        with self.assertRaisesRegex(ValueError,'Conflicting candidate assessments'):
            compact_assessments(row)

    def test_groups_keep_each_source_member_and_validate_amounts(self):
        rows = [{'id': 'a', 'groupId': 'g', 'comparisonStage': 'nep', 'value': 10},
                {'id': 'b', 'groupId': 'g', 'comparisonStage': 'nep', 'value': 20},
                {'id': 'outside', 'groupId': None, 'comparisonStage': None, 'value': 5}]
        group = {'id': 'g', 'stages': {'nep': {'observation_ids': ['a', 'b'], 'amount_php': 30}}}
        self.assertEqual(comparison_groups(rows, [group]), [group])
        group['stages']['nep']['amount_php'] = 10
        with self.assertRaisesRegex(ValueError, 'amount differs'):
            comparison_groups(rows, [group])

    def test_groups_reject_missing_members_and_reused_observations(self):
        rows = [{'id': 'a', 'groupId': 'g', 'comparisonStage': 'nep', 'value': 10}]
        with self.assertRaisesRegex(ValueError, 'coverage differs'):
            comparison_groups(rows, [])
        group = {'id': 'g', 'stages': {'nep': {'observation_ids': ['a', 'a'], 'amount_php': 20}}}
        with self.assertRaisesRegex(ValueError, 'reused viewer membership'):
            comparison_groups(rows, [group])

    def test_manifest_pins_applied_suggestion_layer(self):
        manifest = json.loads((ROOT / 'master_list/data/viewer_manifest.json').read_text())
        audit = json.loads((ROOT / 'master_list/data/applied_suggestions_audit.json').read_text())
        applied = manifest['applied_suggestions']
        self.assertEqual(applied['applied'], audit['applied'])
        self.assertEqual(applied['method'], audit['method'])
        self.assertEqual(applied['by_master_status'], audit['applied_by_master_status'])
        self.assertEqual(applied['layer_sha256'], digest(ROOT / 'master_list/data/applied_suggestions.jsonl.gz'))
        for name in ('master_list/data/applied_suggestions.jsonl.gz',
                     'master_list/data/applied_suggestions_audit.json'):
            self.assertIn(name, manifest['input_sha256'])

    def test_master_preserves_processing_lineage_and_readable_titles(self):
        from processing_release import load_release, read_jsonl
        processing = load_release()
        source = {r['record_id']: r for r in read_jsonl('observations.jsonl.gz')}
        changed = grouped = outside = 0
        with gzip.open(ROOT / 'master_list/data/projects.jsonl.gz', 'rt') as stream:
            for line in stream:
                row = json.loads(line)
                original = source.pop(row['record_id'])
                for field in ('title', 'title_source', 'title_clean', 'title_clean_method',
                              'title_clean_rules', 'comparison_group_id', 'comparison_stage', 'amount_php'):
                    self.assertEqual(row[field], original[field], (row['record_id'], field))
                self.assertEqual(row['location_title_field'], 'title_clean')
                grouped += bool(row['comparison_group_id'])
                outside += not row['comparison_group_id']
                changed += row['title_clean'] != row['title_source']
        self.assertFalse(source)
        self.assertEqual(grouped, processing['compared_observations'])
        self.assertEqual(outside, processing['not_compared_observations'])
        self.assertEqual(changed, 270)

    def test_api_has_no_invented_pdf(self):
        self.assertEqual(reference({'dataset': 'dpwh_nep_api'}), (None, None, None))

    def test_hfep_ocr_file_resolves_to_pdf_with_same_page_basis(self):
        row = {'dataset': 'hfep_nep', 'source': {'source_pdf': 'HFEP.json', 'pdf_page': 2, 'printed_page': 720}}
        self.assertEqual(reference(row), ('dbm-other-nep-line-data/HFEP_2.pdf', 2, 720))

    def test_legacy_absolute_pdf_path_resolves_locally(self):
        row = {'dataset': 'dpwh_nep_pdf', 'source': {'source_pdf': '/old/server/file.pdf', 'pdf_page': 195}}
        self.assertEqual(reference(row), ('dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf', 195, None))

    def test_nia_uses_extraction_page_field(self):
        row = {'dataset': 'nia_nep', 'source_pdf': 'dbm-other-nep-line-data/NIA.pdf', 'source': {'page': 7}}
        self.assertEqual(reference(row), ('dbm-other-nep-line-data/NIA.pdf', 7, None))

    def test_hfep_region_is_not_a_category(self):
        row = {'dataset': 'hfep_nep', 'source_path': ['Annex', '2. LGU Hospitals', 'Region I', 'Facility']}
        self.assertEqual(category(row), '2. LGU Hospitals')

    def test_csv_preserves_records_and_source_totals(self):
        audit = json.loads((ROOT / 'master_list/data/audit.json').read_text())
        counts, totals, seen = Counter(), Counter(), set()
        with gzip.open(ROOT / 'master_list/data/project_list.csv.gz', 'rt', encoding='utf-8', newline='') as stream:
            for row in csv.DictReader(stream):
                self.assertNotIn(row['record_id'], seen)
                seen.add(row['record_id'])
                counts[row['dataset']] += 1
                totals[row['dataset']] += int(row['value_php'])
                score = int(row['location_score'])
                self.assertEqual(row['location_score'], str(score))
                self.assertEqual(row['score_method'], SCORE_METHOD)
                for code in row['psgc_codes'].split('|'):
                    if code:
                        self.assertEqual(len(code), 10)
                        self.assertTrue(code.isdigit())
                if row['dataset'] == 'dpwh_nep_api':
                    self.assertEqual(row['reference_pdf'], '')
                    self.assertEqual(row['pdf_page'], '')
                else:
                    self.assertTrue((ROOT / row['reference_pdf']).is_file())
                    self.assertGreater(int(row['pdf_page']), 0)
        self.assertEqual(len(seen), audit['records'])
        for dataset, entry in audit['datasets'].items():
            self.assertEqual(counts[dataset], entry['records'])
            self.assertEqual(totals[dataset], entry['amount_php'])


if __name__ == '__main__':
    unittest.main()
