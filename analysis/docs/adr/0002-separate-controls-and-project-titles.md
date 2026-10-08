# 0002. Keep House control baseline separate from project-title extract

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

Volume I-B prints office-level controls; Volume I-C prints project detail.
A single “House dataset” cannot serve both aggregate reconciliation and
title-level matching without conflating arithmetic truth with extraction
coverage. Which artifact is authoritative for which job?

## Decision Drivers

* Aggregate comparisons must use printed controls that balance
* Project matching needs titles, regions, offices, and amounts
* Incomplete project coverage must stay visible (coverage gaps ≠ policy)
* Repair lineage (v3→v5) must not quietly redefine printed totals

## Considered Options

1. One unified House JSON that invents rollups to force balance
2. Treat v5 leaf sums as House totals for dashboards and gaps
3. Dual baseline: native I-B (controls) + v5 / future native I-C (titles)

## Decision Outcome

Chosen option: **3 — dual baseline**.

| Role | Artifact |
|---|---|
| Control baseline | `analysis/data/hb_dpwh_native_tree.json` |
| Project-title candidate | `analysis/data/hb_dpwh_leaves_corrected_v5.json` (until native I-C) |
| Rollup / document views | `hb_2027_tree.json`, `hb_2027_source_tree.json` under printed controls |

Trees mark nodes without printed controls as **derived** (child sums). No
subtotal or hierarchy amount is invented to close gaps. The four unresolved
v5 PAPs and the ₱5.596B net operations gap stay explicit as extraction
limits, not bill deficits.

### Consequences

* Good: dashboards can separate printed deltas from extraction coverage
* Good: native control wins when v5 disagrees on a printed PAP total
* Bad: two House artifacts must be kept in sync and clearly labeled
* Bad: v5 still required for titles until I-C native re-extract lands

## More Information

* [../hb_known_defect_repairs.md](../hb_known_defect_repairs.md)
* [../../viewers/hb_2027_tree.md](../../viewers/hb_2027_tree.md)
* [../../viewers/hb_2027_source_tree.md](../../viewers/hb_2027_source_tree.md)
* ADR-0001
