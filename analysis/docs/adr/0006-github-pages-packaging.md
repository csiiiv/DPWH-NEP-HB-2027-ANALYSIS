# 0006. Package viewers + data flattened under `_site/analysis/`

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

Local development keeps HTML under `analysis/viewers/` and JSON under
`analysis/data/` with relative `../data/` links. GitHub Pages needs a static
tree that works without the full repo layout and without breaking historical
viewer URLs that expected files beside each other under `analysis/`.

## Decision Drivers

* Hosted site must open dashboards and downloads without a Python server
* Prefer not to rewrite every embedded path inside large HTML payloads
* CI should validate pages without re-running PDF extraction
* House PDFs should ship with the site for working page citations

## Considered Options

1. Host the repo layout as-is (`analysis/viewers/...`, `analysis/data/...`)
2. Rewrite all viewer links to a CDN-style `/assets/` tree
3. Flatten viewers + selected data into `_site/analysis/` at package time

## Decision Outcome

Chosen option: **3 — flatten at package time**, via `scripts/build_pages.py`.

Local sources keep the regrouped layout. Packaging copies viewers and needed
JSON into `_site/analysis/`, rewrites local `../data/` / `../docs/` links for
the hosted tree, and adapts `site/index.html` hrefs from `analysis/viewers/`
to `analysis/`. Validation (`scripts/validate_current_pages.py`) checks
embedded data and accounting before publish.

### Consequences

* Good: local regroup and hosted URLs can evolve independently
* Good: Pages workflow stays “build static from committed JSON”
* Bad: package step must stay in sync when new viewers/datasets appear
* Bad: browsing `_site/` is not identical to browsing the source tree

## More Information

* `scripts/build_pages.py`
* `scripts/validate_current_pages.py`
* `.github/workflows/pages.yml`
* ADR-0005
