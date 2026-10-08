"""Shared locations for the analysis workbench after the docs/builders/viewers/data regroup."""
from __future__ import annotations

import sys
from pathlib import Path

ANALYSIS = Path(__file__).resolve().parent
REPO = ANALYSIS.parent
BUILDERS = ANALYSIS / 'builders'
VIEWERS = ANALYSIS / 'viewers'
DATA = ANALYSIS / 'data'
DOCS = ANALYSIS / 'docs'
TESTS = ANALYSIS / 'tests'
ARCHIVE = ANALYSIS / 'archive'
EVIDENCE = ANALYSIS / 'evidence'
JOEBERT = ANALYSIS / 'joebert_data'

# Builders import each other by bare module name; tests do the same.
for _p in (str(ANALYSIS), str(BUILDERS)):
    if _p not in sys.path:
        sys.path.insert(0, _p)


def data_path(*parts: str) -> Path:
    return DATA.joinpath(*parts)


def viewer_path(*parts: str) -> Path:
    return VIEWERS.joinpath(*parts)


def docs_path(*parts: str) -> Path:
    return DOCS.joinpath(*parts)


def archive_path(*parts: str) -> Path:
    return ARCHIVE.joinpath(*parts)
