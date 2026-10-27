"""Shared review vocabulary and compact flag validation; no flag inference."""
import json
from pathlib import Path
import re

CATALOG_PATH = Path(__file__).resolve().parents[1] / 'reference/review_catalog.json'
VERSION = 'review_catalog_v1'
CODE = re.compile(r'[a-z][a-z0-9_]*')


def _text(value, context):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{context} must be a nonempty string')


def validate_catalog(catalog):
    """Reject incomplete/unknown vocabularies before a consumer uses them."""
    if not isinstance(catalog, dict) or catalog.get('version') != VERSION:
        raise ValueError(f'Expected catalog version {VERSION}')
    for section, fields in (
        ('flags', ('label', 'description', 'requested_information', 'trigger_guidance')),
        ('statuses', ('label', 'description')),
        ('location_statuses', ('label', 'description')),
    ):
        entries = catalog.get(section)
        if not isinstance(entries, dict) or not entries:
            raise ValueError(f'Catalog {section} must be a nonempty object')
        for code, definition in entries.items():
            if not isinstance(code, str) or not CODE.fullmatch(code):
                raise ValueError(f'Invalid {section} code: {code!r}')
            if not isinstance(definition, dict):
                raise ValueError(f'{section}.{code} must be an object')
            for field in fields:
                _text(definition.get(field), f'{section}.{code}.{field}')
            if section == 'statuses' and type(definition.get('requires_review_event')) is not bool:
                raise ValueError(f'{section}.{code}.requires_review_event must be boolean')
    if catalog['statuses'].get('open', {}).get('requires_review_event') is not False:
        raise ValueError('The initial open status must not require a review event')
    for code, definition in catalog['statuses'].items():
        if code != 'open' and not definition['requires_review_event']:
            raise ValueError(f'Status {code} must require a recorded review event')
    interpretation = catalog.get('interpretation')
    if not isinstance(interpretation, dict):
        raise ValueError('Catalog interpretation must be an object')
    for field in ('empty_flags', 'resolved_location', 'resolved_question', 'attribution'):
        _text(interpretation.get(field), f'interpretation.{field}')
    return catalog


def load_catalog(path=CATALOG_PATH):
    return validate_catalog(json.loads(Path(path).read_text(encoding='utf-8')))


def validate_location_status(status, catalog=None):
    catalog = load_catalog() if catalog is None else validate_catalog(catalog)
    if not isinstance(status, str) or status not in catalog['location_statuses']:
        raise ValueError(f'Unknown location status: {status!r}')


def _refs(refs, context, available):
    if not isinstance(refs, list) or not refs:
        raise ValueError(f'{context} must be a nonempty array')
    seen = set()
    for ref in refs:
        _text(ref, context)
        if ref in seen:
            raise ValueError(f'Duplicate reference in {context}: {ref}')
        if available is not None and ref not in available:
            raise ValueError(f'Unknown reference in {context}: {ref}')
        seen.add(ref)


def validate_review_flags(flags, catalog=None, *, evidence_ids=None, review_event_ids=None):
    """Validate structure; pass ID inventories to also check reference integrity.

    This does not judge whether evidence warrants a flag or a status change.
    A release builder must supply both inventories, including empty ones.
    """
    catalog = load_catalog() if catalog is None else validate_catalog(catalog)
    if not isinstance(flags, list):
        raise ValueError('review_flags must be an array')
    evidence_ids = None if evidence_ids is None else set(evidence_ids)
    review_event_ids = None if review_event_ids is None else set(review_event_ids)
    seen = set()
    for flag in flags:
        if not isinstance(flag, dict):
            raise ValueError('Each review flag must be an object')
        if set(flag) - {'code', 'status', 'evidence_refs', 'review_event_refs', 'detail'}:
            raise ValueError('Unknown review flag fields; shared wording belongs in the catalog')
        code, status = flag.get('code'), flag.get('status')
        if not isinstance(code, str) or code not in catalog['flags']:
            raise ValueError(f'Unknown review flag code: {code!r}')
        if code in seen:
            raise ValueError(f'Duplicate review flag: {code}')
        seen.add(code)
        if not isinstance(status, str) or status not in catalog['statuses']:
            raise ValueError(f'Unknown review flag status: {status!r}')
        _refs(flag.get('evidence_refs'), f'{code}.evidence_refs', evidence_ids)
        if 'detail' in flag:
            _text(flag['detail'], f'{code}.detail')
        if 'review_event_refs' in flag or catalog['statuses'][status]['requires_review_event']:
            _refs(flag.get('review_event_refs'), f'{code}.review_event_refs', review_event_ids)


if __name__ == '__main__':
    catalog = load_catalog()
    print(f"Validated {catalog['version']}: {len(catalog['flags'])} flags, "
          f"{len(catalog['statuses'])} review statuses, "
          f"{len(catalog['location_statuses'])} location statuses.")
