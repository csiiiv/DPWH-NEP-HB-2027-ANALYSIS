# 0003. Build the canonical NEP tree from source OCR only

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

FY2027 DPWH NEP amounts appear in the retained Volume II-B OCR trees, the
BetterGov API snapshot, and third-party compilations. Mixing those sources
when building a “canonical” tree makes it impossible to tell whether a
branch comes from the printed proposal or from an incomplete API.

## Decision Drivers

* Canonical hierarchy must be attributable to the NEP PDF / OCR trees
* API omissions must not silently shrink the NEP baseline
* Arithmetic validation (zero-peso additive rollups) must be independent
* House data must not determine NEP structure or amounts

## Considered Options

1. Build the tree from the BetterGov API and fill gaps from OCR
2. Prefer the ajamontesa compilation workbook as the hierarchy source
3. Source-only builder: retained PAP + operating-unit OCR trees + PDF

## Decision Outcome

Chosen option: **3 — source-only**, via `analysis/builders/build_nep_tree.py`
→ `analysis/data/nep_2027_tree.json`.

Provenance records input paths and SHA-256 hashes. API and House rows are
never parents, amounts, or labels in this tree. The BetterGov snapshot and
API reconciliation remain a **separate coverage baseline**
(₱445.38B vs ₱642.612015B new appropriations).

### Consequences

* Good: ₱642.612015B new-appropriations baseline with 2,552 balanced rollups
* Good: API gap analysis cannot redefine the executive proposal
* Bad: 237 native-text/coordinate review candidates remain open
* Bad: rebuild requires the external `paddle_pdf_ocr_v2` source directory

## More Information

* [../../viewers/nep_2027_tree.md](../../viewers/nep_2027_tree.md)
* [../nep_2027_api_reconciliation.md](../nep_2027_api_reconciliation.md)
* ADR-0004
