"""Conservative display-text cleanup, separate from project matching rules."""
from __future__ import annotations

import html
import re
import unicodedata

TITLE_CLEAN_METHOD = 'readable_title_v1'
ENTITY = re.compile(r'&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);')
SPACED_ENYE = re.compile(r'([^\W\d_])\s*([ñÑ])\s*([^\W\d_])')


def readable_title(source: str) -> dict:
    """Keep source text and log only the display transformations that changed it.

    Matching-only abbreviations, spelling guesses, station/structure IDs and
    wording equivalences are deliberately not applied. NFC preserves characters
    such as superscript units that compatibility normalization would rewrite.
    The letter/enye/letter join follows the existing DPWH spacing repair, also
    handling uppercase Ñ without joining digits or removing punctuation.
    """
    if not isinstance(source, str):
        raise TypeError('A readable title requires a string source')
    text, rules = source, []

    def apply(rule, value):
        nonlocal text
        if value != text:
            rules.append(rule)
            text = value

    apply('html_entities_decoded', ENTITY.sub(lambda m: html.unescape(m.group()), text))
    apply('unicode_nfc', unicodedata.normalize('NFC', text))
    apply('whitespace_collapsed', ' '.join(text.split()))
    previous = None
    joined = text
    while previous != joined:
        previous = joined
        joined = SPACED_ENYE.sub(
            lambda m: ''.join(m.groups()) if m[1].isalpha() and m[3].isalpha() else m.group(),
            joined)
    apply('split_enye_joined', joined)
    return {'title_source': source, 'title_clean': text,
            'title_clean_method': TITLE_CLEAN_METHOD, 'title_clean_rules': rules}


def annotate_titles(value):
    """Copy an upstream record, including suggestions, without rewriting title."""
    if isinstance(value, list):
        return [annotate_titles(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: annotate_titles(item) for key, item in value.items()}
    if isinstance(value.get('title'), str):
        result.update(readable_title(value['title']))
    return result
