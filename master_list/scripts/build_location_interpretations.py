#!/usr/bin/env python3
"""Retain alternative location chains and assess each context separately.

Read-only consumer of master, processing and coordinate evidence. Catalog
ancestry is authoritative for each candidate; contradictory printed context
is recorded rather than used to discard the candidate. No assignments change.
"""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import tempfile

from locations import Matcher
from context_scoring import METHOD as SCORE_METHOD, WEIGHTS, PARTIAL_SPATIAL_FACTOR, score_profile
from location_assessments import METHOD as ASSESSMENT_METHOD
from office_context import OfficeResolver, office_assessment, METHOD as OFFICE_METHOD
from processing_release import load_release

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'master_list/data'
METHOD = 'location_interpretations_v6'
OFFICE_CODEBOOK = ROOT / 'DEO2LEG/sources/dpwh-project-code-mapping@38fe1cf2.json'
LEVELS = ('region', 'province', 'municipality_city', 'sub_municipality', 'barangay')
PROJECT_KINDS = {'project', 'facility', 'fap_project'}
ARTIFACTS = ('location_interpretations.jsonl.gz', 'location_interpretations_audit.json',
             'LOCATION_INTERPRETATIONS_REPORT.md')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        yield from (json.loads(line) for line in stream)


def chain_levels(ancestry):
    """City and municipality share a tier; preserve submunicipalities separately."""
    result = {}
    for level, code in ancestry.items():
        result['municipality_city' if level in {'city', 'municipality'} else level] = code
    return result


def relation(code, pool, matcher):
    if not pool:
        return 'not_assessed'
    own = matcher.ancestry(code)
    # A province-only statement can agree with a child, and vice versa.
    checks = [other in own.values() or code in matcher.ancestry(other).values() for other in pool]
    return 'agrees' if all(checks) else 'mixed' if any(checks) else 'conflicts'


