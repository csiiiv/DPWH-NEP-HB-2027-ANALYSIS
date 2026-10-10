#!/usr/bin/env python3
"""Mine office twins and fuzzy title substitutions for the normalize-labels step.

Primary signal: House↔NEP fuzzy/chainage suggestions. Similar titles on both
sides are evidence of a real counterpart with OCR/spelling drift — those pairs
are the backlog for new normalize rules (place names, structure IDs, abbrevs).
Exact pairs already match; unmatched rows without a suggestion are weaker.

Read-only: does not rewrite comparison payloads. Writes a JSON report and a
short Markdown summary for triage (promote / reject / review).

Usage (from repository root)::

    python analysis/builders/mine_normalization_candidates.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parents[1]),
                str(Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA, DOCS  # noqa: E402
from normalize_labels import (  # noqa: E402
    canonical_office,
    classify_title_substitution,
    collapse_spaced_n_tilde,
    normalized,
    raw_normalized,
    title_match_key,
    title_tokens,
)


def read_projects():
    path = DATA / 'source_comparison_2027.json'
    return json.loads(path.read_text())['projects']


def mine_offices(projects):
    """Group raw office strings that share a canonical form."""
    groups = defaultdict(Counter)
    sides = defaultdict(lambda: defaultdict(set))
    for row in projects:
        for side in ('house', 'nep', 'api'):
            src = row.get(side)
            if not isinstance(src, dict):
                continue
            office = src.get('office') or ''
            if not office:
                continue
            canon = canonical_office(office)
            groups[canon][office] += 1
            sides[canon][office].add(side)
    multi = []
    for canon, variants in groups.items():
        if len(variants) < 2:
            continue
        multi.append({
            'office_canonical': canon,
            'variants': [
                {'office': office, 'count': count,
                 'sides': sorted(sides[canon][office])}
                for office, count in variants.most_common()
            ],
            'total': sum(variants.values()),
            'triage': 'promote',
            'rules': ['spaced_n_tilde', 'deo_hyphen_to_space', 'regional_office_iva'],
        })
    multi.sort(key=lambda g: -g['total'])
    # Paired House/NEP rows that soft-match only after canonical_office.
    paired_splits = 0
    for row in projects:
        h, n = row.get('house'), row.get('nep')
        if not isinstance(h, dict) or not isinstance(n, dict):
            continue
        ho, no = h.get('office') or '', n.get('office') or ''
        if ho and no and ho != no and canonical_office(ho) == canonical_office(no):
            paired_splits += 1
    return {'multi_variant_groups': multi, 'paired_rows_split_only_by_office_spelling': paired_splits}


def mine_title_substitutions(projects):
    """Align top fuzzy/chainage NEP suggestions and classify token replacements.

    Work from the House→NEP suggestion link (same region/PAP/zone, score ≥0.85).
    Each hit is a likely identity with residual OCR; promote closed-class slips,
    reject work-type/entity changes, leave the rest for review.
    """
    subs = Counter()
    examples = defaultdict(list)
    status_counts = Counter()
    for row in projects:
        status = row.get('status')
        if status not in ('fuzzy_candidate', 'chainage_candidate'):
            continue
        candidates = row.get('candidates') or []
        if not candidates:
            continue
        status_counts[status] += 1
        house = row.get('house') or {}
        ht = house.get('title') or row.get('title') or ''
        top = candidates[0]
        nep = top.get('nep') if isinstance(top, dict) else None
        if not isinstance(nep, dict):
            continue
        nt = nep.get('title') or ''
        conf = float(top.get('confidence') or 0)
        htoks = title_tokens(collapse_spaced_n_tilde(ht))
        ntoks = title_tokens(collapse_spaced_n_tilde(nt))
        sm = SequenceMatcher(None, htoks, ntoks, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != 'replace' or i1 == i2 or j1 == j2:
                continue
            hseg = tuple(htoks[i1:i2])
            nseg = tuple(ntoks[j1:j2])
            key = (hseg, nseg)
            subs[key] += 1
            if len(examples[key]) < 3:
                examples[key].append({
                    'confidence': round(conf, 4),
                    'status': status,
                    'house_title': ht,
                    'nep_title': nt,
                    'id': row.get('id'),
                })
        # Only the top suggestion.
    rows = []
    for (hseg, nseg), count in subs.most_common():
        triage = classify_title_substitution(hseg, nseg)
        rows.append({
            'house_tokens': list(hseg),
            'nep_tokens': list(nseg),
            'count': count,
            'triage': triage,
            'examples': examples[(hseg, nseg)],
        })
    by_triage = Counter(r['triage'] for r in rows)
    return {
        'fuzzy_or_chainage_rows_scanned': sum(status_counts.values()),
        'status_counts': dict(status_counts),
        'substitutions': rows,
        'triage_counts': dict(by_triage),
        'promote': [r for r in rows if r['triage'] == 'promote'],
        'reject': [r for r in rows if r['triage'] == 'reject'][:40],
        'review': [r for r in rows if r['triage'] == 'review'][:60],
    }


def mine_existing_abbrev_effect(projects):
    """How many exact pairs already depend on Brgy./repeat normalization."""
    flagged = 0
    samples = []
    for row in projects:
        if row.get('status') != 'exact_candidate':
            continue
        house, nep = row.get('house'), row.get('nep')
        if not isinstance(house, dict) or not isinstance(nep, dict):
            continue
        ht, nt = house.get('title') or '', nep.get('title') or ''
        if not ht or not nt:
            continue
        if normalized(ht) == normalized(nt) and raw_normalized(ht) != raw_normalized(nt):
            flagged += 1
            if len(samples) < 5:
                samples.append({'house_title': ht, 'nep_title': nt, 'reason': row.get('reason')})
    return {'exact_pairs_normalization_dependent': flagged, 'samples': samples}


def render_markdown(report: dict) -> str:
    offices = report['offices']['multi_variant_groups']
    titles = report['titles']
    lines = [
        '# Normalization candidates',
        '',
        f"Generated: {report['generated_at']}. Read-only mine over "
        '`source_comparison_2027.json`. Does not rewrite payloads.',
        '',
        '## Offices — promote',
        '',
        f"Paired House/NEP rows split only by office spelling: "
        f"**{report['offices']['paired_rows_split_only_by_office_spelling']}**.",
        '',
    ]
    if not offices:
        lines.append('No multi-variant office groups under current rules.')
    for g in offices:
        lines.append(f"### `{g['office_canonical']}` · {g['total']} assignments")
        lines.append('')
        for v in g['variants']:
            lines.append(f"- {v['count']}× `{v['office']}` ({', '.join(v['sides'])})")
        lines.append('')
    lines += [
        '## Titles — triage summary',
        '',
        f"Fuzzy/chainage rows scanned: **{titles['fuzzy_or_chainage_rows_scanned']}**.",
        f"Substitution patterns: promote {titles['triage_counts'].get('promote', 0)}, "
        f"reject {titles['triage_counts'].get('reject', 0)}, "
        f"review {titles['triage_counts'].get('review', 0)}.",
        '',
        '### Existing abbreviation effect',
        '',
        f"Exact pairs that already match only after Brgy./repeat normalization: "
        f"**{report['existing_abbrev']['exact_pairs_normalization_dependent']}**.",
        '',
        '### Promote (abbreviation / OCR / typo class)',
        '',
    ]
    for r in titles['promote'][:30]:
        lines.append(
            f"- {r['count']}× `{r['house_tokens']}` ↔ `{r['nep_tokens']}`"
        )
        if r['examples']:
            ex = r['examples'][0]
            lines.append(f"  - e.g. conf={ex['confidence']}: {ex['house_title'][:90]}")
            lines.append(f"    vs {ex['nep_title'][:90]}")
    lines += ['', '### Review (inspect before adding rules)', '']
    for r in titles['review'][:25]:
        lines.append(
            f"- {r['count']}× `{r['house_tokens']}` ↔ `{r['nep_tokens']}`"
        )
    lines += [
        '',
        '### Reject samples (work type / chainage / different entity)',
        '',
    ]
    for r in titles['reject'][:15]:
        lines.append(
            f"- {r['count']}× `{r['house_tokens']}` ↔ `{r['nep_tokens']}`"
        )
    lines += [
        '',
        '## Working from fuzzy matches',
        '',
        'Fuzzy/chainage rows are the main OCR triage queue: high-similarity '
        'House and NEP titles in the same scope are evidence of a real '
        'counterpart with residual spelling. Exact matches are already done; '
        'House-only / NEP-only without a suggestion are a weaker signal.',
        '',
        '## Next step',
        '',
        '`annotate_source_labels` already writes `office_canonical` / '
        '`title_match_key` on comparison payloads. Promote mined title pairs '
        'into live rules only after an explicit rebuild.',
        '',
    ]
    return '\n'.join(lines)


def main():
    projects = read_projects()
    report = {
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': 'source_comparison_2027.json',
        'project_rows': len(projects),
        'offices': mine_offices(projects),
        'titles': mine_title_substitutions(projects),
        'existing_abbrev': mine_existing_abbrev_effect(projects),
        'notes': [
            'Additive reporting only — raw office/title fields are unchanged.',
            'Promote office groups and title pairs are candidates for normalize_labels rules.',
            'Reject pairs must not become abbreviation expansions.',
        ],
    }
    # Sanity: title_match_key available for dry checks in the report meta.
    report['smoke'] = {
        'brgy_key_equal': title_match_key('Brgy. Mabini') == title_match_key('Barangay Mabini'),
        'las_pinas_office': canonical_office('Las Pi ñ as-Muntinlupa District Engineering Office'),
    }

    json_path = DATA / 'normalization_candidates.json'
    md_path = DOCS / 'normalization_candidates.md'
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    md_path.write_text(render_markdown(report))

    offices = report['offices']
    titles = report['titles']
    print(f'Wrote {json_path.relative_to(DATA.parent.parent)}')
    print(f'Wrote {md_path.relative_to(DATA.parent.parent)}')
    print(f"Office multi-variant groups: {len(offices['multi_variant_groups'])}")
    print(f"Paired rows split only by office spelling: "
          f"{offices['paired_rows_split_only_by_office_spelling']}")
    print(f"Title substitutions — promote: {titles['triage_counts'].get('promote', 0)}, "
          f"reject: {titles['triage_counts'].get('reject', 0)}, "
          f"review: {titles['triage_counts'].get('review', 0)}")
    print(f"Exact pairs already Brgy./repeat-dependent: "
          f"{report['existing_abbrev']['exact_pairs_normalization_dependent']}")
    if titles['promote']:
        print('Top promote:')
        for r in titles['promote'][:8]:
            print(f"  {r['count']:4d}  {r['house_tokens']} ↔ {r['nep_tokens']}")


if __name__ == '__main__':
    main()
