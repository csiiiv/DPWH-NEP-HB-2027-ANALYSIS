# Architecture Decision Records

Lean [MADR](https://adr.github.io/madr/)-style records for the FY2027 DPWH
House / NEP analysis workbench. Each ADR captures one settled choice and why
alternatives were rejected.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-native-text-layer-house-controls.md) | Use native PDF text layer for House printed controls | Accepted |
| [0002](0002-separate-controls-and-project-titles.md) | Keep House control baseline separate from project-title extract | Accepted |
| [0003](0003-source-only-nep-tree.md) | Build the canonical NEP tree from source OCR only | Accepted |
| [0004](0004-unmatched-rows-are-candidates.md) | Treat unmatched / fuzzy rows as candidates, not insertions | Accepted |
| [0005](0005-analysis-workbench-layout.md) | Split analysis/ into builders, viewers, data, docs, tests, archive | Accepted |
| [0006](0006-github-pages-packaging.md) | Package viewers + data flattened under `_site/analysis/` | Accepted |
| [0007](0007-verify-source-hierarchies-before-comparison.md) | Verify independent source hierarchies before comparisons | Accepted |
| [0008](0008-per-item-amount-columns-and-evidence.md) | Preserve per-item columns and page-specific source evidence | Accepted |
| [0009](0009-navigable-source-review-workspace.md) | Navigate source paths within a shared review workspace | Accepted |
| [0010](0010-archive-superseded-analysis-work.md) | Archive superseded and exploratory analysis by role | Accepted |

| [0011](0011-react-vite-migration.md) | Incremental React + Vite migration with PDF.js evidence | Accepted for preview |

## How to add an ADR

1. Copy the next number: `NNNN-short-title-with-dashes.md`
2. Fill Context → Options → Outcome → Consequences
3. Set status: Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
4. Link it from this index and from [../../README.md](../../README.md) docs index

Narrative evidence and numbers live in sibling docs under `../`; ADRs only
record the decision.