class Interpreter:
    def __init__(self, catalog, office_codebook=None):
        self.matcher = Matcher(catalog)
        self.offices = OfficeResolver(self.matcher, office_codebook)

    def assess(self, record, coordinate=None):
        m = self.matcher
        result = {'record_id': record['record_id'], 'dataset': record['dataset'],
                  'method': METHOD, 'assignment_policy': 'review_only',
                  'state': 'not_applicable', 'mentions': [], 'candidates': [],
                  'readings': [], 'context': {}, 'review_suggestion_codes': []}
        if record['record_kind'] not in PROJECT_KINDS:
            score_profile(result, record, coordinate, m)
            return result
        title = record['title_clean']
        loc = record['location']
        # A title-only reading exposes hypotheses lost through contextual
        # scoping. It does not alter the parser or count as another witness.
        text = m.match(title, (), None, None)
        mentions = []
        for evidence in [*text['evidence'], *loc['evidence']]:
            field = evidence['field']
            if field not in {'title', 'title_barangay', 'source_locality_heading'}:
                continue
            codes = {c for c in evidence['candidate_codes'] if c in m.rows}
            if not codes:
                continue
            item = {'field': field, 'text': evidence.get('text', ''),
                    'asserted': evidence.get('locality_syntax', True),
                    'codes': sorted(codes)}
            if item not in mentions:
                mentions.append(item)
        # Share missing-comma/name-role readings with the master suggestion
        # generator, including chains whose printed province conflicts.
        for evidence in m.parent_chain_mentions(title):
            item = {'field': 'unmarked_parent_chain', 'text': evidence['text'],
                    'asserted': True, 'codes': evidence['candidate_codes']}
            if item not in mentions:
                mentions.append(item)
        for i, mention in enumerate(mentions):
            mention['id'] = f'm{i}'
        named = {c for ev in mentions if ev['asserted'] and ev['field'] == 'title'
                 for c in ev['codes']}
        named_towns = {c for c in named if m.rows[c]['level'] in
                       {'municipality', 'city', 'sub_municipality'}}
        named_provinces = {c for c in named if m.rows[c]['level'] == 'province'}
        heading_codes = {c for ev in mentions if ev['field'] == 'source_locality_heading'
                         for c in ev['codes']}
        region = m.region_code(record.get('source_region', ''))
        office_profile = self.offices.resolve(record)
        office_provinces = [p['code'] for p in office_profile['named_locations'] if p['level']=='province']
        office = office_provinces[0] if len(office_provinces)==1 and office_profile['resolution']=='resolved' else None
        registry = {c for ev in loc['evidence'] if ev['field'] == 'bridge_registry'
                    for c in ev.get('candidate_codes', []) if c in m.rows}
        registry = {c for c in registry if not any(
            c != other and c in m.ancestry(other).values() for other in registry)}
        selected = {p['psgc_code'] for p in loc['locations']}
        suggestions = {s['location']['psgc_code'] for s in loc.get('suggestions', [])}
        codes = selected | suggestions | registry | {c for ev in mentions for c in ev['codes']}
        point_levels, invalid_points, coordinate_candidates = [], 0, set()
        for point in (coordinate or {}).get('points', []):
            chain = point.get('chain') or {}
            valid = {level: v['code'] for level, v in chain.items()
                     if v.get('name') and v.get('code') in m.rows
                     and m.rows[v['code']]['name'] == v['name']}
            # Rebuild ancestors from a catalog-resolved unit, rather than
            # treating a padded historical code as a current catalog match.
            resolved = {}
            ordered = sorted(valid.values(), key=lambda c: len(m.ancestry(c)))
            if ordered:
                deepest = m.ancestry(ordered[-1])
                # Conflicting units in one returned chain are not corroboration.
                if all(c in deepest.values() for c in ordered):
                    resolved = deepest
                    coordinate_candidates.add(ordered[-1])
            if not resolved:
                invalid_points += 1
            point_levels.append(chain_levels(resolved))
        codes.update(coordinate_candidates)
        result['context'] = {'region_code': region, 'office_province_code': office,
                             'office': office_profile,
                             'printed_province_codes': sorted(named_provinces),
                             'heading_codes': sorted(heading_codes),
                             'coordinate_point_count': len(point_levels),
                             'coordinate_unmapped_points': invalid_points,
                             'coordinate_reference_freshness': 'not_assessed',
                             'registry_codes': sorted(registry)}
        for code in sorted(codes):
            ancestry = m.ancestry(code)
            evidence = [ev['id'] for ev in mentions if code in ev['codes']]
            explicit = any(code in ev['codes'] and ev['asserted'] and
                           ev['field'] in {'title', 'title_barangay', 'unmarked_parent_chain'}
                           for ev in mentions)
            province = ancestry.get('province')
            # No administrative province for an independent city: keep a
            # printed nearby province as association context, not a parent.
            province_state = ('agrees' if province in named_provinces else
                              'not_assessed' if not named_provinces else
                              'no_province_parent' if province is None else 'conflicts')
            spatial = {}
            for level, own in chain_levels(ancestry).items():
                if level not in LEVELS:
                    continue
                comparable = [p[level] for p in point_levels if level in p]
                agree = sum(c == own for c in comparable)
                spatial[level] = {'state': ('not_assessed' if not comparable else
                                           'agrees' if agree == len(comparable) else
                                           'mixed' if agree else 'conflicts'),
                                  'agree': agree, 'compared': len(comparable),
                                  'unassessed': len(point_levels) - len(comparable)}
            result['candidates'].append({
                'code': code, 'evidence_ids': evidence, 'master_selected': code in selected,
                'suggested': code in suggestions,
                'coordinate_candidate': code in coordinate_candidates,
                'registry_candidate': code in registry,
                'title': 'asserted' if explicit else 'reference_only' if evidence else 'not_assessed',
                'named_parent': ('agrees' if (set(ancestry.values()) - {code}) & named_towns
                                 else 'not_assessed'),
                'printed_province': province_state,
                'region': ('not_assessed' if not region else 'agrees'
                           if ancestry.get('region') == region else 'conflicts'),
                'headings': relation(code, heading_codes, m),
                'office_context': office_assessment(code, office_profile, m)['state'],
                'registry': relation(code, registry, m), 'spatial': spatial})
        result['readings'] = [
            {'kind': 'master_assignment', 'scope': 'whole_record', 'codes': sorted(selected),
             'status': loc['status']},
            {'kind': 'title_only', 'scope': 'whole_title',
             'codes': sorted(p['psgc_code'] for p in text['locations']), 'status': text['status']}]
        for c in result['candidates']:
            if c['title'] == 'asserted' and (c['named_parent'] == 'agrees' or c['suggested']):
                result['readings'].append({'kind': 'candidate_parent_chain', 'scope': 'mention',
                                          'codes': [c['code']], 'evidence_ids': c['evidence_ids']})
        # Display ordering is not a confidence score. Parent-supported text
        # interpretations precede broad references; conflict does not delete.
        result['candidates'].sort(key=lambda c: (
            not c['master_selected'], c['named_parent'] != 'agrees',
            c['title'] != 'asserted', c['printed_province'] == 'conflicts', c['code']))
        # Review suggestions use every assessed candidate, not the bounded
        # browser preview. Keep conflicts and separate contextual dimensions;
        # this list has no numeric ranking or automatic application gate.
        explained = selected | {a for code in selected for a in m.ancestry(code).values()}
        def review_supported(candidate):
            if candidate['suggested'] or candidate['coordinate_candidate'] or candidate['registry_candidate']:
                return True
            if candidate['title'] != 'asserted':
                return False
            if candidate['named_parent'] == 'agrees':
                return True
            # A town reading can be supported by province/region/office or
            # heading context. A nationally common barangay name needs its
            # named parent, a specific heading, GPS or registry evidence.
            if m.rows[candidate['code']]['level'] in {'city', 'municipality', 'sub_municipality'}:
                return any(candidate[key] == 'agrees' for key in
                           ('printed_province', 'region', 'office_context', 'headings'))
            specific_headings = {c for c in heading_codes
                                 if m.rows[c]['level'] in {'city', 'municipality', 'sub_municipality', 'barangay'}}
            return (relation(candidate['code'], specific_headings, m) == 'agrees' or
                    candidate['office_context'] == 'agrees')

        result['review_suggestion_codes'] = [c['code'] for c in result['candidates']
            if c['code'] not in explained and review_supported(c)]
        result['mentions'] = mentions
        result['state'] = ('alternatives' if len(codes - selected) > 0 else
                           'single_reading' if codes else 'unresolved')
        # Per-candidate mixed points are expected for multi-place projects.
        # A spatial diagnostic requires a point outside the WHOLE selected
        # textual scope at a comparable tier, not outside one of its towns.
        selected_scope = {level: {chain_levels(m.ancestry(c)).get(level) for c in selected}
                          - {None} for level in LEVELS}
        title_selected = any(c['master_selected'] and c['title'] == 'asserted'
                             for c in result['candidates'])
        spatial_conflict = title_selected and any(
            selected_scope[level] and level in point and point[level] not in selected_scope[level]
            for point in point_levels for level in LEVELS)
        result['has_conflict'] = bool(spatial_conflict or any(
            (c['master_selected'] or c['named_parent'] == 'agrees') and
            c['title'] == 'asserted' and c['printed_province'] == 'conflicts'
            for c in result['candidates']))
        score_profile(result, record, coordinate, m)
        return result


