# DPWH Transparency NEP data

This folder was renamed from `nep-data/` to make the source explicit. It contains the retained **FY2027 NEP project data released through DPWH Transparency**, fetched through the BetterGov-hosted endpoint recorded by the scripts:

`https://api.dpwh.bettergov.ph/nep/projects`

This is a proposal-project dataset. The multi-year DPWH contract-listing archive is outside this workbench's current verification scope.

| Artifact | Role |
|---|---|
| `json/fy2027-combined.json` | Committed combined listing: **11,372 projects; ₱445,378,063,000** |
| `json/fy2027/dump-page-*.json` | 23 original listing pages, retained locally and git-ignored |
| `json/fy2027-details/*.json` | 11,372 successful detail responses, retained locally and git-ignored |
| `lists/fy2027*/` | Local fetch progress and tracking files; counters may lag actual files |
| `fetch_nep_projects_paginated.py` | Listing fetcher |
| `fetch_nep_projects_details.py` | Per-project detail fetcher |
| `combine_nep_dumps.py` | Combines listing pages |

Source `amount` and `summary.totalAmount` are **thousands of pesos**. The combined summary's `445378063` means **₱445,378,063,000**. Verification outputs convert to integer pesos and keep the original snapshot separate from the printed NEP PDF hierarchy.

The native House JSON artifacts formerly stored here now live under `analysis/data/`.

Build the independent API hierarchy with:

```sh
python3 analysis/builders/build_dpwh_nep_api_tree.py
python3 analysis/builders/build_source_verification.py
```

The [API hierarchy](../analysis/data/dpwh_transparency_nep_tree.json) follows `pap1 → pap2 → pap3 → region → office → project code`. Its [audit](../analysis/data/dpwh_transparency_nep_tree_validation.json) retains 2,662 direct/recursive rollup checks, original listing page summaries, and detail-file checks. All 23 listing pages agree with the combined snapshot; all 11,372 detail responses match the listing identity, hierarchy fields, and amount. The retained details index 5,155 documents. The progress counter is a tracking snapshot, not the completeness audit.

Use the [verification viewer](../analysis/viewers/dpwh_nep_api_verification.html) to inspect this source independently. Matching the retained API summary certifies the snapshot arithmetic; complete coverage of the printed NEP budget still needs separate review.

After changing the API tree, run `python3 analysis/builders/build_current_pages.py`,
`python3 scripts/validate_current_pages.py`, and `python3 scripts/build_pages.py`
to refresh dependent embedded pages and manifests. Rebuilding from only the
committed combined listing cannot reproduce the local listing/detail audit;
retain those raw files to repeat its coverage checks. The listing has no
PS/MOOE/CO split. See [current source-verification workflow](../analysis/docs/source_hierarchy_verification.md).
