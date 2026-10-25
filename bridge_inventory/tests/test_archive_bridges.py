"""Acquisition failure cases and offline reproducibility of retained exports."""

import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'archive_bridges.py'
SPEC = importlib.util.spec_from_file_location('archive_bridges', SCRIPT)
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


def feature(oid, bridge_id='B00001LZ', geometry=None):
    return {'attributes': {'OBJECTID': oid, 'BRIDGE_ID': bridge_id, 'BR_NAME': 'Test Br.',
                           'BRGY': 'Test', 'MUNICIPAL': 'Test', 'PROVINCE': 'Test',
                           'REGION': 'Region I', 'REMARKS': 'Source text, unchanged\nsecond line'},
            'geometry': geometry if geometry is not None else {'x': 120.1, 'y': 18.2}}


class ArchiveTests(unittest.TestCase):
    def test_missing_or_duplicate_objects_rejected(self):
        for features in ([feature(1)], [feature(1), feature(1)]):
            with self.subTest(features=features), self.assertRaises(ValueError):
                archive.validate_features(features, [1, 2], 'OBJECTID')

    def test_bridge_id_duplicates_retained_and_disclosed(self):
        result = archive.validate_features([feature(1), feature(2)], [1, 2], 'OBJECTID')
        self.assertEqual(result['duplicate_bridge_ids'], {'B00001LZ': 2})
        self.assertEqual(result['feature_count'], 2)

    def test_invalid_coordinates_preserved_as_null_and_flagged(self):
        features = [feature(1, geometry={'x': 999, 'y': 20}),
                    feature(2, geometry={'x': 0, 'y': 0}), feature(3, geometry={})]
        result = archive.validate_features(features, [1, 2, 3], 'OBJECTID')
        self.assertEqual(result['invalid_or_missing_coordinate_object_ids'], [1, 3])
        self.assertEqual(result['outside_philippines_screen_object_ids'], [2])
        fields = [{'name': name} for name in features[0]['attributes']]
        exports = archive.exports(features, fields, 'OBJECTID')
        geo = json.loads(exports['data/bridges.geojson.gz'])
        self.assertIsNone(geo['features'][0]['geometry'])
        self.assertEqual(geo['features'][1]['geometry']['coordinates'], [0, 0])
        self.assertEqual(geo['features'][0]['properties'], features[0]['attributes'])

    def fake_fetch(self, instance, name, endpoint, **params):
        features = [feature(i, f'B0000{i}LZ') for i in range(1, 4)]
        layer = {'name': 'General Bridge Type', 'geometryType': 'esriGeometryPoint',
                 'objectIdField': 'OBJECTID', 'maxRecordCount': 2, 'editingInfo': {'lastEditDate': 123},
                 'extent': {'spatialReference': {'wkid': 32651}},
                 'fields': [{'name': name} for name in features[0]['attributes']]}
        if name == 'raw/service.json':
            value = {'serviceItemId': 'test'}
        elif name == 'raw/item.json':
            value = {'owner': 'test', 'snippet': 'Existing bridges'}
        elif 'layer' in name:
            value = layer
        elif 'count' in name:
            value = {'count': 3}
        elif 'object_ids' in name:
            value = {'objectIds': [3, 1, 2]}
        else:
            ids = [int(oid) for oid in params['objectIds'].split(',')]
            value = {'spatialReference': {'wkid': 4326},
                     'features': [f for f in features if f['attributes']['OBJECTID'] in ids]}
        value = copy.deepcopy(value)
        if self.failure == 'truncate' and name.startswith('raw/features_'):
            value['exceededTransferLimit'] = True
        if self.failure == 'source_change' and name == 'raw/layer_after.json':
            value['editingInfo']['lastEditDate'] = 456
        if self.failure == 'crs' and name.startswith('raw/features_'):
            value['spatialReference']['wkid'] = 32651
        instance.write(name, archive.encode(value), url='https://example.invalid', retrieved_at_utc=archive.now())
        return value

    def run_collect(self, directory, failure=None):
        self.failure = failure
        test = self

        def fetch(instance, *args, **kwargs):
            return test.fake_fetch(instance, *args, **kwargs)

        with patch.object(archive.Archive, 'fetch', fetch), contextlib.redirect_stdout(io.StringIO()):
            return archive.collect(directory)

    def test_full_acquisition_and_offline_check(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            manifest = self.run_collect(directory)
            self.assertEqual(manifest['validation']['feature_count'], 3)
            self.assertTrue((directory / 'raw/features_0002.json.gz').exists())
            with patch.object(archive, 'urlopen', side_effect=AssertionError('Network used')):
                archive.check(directory)
            rows = [json.loads(line) for line in archive.read(directory, 'data/bridges.jsonl.gz').splitlines()]
            self.assertEqual([r['attributes']['OBJECTID'] for r in rows], [1, 2, 3])
            self.assertEqual(rows[0]['longitude'], 120.1)
            self.assertEqual(rows[0]['latitude'], 18.2)
            (directory / 'data/bridges.csv.gz').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'checksum/size mismatch'):
                archive.check(directory)

    def test_truncation_source_change_and_wrong_crs_rejected(self):
        for failure in ('truncate', 'source_change', 'crs'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError):
                    self.run_collect(Path(temp), failure)

    def test_failed_refresh_preserves_latest_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            latest = b'{"snapshot_path":"snapshots/previous"}\n'
            (root / 'latest.json').write_bytes(latest)
            with patch.object(archive, 'ROOT', root), patch('sys.argv', ['archive_bridges.py']), \
                    patch.object(archive, 'collect', side_effect=ValueError('incomplete download')):
                with self.assertRaises(ValueError):
                    archive.main()
            self.assertEqual((root / 'latest.json').read_bytes(), latest)
            self.assertEqual(list((root / 'snapshots').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
