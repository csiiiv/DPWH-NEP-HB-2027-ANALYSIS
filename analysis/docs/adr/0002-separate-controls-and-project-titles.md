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
| Additive control baseline | `analysis/data/hb_dpwh_native_rollup.json` (660 direct/recursive checks across four columns) |
| Raw outline for existing consumers | `analysis/data/hb_dpwh_native_tree.json` (647 structural checks) |
| Named-project layer | `analysis/data/hb_dpwh_native_ic_projects.json` (native I-C, 15,972 named project leaves plus 29 FAP totals, 2,477 balancing controls) — since 2026-10-09 |
| Historical project-title candidate | `analysis/data/hb_dpwh_leaves_corrected_v5.json` (OCR lineage, retired) |
| Rollup / document views | `hb_2027_tree.json`, `hb_2027_source_tree.json` under printed controls |

Trees mark nodes without printed controls as **derived** (child sums). No
subtotal or hierarchy amount is invented to close gaps. The former v5 gap
is closed natively: the I-C layer agrees with I-B to the peso on 56 independent
controls, including expense columns and all shared I-B PAP/program controls.

### Consequences

* Good: dashboards can separate printed deltas from extraction coverage
* Good: native control wins when a derived layer disagrees on a printed PAP total
* Good: v5 retired — both halves of the dual baseline are now native text layer
* Good: current matching, stage trace, downloads, and packaging consume native I-C; 44/44 mapped local PAPs balance
* Bad: two House artifacts must be kept in sync and clearly labeled

## More Information

* [../hb_native_ic_rollup_checks.md](../hb_native_ic_rollup_checks.md)
* [../hb_known_defect_repairs.md](../hb_known_defect_repairs.md)
* [../../viewers/hb_2027_tree.md](../../archive/viewers/hb_2027_tree.md)
* [../../viewers/hb_2027_source_tree.md](../../archive/viewers/hb_2027_source_tree.md)
* ADR-0001
