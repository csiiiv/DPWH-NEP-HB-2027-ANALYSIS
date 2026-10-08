# 0005. Split analysis/ into builders, viewers, data, docs, tests, archive

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

`analysis/` accumulated parsers, HTML dashboards, JSON datasets, audits, and
superseded v0–v4b extracts in one flat directory. Paths broke silently,
READMEs went stale, and packaging/CI had to special-case many filenames.

## Decision Drivers

* Clear “current vs historical” boundary for newcomers
* Stable import/path helpers for builders and tests
* Packaging and CI should not hard-code a flat file list forever
* Superseded extracts must remain reproducible without looking current

## Considered Options

1. Keep the flat `analysis/*` layout; document naming conventions only
2. Move everything into a Python package with installable deps
3. Role folders + `paths.py` bootstrap (`builders/`, `viewers/`, `data/`, `docs/`, `tests/`, `archive/`)

## Decision Outcome

Chosen option: **3 — role folders**.

`analysis/paths.py` exposes `ANALYSIS`, `BUILDERS`, `VIEWERS`, `DATA`, `DOCS`,
`TESTS`, `ARCHIVE` and prepends `analysis/` + `builders/` to `sys.path` so
builders keep bare-module imports. Superseded leaves and early matcher
outputs live under `archive/` with their own README. External Ghostscript
dumps stay in `joebert_data/` (not builder outputs). Decision records live
under `docs/adr/`.

### Consequences

* Good: READMEs and CI have a single layout story
* Good: archive cannot be mistaken for current baselines
* Bad: relative links and packaging needed a one-time cutover
* Bad: generated HTML provenance must use `analysis/data/...` paths

## More Information

* [../../README.md](../../README.md)
* [../../archive/README.md](../../archive/README.md)
* `analysis/paths.py`
* ADR-0006
