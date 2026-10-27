"""Resolve administrative office labels without legislative or site inference."""
from functools import lru_cache
import os
import re
import sys
from pathlib import Path

from locations import normalize
from readable_titles import readable_title

METHOD = 'office_context_v1'

# Place-name OCR repairs come from the repo's single home for label
# normalization (analysis/builders/normalize_labels.py) so office joins can
# never drift from title matching or the DEO2LEG crosswalk. Importing that
# module must not bind a builder cwd into the retained artifacts, so resolve
# it by absolute repo path rather than package-relative import.
_ROOT = Path(__file__).resolve().parents[2]
for _path in (str(_ROOT / 'analysis/builders'),):
    if _path not in sys.path:
        sys.path.insert(0, _path)
from normalize_labels import PLACE_NAME_SPELLINGS  # noqa: E402


def office_key(label):
    """Exact aliases only: punctuation, readable cleanup, DEO and ordinal forms."""
    cleaned = readable_title(label)['title_clean']
    cleaned = re.sub(r'^\s*[a-zA-Z][.)]\s+', '', cleaned)
    text = normalize(cleaned)
    text = re.sub(r'\b(?:dpwh|department of public works and highways)\b', ' ', text)
    text = re.sub(r'\bdistrict engineering office\b', 'deo', text)
    text = re.sub(r'\bsub district engineering office\b', 'sub deo', text)
    for word, replacement in [('first','1st'),('second','2nd'),('third','3rd'),('fourth','4th'),
                              ('fifth','5th'),('sixth','6th'),('seventh','7th'),('eighth','8th')]:
        text = re.sub(r'\b'+word+r'\b', replacement, text)
    return ' '.join(text.split())


