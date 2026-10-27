"""Load the pinned cleaned release without inferring new locations or questions."""
import gzip
import hashlib
from itertools import zip_longest
import json
from pathlib import Path

from cleaned_policy import SCHEMA, ADOPTION, FLAG_POLICY
from review_catalog import load_catalog, validate_location_status, validate_review_flags

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'master_list/data/cleaned'


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        yield from (json.loads(line) for line in stream)


def load_cleaned(directory=DIRECTORY, root=ROOT):
    directory, root = Path(directory), Path(root)
    if not (directory / 'manifest.json').is_file():
        raise ValueError('Build the cleaned release first: python3 master_list/scripts/build_cleaned_dataset.py')
    manifest = json.loads((directory / 'manifest.json').read_text())
    if (manifest.get('schema_version') != SCHEMA or manifest.get('adoption_policy') != ADOPTION
            or manifest.get('flag_policy') != FLAG_POLICY):
        raise ValueError('Unknown cleaned release schema or policy')
    for name, info in manifest['input_files'].items():
        if not (root / name).is_file() or digest(root / name) != info['sha256']:
            raise ValueError(f'Stale cleaned release input: {name}; rebuild it first')
    for name, expected in manifest['output_sha256'].items():
        if not (directory / name).is_file() or digest(directory / name) != expected:
            raise ValueError(f'Cleaned release output differs from manifest: {name}')
    catalog_path = directory / manifest['review_catalog']['path']
    catalog = load_catalog(catalog_path)
    if (catalog['version'] != manifest['review_catalog']['version']
            or digest(catalog_path) != manifest['review_catalog']['sha256']):
        raise ValueError('Cleaned review catalog differs from manifest')

    def checked_records():
        seen = set()
        for row, evidence in zip_longest(read_rows(directory / 'observations.jsonl.gz'),
                                        read_rows(directory / 'evidence.jsonl.gz')):
            if row is None or evidence is None or row['record_id'] != evidence['record_id']:
                raise ValueError('Cleaned observation/evidence identities or coverage differ')
            rid = row['record_id']
            if rid in seen:
                raise ValueError('Duplicate cleaned observation')
            seen.add(rid)
            validate_location_status(row['location_resolution']['status'], catalog)
            validate_review_flags(row['review_flags'], catalog, evidence_ids=evidence['items'], review_event_ids=())
            yield row, evidence
        if len(seen) != manifest['counts']['records']:
            raise ValueError('Cleaned record count differs from manifest')
    return checked_records(), manifest, catalog