def build(directory):
    processing = load_release()
    master_path = DATA / 'projects.jsonl.gz'
    master_audit = json.loads((DATA / 'audit.json').read_text())
    if sha(master_path) != master_audit['output_sha256']['projects.jsonl.gz']:
        raise ValueError('Master observations differ from their audit')
    processing_path = DATA / 'processing/observations.jsonl.gz'
    if master_audit['input_files'].get(str(processing_path.relative_to(ROOT)), {}).get('sha256') != sha(processing_path):
        raise ValueError('Master uses a different processing release')
    coordinate_path = DATA / 'coordinate_psgc.jsonl.gz'
    coord_audit_path = DATA / 'coordinate_psgc_audit.json'
    coord_audit = json.loads(coord_audit_path.read_text())
    if coord_audit['input']['path'] != str(processing_path.relative_to(ROOT)) or coord_audit['input']['sha256'] != sha(processing_path):
        raise ValueError('Coordinate layer uses a different processing release')
    if sha(coordinate_path) != coord_audit['output_sha256'][coordinate_path.name]:
        raise ValueError('Coordinate layer differs from its audit')
    coordinates = {}
    for row in read_rows(coordinate_path):
        if row['record_id'] in coordinates:
            raise ValueError('Duplicate coordinate observation')
        coordinates[row['record_id']] = row
    catalog_path = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
    engine = Interpreter([json.loads(line) for line in catalog_path.read_text().splitlines()],
                         json.loads(OFFICE_CODEBOOK.read_text()))
    counts, candidates, review_counts, score_counts, assessment_counts, seen = Counter(), Counter(), Counter(), Counter(), Counter(), set()
    target = directory / ARTIFACTS[0]
    with target.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
        with io.TextIOWrapper(zipped, encoding='utf-8', newline='\n') as stream:
            for record in read_rows(master_path):
                rid = record['record_id']
                if rid in seen:
                    raise ValueError('Duplicate master observation')
                seen.add(rid)
                result = engine.assess(record, coordinates.pop(rid, None))
                counts[result['state']] += 1
                counts['with_context_conflict'] += bool(result.get('has_conflict'))
                candidates[record['dataset']] += len(result['candidates'])
                review_counts['records'] += bool(result.get('review_suggestion_codes'))
                review_counts['candidates'] += len(result.get('review_suggestion_codes', []))
                summary = result['context_scoring']
                score_counts[summary['trial_status']] += 1
                score_counts['assessed_candidates'] += summary['assessed_candidates']
                for flag in ('has_quality_review', 'has_partial_scope', 'has_competing_candidates', 'has_office_review'):
                    assessment_counts[flag] += summary[flag]
                stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n')
    if coordinates or len(seen) != processing['source_observations']:
        raise ValueError('Location-interpretation source coverage differs')
    inputs = [master_path, DATA / 'audit.json', processing_path, DATA / 'processing/audit.json',
              coordinate_path, coord_audit_path, catalog_path, Path(__file__),
              Path(__file__).with_name('locations.py'), Path(__file__).with_name('processing_release.py'),
              Path(__file__).with_name('context_scoring.py'),
              Path(__file__).with_name('location_assessments.py'),
              Path(__file__).with_name('office_context.py'), OFFICE_CODEBOOK,
              Path(__file__).with_name('build_applied_suggestions.py')]
    audit = {'method': METHOD, 'records': len(seen), 'states': dict(counts),
             'candidate_counts_by_dataset': dict(candidates), 'review_suggestions': dict(review_counts),
             'context_scoring': {'method': SCORE_METHOD, 'weights': WEIGHTS,
                                 'qualitative_method': ASSESSMENT_METHOD,
                                 'office_method': OFFICE_METHOD,
                                 'assessment_counts': dict(assessment_counts),
                                 'partial_spatial_factor': PARTIAL_SPATIAL_FACTOR,
                                 'coverage_and_trial_states': dict(score_counts)},
             'policy': 'Review-only alternative readings; catalog ancestry preserved; context conflicts retain candidates; experimental support scores and dry-run proposals; no probability or automatic assignment.',
             'coordinate_reference_freshness': 'Not assessed: upstream audit does not pin boundary/catalog/mapper dependencies.',
             'input_sha256': {str(p.relative_to(ROOT)): sha(p) for p in inputs},
             'output_sha256': {target.name: sha(target)}}
    (directory / ARTIFACTS[1]).write_text(json.dumps(audit, indent=2, sort_keys=True) + '\n')
    lines = ['# Location interpretations', '', f'{len(seen):,} source observations; method `{METHOD}`.', '',
             'Candidate catalog chains stay intact. Printed province/region disagreement is recorded without deleting candidates. All alternatives are retained; none replaces a master assignment.', '',
             '| State / diagnostic | Observations |', '|---|---:|']
    lines += [f'| {k} | {v:,} |' for k, v in sorted(counts.items())]
    lines += ['', f"Candidate scoring: `{SCORE_METHOD}`; {score_counts['assessed_candidates']:,} assessed candidates, {score_counts['ready_for_trial']:,} observations ready for a non-destructive trial proposal. No assignments are changed."]
    lines += ['', f'Qualitative assessments: `{ASSESSMENT_METHOD}`. Quality and scope do not add points.', '',
              '| Assessment flag | Observations |', '|---|---:|']
    lines += [f'| {k} | {v:,} |' for k, v in sorted(assessment_counts.items())]
    lines += ['', f"Review suggestions: {review_counts['records']:,} observations, {review_counts['candidates']:,} candidate chains. Experimental scores retain separate contextual dimensions and explicit trial checks; no automatic application."]
    lines += ['', 'Alternative counts include reference-only names and homonyms; they do not prove ambiguity in the asserted site. Context conflicts are diagnostics, not certified source errors. See [interpretation rules](../docs/LOCATION_INTERPRETATIONS.md).']
    (directory / ARTIFACTS[2]).write_text('\n'.join(lines) + '\n')
    return audit


