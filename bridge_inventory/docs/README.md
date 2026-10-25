# Bridge inventory documentation

This module supports the sequence **budget observation → bridge ID → inventory
coordinates → legislative district (direct) and dated administrative polygons →
provisional current PSGC candidate (fallback)**. It preserves the evidence for
each step so the inventory can be reused independently of a budget year or
viewer.

| Guide | Read it for |
|---|---|
| [Methodology](METHODOLOGY.md) | Acquisition controls, project identity matching, spatial joins, PSGC reconciliation, and interpretation limits. |
| [Data guide](DATA_GUIDE.md) | File layout, record grain, keys, fields, statuses, review flags, and a Python reuse example. |
| [Proximity review](PROXIMITY_REVIEW.md) | DPWH locality fields, point-versus-edge geometry, nearest-three candidates, distances, and no-hit review. |
| [Workflow and roadmap](WORKFLOW_AND_ROADMAP.md) | Refresh/rebuild commands, dependencies, current results, review priorities, and planned integration. |

Start with the [module README](../README.md) for downloads, the
[table viewer](../index.html) to browse bridge assets and their evidence, the
[generated report](../data/REPORT.md) for matching coverage, and the
[matching audit](../data/bridge_matching_audit.json) for exact input/output
hashes and software versions. [latest.json](../latest.json) identifies the most
recent verified inventory snapshot; the matching audit identifies the snapshot
actually used for enrichment.

The initial acquisition and matching work was completed on **25 October 2026**.
The inventory states **January 2023** as its data date, the local polygon set
has **2023** vintage, and the current retained PSGC catalog is a **provisional
community mirror marked as 3Q 2026**. These dates describe different inputs.

Current PSGC candidates remain provisional. Master-list integration is live as
of location evidence v5/v5.1: registry evidence scores as independent factors
and assigned records carry verified legislative districts. The enrichment
itself never changes master-list assignments directly; all master-list effects
flow through its own versioned build with regression checks.
