# 0008. Preserve per-item expenditure columns and use page-specific source evidence

- Status: Accepted
- Date: 2026-10-09

## Context

An expense-class selector did not resolve lost row-column context. Operating-unit
rows displayed PS under a generic amount label, and a fixed native-text x range
read MOOE on some PS continuation pages. Large extraction boxes also accepted
matching amounts from adjacent rows.

## Options

1. Continue using generic amounts and a fixed column range.
2. Retain each node's amount basis, printed row columns, and page-specific geometry.

## Outcome

Choose option 2. The canonical NEP tree records `amount_basis`. Printed
operating-unit rows retain `source_row_columns_php`, with missing captures as
null. Three-amount continuation layouts represent PS, MOOE, and Total;
four-amount layouts include CO. Full row totals are contextual and are never
added to the PS branch.

Audit native text within each page's amount-column polygon. Multiple amount
lines produce a row-ambiguity flag even when one matches. Bind every-item
reassessment and rendered review crops to the tree and retained source hashes.

## Consequences

- Arithmetic, single-line text support, and rendered-image verification remain distinct.
- The 237-candidate initial audit is superseded by 3,193 actionable source checks.
- No numeric allocation changed in this reassessment; amounts remain retained extractions.
- Extraction rebuilds require table-structure pages as well as PDF and OCR trees.
- Evidence crops and dependent viewers must be refreshed after canonical changes.

See [verification methods and current counts](../source_hierarchy_verification.md)
and [canonical NEP decision](0003-source-only-nep-tree.md).
