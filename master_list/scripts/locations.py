"""Conservative, evidence-bearing title matching against the retained PSGC catalog.

No fuzzy matching, geocoding, office-to-project inference, or code slicing.
All code ancestry follows parent_code, including HUCs and NCR districts.
"""
from collections import defaultdict
from functools import lru_cache
import re
import unicodedata


SCORE_METHOD = 'location_evidence_v6.2'
SUGGESTION_METHOD = 'hierarchy_candidate_v4'
SCORE_BASES = {
    'allocation_not_site': 0,
    'unresolved': 0,
    'ambiguous': 1,
    'province_only': 2,
    'multiple_locations': 3,
    'name_matched_town': 4,
    'registry_matched': 4,
    'name_matched_barangay': 6,
}
SCORE_BONUSES = {
    'explicit_barangay_marker': 2,
    'province_anchored_enumeration': 2,
    'comma_barangay_municipality_province_chain': 4,
    'compact_locality_component': 1,
    'title_and_source_heading': 2,
    'explicit_parent_chain': 2,
    'source_region_agreement': 1,
    'bridge_registry_id_match': 2,
    'bridge_registry_unique_chain': 2,
    'bridge_registry_agreement': 2,
}
# Coherence flags raised during parsing that carry positive weight. Unlike
# evidence bonuses (counted once per rule), these attach to the flag itself.
SCORE_FLAG_BONUSES = {
    'grouped_barangays_under_same_municipality': 3,
}
SCORE_PENALTIES = {
    'title_or_heading_province_conflict': -5,
    'source_region_differs_from_title_location': -3,
    'bridge_registry_conflicts_with_title_location': -3,
    'ambiguous_barangay_name': -3,
    'barangay_scope_spans_multiple_municipalities': -3,
    'barangay_mentioned_but_unmatched': -2,
    'barangay_list_requires_review': -1,
    'independent_city_with_separate_province_context': -1,
}


def score_location(match):
    """Attach an uncapped additive evidence score; this is not a probability."""
    status = match['status']
    levels = {loc['level'] for loc in match['locations']}
    base_rule = status
    if status == 'name_matched':
        base_rule = ('name_matched_barangay' if 'barangay' in levels
                     else 'name_matched_town')
    elif status == 'registry_matched':
        base_rule = 'registry_matched'
    score = SCORE_BASES[base_rule]
    factors = [{'rule': f'base:{base_rule}', 'impact': score}]

    resolution_rules = {ev.get('resolution_rule') for ev in match['evidence']}
    for rule in ('explicit_barangay_marker',
                 'province_anchored_enumeration',
                 'comma_barangay_municipality_province_chain',
                 'compact_locality_component', 'source_region_agreement',
                 'bridge_registry_id_match', 'bridge_registry_unique_chain',
                 'bridge_registry_agreement'):
        if rule in resolution_rules:
            impact = SCORE_BONUSES[rule]
            score += impact
            factors.append({'rule': f'evidence:{rule}', 'impact': impact})

    # Independent fields can corroborate one another. A heading alone does not
    # earn this bonus; both an accepted title name and a compatible printed
    # locality heading must support the selected location or one of its parents.
    selected_scope = {loc['psgc_code'] for loc in match['locations']}
    for loc in match['locations']:
        selected_scope.update(v['code'] for v in loc['ancestry'].values())
    title_scope = {code for ev in match['evidence'] if ev['field'] in {'title', 'title_barangay'}
                   and ev.get('locality_syntax', True) for code in ev['candidate_codes']}
    heading_scope = {code for ev in match['evidence'] if ev['field'] == 'source_locality_heading'
                     for code in ev['candidate_codes']}
    if selected_scope & title_scope and selected_scope & heading_scope:
        impact = SCORE_BONUSES['title_and_source_heading']
        score += impact
        factors.append({'rule': 'corroboration:title_and_source_heading', 'impact': impact})

    # A title that explicitly names both the selected town/barangay and its
    # province supplies an internally consistent parent chain.
    title_locality_codes = {code for ev in match['evidence'] if ev['field'] == 'title'
                            and ev.get('locality_syntax') for code in ev['candidate_codes']}
    if any(loc['psgc_code'] in title_scope and
           loc['ancestry'].get('province', {}).get('code') in title_locality_codes
           for loc in match['locations'] if loc['level'] != 'province'):
        impact = SCORE_BONUSES['explicit_parent_chain']
        score += impact
        factors.append({'rule': 'corroboration:explicit_parent_chain', 'impact': impact})

    for flag in sorted(set(match['review_flags'])):
        impact = SCORE_PENALTIES.get(flag, 0)
        if impact:
            score += impact
            factors.append({'rule': f'penalty:{flag}', 'impact': impact})
        else:
            bonus = SCORE_FLAG_BONUSES.get(flag, 0)
            if bonus:
                score += bonus
                factors.append({'rule': f'coherence:{flag}', 'impact': bonus})

    match.update(score=score, score_method=SCORE_METHOD, score_factors=factors)
    return match


def _normalize_string(text):
    """Apply the documented rewrites; punctuation survives for tokenizing."""
    # A recurring PDF extraction artifact separates the enye in Niño as
    # "Ni ñ o". Repair only that word-level pattern before Unicode folding.
    text = re.sub(r'\bni\s+ñ\s+o\b', 'niño', text or '', flags=re.IGNORECASE)
    text = unicodedata.normalize('NFKD', text).casefold()
    text = ''.join(c for c in text if not unicodedata.combining(c))
    # Station syntax ("Sta. 0+000", "Sta. 126 + 151") names road chainage,
    # not the municipality Santa, Ilocos Sur. Rewrite before Sta. -> santa.
    text = re.sub(r'\bsta(\.?)\s*\+?\s*(?=\d)', r'stn\1 ', text)
    text = re.sub(r'\bsta\.?\s+', 'santa ', text)
    text = re.sub(r'\bsto\.?\s+', 'santo ', text)
    # Documented historical/abbreviated spellings retained by PSA usage:
    # North Cotabato is the province officially named Cotabato (RA 11145,
    # "North" is the distinguishing former name); Compostela Valley was
    # renamed Davao de Oro (RA 11297); "Pob." abbreviates Poblacion in
    # barangay names; Western Samar is the province officially named Samar.
    text = re.sub(r'\bnorth\s+cotabato\b', 'cotabato', text)
    text = re.sub(r'\bcompostela\s+valley\b', 'davao de oro', text)
    text = re.sub(r'\bwestern\s+samar\b', 'samar', text)
    text = re.sub(r'\bpob\s*\.\s*(?=[,\s]|$)', 'poblacion ', text)
    return text


def normalize(text):
    return ' '.join(re.findall(r'[a-z0-9]+', _normalize_string(text)))


