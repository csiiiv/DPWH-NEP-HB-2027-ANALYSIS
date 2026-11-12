#!/usr/bin/env python3
"""Local mirror of the Publish dashboards CI build job.

Runs every validation gate in the same order and at the same strictness as
.github/workflows/pages.yml so a push never surprises us: derived-artifact
gate, data-level unittest suites (incl. NIA/HFEP/master_list), the deep
workbench integrity check, React unit tests, vite build, site packaging and
the full Playwright browser sweep.

Levels mirror CI:
  fast          fast gate + web tests + build + packaging + smoke checks
  data          + all data-level suites (test_current_pages & friends)
  comprehensive + NIA/HFEP extraction suites, FMR checks, master list,
                derived_artifacts --deep, and the full browser sweep

Usage:
  python3 scripts/local_deploy_preflight.py [--level LEVEL] [--skip-browser]
                                            [--only SECTION]
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

ENV = {**os.environ, 'SKIP_MOBILE_CHECKS': '1', 'PYTHONDONTWRITEBYTECODE': '1'}

DATA_SUITES = [
    ('derived-artifacts gate', ['python3', 'scripts/derived_artifacts.py']),
    ('current accounting/freshness/matching',
     ['python3', '-m', 'unittest', 'discover', '-s', 'analysis/tests', '-p', 'test_current_pages.py']),
    ('house readings', ['python3', '-m', 'unittest', 'discover', '-s', 'analysis/tests',
                        '-p', 'test_house_readings.py']),
    ('stage trace + README nav',
     ['bash', '-c', 'python3 -m unittest discover -s analysis/tests -p test_stage_trace.py '
                    '&& python3 -m unittest discover -s analysis/tests -p test_static_pages.py '
                    '&& python3 -m unittest discover -s analysis/tests -p test_pdf_range_server.py']),
]

COMPREHENSIVE_SUITES = [
    ('house native extraction',
     ['bash', '-c', 'python3 scripts/hb_native_ic_rollup.py --check && '
                    'python3 -m unittest scripts.tests.test_hb_native_ic_rollup '
                    'scripts.tests.test_hb_native_rollup -v']),
    ('budget display units', ['node', '--test', 'analysis/tests/test_budget_display.cjs']),
    ('source verification',
     ['bash', '-c', 'python3 -m unittest discover -s analysis/tests -p test_source_verification.py '
                    '&& node --test analysis/tests/test_source_verification_viewer.cjs']),
    ('FMR datasets',
     ['bash', '-c', 'python3 other-analysis/build_fmr_final_dataset.py --check && '
                    'python3 other-analysis/build_fmr_workbench.py --check']),
    ('NIA extraction + browser accounting',
     ['bash', '-c', 'python3 -m unittest discover -s analysis-nia/tests && '
                    'python3 analysis-nia/build_nia_workbench.py --check']),
    ('HFEP extraction', ['bash', '-c', 'python3 -m pytest analysis-hfep/tests -q && '
                                       'python3 other-analysis/build_hfep_workbench.py --check']),
    ('master list', ['python3', '-m', 'unittest', 'discover', '-s', 'master_list/tests']),
    ('deep workbench integrity', ['python3', 'scripts/derived_artifacts.py', '--deep']),
]

FRONTEND_STEPS = [
    ('web unit tests', ['bash', '-c', 'cd analysis/web && npm test']),
    ('vite build', ['bash', '-c', 'cd analysis/web && npm run build']),
]

PACKAGING_STEPS = [
    ('package site', ['python3', 'scripts/build_pages.py', '--with-react', '--no-regenerate']),
]

SMOKE_CHECKS = [
    ('first visit disclaimer', ['python3', 'scripts/check_first_visit_disclaimer.py']),
    ('react pages', ['python3', 'scripts/check_react_pages.py']),
    ('static navigation', ['node', '--test', 'analysis/tests/test_static_navigation.cjs']),
]

FULL_BROWSER_CHECKS = [
    ('overview pages', ['python3', 'scripts/check_overview_pages.py']),
    ('comparison workspace', ['python3', 'scripts/check_comparison_workspace.py']),
    ('analysis page', ['python3', 'scripts/check_analysis_page.py']),
    ('highlights page', ['python3', 'scripts/check_highlights_page.py']),
    ('FMR pages', ['python3', 'scripts/check_fmr_pages.py']),
    ('HFEP pages', ['python3', 'scripts/check_hfep_pages.py']),
    ('NIA pages', ['python3', 'scripts/check_nia_pages.py']),
    ('budget flow pages', ['python3', 'scripts/check_budget_flow_pages.py']),
    ('flow source pages', ['python3', 'scripts/check_flow_source_pages.py']),
    ('hierarchy pages', ['python3', 'scripts/check_hierarchy_pages.py']),
]


def run(label: str, cmd: list[str]) -> bool:
    start = time.time()
    print(f'\n=== {label} ===', flush=True)
    proc = subprocess.run(cmd, env=ENV, cwd=ROOT)
    minutes = (time.time() - start) / 60
    status = 'ok' if proc.returncode == 0 else 'FAIL'
    print(f'--- {label}: {status} ({minutes:.1f} min) ---', flush=True)
    return proc.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--level', choices=('fast', 'data', 'comprehensive'), default='comprehensive')
    parser.add_argument('--skip-browser', action='store_true', help='skip packaging + browser checks')
    parser.add_argument('--only', help='run a single section by label substring')
    args = parser.parse_args()

    plan: list[tuple[str, list[str]]] = []
    plan += DATA_SUITES
    if args.level == 'comprehensive':
        plan += COMPREHENSIVE_SUITES
    plan += FRONTEND_STEPS
    if not args.skip_browser:
        plan += PACKAGING_STEPS + SMOKE_CHECKS
        if args.level != 'fast':
            plan += FULL_BROWSER_CHECKS

    if args.only:
        plan = [step for step in plan if args.only.lower() in step[0].lower()]
        if not plan:
            print(f'No section matches --only {args.only!r}')
            return 2

    print(f'Local deploy preflight · level={args.level} · {len(plan)} sections', flush=True)
    results: list[tuple[str, bool, float]] = []
    for label, cmd in plan:
        start = time.time()
        ok = run(label, cmd)
        results.append((label, ok, time.time() - start))
        if not ok:
            print(f'\nStopping at first failure: {label}. Fix and rerun '
                  f'(--only {label.split(" ")[0].lower()} to retest just this).')
            break

    print('\n================ PREFLIGHT SUMMARY ================')
    failed = 0
    for label, ok, seconds in results:
        mark = 'PASS' if ok else 'FAIL'
        print(f'  [{mark}] {label:<45} {seconds/60:6.1f} min')
        failed += not ok
    total = sum(s for _, _, s in results)
    print(f'  {len(results) - failed}/{len(results)} sections passed · {total/60:.1f} min total')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
