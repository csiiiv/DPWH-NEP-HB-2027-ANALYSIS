# 0007. Verify independent source hierarchies before comparisons

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context

The homepage led with an OCR-era House/NEP candidate comparison before each
source's hierarchy and coverage were confirmed. The intended three sources are
House Native I-B, the NEP PDF source, and DPWH Transparency's FY2027 NEP project
snapshot. The separate multi-year contract archive is outside this scope.

## Options

1. Continue comparisons with downstream source caveats.
2. First expose independent source hierarchies, arithmetic, evidence, and coverage.

## Outcome

Choose option 2. The homepage leads with three source-verification viewers.
Comparison pages remain earlier references. Balanced arithmetic does not
independently establish comparison readiness.

Each viewer shows immediate-child sums, recursive leaves, progressive balances,
and source references. API groups are derived from unique FY2027 project
records, without importing PDF/House allocations. API amounts in thousands of
PHP convert exactly to integer pesos.

Rename the API source folder to `dpwh-transparency-nep-data/`; House native
artifacts belong in `analysis/data/`. The scripts retain the actual
BetterGov-hosted API endpoint in provenance.

## Consequences

- Source identity, coverage, and allocation grain are visible before comparisons.
- CI validates committed snapshots and trees without local detail downloads.
- House project identity/amendment review, NEP source-image review, and API document/release coverage
  remain explicit prerequisites for certified comparisons.

See [source verification methods](../source_hierarchy_verification.md).

## Implementation update — 9 October 2026

[ADR-0008](0008-per-item-amount-columns-and-evidence.md) documents per-item
expense columns and the revised evidence audit. [ADR-0009](0009-navigable-source-review-workspace.md)
documents navigable source paths and the responsive review workspace.
All three retained sources still have `comparison_ready: false`.