class OfficeResolver:
    def __init__(self, matcher, codebook=None):
        self.matcher = matcher
        self.codebook = {}
        self.place_aliases = {}
        for row in matcher.rows.values():
            if row['level'] != 'province':
                continue
            name = normalize(row['name'])
            match = re.fullmatch(r'(oriental|occidental) (.+)', name)
            if match:
                self.place_aliases[match[2]+' '+match[1]] = name
            if name.startswith('mountain '):
                self.place_aliases['mt '+name[len('mountain '):]] = name
        # Source documents misspell province names inside DPWH office labels
        # (Siquijor, Marindugue DEO; also Occidenatal/Batagas/Ilolilo slips).
        # These are reviewed repairs in the readable-title spirit, imported
        # from the repo's single normalization home: applied at join time
        # only, the source value is never rewritten, and every downstream
        # consumer (title matching, DEO2LEG crosswalk joins) inherits the
        # same repair list.
        self.place_aliases.update(
            {normalize(wrong): normalize(right) for wrong, right in PLACE_NAME_SPELLINGS})
        for region in (codebook or {}).values():
            for label in region['districts'].values():
                self.codebook.setdefault(self.key(label), []).append(
                    {'name': label, 'region': region['region_name']})

    def key(self, raw):
        text = office_key(raw)
        for alias, canonical in self.place_aliases.items():
            text = re.sub(r'\b'+re.escape(alias)+r'\b', canonical, text)
        return text

    @lru_cache(maxsize=2048)
    def label(self, raw):
        m = self.matcher
        clean = readable_title(raw)
        key = self.key(raw)
        entries = self.codebook.get(key, [])
        regions = sorted({c for e in entries if (c := m.region_code(e['region']))})
        # Metadata is retained, never treated as a present-day office boundary.
        result = {'raw': raw, 'cleaned': clean['title_clean'], 'key': key,
                  'cleanup_rules': clean['title_clean_rules'],
                  'canonical_names': sorted({e['name'] for e in entries}),
                  'codebook_match': 'exact_normalized' if entries else 'not_matched',
                  'reference_region_codes': regions, 'named_codes': [], 'ambiguous_codes': [],
                  'region_codes': [], 'warnings': [], 'geographic_aliases': [
                      {'source': alias, 'canonical': canonical} for alias, canonical in self.place_aliases.items()
                      if re.search(r'\b'+re.escape(alias)+r'\b', office_key(raw))]}
        if not key:
            result['resolution'] = 'no_office'
            return result
        if key == 'central office':
            result['resolution'] = 'central_office'
            return result
        # Metro Manila names a metropolitan region, not Manila City.
        broad = []
        if 'metro manila' in key:
            region = m.region_code('NCR')
            if region:
                broad.append(region)
            text = key.replace('metro manila', '')
        else:
            text = key
        if 'regional office' in text or text in {'barmm', 'ncr', 'car', 'nir'}:
            region_text = re.sub(r'\b(?:regional|office|deo)\b', ' ', text).strip()
            region_text = re.sub(r'\biv([ab])\b', r'iv \1', region_text)
            region_text = re.sub(r'\bregion (iv)([ab])\b', r'region \1 \2', region_text)
            region = m.region_code(region_text) or m.region_code('Region '+region_text)
            result['region_codes'] = [region] if region else []
            result['resolution'] = 'broad_region_only' if region else 'unresolved'
            return result
        result['region_codes'] = sorted(set(broad))
        named, ambiguous = set(), set()
        is_deo = bool(re.search(r'\bdeo\b', text))
        for hit in m.find(text):
            pool = {c for c in hit['codes'] if m.rows[c]['level'] in {'province','city'}}
            if not pool:
                continue
            explicit_city = 'city' in hit['text'].split()
            if explicit_city:
                pool = {c for c in pool if m.rows[c]['level'] == 'city'}
            elif is_deo and any(m.rows[c]['level'] == 'province' for c in pool):
                # "Iloilo 1st DEO" is a province-name association;
                # "Iloilo City DEO" is explicitly a city-name association.
                pool = {c for c in pool if m.rows[c]['level'] == 'province'}
            # A catalog may expose nested units sharing a city alias (e.g.
            # Isabela's city container and inner city). Keep the encompassing
            # administrative association, not two rival office locations.
            pool = {c for c in pool if not any(c != other and other in m.ancestry(c).values()
                                              for other in pool)}
            if len(pool) == 1:
                named.update(pool)
            elif pool:
                ambiguous.update(pool)
        result['named_codes'] = sorted(named)
        result['ambiguous_codes'] = sorted(ambiguous)
        result['resolution'] = ('ambiguous' if ambiguous else 'multiple_named_places' if len(named) > 1 else
                                'resolved' if named else 'broad_region_only' if broad else 'unresolved')
        actual_regions = {m.ancestry(c).get('region') for c in named} - {None}
        if regions and actual_regions and not actual_regions <= set(regions):
            result['warnings'].append('codebook_region_differs_from_current_catalog')
        return result

    def resolve(self, record):
        sources = []
        fields = ('implementing_office','DEO','deo','district_engineering_office')
        for prefix, data, keys in [('',record,fields),
                ('source.',record.get('source'),fields),
                ('analysis_record.',record.get('analysis_record'),(*fields,'office','office_canonical'))]:
            if not isinstance(data, dict):
                continue
            for key in keys:
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    sources.append({'field': prefix + key, **self.label(value)})
        keys = {s['key'] for s in sources}
        named = sorted({c for s in sources for c in s['named_codes']})
        ambiguous = sorted({c for s in sources for c in s['ambiguous_codes']})
        warnings = sorted({w for s in sources for w in s['warnings']})
        if len(keys) > 1:
            warnings.append('source_office_labels_disagree')
        resolution = ('source_conflict' if len(keys) > 1 else sources[0]['resolution'] if sources else 'no_office')
        return {'method': METHOD, 'sources': sources, 'resolution': resolution,
                'named_locations': [{'code': c, 'name': self.matcher.rows[c]['name'],
                                     'level': self.matcher.rows[c]['level']} for c in named],
                'ambiguous_codes': ambiguous,
                'region_codes': sorted({c for s in sources for c in s['region_codes']}),
                'warnings': warnings, 'scope': 'administrative_name_association',
                'jurisdiction_boundaries': 'not_assessed', 'reference_freshness': 'not_assessed'}


def office_assessment(code, office, matcher, level=None):
    """One weak office contribution at most; unresolved labels earn no points."""
    own = matcher.ancestry(code)
    places = office['named_locations']
    if level:
        places = [p for p in places if level in matcher.ancestry(p['code'])]
    related = [p['code'] for p in places if p['code'] in own.values() or code in matcher.ancestry(p['code']).values()]
    resolution = office['resolution']
    if resolution in {'source_conflict','no_office','central_office','unresolved'}:
        state = 'not_assessed'
    elif resolution == 'broad_region_only':
        state = 'broad_region_only'
    elif resolution == 'ambiguous':
        state = 'possible_agreement' if related or any(c in own.values() or code in matcher.ancestry(c).values()
            for c in office['ambiguous_codes']) else 'not_assessed'
    elif not places:
        state = 'not_assessed'
    elif related:
        state = 'agrees'
    elif 'province' not in own and all(p['level'] == 'province' for p in places):
        state = 'no_province_parent'
    else:
        state = 'conflicts'
    return {'state': state, 'resolution': resolution, 'matched_codes': sorted(related),
            'named_locations': places, 'raw_labels': sorted({s['raw'] for s in office['sources']}),
            'canonical_names': sorted({name for s in office['sources'] for name in s['canonical_names']}),
            'scope': office['scope'], 'jurisdiction_boundaries': office['jurisdiction_boundaries'],
            'warnings': office['warnings']}