def load_profiles():
    audit = json.loads((DATA / ARTIFACTS[1]).read_text())
    if audit['method'] != METHOD:
        raise ValueError('Unknown location interpretation method')
    for name, expected in audit['input_sha256'].items():
        if sha(ROOT / name) != expected:
            raise ValueError(f'Stale location interpretations: {name}; rebuild them first')
    if sha(DATA / ARTIFACTS[0]) != audit['output_sha256'][ARTIFACTS[0]]:
        raise ValueError('Location interpretations differ from their audit')
    def checked_rows():
        seen = set()
        for row in read_rows(DATA / ARTIFACTS[0]):
            if row['record_id'] in seen:
                raise ValueError('Duplicate location interpretation profile')
            seen.add(row['record_id'])
            yield row
        if len(seen) != audit['records']:
            raise ValueError('Location interpretation count differs from audit')
    return checked_rows(), audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='location-interpretations-') as tmp:
        directory = Path(tmp)
        audit = build(directory)
        if args.check:
            stale = [name for name in ARTIFACTS if not (DATA / name).exists() or sha(DATA / name) != sha(directory / name)]
            if stale:
                raise SystemExit('Stale location interpretation outputs: ' + ', '.join(stale))
        else:
            for name in ARTIFACTS:
                shutil.copyfile(directory / name, DATA / name)
        print(f'{"Checked" if args.check else "Built"}: {audit["records"]:,} location interpretation profiles.')


if __name__ == '__main__':
    main()
