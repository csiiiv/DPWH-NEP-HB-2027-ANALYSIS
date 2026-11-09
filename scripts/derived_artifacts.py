#!/usr/bin/env python3
"""Central registry of derived artifacts: producers, inputs, freshness checks.

The deployment pipeline no longer regenerates datasets on the build machine
(see docs/ci_fast_deploys.md). Instead, packaging consumes committed derived
artifacts and this module answers two questions:

1. ``required_for_package()`` — every artifact the site needs, with the
   builder that produces it, so ``build_pages.py --no-regenerate`` fails with
   an actionable message instead of silently shipping a stale site.
2. ``verify_derived_artifacts()`` — cheap staleness gates:
   - artifacts exist and are non-empty;
   - artifacts that carry ``input_provenance`` / ``input_sha256`` pin their
     inputs' current SHA-256 (provenance is a *claim*, this checks bytes);
   - the FMR / NIA / HFEP workbenches and the comparison payload pass their
     own ``--check`` modes / hash lists when available.

Full regeneration remains available locally via ``npm run generate:data``
(analysis/web) and the per-builder commands listed in the registry.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'analysis' / 'data'
FMR_DATA = ROOT / 'other-analysis' / 'data'
NIA_DATA = ROOT / 'analysis-nia' / 'data'
HFEP_CSV = ROOT / 'analysis-hfep' / 'data'
GPS_DATA = ROOT / 'gps-analysis' / 'data'
MASTER = ROOT / 'master_list'

# name -> (path relative to ROOT, producing command, note)
DERIVED = {
    # comparison payloads (stage_trace/readings/road_groups/chainage are
    # committed upstream inputs; these three are rebuilt from them)
    'comparison_overview_2027.json': (
        'analysis/data/comparison_overview_2027.json',
        'node analysis/web/buildComparisonData.mjs', ''),
    'comparison_projects_2027.json': (
        'analysis/data/comparison_projects_2027.json',
        'node analysis/web/buildComparisonData.mjs', ''),
    'highlights_details_2027.json': (
        'analysis/data/highlights_details_2027.json',
        'node analysis/web/buildComparisonData.mjs', ''),
    'main_overview_2027.json': (
        'analysis/data/main_overview_2027.json',
        'node analysis/web/buildMainOverview.mjs', ''),
    'dpwh_flow_2027.json': (
        'analysis/data/dpwh_flow_2027.json',
        'node analysis/web/buildDpwhFlow.mjs', ''),
    'budget_flow_sources_2027.json': (
        'analysis/data/budget_flow_sources_2027.json',
        'node analysis/web/buildBudgetFlowSources.mjs', ''),
    'allocation_hierarchy_sources_2027.json': (
        'analysis/data/allocation_hierarchy_sources_2027.json',
        'node analysis/web/buildHierarchySources.mjs', ''),
    'dpwh_comparison_all_2027.csv': (
        'analysis/data/dpwh_comparison_all_2027.csv',
        'node analysis/web/buildCsvExports.mjs', ''),
    # congress workspace
    'congress_district_index_2027.json': (
        'analysis/data/congress_district_index_2027.json',
        'node analysis/web/buildCongressIndex.mjs', ''),
    'location_district_index_2027.json': (
        'analysis/data/location_district_index_2027.json',
        'python3 analysis/web/buildLocationLens.py', ''),
    'congress_district_map_2027.json': (
        'analysis/data/congress_district_map_2027.json',
        'python3 analysis/web/buildLocationLens.py', ''),
    'fmr_legislative_index_2027.json': (
        'analysis/data/fmr_legislative_index_2027.json',
        'python3 analysis/web/buildFmrLegislativeLens.py', ''),
    'mpb_legislative_index_2027.json': (
        'analysis/data/mpb_legislative_index_2027.json',
        'python3 analysis/web/buildMpbLegislativeLens.py', ''),
    # annex workbenches + FMR finals consumed by the SPA and packaging
    'da_fmr_draft.json': (
        'other-analysis/data/da_fmr_draft.json',
        'python3 other-analysis/extract_da_fmr.py', ''),
    'fmr_workbench.json': (
        'other-analysis/data/fmr_workbench.json',
        'python3 other-analysis/build_fmr_workbench.py', ''),
    'fmr_psgc_locations_2027.json': (
        'other-analysis/data/fmr_psgc_locations_2027.json',
        'python3 other-analysis/build_fmr_psgc_locations.py', ''),
    'hgab_fmr_final_dataset.json': (
        'other-analysis/data/hgab_fmr_final_dataset.json',
        'python3 other-analysis/build_fmr_final_dataset.py',
        'requires the PSGC shapefile submodule'),
    'nep_fmr_final_dataset.json': (
        'other-analysis/data/nep_fmr_final_dataset.json',
        'python3 other-analysis/build_fmr_final_dataset.py',
        'requires the PSGC shapefile submodule'),
    'hfep_workbench.json': (
        'other-analysis/data/hfep_workbench.json',
        'python3 other-analysis/build_hfep_workbench.py', ''),
    'nia_workbench.json': (
        'analysis-nia/data/nia_workbench.json',
        'python3 analysis-nia/build_nia_workbench.py', ''),
    'gps_workbench.json': (
        'gps-analysis/data/gps_workbench.json',
        'python3 gps-analysis/build_gps_workbench.py', ''),
    # master list cleaned release (input of the location lens chain); the
    # 82 MB viewer HTML is committed separately and reused as-is.
    'master_list_cleaned': (
        'master_list/data/cleaned/observations.jsonl.gz',
        'npm run build:location-release --prefix analysis/web', ''),
    'master_list_index': (
        'master_list/index.html',
        'python3 master_list/scripts/build_viewer.py', '82 MB standalone viewer'),
}

# Artifacts with a self-describing input_provenance / input_sha256 block whose
# input hashes must match the current committed inputs.
_PROVENANCE_KEYS = ('input_provenance', 'input_sha256')


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _provenance_inputs(payload: dict):
    """Yield (input_path, expected_sha) pairs declared inside one artifact."""
    block = payload.get('input_provenance')
    if isinstance(block, dict):
        for name, entry in block.items():
            if isinstance(entry, str):
                yield name, entry  # input_sha256-style {name: sha}
            elif isinstance(entry, dict):
                sha = entry.get('sha256') or entry.get('input_sha256')
                path = entry.get('path') or entry
                if isinstance(path, str) and isinstance(sha, str):
                    yield path, sha
    flat = payload.get('input_sha256')
    if isinstance(flat, dict):
        yield from flat.items()


def verify_provenance(name: str, path: Path, failures: list[str]) -> None:
    """Check that a derived artifact's declared input hashes match disk bytes."""
    try:
        payload = json.loads(path.read_text())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return  # not JSON or huge streaming file — presence check only
    if not isinstance(payload, dict):
        return
    checked = 0
    for input_path, expected in _provenance_inputs(payload):
        target = ROOT / input_path
        if not target.is_file():
            # Relative to the artifact's own directory (comparison payloads).
            target = path.parent / input_path
        if not target.is_file():
            continue  # input lives outside the repo or is itself derived
        actual = sha256(target)
        if actual != expected:
            failures.append(
                f'{name}: input {input_path} changed since this artifact was '
                f'built — rerun {DERIVED[name][1] if name in DERIVED else "the producing builder"}'
                f' and commit the refreshed artifact')
        checked += 1
    if checked and name in ('congress_district_index_2027.json',
                            'location_district_index_2027.json',
                            'fmr_legislative_index_2027.json',
                            'mpb_legislative_index_2027.json'):
        print(f'  provenance verified: {name} pins {checked} current input(s)')


