"""Validate the generated processing release before downstream enrichment."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'master_list/data/processing'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_release(inputs=None):
    audit_path = DIRECTORY / 'audit.json'
    if not audit_path.is_file():
        raise ValueError('Generate the processing dataset first: python3 master_list/scripts/build_processing_dataset.py')
    audit = json.loads(audit_path.read_text())
    checked = [audit_path]
    checks = {ROOT / name: item['sha256'] for name, item in audit['input_files'].items()}
    checks.update({ROOT / 'master_list/scripts' / name: value
                   for name, value in audit['builder_sha256'].items()})
    checks.update({DIRECTORY / name: value for name, value in audit['output_sha256'].items()})
    for path, expected in checks.items():
        if not path.is_file() or digest(path) != expected:
            raise ValueError(f'Stale processing release: {path.relative_to(ROOT)}; rebuild the processing dataset.')
        checked.append(path)
    if inputs is not None:
        inputs.update({str(path.relative_to(ROOT)): {'sha256': digest(path),
                       'scope': 'Validated readable processing release and its direct provenance'}
                       for path in checked})
    return audit


def read_jsonl(name):
    with gzip.open(DIRECTORY / name, 'rt', encoding='utf-8') as stream:
        yield from (json.loads(line) for line in stream)
