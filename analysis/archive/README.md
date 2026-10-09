# analysis/archive — historical and exploratory work

Archived on **9 October 2026**. This tree preserves superseded scripts, viewers,
reports, outputs, exploratory external candidates, and historical evidence.
Start current work from [analysis/README.md](../README.md) and
[source verification](../docs/source_hierarchy_verification.md). The current
[React SPA](../web/README.md) serves the active workspaces; these archived
viewers are outside its route list.

[manifest.json](manifest.json) lists **104 relocated files**, original paths,
pre-move SHA-256 hashes, and reasons. Of the 104 moves, 102 are versioned and
two `.pkl` caches remain ignored local files (`local_only: true` in the manifest);
a fresh clone does not include those caches. Files were moved rather than deleted.
JSON, image, and cache bytes were preserved. Source/report links and Python
imports were adapted for the new layout; historical JSON provenance keeps its
original paths, which can be resolved through the manifest.

## What is here

| Folder | Contents and status |
|---|---|
| [builders/](builders) | OCR parsers, v1–v4 repairs/audits, old API matchers, taxonomy, inventory and Ghostscript experiments; also generators for archived House views |
| [data/](data) | v0–v4b allocation lineage, old matcher results, OCR hierarchy and House view outputs, exploratory reassessments, and local page-map caches |
| [docs/](docs) | [Historical work log](docs/FY2027_work_summary.md), text-layer audits, [parser report](docs/hierarchy_report.md), [dataset inventory](docs/hb_json_usability_audit.md), and external candidate assessments |
| [viewers/](viewers) | [OCR-era House rollup](viewers/hb_2027_tree.html), [reconstructed House tree](viewers/hb_2027_source_tree.html), [earlier crosscheck](viewers/crosscheck_2027.html), and [title taxonomy](viewers/taxonomy_comparison.html), with scripts/templates |
| [tests/](tests) | Regression tests for the two archived House trees and their viewers |
| [evidence/](evidence) | Old sampled PDF-row crops; current NEP review crops remain in [current data](../data/source_review_evidence) |
| [joebert_data/](joebert_data/README.md) | Third-party Ghostscript project candidates; not certified House leaves |

The earlier insertion/removal labels and unmatched pools retain their historical
meaning. They do not establish policy changes. Archived House trees use v5
project candidates with four unresolved PAP extraction gaps; current additive
controls are [Native I-B](../data/hb_dpwh_native_rollup.json).

## Dependencies retained deliberately

Archiving does not mean every file is unused by every rebuild:

- The active `repair_hb_known_defects.py` explicitly imports archived
  `audit_textlayer_v2` and `crosscheck_lineitems` helpers. It reads archived v4b
  leaves and v3 text-layer audit to reproduce the retained v5 candidate.
- The active `reconcile_nep_source.py` reads archived line-item results only for
  its historical House-only reassessment and writes that exploratory output here.
  Its current NEP source projects and API reconciliation remain under `../data/`.
- The archived inventory builder can regenerate the retained
  `../data/hb_json_usability_audit.json`, which supplies the current candidate
  comparison and v5 repairs. This is a historical control input, not current
  verification of all rows.
- Archived House builders read current v5/control inputs alongside the archived
  OCR hierarchy. `retained_data_path()` resolves that mixed input set; output
  tree, report, and viewer locations stay in the archive.

`reference_official_compilation.json`, v5, source projects/reconciliation, and
current candidate/stage-trace artifacts remain outside the archive because they
are still inputs or outputs of retained workflows. The recently added stage
trace remains active; its matches are provisional.

## Run historical checks

From the repository root:

```sh
python -m unittest discover -s analysis/archive/tests -p 'test_*.py' -v
node --test analysis/archive/tests/test_hb_tree_viewer.cjs \
              analysis/archive/tests/test_hb_source_tree_viewer.cjs

# Optional: regenerate these archived views from their retained dependencies.
python analysis/archive/builders/build_hb_tree.py
python analysis/archive/builders/build_hb_source_tree.py
```

Some archived generators need PyMuPDF, RapidFuzz, source PDFs/OCR markdown, or
ignored local page-mapping caches. They are historical tools, not part of Pages
CI. The current site packages six retained viewers and links to this repository
archive; old viewer URLs are no longer published as current pages.