def normalized_tokens(text):
    """normalize()'s word list plus a balanced-parenthesis mask per word.

    A parenthetical qualifies or annotates (road-segment specs, bridge IDs,
    coordinates); place mentions inside BALANCED parentheses stay candidates
    but never assert locality. Unclosed parens — a common PDF artifact —
    mask nothing, so "(Jct Bukidnon-Davao City Rd" still parses as text.
    """
    words, masks = [], []
    depth, starts = 0, []
    for token in re.findall(r'\S+', _normalize_string(text)):
        for piece in re.split(r'([()])', token):
            if piece == '(':
                depth += 1
                starts.append(len(words))
            elif piece == ')':
                if depth:
                    depth -= 1
                    start = starts.pop() if starts else 0
                    if not starts:
                        for k in range(start, len(words)):
                            masks[k] = True
            elif piece:
                for word in re.findall(r'[a-z0-9]+', piece):
                    words.append(word)
                    masks.append(False)
    return words, masks


def member_words(text):
    """Enumeration-member words: parenthetical qualifiers (purok/sitio notes
    such as "Minante 2 (Purok 2)") drop out — they are text context, not
    barangay-name components."""
    return normalize(re.sub(r'\([^()]*\)', '', text)).split()


def aliases(row):
    name = normalize(row['name'])
    result = {name}
    # Parenthetical alternate names remain explicit catalog-derived aliases.
    base = normalize(re.sub(r'\([^)]*\)', '', row['name']))
    if base:
        result.add(base)
    if row['level'] == 'city':
        for value in list(result):
            bare = re.sub(r'^city of | city$', '', value)
            result.update({bare, f'city of {bare}', f'{bare} city'})
    if row['level'] in {'city', 'municipality', 'sub_municipality'}:
        # Some project titles omit a formal numeric suffix (e.g. Tagoloan for
        # PSGC's Tagoloan II). Retaining both aliases lets a stated province or
        # parent chain disambiguate the otherwise colliding bare names.
        for value in list(result):
            bare = re.sub(r'\s+(?:i|ii|iii|iv|v|vi)$', '', value)
            if bare != value:
                result.add(bare)
        # PSA official names may carry personal initials that DPWH titles drop
        # ("Pres. Manuel A. Roxas" written as "Pres. Manuel, Roxas"). Dropping
        # single-letter initial tokens is safe; whole given names never drop.
        for value in list(result):
            dropped = ' '.join(w for w in value.split() if len(w) > 1)
            if dropped and dropped != value:
                result.add(dropped)
    if row['level'] == 'barangay':
        # Numbered barangays officially read "Bgy. No. 1, San Lorenzo" while
        # titles write "Barangay 1, San Lorenzo" or "Brgy. 1 San Lorenzo".
        # Expose the prefix-stripped variant; a bare numeral stays too
        # generic to index, so require at least one name word after it.
        for value in list(result):
            stripped = re.sub(r'^(?:bgy|brgy|barangay)\s+(?:no\s+)?(?=\d)', '', value)
            rest = stripped.split()
            if stripped != value and len(rest) >= 2:
                result.add(stripped)
    if row['level'] in {'city', 'municipality', 'sub_municipality', 'barangay'}:
        # DPWH titles write Arabic numerals where PSA uses Roman suffixes
        # ("Minante 2" for official "Minante II"). A town cannot hold both
        # spellings of one name, so the mapping is exact.
        roman = {'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'}
        for value in list(result):
            m = re.search(r'\s+(i{1,3}|iv|v|vi{1,3}|ix|x)$', value)
            if m:
                result.add(value[:m.start()] + ' ' + roman[m.group(1)])
    return {s for s in result if len(s) > 2}


