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
ARCHIVE_DATA = ARCHIVE / 'data'
ARCHIVE_DOCS = ARCHIVE / 'docs'
ARCHIVE_VIEWERS = ARCHIVE / 'viewers'
ARCHIVE_BUILDERS = ARCHIVE / 'builders'
ARCHIVE_TESTS = ARCHIVE / 'tests'
EVIDENCE = ARCHIVE / 'evidence'
JOEBERT = ARCHIVE / 'joebert_data'

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

# Archived helper imports are explicit in active repair code; retired builders
# are not added to the active import path.
def retained_data_path(name: str) -> Path:
    """Resolve retained current inputs or a historical archive dependency."""
    current = DATA / name
    return current if current.exists() else ARCHIVE_DATA / name