def verify_derived_artifacts(names=None, *, deep: bool = False) -> list[str]:
    """Return a list of failure messages (empty = all good).

    ``deep=True`` additionally runs the builders' own ``--check`` modes
    (FMR/NIA/HFEP workbenches) which re-verify against retained inputs.
    """
    failures: list[str] = []
    selected = names or DERIVED
    for name in selected:
        rel, command, note = DERIVED[name]
        path = ROOT / rel
        if not path.is_file() or path.stat().st_size == 0:
            failures.append(f'{name}: missing or empty — run: {command}'
                            + (f' ({note})' if note else ''))
            continue
        verify_provenance(name, path, failures)
    if deep:
        checks = [
            ['python3', 'other-analysis/build_fmr_workbench.py', '--check'],
            ['python3', 'other-analysis/build_hfep_workbench.py', '--check'],
            ['python3', 'analysis-nia/build_nia_workbench.py', '--check'],
        ]
        for command in checks:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            if result.returncode != 0:
                failures.append(
                    f"{' '.join(command)} failed:\n{result.stdout}\n{result.stderr}")
            else:
                print(f'  deep check OK: {" ".join(command[1:])}')
    return failures


def required_for_package() -> list[str]:
    """Artifact names packaging requires regardless of staleness checks."""
    return list(DERIVED)


def main() -> int:
    deep = '--deep' in sys.argv
    names = [a for a in sys.argv[1:] if not a.startswith('--')]
    print('Verifying derived artifacts' + (' (deep)' if deep else ''))
    failures = verify_derived_artifacts(names or None, deep=deep)
    if failures:
        print('\n'.join(f'FAIL {message}' for message in failures), file=sys.stderr)
        return 1
    total = len(names) if names else len(DERIVED)
    print(f'OK: {total} derived artifact(s) present and provenance-consistent')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