class Matcher:
    def __init__(self, rows):
        self.rows = {r['code']: r for r in rows}
        self.index = defaultdict(set)
        self.all_barangays = defaultdict(set)
        self.children = defaultdict(list)
        self.regions = {}
        for row in rows:
            self.children[row['parent_code']].append(row['code'])
            if row['level'] in {'province', 'city', 'municipality', 'sub_municipality'}:
                for name in aliases(row):
                    self.index[name].add(row['code'])
            if row['level'] == 'barangay':
                for name in aliases(row):
                    self.all_barangays[name].add(row['code'])
            if row['level'] == 'region':
                names = {normalize(row['name'])}
                names.update(normalize(s) for s in re.findall(r'\(([^)]+)\)', row['name']))
                prefix = re.match(r'Region\s+[IVX]+(?:-[AB])?', row['name'])
                if prefix:
                    names.add(normalize(prefix.group()))
                    names.add(re.sub(r'\biv ([ab])\b', r'iv\1', normalize(prefix.group())))
                names.update({normalize(re.sub(r'\([^)]*\)', '', row['name']))})
                if row['code'] == '1700000000':
                    names.update({'region iv b', 'region ivb', 'mimaropa'})
                for name in names:
                    self.regions[name] = row['code']
        self.max_words = max(len(n.split()) for n in self.index)
        self.max_barangay_words = max(len(n.split()) for n in self.all_barangays)

    @lru_cache(maxsize=None)
    def ancestry(self, code):
        result = {}
        seen = set()
        while code:
            if code in seen:
                raise ValueError('PSGC ancestry cycle')
            seen.add(code)
            row = self.rows[code]
            result[row['level']] = code
            code = row['parent_code']
        return result

    def find(self, text):
        """Longest non-overlapping catalog names, retaining homonyms."""
        words = normalize(text).split()
        hits, i = [], 0
        while i < len(words):
            for size in range(min(self.max_words, len(words) - i), 0, -1):
                phrase = ' '.join(words[i:i + size])
                if phrase in self.index:
                    hits.append({'text': phrase, 'codes': sorted(self.index[phrase]),
                                 'start': i, 'end': i + size})
                    i += size
                    break
            else:
                i += 1
        return hits

    @lru_cache(maxsize=None)
    def barangay_index(self, town):
        index = defaultdict(set)
        for code in self.children[town]:
            row = self.rows[code]
            if row['level'] == 'barangay':
                for name in aliases(row):
                    index[name].add(code)
        return index, max((len(name.split()) for name in index), default=0)

    @staticmethod
    def locality_parts(title):
        """Only bounded suffixes and explicit locality introductions assert location.

        An unqualified name in a road, river, school or hospital title remains
        a candidate. Comma-separated locality suffixes may include road length
        or phase annotations. Municipality/city prefixes are handled separately.
        """
        # Coordinates appended to the final locality do not weaken the place
        # syntax: "Misamis Occidental (8.5, 123.7)" is still that province.
        title = re.sub(r'\(\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*\)\s*$', '', title)
        parts = [p.strip() for p in re.split(r'[,;]', title) if p.strip()]
        bounded = parts[1:]
        if len(parts) == 1:
            bounded = [title]
        return bounded

    @lru_cache(maxsize=30000)
    def match(self, title, structured=(), region_hint=None, office_hint=None):
        title_hits = self.find(title)
        words, paren_masks = normalized_tokens(title)
        locality_parts = self.locality_parts(title)
        bounded = {normalize(p) for p in locality_parts}

        # A comma component may be a compact parent chain without internal
        # commas, such as "Claver Surigao del Norte". Treat it as locality
        # syntax only when catalog hits cover every word in that component.
        chain_phrases = set()
        locality_labels = {'city', 'municipality', 'province', 'of'}
        for part in locality_parts:
            part_words = normalize(part).split()
            part_hits = self.find(part)
            covered = {i for hit in part_hits for i in range(hit['start'], hit['end'])}
            if len(part_hits) > 1 and all(i in covered or word in locality_labels
                                         for i, word in enumerate(part_words)):
                chain_phrases.update(hit['text'] for hit in part_hits)
        # A catalog name may span a comma inside a bounded suffix, as when a
        # PSA name with initials is written "Pres. Manuel, Roxas". Accept a
        # phrase that appears across the joined parts but not inside any one
        # part (a part-internal phrase may be a barangay mention, not a town).
        # The phrase must start inside the bounded suffix: a road name in the
        # head part ("Malaybalay-Gingoog Road") must not borrow assertion
        # strength from an unrelated suffix occurrence of the same word.
        joined_suffix = ' '.join(' '.join(normalize(p).split()) for p in locality_parts)
        part_internal = {f' {p} ' for p in (f' {" ".join(normalize(x).split())} ' for x in locality_parts)}
        head_part = re.split(r'[,;]', title)[0] if re.split(r'[,;]', title)[1:] else ''
        suffix_word_start = len(normalize(head_part).split())
        spanning_phrases = set()
        for hit in title_hits:
            if hit['start'] < suffix_word_start:
                continue
            if f' {hit['text']} ' not in f' {joined_suffix} ':
                continue
            if any(f' {hit['text']} ' in padded for padded in part_internal):
                continue
            spanning_phrases.add(hit['text'])
        bounded |= spanning_phrases

        # Resolve an unmarked barangay only from a complete, ordered
        # "barangay, municipality, province" suffix. This handles a name such
        # as Santa Maria that is also a municipality elsewhere without turning
        # arbitrary bare barangay names into project sites.
        hierarchy_barangays = set()
        hierarchy_suppressed_towns = set()
        hierarchy_evidence = []
        normalized_parts = [normalize(part) for part in locality_parts]
        for i in range(len(normalized_parts) - 2):
            barangay_codes = set(self.all_barangays.get(normalized_parts[i], ()))
            parent_towns = {c for c in self.index.get(normalized_parts[i + 1], ())
                            if self.rows[c]['level'] in {'city', 'municipality', 'sub_municipality'}}
            later_provinces = {c for part in normalized_parts[i + 2:]
                               for c in self.index.get(part, ())
                               if self.rows[c]['level'] == 'province'}
            if not barangay_codes or not parent_towns or not later_provinces:
                continue
            compatible_parents = {c for c in parent_towns
                                  if self.ancestry(c).get('province') in later_provinces}
            candidates = {c for c in barangay_codes
                          if self.rows[c]['parent_code'] in compatible_parents}
            same_name_towns = {c for c in self.index.get(normalized_parts[i], ())
                               if self.rows[c]['level'] in {'city', 'municipality', 'sub_municipality'}
                               and self.ancestry(c).get('province') in later_provinces}
            if len(candidates) == 1 and not same_name_towns:
                code = next(iter(candidates))
                hierarchy_barangays.add(code)
                hierarchy_suppressed_towns.add(normalized_parts[i])
                hierarchy_evidence.append({
                    'field': 'title_barangay', 'text': normalized_parts[i],
                    'candidate_codes': [code],
                    'parent_code': self.rows[code]['parent_code'],
                    'locality_syntax': True,
                    'resolution_rule': 'comma_barangay_municipality_province_chain',
                })
        groups = []
        group_phrases = []
        evidence = list(hierarchy_evidence)
        # A marker part ending in a bare number ("Barangay 1") may be the
        # first half of an official name with an internal comma ("Bgy. No. 1,
        # San Lorenzo"). Join the next part when the joined words form a
        # catalog barangay alias; the absorbed part is then not a town.
        numbered_absorbed = {}  # {part_idx: joined_name}
        split_parts = re.split(r'[,;]', title)
        for pi in range(len(split_parts) - 1):
            words_here = normalize(split_parts[pi]).split()
            marker_positions = [k for k, w in enumerate(words_here)
                                if w in {'brgy', 'brgys', 'barangay', 'barangays'}]
            if not marker_positions:
                continue
            tail = words_here[marker_positions[-1] + 1:]
            if not tail or not tail[-1].isdigit():
                continue
            next_words = normalize(split_parts[pi + 1]).split()
            for take in range(min(len(next_words), self.max_barangay_words), 0, -1):
                joined = ' '.join(tail + next_words[:take])
                if joined in self.all_barangays:
                    numbered_absorbed[pi] = joined
                    break
        absorbed_phrases = {normalize(split_parts[pi + 1])
                            for pi in numbered_absorbed}  # suppress as towns
        # Province-anchored enumeration: "…, s. Member A, Member B and C,
        # Town, Province" — when the contiguous part-run before a Town,
        # Province anchor segments COMPLETELY into barangay names of that
        # town, every member is a barangay mention of the anchor town.
        # Complete segmentation is what separates enumerations from ordinary
        # multi-town titles: in "Bacarra, Adams, Ilocos Norte" no part-run of
        # Adams barangays can cover the Bacarra part. Exact matches attach
        # directly; a bare area name (Pindangan, Poblacion) attaches a
        # same-named family of that town (Pindangan Centro/East/West) only
        # when the run carries >=2 exact members. A leading "s." token (the
        # sources' enumeration marker) continues rather than starts a chunk.
        enum_anchored = {}   # part_idx -> {'town': code, 'members': [...]}
        enum_direct = set()  # exact members with a unique code, for attachment
        for prov_pi in range(len(split_parts) - 1, -1, -1):
            prov_pool = {c for c in self.index.get(normalize(split_parts[prov_pi]), ())
                         if self.rows[c]['level'] == 'province'}
            if len(prov_pool) != 1:  # absent or homonym: cannot anchor alone
                continue
            province = next(iter(prov_pool))
            for town_pi in range(prov_pi - 1, -1, -1):
                town_pool = {c for c in self.index.get(normalize(split_parts[town_pi]), ())
                             if self.rows[c]['level'] in {'city', 'municipality',
                                                          'sub_municipality'}
                             and self.ancestry(c).get('province') == province}
                if len(town_pool) != 1:
                    continue
                town = next(iter(town_pool))
                if region_hint and self.ancestry(town).get('region') != region_hint:
                    continue
                bidx, bmax = self.barangay_index(town)
                if not bidx:
                    continue
                part_members = {}  # part_idx -> [(name, kind, codes), ...]
                for member_pi in range(0, town_pi):
                    if member_pi in numbered_absorbed or member_pi in enum_anchored:
                        continue
                    words_here = member_words(split_parts[member_pi])
                    if not words_here or any(w in {'brgy', 'brgys', 'barangay',
                                                   'barangays'} for w in words_here):
                        continue  # marker parts keep the marker pass
                    if words_here[0] == 's' and len(words_here) > 1:
                        words_here = words_here[1:]  # "s. <members>" marker
                    members_here, ok = [], True
                    k = 0
                    while k < len(words_here):
                        if words_here[k] == 'and':
                            k += 1
                            continue
                        for size in range(min(bmax, len(words_here) - k), 0, -1):
                            name = ' '.join(words_here[k:k + size])
                            if name in bidx:
                                members_here.append((name, 'exact',
                                                     sorted(bidx[name])))
                                k += size
                                break
                            family = sorted({c for n, cs in bidx.items()
                                             if n.startswith(name + ' ')
                                             and len(n.split()) == len(name.split()) + 1
                                             for c in cs})
                            if family:
                                members_here.append((name, 'family', family))
                                k += size
                                break
                        else:
                            ok = False  # a word is not a barangay of the town
                            break
                    if ok and members_here:
                        part_members[member_pi] = members_here
                # Contiguous run of member parts immediately before the town.
                run_start = town_pi
                while run_start - 1 in part_members:
                    run_start -= 1
                run_parts = list(range(run_start, town_pi))
                exact_total = sum(1 for pi in run_parts for _, kind, _ in part_members[pi]
                                  if kind == 'exact')
                if (not run_parts or exact_total < 2
                        or len(run_parts) + sum(len(part_members[pi]) - 1
                                                for pi in run_parts) < 2):
                    continue  # isolated member: not an enumeration
                members = [{'part': pi, 'name': name, 'kind': kind, 'codes': codes}
                           for pi in run_parts
                           for name, kind, codes in part_members[pi]]
                for pi in run_parts:
                    enum_anchored[pi] = {'town': town, 'members': members,
                                         'town_part': town_pi, 'province_part': prov_pi}
                enum_direct.update(next(iter(mc)) for pi in run_parts
                                   for _, kind, mc in part_members[pi]
                                   if kind == 'exact' and len(mc) == 1)
                break
        enum_evidence = []
        for entry in enum_anchored.values():
            town = entry['town']
            for member in entry['members']:
                if member['kind'] == 'exact':
                    ev = {'field': 'title_barangay', 'text': member['name'],
                          'candidate_codes': member['codes'],
                          'parent_code': town, 'locality_syntax': True,
                          'resolution_rule': 'province_anchored_enumeration'}
                else:
                    ev = {'field': 'title_barangay', 'text': member['name'],
                          'candidate_codes': member['codes'],
                          'parent_code': town, 'locality_syntax': True,
                          'resolution_rule': 'province_anchored_enumeration_family'}
                enum_evidence.append(ev)
        evidence.extend(enum_evidence)
        # A marker-less part immediately before an explicit city part may be
        # a barangay of that city ("Libertad, Butuan City" / enumeration
        # tails "..., Citrus and Kaypian, City of ..."). Probe trailing
        # words; a resolving part is a barangay mention, not a town.
        # An explicit city part must carry the city form itself ("City of X",
        # "X City") — a bare homonym ("San Pedro", also a Laguna city) is not.
        explicit_city_parts = {pi for pi, part in enumerate(split_parts)
                               if (normalize(part).startswith('city of ')
                                   or normalize(part).endswith(' city'))
                               and any(self.rows[c]['level'] == 'city'
                                       for c in self.index.get(normalize(part), ()))}
        # Parts resolved as city barangays without any marker word.
        markerless_barangay = {}  # {part_idx: [barangay_code, ...]}
        # Enumeration continuation: "Barangays A, B, C and D, City of X" —
        # every part between a plural-marker part and the explicit city part
        # is a barangay-name member of that city ("and" joins split further).
        # Runs BEFORE the immediate-before-city probe so multi-member parts
        # resolve every name, not just the trailing one.
        city_codes_flat = {cc for cp in explicit_city_parts
                           for cc in self.index.get(normalize(split_parts[cp]), ())}
        for pi, part in enumerate(split_parts):
            words_here = normalize(part).split()
            if pi == 0:
                continue  # head part; only a road name starts an enumeration
            if not any(w in {'brgys', 'barangays'} for w in words_here):
                continue
            later_cities = [cp for cp in explicit_city_parts if cp > pi]
            if not later_cities:
                continue
            for member_pi in range(pi + 1, later_cities[0]):
                if member_pi in markerless_barangay or member_pi in enum_anchored:
                    continue
                # A part may hold several "and"-joined members; record each
                # that resolves uniquely under the explicit city. Parts with
                # ANY member resolving are wholly consumed: unresolvable
                # words (parenthetical purok qualifiers, unmatched names)
                # are not independent town mentions.
                chunks = [c.strip() for c in ' '.join(member_words(split_parts[member_pi])).split(' and ') if c.strip()]
                resolved_here = []
                for chunk in chunks:
                    if chunk not in self.all_barangays:
                        continue
                    in_city = {c for c in self.all_barangays[chunk]
                               if self.rows[c]['parent_code'] in city_codes_flat}
                    if len(in_city) == 1:
                        resolved_here.append(next(iter(in_city)))
                if resolved_here:
                    markerless_barangay[member_pi] = resolved_here
        # Immediate-before-city probe: a marker-less part directly preceding
        # an explicit city may itself be one barangay ("Libertad, Butuan
        # City"); parts already enumerated keep their richer resolution.
        # The head part qualifies too when its trailing words name the city's
        # barangay ("... Esplanade Tuburan Sur to Hi-way Looc, Danao City").
        for pi in range(len(split_parts) - 1):
            if pi + 1 not in explicit_city_parts or pi in markerless_barangay:
                continue
            if pi in enum_anchored:
                continue  # consumed by a province-anchored run
            words_here = normalize(split_parts[pi]).split()
            if not words_here or any(w in {'brgy', 'brgys', 'barangay', 'barangays'}
                                     for w in words_here):
                continue  # marker parts are handled by the marker pass
            for take in range(min(len(words_here), self.max_barangay_words), 0, -1):
                name = ' '.join(words_here[-take:])
                codes = self.all_barangays.get(name, set())
                in_city = {c for c in codes
                           if self.rows[c]['parent_code'] in city_codes_flat}
                if len(in_city) == 1:
                    markerless_barangay[pi] = [next(iter(in_city))]
                    break
                if codes:
                    break  # a place-name hit that is not a city barangay stays a town
        # District-before-city: a part immediately before an explicit city
        # whose whole text names a town elsewhere ("Jaro, Iloilo City") is a
        # city-district mention when the city's barangay names carry that
        # qualifier ("San Isidro (Jaro)"). Kept for soft-conflict handling.
        district_before_city = {}
        for cp in explicit_city_parts:
            if cp == 0:
                continue
            prev = normalize(split_parts[cp - 1])
            if prev in self.index and any(self.rows[c]['level'] in
                                          {'city', 'municipality'} for c in self.index[prev]):
                district_before_city[cp - 1] = prev
        # Exact structured headings may be towns even when called province_control
        # by the source extractor (e.g. HFEP Sagada).
        for raw in structured:
            key = normalize(raw)
            codes = self.index.get(key, set())
            if codes:
                groups.append((set(codes), False))
                evidence.append({'field': 'source_locality_heading', 'text': raw,
                                 'candidate_codes': sorted(codes)})
        for hit in title_hits:
            before = ' '.join(words[max(0, hit['start'] - 3):hit['start']])
            after = ' '.join(words[hit['end']:hit['end'] + 2])
            phrase = hit['text']
            # Phrases fully inside a part absorbed by a numbered-barangay
            # join are barangay name components, not towns.
            if any(phrase in ap or ap in phrase for ap in absorbed_phrases):
                suppressed_num = True
            else:
                suppressed_num = False
            # A part resolved as a marker-less city barangay is not a town.
            if any(phrase in normalize(split_parts[mpi]) or normalize(split_parts[mpi]) in phrase
                   for mpi in markerless_barangay):
                suppressed_num = True
            # A part consumed by a province-anchored enumeration names a
            # barangay of the anchor town, not an independent town.
            if any(phrase in normalize(split_parts[epi]) for epi in enum_anchored):
                suppressed_num = True
            # Place mentions inside balanced parentheses qualify or annotate
            # (road-segment specs, bridge IDs); they stay candidates but
            # never assert locality.
            if any(paren_masks[i] for i in range(hit['start'], hit['end'])):
                suppressed_num = True
            # A comma component must itself be a place, or an explicit city /
            # municipality phrase. Province mentions in "Abra River" stay weak.
            exact = phrase in bounded or phrase in chain_phrases or any(
                p in {f'city of {phrase}', f'municipality of {phrase}',
                      f'{phrase} city', f'province of {phrase}'} for p in bounded)
            marker = bool(re.search(r'(?:municipality of|city of|province of)$', before)) or phrase.startswith('city of ')
            city_suffix = phrase.endswith(' city') or after == 'city' or (
                after.startswith('city ') and not after.startswith('city of'))
            # "in X" is useful only at the title end, not "in X River".
            locative_end = before.split()[-1:] in [['in'], ['at']] and hit['end'] == len(words)
            suppressed = (phrase in hierarchy_suppressed_towns and phrase in bounded) or suppressed_num
            if (exact or marker or city_suffix or locative_end) and not suppressed:
                groups.append((set(hit['codes']), city_suffix or phrase.startswith('city of ')
                               or bool(re.search(r'(?:city of|municipality of)$', before))))
                group_phrases.append(phrase)
            title_evidence = {'field': 'title', 'text': phrase,
                              'candidate_codes': hit['codes'],
                              'locality_syntax': bool((exact or marker or city_suffix or locative_end)
                                                      and not suppressed)}
            if phrase in chain_phrases:
                title_evidence['resolution_rule'] = 'compact_locality_component'
            evidence.append(title_evidence)

        # Explicit Brgy./Barangay markers can establish their own parent town.
        # First use any title/heading town and province context to disambiguate;
        # otherwise accept only a nationally unique catalog barangay name.
        context_codes = {c for pool, _ in groups for c in pool}
        context_towns = {c for c in context_codes if self.rows[c]['level'] in
                         {'city', 'municipality', 'sub_municipality'}}
        context_provinces_pre = {c for c in context_codes if self.rows[c]['level'] == 'province'}
        # A province-name pool may carry same-named town homonyms ("Quezon"
        # also names municipalities). When a title asserts a province, only
        # towns actually inside it scope markers — except independent cities
        # of the same region (HUCs have no province ancestor; v4 rule).
        if context_provinces_pre and len(context_provinces_pre) == 1:
            province = next(iter(context_provinces_pre))
            prov_region = self.ancestry(province).get('region')
            context_towns = {c for c in context_towns
                             if self.ancestry(c).get('province') == province
                             or ('province' not in self.ancestry(c)
                                 and self.ancestry(c).get('region') == prov_region)}
            # An adjacent "Town, Province" comma pair is an explicit chain;
            # its town outranks remaining homonyms ("Catanauan, Quezon" —
            # the municipality named Quezon inside Quezon province). The
            # override applies only when it uniquely resolves marker names
            # that stay ambiguous under the full town scope, so multi-town
            # titles ("Guruyan, Juban, Sorsogon - Dolos, Bulan, Sorsogon")
            # keep their full scope.
            if len(context_towns) > 1:
                pair_towns = set()
                for pi in range(len(split_parts) - 1):
                    town_pool = {c for c in self.index.get(normalize(split_parts[pi]), ())
                                 if c in context_towns
                                 and self.ancestry(c).get('province') == province}
                    prov_pool = {c for c in self.index.get(normalize(split_parts[pi + 1]), ())
                                 if c == province}
                    if len(town_pool) == 1 and prov_pool:
                        pair_towns.update(town_pool)
                if len(pair_towns) == 1:
                    # Marker names adjacent to each Brgy./Barangay word, in
                    # either direction (mirrors the marker pass probe).
                    marker_names = set()
                    for part in split_parts:
                        lw = normalize(part).split()
                        for i, w in enumerate(lw):
                            if w in {'brgy', 'barangay'}:
                                for size in range(min(self.max_barangay_words,
                                                      len(lw) - i - 1), 0, -1):
                                    nm = ' '.join(lw[i + 1:i + 1 + size])
                                    if nm in self.all_barangays:
                                        marker_names.add(nm)
                                        break
                                for size in range(min(self.max_barangay_words, i), 0, -1):
                                    nm = ' '.join(lw[i - size:i])
                                    if nm in self.all_barangays:
                                        marker_names.add(nm)
                                        break

                    def resolved_under(names, scope):
                        count = 0
                        for nm in names:
                            hits = {c for c in self.all_barangays.get(nm, ())
                                    if self.rows[c]['parent_code'] in scope}
                            count += len(hits) == 1
                        return count

                    if (marker_names
                            and resolved_under(marker_names, context_towns) < len(marker_names)
                            and resolved_under(marker_names, pair_towns) == len(marker_names)):
                        context_towns = pair_towns
        # An explicit city phrase ("Iloilo City") outranks same-named town
        # homonyms for barangay scoping: a district homonym ("Jaro" also in
        # Leyte) must not steal the barangay assignment.
        explicit_city_codes = {c for pool, explicit in groups if explicit
                               for c in pool if self.rows[c]['level'] == 'city'}
        marker_scope_towns = explicit_city_codes or context_towns
        context_provinces = {c for c in context_codes if self.rows[c]['level'] == 'province'}
        direct_barangays = set(hierarchy_barangays) | set(enum_direct)
        barangay_by_part = {}  # {part_index: [(name, code, flag), ...]}
        marker_seen = False
        flags = []
        for part_idx, part in enumerate(split_parts):
            if part_idx in enum_anchored:
                continue  # consumed by the province-anchored enumeration
            joined_name = numbered_absorbed.get(part_idx)
            if joined_name:
                # Resolve the joined numbered name directly under context.
                candidates = set(self.all_barangays[joined_name])
                compatible = set(candidates)
                if context_towns:
                    town_hits = {c for c in compatible
                                 if self.rows[c]['parent_code'] in marker_scope_towns}
                    compatible = town_hits
                elif context_provinces:
                    prov_hits = {c for c in compatible
                                 if self.ancestry(c).get('province') in context_provinces}
                    compatible = prov_hits
                elif region_hint:
                    reg_hits = {c for c in compatible
                                if self.ancestry(c).get('region') == region_hint}
                    if reg_hits:
                        compatible = reg_hits
                marker_seen = True
                if len(compatible) == 1:
                    code = next(iter(compatible))
                    direct_barangays.add(code)
                    barangay_by_part[part_idx] = [(joined_name, code, None)]
                elif not compatible:
                    barangay_by_part[part_idx] = [(joined_name, None, 'barangay_mentioned_but_unmatched')]
                else:
                    barangay_by_part[part_idx] = [(joined_name, None, 'ambiguous_barangay_name')]
                evidence.append({
                    'field': 'title_barangay', 'text': joined_name,
                    'candidate_codes': sorted(candidates),
                    'locality_syntax': True,
                    'resolution_rule': 'numbered_barangay_comma_join',
                })
                continue
            local_words = normalize(part).split()
            part_markers = []
            for i, word in enumerate(local_words):
                if word not in {'brgy', 'brgys', 'barangay', 'barangays'}:
                    continue
                marker_seen = True
                if word in {'brgys', 'barangays'}:
                    flags.append('barangay_list_requires_review')
                mention_found = False
                chosen = None
                for direction in ('after', 'before'):
                    if chosen is not None:
                        break
                    limit = min(self.max_barangay_words,
                                len(local_words) - i - 1 if direction == 'after' else i)
                    for size in range(limit, 0, -1):
                        name = ' '.join(local_words[i + 1:i + 1 + size]
                                        if direction == 'after' else local_words[i - size:i])
                        if name not in self.all_barangays:
                            continue
                        mention_found = True
                        candidates = set(self.all_barangays[name])
                        compatible = set(candidates)
                        if context_towns:
                            town_matches = {c for c in compatible
                                            if self.rows[c]['parent_code'] in marker_scope_towns}
                            if town_matches:
                                compatible = town_matches
                            else:
                                compatible = set()
                        elif context_provinces:
                            province_matches = {c for c in compatible
                                                if self.ancestry(c).get('province') in context_provinces}
                            if province_matches:
                                compatible = province_matches
                            else:
                                compatible = set()
                        elif region_hint:
                            region_matches = {c for c in compatible
                                              if self.ancestry(c).get('region') == region_hint}
                            if region_matches:
                                compatible = region_matches
                        if compatible or not name.endswith(' poblacion') or name == 'poblacion':
                            chosen = (name, candidates, compatible)
                            break
                        shorter = name[:-len(' poblacion')]
                        if shorter in self.all_barangays:
                            short_candidates = set(self.all_barangays[shorter])
                            short_compatible = set(short_candidates)
                            if context_towns:
                                short_compatible = {c for c in short_compatible
                                                    if self.rows[c]['parent_code'] in marker_scope_towns}
                            elif context_provinces:
                                short_compatible = {c for c in short_compatible
                                                    if self.ancestry(c).get('province') in context_provinces}
                            elif region_hint:
                                short_compatible = {c for c in short_compatible
                                                    if self.ancestry(c).get('region') == region_hint}
                            if short_compatible:
                                chosen = (shorter, short_candidates, short_compatible)
                                break
                        chosen = (name, candidates, compatible)
                        break
                if mention_found and chosen is not None:
                    name, candidates, compatible = chosen
                    # Province context scopes barangay candidates even when
                    # the town is ambiguous or absent: keep only candidates
                    # inside a stated province before deciding uniqueness.
                    if compatible and context_provinces:
                        in_province = {c for c in compatible
                                       if self.ancestry(c).get('province') in context_provinces}
                        if in_province:
                            compatible = in_province
                        elif not any('province' in self.ancestry(c)
                                     for c in compatible):
                            pass  # independent-city barangays; region check applies below
                        else:
                            compatible = set()
                    if len(compatible) > 1:
                        # Same-named barangays within one city may carry
                        # parenthetical district qualifiers ("San Isidro
                        # (Jaro)" vs "San Isidro (La Paz)"). A district name
                        # mentioned elsewhere in the title disambiguates.
                        by_qualifier = {}
                        for c in compatible:
                            m = re.search(r'\(([^)]+)\)', self.rows[c]['name'])
                            if m:
                                by_qualifier.setdefault(normalize(m.group(1)), set()).add(c)
                        if by_qualifier:
                            rest = ' '.join(normalize(p) for j, p in enumerate(split_parts)
                                            if j != part_idx)
                            for qual, codes in by_qualifier.items():
                                if f' {qual} ' in f' {rest} ':
                                    compatible = codes & compatible
                                    break
                    if len(compatible) == 1:
                        code = next(iter(compatible))
                        candidate_province = self.ancestry(code).get('province')
                        if context_provinces and candidate_province not in context_provinces:
                            # A barangay under a highly urbanized city has
                            # no province ancestor. Mirroring the town-level
                            # rule, a same-region province mention is soft
                            # context (kept, flagged); a different-region
                            # province remains a hard conflict.
                            parent_town = self.rows[code]['parent_code']
                            same_region = any(
                                self.ancestry(parent_town).get('region')
                                == self.ancestry(p).get('region')
                                for p in context_provinces)
                            if candidate_province is None and same_region:
                                flags.append('independent_city_with_separate_province_context')
                                direct_barangays.add(code)
                                part_markers.append((name, code, None))
                            else:
                                part_markers.append((name, None, 'title_or_heading_province_conflict'))
                        else:
                            direct_barangays.add(code)
                            part_markers.append((name, code, None))
                    elif not compatible:
                        part_markers.append((name, None, 'barangay_mentioned_but_unmatched'))
                    else:
                        part_markers.append((name, None, 'ambiguous_barangay_name'))
                    evidence.append({
                        'field': 'title_barangay', 'text': name,
                        'candidate_codes': sorted(candidates),
                        'locality_syntax': True,
                        'resolution_rule': 'explicit_barangay_marker',
                    })
                elif not mention_found:
                    # The marker word exists but no adjacent words form a
                    # catalog barangay name: an explicit unmatched mention.
                    part_markers.append(('', None, 'barangay_mentioned_but_unmatched'))
            if part_idx in markerless_barangay:
                # Precomputed: this marker-less part resolves as one or more
                # barangays of the explicit city part that follows.
                name = normalize(split_parts[part_idx])
                for code in markerless_barangay[part_idx]:
                    direct_barangays.add(code)
                    part_markers.append((name, code, None))
                    evidence.append({
                        'field': 'title_barangay', 'text': name,
                        'candidate_codes': [code],
                        'locality_syntax': True,
                        'resolution_rule': 'explicit_city_markerless_barangay',
                    })
            if part_markers:
                barangay_by_part[part_idx] = part_markers
        # Only flag unmatched when a marker word exists but no barangay name
        # followed it into the catalog; titles without any marker stay clean.
        if marker_seen and not barangay_by_part:
            flags.append('barangay_mentioned_but_unmatched')
        # Resolve per-part marker outcomes: publish each marker's flag, unless
        # a same-municipality group makes the mention internally coherent.
        for part_idx, markers in barangay_by_part.items():
            municipality_codes = {self.rows[c]['parent_code']
                                  for _, c, _ in markers if c}
            same_municipality = len(markers) >= 2 and len(municipality_codes) == 1
            for name, code, flag in markers:
                if flag and same_municipality:
                    # Multiple barangays all under one municipality: waive the
                    # per-marker conflict/ambiguity and record the grouping.
                    if 'grouped_barangays_under_same_municipality' not in flags:
                        flags.append('grouped_barangays_under_same_municipality')
                    continue
                if flag:
                    flags.append(flag)

        # A resolved barangay supplies its actual PSGC parent chain. Add those
        # ancestors as constraints so unrelated same-named towns cannot win.
        for code in direct_barangays:
            town = self.rows[code]['parent_code']
            groups.append(({town}, True))
            province = self.ancestry(code).get('province')
            if province:
                groups.append(({province}, False))

        # "Batangas" can mean province or city. A bare province name defaults
        # to province precision, unless a different explicit province scopes
        # a same-named municipality ("Aurora, Zamboanga del Sur").
        all_provinces = {c for pool, _ in groups for c in pool if self.rows[c]['level'] == 'province'}
        strong = set()
        strong_groups = []
        for pool, explicit_town in groups:
            provs = {c for c in pool if self.rows[c]['level'] == 'province'}
            towns_in_pool = {c for c in pool if self.rows[c]['level'] != 'province'}
            if provs and towns_in_pool:
                scoped_towns = {c for c in towns_in_pool
                                if self.ancestry(c).get('province') in all_provinces - provs}
                pool = towns_in_pool if explicit_town else scoped_towns if scoped_towns else provs
            strong.update(pool)
            strong_groups.append(pool)
        provinces = {c for c in strong if self.rows[c]['level'] == 'province'}
        towns = {c for c in strong if self.rows[c]['level'] in
                 {'city', 'municipality', 'sub_municipality'}}
        # Province context disambiguates homonyms; independent cities have no
        # province ancestor and cannot be forced into a province by code prefix.
        if provinces:
            compatible = {c for c in towns if self.ancestry(c).get('province') in provinces}
            independent = {c for c in towns if 'province' not in self.ancestry(c)
                           and any(self.ancestry(c).get('region') == self.ancestry(p).get('region')
                                   for p in provinces)}
            if compatible or independent:
                if independent:
                    flags.append('independent_city_with_separate_province_context')
                # A conflicting town mention may be a city district (Jaro, La
                # Paz in Iloilo City; PSGC has no district level). Districts
                # appear positionally: "Brgy X, <District>, <City>" — the
                # conflicting part immediately precedes an accepted city and
                # that city is the resolved barangay's parent. Soft-flag those
                # instead of firing a hard conflict.
                barangay_parent_towns = {self.rows[c]['parent_code'] for c in direct_barangays}
                accepted_towns = compatible | independent
                for pool in strong_groups:
                    mentioned_towns = pool & towns
                    if mentioned_towns and not mentioned_towns & accepted_towns:
                        district_context = (
                            bool(accepted_towns & barangay_parent_towns)
                            and len(accepted_towns) == 1
                            and len(mentioned_towns) == 1)
                        # Even without a resolved barangay, a district part
                        # immediately before the explicit city ("Jaro, Iloilo
                        # City") whose name the city's barangay qualifiers
                        # use is a district mention, not a province conflict.
                        if not district_context:
                            accepted_city = next(iter(accepted_towns), None) if len(accepted_towns) == 1 else None
                            if accepted_city:
                                bidx, _ = self.barangay_index(accepted_city)
                                quals = {re.search(r'\(([^)]+)\)', self.rows[bc]['name']).group(1).lower()
                                         for n, cset in bidx.items() for bc in cset
                                         if re.search(r'\(([^)]+)\)', self.rows[bc]['name'])}
                                mentioned_names = {normalize(self.rows[t]['name']) for t in mentioned_towns}
                                district_context = bool(mentioned_names & quals)
                        if district_context:
                            flags.append('city_district_context')
                        else:
                            flags.append('title_or_heading_province_conflict')
                towns = accepted_towns
            elif towns:
                flags.append('title_or_heading_province_conflict')
        elif region_hint and len(towns) > 1:
            regional_towns = {c for c in towns
                              if self.ancestry(c).get('region') == region_hint}
            if regional_towns:
                towns = regional_towns

        # Homonyms must be unique after parent filtering, for EVERY mentioned name.
        ambiguous = set()
        for ev in evidence:
            pool = set(ev['candidate_codes']) & towns
            if len(pool) > 1:
                ambiguous.update(pool)
        if ambiguous:
            flags.append('ambiguous_city_municipality_name')
        accepted = towns - ambiguous
        if 'title_or_heading_province_conflict' in flags:
            accepted = set()

        barangays = set(direct_barangays)
        if len(accepted) > 1 and barangays and any(
                self.rows[c]['parent_code'] not in accepted for c in barangays):
            flags.append('barangay_scope_spans_multiple_municipalities')

        # Remove ancestor locations only where a selected descendant explains
        # them; retain other explicit provinces on cross-province projects.
        selected = set(barangays) | accepted | provinces
        for code in list(selected):
            if any(code != other and code in self.ancestry(other).values() for other in selected):
                selected.discard(code)
        if ambiguous or 'title_or_heading_province_conflict' in flags:
            status = 'ambiguous'
        elif accepted:
            status = 'multiple_locations' if len(selected) > 1 else 'name_matched'
        elif provinces:
            status = 'province_only'
        else:
            status = 'unresolved'
        suggestions = (self.suggest_hierarchies(evidence, region_hint, office_hint)
                       if status != 'name_matched' or flags else [])
        assigned = {loc['psgc_code'] for loc in
                    [self.describe(c) for c in sorted(selected)]}
        suggestions = [s for s in suggestions
                       if s['location']['psgc_code'] not in assigned]
        return score_location({'status': status, 'method': 'exact_catalog_name_with_locality_syntax',
                'verification_status': 'provisional_name_match',
                'locations': [self.describe(c) for c in sorted(selected)],
                'candidate_codes': sorted({c for ev in evidence for c in ev['candidate_codes']} | strong),
                'suggestions': suggestions, 'suggestion_method': SUGGESTION_METHOD,
                'evidence': evidence, 'review_flags': sorted(set(flags)),
                'needs_review': status != 'name_matched' or bool(flags)})

    def suggest_hierarchies(self, evidence, region_hint, office_hint=None):
        """Rank coherent unassigned barangay/town/province chains for review.

        Suggestions never become assigned locations. They require an explicit
        barangay mention and a separately named parent town. A conflicting
        printed province is retained as a negative factor instead of being
        silently corrected; source-region agreement can help order alternatives.

        Chains are scored as combinations, not per candidate name. When the
        stated town->province chain is absent from the catalog (the printed
        province names no place containing the stated town), each compatible
        chain is a candidate repair, and a repair that is the only one
        compatible with the source region is the strongest single signal a
        title-only parse can produce without assigning it.
        """
        barangays = {code for ev in evidence if ev['field'] == 'title_barangay'
                     for code in ev['candidate_codes']
                     if self.rows[code]['level'] == 'barangay'}
        # Family-prefix mentions (a barangay marker whose name matches only a
        # numbered/area family of a named town — "Sta. Cruz" under a city whose
        # barangays are "Santa Cruz I".."V") carry the family codes; the town
        # relationship is stated by the title, so they expand as chains.
        family_mentions = [ev for ev in evidence
                           if ev['field'] == 'title_barangay'
                           and ev.get('resolution_rule') == 'explicit_barangay_marker']
        title_places = {code for ev in evidence
                        if ev['field'] in {'title', 'source_locality_heading'}
                        and ev.get('locality_syntax', True)
                        for code in ev['candidate_codes']}
        named_towns = {code for code in title_places if self.rows[code]['level'] in
                       {'city', 'municipality', 'sub_municipality'}}
        named_provinces = {code for code in title_places
                           if self.rows[code]['level'] == 'province'}
        for ev in family_mentions:
            name = ev['text']
            # Only a mention with NO exact barangay under any named town is
            # a family mention; when a bare match exists (Poblacion under
            # Carmen), the exact chains already speak and no family expands.
            if any(self.rows[c]['parent_code'] in named_towns
                   for c in ev['candidate_codes']):
                continue
            for town in named_towns:
                bidx, _ = self.barangay_index(town)
                fam = sorted({c for n, cs in bidx.items()
                              if n.startswith(name + ' ')
                              and len(n.split()) == len(name.split()) + 1
                              for c in cs})
                if len(fam) >= 2:
                    barangays.update(fam)
        # Chain-combination context: does any stated town actually sit in a
        # stated province? If not, the title chain itself is impossible and
        # every suggestion is a repair candidate rather than a rival reading.
        stated_chain_exists = any(self.ancestry(town).get('province') in named_provinces
                                  for town in named_towns)
        chains = []
        for code in barangays:
            town = self.rows[code]['parent_code']
            if town not in named_towns:
                continue
            ancestry = self.ancestry(code)
            province, region = ancestry.get('province'), ancestry.get('region')
            factors = [
                {'rule': 'explicit_barangay_mention', 'impact': 4},
                {'rule': 'named_parent_town', 'impact': 3},
            ]
            conflicts = []
            if province in named_provinces:
                factors.append({'rule': 'named_parent_province', 'impact': 2})
            elif named_provinces:
                factors.append({'rule': 'named_province_conflict', 'impact': -4})
                conflicts.append('named_province_conflict')
                if not stated_chain_exists:
                    factors.append({'rule': 'stated_chain_absent_from_catalog', 'impact': 2})
            if region_hint:
                if region == region_hint:
                    factors.append({'rule': 'source_region_agreement', 'impact': 2})
                else:
                    factors.append({'rule': 'source_region_conflict', 'impact': -2})
                    conflicts.append('source_region_conflict')
            # District engineering offices are province-scoped, so a matching
            # province name is meaningful ordering evidence. It stays a
            # suggestion factor only: office names are context, never a
            # project site. Conflict is asymmetrically weaker because offices
            # legitimately administer works crossing province lines.
            if office_hint:
                if province == office_hint:
                    factors.append({'rule': 'office_province_agreement', 'impact': 2})
                else:
                    factors.append({'rule': 'office_province_conflict', 'impact': -1})
                    conflicts.append('office_province_conflict')
            chains.append({'code': code, 'province': province, 'region': region,
                           'factors': factors, 'conflicts': conflicts})
        # A unique region-compatible repair is chain-level evidence: the
        # combination of stated barangay + town fits exactly one province in
        # the source region, so it is promoted above rival readings.
        if not stated_chain_exists and named_provinces and region_hint:
            region_repairs = [c for c in chains
                              if c['region'] == region_hint
                              and 'named_province_conflict' in c['conflicts']]
            if len(region_repairs) == 1:
                region_repairs[0]['factors'].append(
                    {'rule': 'unique_region_compatible_repair', 'impact': 3})
        return sorted(({'location': self.describe(c['code']),
                        'support_score': sum(f['impact'] for f in c['factors']),
                        'factors': c['factors'],
                        'conflicts': c['conflicts']} for c in chains),
                      key=lambda s: (-s['support_score'], s['location']['psgc_code']))

    def describe(self, code):
        row = self.rows[code]
        return {'psgc_code': code, 'name': row['name'], 'level': row['level'],
                'ancestry': {level: {'code': c, 'name': self.rows[c]['name']}
                             for level, c in self.ancestry(code).items()}}

    def region_code(self, text):
        text = normalize(text)
        for alias in sorted(self.regions, key=len, reverse=True):
            if text == alias or text.startswith(alias + ' '):
                return self.regions[alias]
        return None

    def province_code(self, office):
        """Province-level catalog name in an office label, else None.

        Only an unambiguous province-level hit counts: names that are also
        cities/municipalities (Isabela, Batangas) yield no hint, and an
        office naming two provinces yields none either. The result orders
        review suggestions only; it is never assigned as a project site.
        """
        if not office:
            return None
        hits = [set(codes) for hit in self.find(office)
                for codes in [hit['codes']]
                if all(self.rows[c]['level'] == 'province' for c in codes)]
        provinces = set().union(*hits) if hits else set()
        if len(provinces) == 1:
            return next(iter(provinces))
        return None
