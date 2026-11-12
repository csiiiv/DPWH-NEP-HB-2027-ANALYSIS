#!/usr/bin/env python3
"""Build a shareable consolidated NIA project dataset (one row per Senate workbook line).

Canonical unit
--------------
NIA's Senate hearing workbook already reconciles NEP ↔ House at print level
(937 lines). This builder keeps that unit — not the 1,013 title-matching
comparison observations — so pesos and projects are not inflated by matching
splits.

Location sources (complementary, not additive)
----------------------------------------------
* title_gps — decimal-degree points parsed from the column-V fixed title when
  present (else the NEP-print label). Multi-site titles yield several points
  on one project; amounts stay on the project.
* psgc — barangay/municipality polygon centroids from the Anthony geolocation
  layer, joined through the workbook's 1:1 ledger links → comparison rows.
  A matching-split workbook line may touch two comparison geolocations; those
  anchors are listed, and ``psgc_divergent`` is flagged when PSGC codes differ.

``locations.coverage`` records which sources are present. Map consumers should
treat the two geometries as alternate layers for the same ``id``, never as two
fundable projects.

Matching-split note
-------------------
77 both-funded workbook lines still sit on two comparison observations because
provisional title matching cannot pair their ledger halves. The workbook has
already aligned them; this dataset keeps one project row and sets
``matching.split`` so downstream tools can see the matching residual without
double-counting.

Inputs (regenerable):
  analysis-nia/data/nia_workbench.json   (senate + comparison + geolocation)

Outputs:
  analysis-nia/data/nia_consolidated.json
  analysis-nia/data/nia_consolidated_projects.csv
  analysis-nia/data/nia_consolidated_title_gps_points.csv  (geometry export)
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(__file__).resolve().parent / 'data'
WORKBENCH = DATA / 'nia_workbench.json'
OUT_JSON = DATA / 'nia_consolidated.json'
OUT_PROJECTS_CSV = DATA / 'nia_consolidated_projects.csv'
OUT_POINTS_CSV = DATA / 'nia_consolidated_title_gps_points.csv'


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_title(text: str) -> str:
    import re
    import unicodedata
    folded = unicodedata.normalize('NFKD', (text or '').lower())
    return ' '.join(re.findall(r'[a-z0-9]+', folded))


def split_reason(project: dict, house_row: dict | None, nep_row: dict | None,
                 house_title: str, nep_title: str) -> str | None:
    """Mirror the Senate gap reason labels used in the workbench UI."""
    if not (house_row and nep_row):
        return None
    if house_row.get('status') != 'house_only' or nep_row.get('status') != 'nep_only':
        return None
    if (canonical_title(house_title) == canonical_title(nep_title)
            and canonical_title(house_title)):
        return 'repeated_title'
    return 'reworded_printing'


def coverage_label(has_gps: bool, has_psgc: bool) -> str:
    if has_gps and has_psgc:
        return 'title_gps+psgc'
    if has_gps:
        return 'title_gps'
    if has_psgc:
        return 'psgc'
    return 'none'


def _php_per_m(amount, length_m: float | int | None) -> float | None:
    """Allocation pesos per title-chainage meter (screening proxy, not unit cost)."""
    if amount is None or length_m is None:
        return None
    try:
        length = float(length_m)
        pesos = float(amount)
    except (TypeError, ValueError):
        return None
    if length <= 0 or pesos < 0:
        return None
    return round(pesos / length, 2)


def enrich_chainage(chainage: dict | None, nep_amount, hgab_amount) -> dict | None:
    """Attach NEP / House allocation-per-meter rates to a parsed chainage block."""
    if not chainage:
        return None
    length = chainage.get('length_m')
    nep_rate = _php_per_m(nep_amount, length)
    hgab_rate = _php_per_m(hgab_amount, length)
    # Prefer House when printed (workbook reconciliation unit); else NEP.
    if hgab_rate is not None:
        primary, basis = hgab_rate, 'hgab'
    elif nep_rate is not None:
        primary, basis = nep_rate, 'nep'
    else:
        primary, basis = None, None
    return {
        **chainage,
        'nep_php_per_m': nep_rate,
        'hgab_php_per_m': hgab_rate,
        'php_per_m': primary,
        'php_per_m_basis': basis,
    }


def build(workbench: dict | None = None) -> dict:
    data = workbench or json.loads(WORKBENCH.read_text())
    senate = data.get('senate') or {}
    projects_in = senate.get('projects') or []
    comparison = data.get('comparison') or []
    geo_records = (data.get('geolocation') or {}).get('records') or []
    geo_by_id = {r['id']: r for r in geo_records}
    stages = data.get('stages') or {}
    nep_ledger = {p['id']: p for p in (stages.get('nep') or {}).get('projects') or []}
    house_ledger = {p['id']: p for p in (stages.get('house') or {}).get('projects') or []}

    # comparison id → row; ledger id → comparison row(s)
    comp_by_id = {r['id']: r for r in comparison}
    by_house, by_nep = {}, {}
    for row in comparison:
        if row.get('house_id'):
            by_house[row['house_id']] = row
        if row.get('nep_id'):
            by_nep[row['nep_id']] = row

    projects = []
    point_rows = []
    for project in projects_in:
        nep_join = project.get('nep_join') or {}
        house_join = project.get('house_join') or {}
        nep_id = nep_join.get('id')
        house_id = house_join.get('id')
        nep_row = by_nep.get(nep_id) if nep_id else None
        house_row = by_house.get(house_id) if house_id else None
        comparison_ids = []
        for row in (house_row, nep_row):
            if row and row['id'] not in comparison_ids:
                comparison_ids.append(row['id'])

        nep_title = (nep_ledger.get(nep_id) or {}).get('title') or ''
        house_title = (house_ledger.get(house_id) or {}).get('title') or ''
        reason = split_reason(project, house_row, nep_row, house_title, nep_title)
        split = reason is not None

        parse = project.get('title_parse') or {}
        coord_block = parse.get('coordinates') or {}
        raw_points = coord_block.get('points') or []
        title_points = []
        for index, pt in enumerate(raw_points):
            lat, lon = pt.get('latitude'), pt.get('longitude')
            if lat is None or lon is None:
                continue
            point = {
                'index': index,
                'latitude': lat,
                'longitude': lon,
                'role': pt.get('role'),
            }
            title_points.append(point)
            point_rows.append({
                'project_id': project['id'],
                'point_index': index,
                'latitude': lat,
                'longitude': lon,
                'role': pt.get('role') or '',
                'workbook_status': project['status'],
                'subprogram_key': project['subprogram_key'],
                'label': project.get('submission_label') or project['label'],
                'nep_amount': project.get('nep_amount'),
                'hgab_amount': project.get('hgab_amount'),
                'note': 'geometry export — do not sum amounts across points',
            })

        anchors = []
        for cid in comparison_ids:
            geo = geo_by_id.get(cid)
            if not geo:
                continue
            anchors.append({
                'comparison_id': cid,
                'comparison_status': (comp_by_id.get(cid) or {}).get('status'),
                'psgc': geo.get('psgc'),
                'psgc_status': geo.get('psgc_status'),
                'coordinate_anchor': geo.get('coordinate_anchor'),
                'coordinates': geo.get('coordinates'),  # [lon, lat] centroid
                'barangay': geo.get('barangay'),
                'municipality': geo.get('municipality'),
                'province': geo.get('province'),
                'legislative_district': geo.get('legislative_district'),
                'deo': geo.get('deo'),
                'flags': geo.get('flags') or [],
            })
        located_anchors = [a for a in anchors if a.get('coordinates')]
        psgc_codes = {a['psgc'] for a in located_anchors if a.get('psgc')}
        psgc_divergent = len(psgc_codes) > 1
        # Prefer barangay-anchored centroid when several comparison halves attach.
        primary = None
        if located_anchors:
            primary = next((a for a in located_anchors
                            if a.get('coordinate_anchor') == 'barangay'), None)
            primary = primary or located_anchors[0]

        has_gps = bool(title_points)
        has_psgc = bool(located_anchors)
        flags = []
        if split:
            flags.append('matching_split')
        if psgc_divergent:
            flags.append('psgc_divergent')
        if len(title_points) > 1:
            flags.append('multi_site_title_gps')
        if project['status'] == 'unfunded':
            flags.append('unfunded')

        record = {
            'id': project['id'],
            'row': project['row'],
            'subprogram_key': project['subprogram_key'],
            'subprogram_label': project.get('subprogram_label'),
            'program_group': project.get('program_group'),
            'category': project.get('category'),
            'region': project.get('region_canonical') or project.get('region'),
            'province': project.get('province'),
            'label': project['label'],
            'submission_label': project.get('submission_label'),
            'workbook_status': project['status'],
            'nep_amount': project.get('nep_amount'),
            'hgab_amount': project.get('hgab_amount'),
            'submission_amount': project.get('submission_amount'),
            'submission_edited': project.get('submission_edited'),
            'justification': project.get('justification'),
            'nep_id': nep_id,
            'house_id': house_id,
            'comparison_ids': comparison_ids,
            'matching': {
                'aligned': not split and bool(comparison_ids),
                'split': split,
                'split_reason': reason,
            },
            'locations': {
                'title_gps': {
                    'source': parse.get('source'),
                    'status': coord_block.get('status'),
                    'points': title_points,
                    'point_count': len(title_points),
                } if title_points or coord_block.get('status') else None,
                'chainage': enrich_chainage(
                    parse.get('chainage'),
                    project.get('nep_amount'),
                    project.get('hgab_amount')),
                'psgc': {
                    'anchors': anchors,
                    'primary': primary,
                    'divergent': psgc_divergent,
                },
                'coverage': coverage_label(has_gps, has_psgc),
            },
            'flags': flags,
        }
        projects.append(record)

    coverage = Counter(p['locations']['coverage'] for p in projects)
    flag_counts = Counter(flag for p in projects for flag in p['flags'])
    with_gps = sum(1 for p in projects
                   if (p['locations'].get('title_gps') or {}).get('point_count'))
    gps_points = sum((p['locations'].get('title_gps') or {}).get('point_count') or 0
                     for p in projects)
    with_psgc = sum(1 for p in projects if p['locations']['psgc'].get('primary'))
    with_chainage = sum(1 for p in projects
                        if (p['locations'].get('chainage') or {}).get('length_m'))
    with_php_per_m = sum(1 for p in projects
                         if (p['locations'].get('chainage') or {}).get('php_per_m') is not None)
    nep_funded = [p for p in projects if (p.get('nep_amount') or 0) > 0]
    house_funded = [p for p in projects if (p.get('hgab_amount') or 0) > 0]

    dataset = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'unit': 'senate_workbook_row',
        'coordinate_unit': 'decimal_degrees',
        'title_gps_order': 'latitude, longitude',
        'psgc_centroid_order': 'longitude, latitude',
        'description': (
            'Consolidated FY2027 NIA irrigation projects: one record per NIA Senate '
            'workbook reconciliation line. Title-parsed GPS points and PSGC admin '
            'centroids are attached as complementary location sources for the same '
            'id; amounts must be summed on projects, never on title_gps points. '
            'Matching-split flags mark workbook lines whose ledger halves remain '
            'unpaired in the provisional title-matching comparison ledger — the '
            'workbook already aligns them.'
        ),
        'meta': {
            'source_workbench': 'analysis-nia/data/nia_workbench.json',
            'source_workbench_sha256': sha(WORKBENCH) if WORKBENCH.is_file() else None,
            'counts': {
                'projects': len(projects),
                'nep_funded': len(nep_funded),
                'house_funded': len(house_funded),
                'with_title_gps': with_gps,
                'title_gps_points': gps_points,
                'with_psgc_centroid': with_psgc,
                'with_chainage_length': with_chainage,
                'with_php_per_m': with_php_per_m,
                'matching_split': flag_counts.get('matching_split', 0),
                'psgc_divergent': flag_counts.get('psgc_divergent', 0),
                'multi_site_title_gps': flag_counts.get('multi_site_title_gps', 0),
                'coverage': dict(coverage),
            },
            'money_note': (
                'Sum nep_amount / hgab_amount on projects once. The title-gps points '
                'CSV repeats project amounts for map popups only — do not aggregate it. '
                'locations.chainage.php_per_m is printed allocation ÷ title chainage '
                'length_m (House when present, else NEP) — a screening proxy, not a '
                'construction unit cost.'
            ),
            'location_note': (
                'title_gps = coordinates printed in the project title (site-level). '
                'psgc = barangay/municipality polygon centroid (administrative). '
                'Toggle layers; do not treat both markers as two projects. '
                'chainage = station spans parsed from the title; php_per_m uses that '
                'length only when length_m > 0.'
            ),
        },
        'projects': projects,
    }
    dataset['_point_rows'] = point_rows  # stripped before write
    return dataset


def write_outputs(dataset: dict) -> None:
    point_rows = dataset.pop('_point_rows', [])
    OUT_JSON.write_text(json.dumps(dataset, ensure_ascii=False, indent=1) + '\n')

    with OUT_PROJECTS_CSV.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow([
            'id', 'row', 'subprogram_key', 'program_group', 'category', 'region',
            'province', 'label', 'submission_label', 'workbook_status',
            'nep_amount', 'hgab_amount', 'submission_amount', 'submission_edited',
            'justification', 'nep_id', 'house_id', 'comparison_ids',
            'matching_aligned', 'matching_split', 'matching_split_reason',
            'location_coverage', 'title_gps_source', 'title_gps_point_count',
            'title_gps_points', 'chainage_length_m', 'chainage_incomplete',
            'php_per_m', 'php_per_m_basis', 'nep_php_per_m', 'hgab_php_per_m',
            'psgc', 'psgc_anchor', 'psgc_longitude',
            'psgc_latitude', 'barangay', 'municipality', 'psgc_province',
            'psgc_divergent', 'flags',
        ])
        for p in dataset['projects']:
            gps = p['locations'].get('title_gps') or {}
            points = gps.get('points') or []
            gps_text = '; '.join(
                f"{pt['latitude']},{pt['longitude']}"
                + (f" ({pt['role']})" if pt.get('role') else '')
                for pt in points)
            primary = (p['locations'].get('psgc') or {}).get('primary') or {}
            coords = primary.get('coordinates') or [None, None]
            chainage = p['locations'].get('chainage') or {}
            writer.writerow([
                p['id'], p['row'], p['subprogram_key'], p['program_group'],
                p.get('category') or '', p.get('region') or '',
                p.get('province') or '', p['label'],
                p.get('submission_label') or '', p['workbook_status'],
                p.get('nep_amount') if p.get('nep_amount') is not None else '',
                p.get('hgab_amount') if p.get('hgab_amount') is not None else '',
                p.get('submission_amount') if p.get('submission_amount') is not None else '',
                p.get('submission_edited') or '', p.get('justification') or '',
                p.get('nep_id') or '', p.get('house_id') or '',
                ';'.join(p.get('comparison_ids') or []),
                p['matching']['aligned'], p['matching']['split'],
                p['matching'].get('split_reason') or '',
                p['locations']['coverage'], gps.get('source') or '',
                gps.get('point_count') or 0, gps_text,
                chainage.get('length_m') if chainage.get('length_m') is not None else '',
                chainage.get('incomplete', False) if chainage else '',
                chainage.get('php_per_m') if chainage.get('php_per_m') is not None else '',
                chainage.get('php_per_m_basis') or '',
                chainage.get('nep_php_per_m') if chainage.get('nep_php_per_m') is not None else '',
                chainage.get('hgab_php_per_m') if chainage.get('hgab_php_per_m') is not None else '',
                primary.get('psgc') or '', primary.get('coordinate_anchor') or '',
                coords[0] if coords and coords[0] is not None else '',
                coords[1] if coords and len(coords) > 1 and coords[1] is not None else '',
                primary.get('barangay') or '', primary.get('municipality') or '',
                primary.get('province') or '',
                (p['locations'].get('psgc') or {}).get('divergent', False),
                ';'.join(p.get('flags') or []),
            ])

    with OUT_POINTS_CSV.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow([
            'project_id', 'point_index', 'latitude', 'longitude', 'role',
            'workbook_status', 'subprogram_key', 'label', 'nep_amount',
            'hgab_amount', 'note',
        ])
        for row in point_rows:
            writer.writerow([
                row['project_id'], row['point_index'], row['latitude'],
                row['longitude'], row['role'], row['workbook_status'],
                row['subprogram_key'], row['label'],
                row['nep_amount'] if row['nep_amount'] is not None else '',
                row['hgab_amount'] if row['hgab_amount'] is not None else '',
                row['note'],
            ])


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='Rebuild in memory and compare to the committed JSON')
    args = parser.parse_args(argv)
    dataset = build()
    counts = dataset['meta']['counts']
    if args.check:
        if not OUT_JSON.is_file():
            raise SystemExit(f'Missing {OUT_JSON}; run without --check first')
        existing = json.loads(OUT_JSON.read_text())
        if existing.get('meta', {}).get('counts') != counts:
            raise SystemExit('nia_consolidated.json counts are stale; rebuild')
        print(f'ok projects={counts["projects"]} '
              f'title_gps={counts["with_title_gps"]} '
              f'psgc={counts["with_psgc_centroid"]} '
              f'split={counts["matching_split"]}')
        return 0

    write_outputs(dataset)
    print(f"projects={counts['projects']} "
          f"title_gps={counts['with_title_gps']} ({counts['title_gps_points']} points) "
          f"psgc={counts['with_psgc_centroid']} "
          f"coverage={counts['coverage']} "
          f"split={counts['matching_split']} divergent_psgc={counts['psgc_divergent']}")
    print(f'wrote {OUT_JSON}')
    print(f'wrote {OUT_PROJECTS_CSV}')
    print(f'wrote {OUT_POINTS_CSV}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
