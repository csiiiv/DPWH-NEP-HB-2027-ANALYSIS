"""Fail closed on stale releases, tampered files and unresolved review refs."""
import gzip
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from master_list.tests import test_cleaned_dataset  # Sets the scripts import path.
from cleaned_policy import SCHEMA, ADOPTION, FLAG_POLICY
from cleaned_release import digest, load_cleaned
from review_catalog import CATALOG_PATH


class CleanedRelease(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.directory=self.root/'release'
        self.directory.mkdir()
        (self.root/'source.txt').write_text('source')
        shutil.copyfile(CATALOG_PATH,self.directory/'review_catalog.json')
        self.row={'record_id':'test:1','location_resolution':{'status':'unresolved'},
                  'review_flags':[{'code':'location_unclear','status':'open','evidence_refs':['interpretation']}]}
        self.evidence={'record_id':'test:1','items':{'interpretation':{}}}
        self.manifest={'schema_version':SCHEMA,'adoption_policy':ADOPTION,'flag_policy':FLAG_POLICY,
                       'counts':{'records':1},'input_files':{'source.txt':{'sha256':digest(self.root/'source.txt')}},
                       'review_catalog':{'path':'review_catalog.json','version':'review_catalog_v1',
                                         'sha256':digest(self.directory/'review_catalog.json')}}
        self.write()

    def write(self,extra_rows=(),extra_evidence=()):
        for name,rows in [('observations.jsonl.gz',[self.row,*extra_rows]),
                          ('evidence.jsonl.gz',[self.evidence,*extra_evidence])]:
            with gzip.open(self.directory/name,'wt') as stream:
                for row in rows:stream.write(json.dumps(row)+'\n')
        self.manifest['output_sha256']={name:digest(self.directory/name) for name in
                                       ('observations.jsonl.gz','evidence.jsonl.gz','review_catalog.json')}
        (self.directory/'manifest.json').write_text(json.dumps(self.manifest))

    def load(self):
        records,manifest,catalog=load_cleaned(self.directory,self.root)
        return list(records),manifest,catalog

    def test_loads_record_pairs_and_shared_catalog(self):
        rows,manifest,catalog=self.load()
        self.assertEqual(rows,[(self.row,self.evidence)])
        self.assertEqual(manifest['schema_version'],SCHEMA)
        self.assertEqual(catalog['version'],'review_catalog_v1')

    def test_rejects_changed_source_and_output_bytes(self):
        (self.root/'source.txt').write_text('changed')
        with self.assertRaisesRegex(ValueError,'Stale cleaned release input'):self.load()
        (self.root/'source.txt').write_text('source')
        with (self.directory/'observations.jsonl.gz').open('ab') as stream:stream.write(b'tampered')
        with self.assertRaisesRegex(ValueError,'output differs'):self.load()

    def test_rejects_unknown_schema_and_dangling_references(self):
        self.manifest['schema_version']='unknown'
        self.write()
        with self.assertRaisesRegex(ValueError,'Unknown cleaned release'):self.load()
        self.manifest['schema_version']=SCHEMA
        self.row['review_flags'][0]['evidence_refs']=['missing']
        self.write()
        with self.assertRaisesRegex(ValueError,'Unknown reference'):self.load()

    def test_rejects_missing_duplicate_or_misidentified_evidence(self):
        self.evidence['record_id']='other'
        self.write()
        with self.assertRaisesRegex(ValueError,'identities or coverage'):self.load()
        self.evidence['record_id']='test:1'
        self.write(extra_rows=[self.row])
        with self.assertRaisesRegex(ValueError,'identities or coverage'):self.load()
        self.write(extra_rows=[self.row],extra_evidence=[self.evidence])
        with self.assertRaisesRegex(ValueError,'Duplicate cleaned'):self.load()


if __name__=='__main__':unittest.main()
