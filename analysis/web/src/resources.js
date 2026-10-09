/** Latest workable datasets and source PDFs for the Resources tab. */
export const resourceGroups = [
  {
    id: "methods",
    title: "Methods and finding links",
    blurb: "How PDF entries become audited datasets, and how to share comparison findings.",
    items: [
      {
        label: "From budget PDFs to auditable datasets",
        kind: "doc",
        path: "analysis/docs/pdf_budget_dataset_method.md",
        purpose: "General extraction and accounting approach, with House and NEP worked examples",
        coverage: "Agency-to-project paths, funding partitions, edge cases, source evidence and rebuild commands. Distinguishes native House extraction from NEP OCR evidence.",
      },
      {
        label: "Shareable searches and comparison findings",
        kind: "doc",
        path: "analysis/docs/shareable_findings.md",
        purpose: "URL settings for searches, filters, expanded records and source paths",
        coverage: "Includes optional region-independent candidates, with original source assignments flagged and strict matching as the default.",
      },
    ],
  },
  {
    id: "repos",
    title: "Referenced repositories",
    blurb:
      "Pinned external sources and this workbench. Public pages and APIs can change; retained commits and snapshots identify what was actually used.",
    items: [
      {
        label: "DPWH NEP / House FY2027 analysis (this workbench)",
        kind: "external",
        path: "https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS",
        purpose: "Canonical repository for the datasets, audits, and React workbench",
        coverage:
          "Hosted app: csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS. Source of the Resources catalog.",
      },
      {
        label: "kimileeee/gab-fy2027-dataset",
        kind: "external",
        path: "https://github.com/kimileeee/gab-fy2027-dataset/tree/1de94242a1342c7174a9efdce71301538dcf43e0",
        purpose: "Independent House GAB appropriation and drill-down extract used for cross-check",
        coverage:
          "Pinned commit 1de94242. Corroborates native 2nd/3rd-reading controls; does not replace the native House baselines. See the local cross-check report.",
      },
      {
        label: "GAB cross-check report (local)",
        kind: "doc",
        path: "analysis/docs/gab_fy2027_reference_crosscheck.md",
        purpose: "How the external GAB dataset compares to native House readings",
        coverage:
          "22 exact control agreements per reading, plus the ₱134M third-reading reallocation checks.",
      },
      {
        label: "ajamontesa/ph-budget-analysis",
        kind: "external",
        path: "https://github.com/ajamontesa/ph-budget-analysis/tree/558a56311dc510b513af2b18b13a49d55d501c02",
        purpose: "Pinned Philippine budget analysis submodule under reference/",
        coverage:
          "Commit 558a5631. Submodule path reference/ph-budget-analysis. Contextual only; does not determine the canonical NEP tree.",
      },
      {
        label: "ph-budget-analysis · reference site",
        kind: "external",
        path: "https://ajamontesa.github.io/ph-budget-analysis/index.html",
        purpose: "Published reference pages for agency and FY2027 assessments",
        coverage:
          "Includes DPWH, FY2027 NEP assessment, and FY2027 House assessment pages. Check stage and peso units before comparing figures.",
      },
      {
        label: "ph-budget-analysis · Compiled DPWH workbook",
        kind: "external",
        path: "https://github.com/ajamontesa/ph-budget-analysis/blob/558a56311dc510b513af2b18b13a49d55d501c02/data/Compiled_-_DPWH.xlsx",
        purpose: "Pinned Compiled DPWH workbook from the reference checkout",
        coverage: "Supplementary compilation; not the canonical NEP or House native trees.",
      },
      {
        label: "ph-budget-analysis · Compiled PAPs workbook",
        kind: "external",
        path: "https://github.com/ajamontesa/ph-budget-analysis/blob/558a56311dc510b513af2b18b13a49d55d501c02/data/Compiled_-_PAPs.xlsx",
        purpose: "Pinned Compiled PAPs workbook from the reference checkout",
        coverage: "Supplementary compilation; verify stage and units before use.",
      },
      {
        label: "csiiiv/dpwh-transparency-data-api-scraper",
        kind: "external",
        path: "https://github.com/csiiiv/dpwh-transparency-data-api-scraper/tree/de96ab393a069792964b086a7d155e7801909c2a",
        purpose: "Supplementary DPWH Transparency API scraper checkout",
        coverage:
          "Pinned commit de96ab39. The BetterGov NEP snapshot used here is fetched by this repo’s dpwh-transparency-nep-data scripts.",
      },
      {
        label: "BetterGov DPWH NEP API (FY2027 listing)",
        kind: "external",
        path: "https://api.dpwh.bettergov.ph/nep/projects?fiscalYear=2027&page=1&limit=100",
        purpose: "Live project-list endpoint behind the retained Transparency snapshot",
        coverage:
          "Comparisons use the committed fy2027-combined.json snapshot, not a live query. Incomplete vs full NEP budget.",
      },
    ],
  },
  {
    id: "pdfs",
    title: "Source PDFs",
    blurb:
      "Primary printed evidence. Page numbers in the datasets are one-based file pages. Certified workbench outputs still use the second-reading House copies; third-reading extracts are available for side-by-side checks.",
    items: [
      {
        label: "DBM NEP · Volume II-B (retained OCR)",
        kind: "pdf",
        path: "pdfs/NEP-2027-VOLUME-2B_OCR.pdf",
        purpose: "Executive proposal · DPWH detail source for the canonical NEP tree",
        coverage:
          "722 pages. Page 8 new appropriations; pp. 13–28 PS rows; pp. 115–690 PAP details. SHA-256 recorded in the canonical tree provenance. Packaged with the workbench site.",
      },
      {
        label: "DBM NEP · Volume I (retained OCR)",
        kind: "repo",
        path: "dbm-nep-data/NEP-2027-VOLUME-1_OCR.pdf",
        purpose: "Retained OCR of NEP Volume I for reference",
        coverage:
          "Committed in the repository; not packaged into the Pages site. Open from the GitHub tree or local checkout.",
      },
      {
        label: "DBM NEP · Volume II-A (retained OCR)",
        kind: "repo",
        path: "dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf",
        purpose: "Retained OCR of NEP Volume II-A for reference",
        coverage:
          "Committed in the repository; not packaged into the Pages site. Open from the GitHub tree or local checkout.",
      },
      {
        label: "DBM NEP · Volume III (retained OCR)",
        kind: "repo",
        path: "dbm-nep-data/NEP-2027-VOLUME-3_OCR.pdf",
        purpose: "Retained OCR of NEP Volume III for reference",
        coverage:
          "1,096 pages. Lightly recompressed (deflate/garbage collect) to stay under GitHub’s 100 MB limit; page count and extracted text spot-checks match the prior file. Not packaged into the Pages site.",
      },
      {
        label: "DBM NEP · Volume II-B (official publication)",
        kind: "external",
        path: "https://www.dbm.gov.ph/wp-content/uploads/NEP2027/NEP-2027-VOLUME-2B.pdf",
        purpose: "Official downloadable Volume II-B from DBM",
        coverage:
          "Publication PDF. The retained OCR copy has not been asserted byte-identical to this file.",
      },
      {
        label: "DBM · DPWH department summary",
        kind: "external",
        path: "https://www.dbm.gov.ph/wp-content/uploads/NEP2027/DPWH/DPWH.pdf",
        purpose: "Official DPWH department summary extract",
        coverage: "Different pagination from the retained Volume II-B OCR file.",
      },
      {
        label: "DBM · Details of DPWH programs/projects",
        kind: "external",
        path: "https://www.dbm.gov.ph/wp-content/uploads/NEP2027/DPWH/Details-of-DPWH.pdf",
        purpose: "Official DPWH program/project detail extract",
        coverage: "Different pagination from the retained Volume II-B OCR file.",
      },
      {
        label: "House GAB 2nd reading · Volume I-A",
        kind: "pdf",
        path: "HB_BUDGET/1%20-%20HB%2010858%20VOL%20IA.pdf",
        purpose: "House Volume I-A reference copy",
        coverage: "Present in the repository; current extraction is DPWH-only from I-B / I-C.",
      },
      {
        label: "House GAB 2nd reading · Volume I-B",
        kind: "pdf",
        path: "HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf",
        purpose: "DPWH summary controls for the certified native I-B tree",
        coverage:
          "PDF page 9 prints ₱654,102,015,000 new appropriations (₱586,941,661,000 operations).",
      },
      {
        label: "House GAB 2nd reading · Volume I-C",
        kind: "pdf",
        path: "HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf",
        purpose: "942-page DPWH project details · native named-project source",
        coverage:
          "Source for hb_dpwh_native_ic_projects.json. Titles retain raw constituent lines and PDF pages.",
      },
      {
        label: "House GAB 2nd reading · Volume II",
        kind: "pdf",
        path: "HB_BUDGET/4%20-%20HB%2010858%20VOL%20II.pdf",
        purpose: "House Volume II reference copy",
        coverage: "Present locally; current extraction is DPWH-only from I-B / I-C.",
      },
      {
        label: "House GAB 3rd reading · Volume I-A",
        kind: "pdf",
        path: "HB_BUDGET_3rd_reading/1-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-A.pdf",
        purpose: "Third-reading Volume I-A reference copy",
        coverage: "Present in the repository; current extraction is DPWH-only from I-B / I-C.",
      },
      {
        label: "House GAB 3rd reading · Volume I-B",
        kind: "pdf",
        path: "HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf",
        purpose: "Third-reading DPWH summary controls",
        coverage:
          "Same ₱654.102015B new-appropriations total as second reading; used by the 3rd-reading I-B extract.",
      },
      {
        label: "House GAB 3rd reading · Volume I-C",
        kind: "pdf",
        path: "HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf",
        purpose: "Third-reading DPWH project details",
        coverage:
          "Source for the 3rd-reading I-C extract and House reading-change comparison (₱134M reallocation).",
      },
      {
        label: "House GAB 3rd reading · Volume II",
        kind: "pdf",
        path: "HB_BUDGET_3rd_reading/4-HB%2010858%203RD%20READING%20VOL%20II.pdf",
        purpose: "Third-reading Volume II reference copy",
        coverage: "Present locally; current extraction is DPWH-only from I-B / I-C.",
      },
    ],
  },
  {
    id: "nep",
    title: "DBM NEP datasets",
    blurb:
      "Canonical hierarchy for new appropriations (automatic appropriations excluded). Integer Philippine pesos. Independent evidence review remains open.",
    workspace: "nep",
    items: [
      {
        label: "Canonical NEP tree",
        kind: "data",
        path: "analysis/nep_2027_tree.json",
        purpose: "NEP hierarchy and program/PAP controls",
        coverage:
          "₱642,612,015,000 total · 2,552 additive rollups balance exactly. Primary NEP baseline for comparisons.",
      },
      {
        label: "Atomic budget units",
        kind: "data",
        path: "analysis/nep_2027_budget_units.json",
        purpose: "Leaf units that reproduce the root without double-counting parents",
        coverage:
          "14,190 units. GOP/loan units partition project totals; they are not separate projects.",
      },
      {
        label: "Validation and repair ledger",
        kind: "data",
        path: "analysis/nep_2027_tree_validation.json",
        purpose: "Provenance, historical extraction repairs, and check results",
        coverage:
          "54 historical extraction repairs. Arithmetic balance alone does not certify OCR amounts.",
      },
      {
        label: "Native amount audit",
        kind: "data",
        path: "analysis/nep_2027_native_amount_audit.json",
        purpose: "Per-item native-text amount audit against the OCR PDF",
        coverage:
          "Supports the review queue after the per-item column reassessment.",
      },
      {
        label: "Review queue",
        kind: "data",
        path: "analysis/nep_2027_native_amount_review.json",
        purpose: "Actionable source checks still open for human review",
        coverage:
          "3,193 actionable checks plus two informational derived groups. Pending checks, not confirmed errors.",
      },
      {
        label: "Source projects",
        kind: "data",
        path: "analysis/nep_2027_source_projects.json",
        purpose: "Earlier NEP source-project listing for API coverage work",
        coverage:
          "Use with the canonical tree. Per-row PDF verification remains open before certified comparisons.",
      },
      {
        label: "Source audit",
        kind: "doc",
        path: "analysis/docs/nep_2027_source_audit.md",
        purpose: "Narrative audit of NEP source coverage and limits",
        coverage: "Companion to nep_2027_source_projects.json.",
      },
      {
        label: "API reconciliation",
        kind: "doc",
        path: "analysis/docs/nep_2027_api_reconciliation.md",
        purpose: "How the canonical NEP relates to the Transparency API snapshot",
        coverage: "Coverage reference only; the API is not the full NEP budget.",
      },
      {
        label: "Validation report",
        kind: "doc",
        path: "analysis/viewers/nep_2027_tree.md",
        purpose: "Method and validation notes for the canonical tree",
        coverage: "Human-readable companion to nep_2027_tree.json / validation JSON.",
      },
    ],
  },
  {
    id: "house",
    title: "House GAB datasets",
    blurb:
      "Native text-layer dual baseline: I-B for agency controls (PS/MOOE/CO) and I-C for named-project MOOE+CO detail. Replaces the OCR-era v5 candidate.",
    workspace: "house",
    items: [
      {
        label: "Native I-B control tree",
        kind: "data",
        path: "analysis/hb_dpwh_native_rollup.json",
        purpose: "Additive House control baseline from Volume I-B",
        coverage:
          "660/660 internal nodes balance across all four expenditure columns · 1,746 leaves reproduce ₱654.102015B · office granularity for local programs.",
      },
      {
        label: "Native I-B audit",
        kind: "doc",
        path: "analysis/docs/hb_native_ib_rollup_checks.md",
        purpose: "Human-readable I-B rollup and repair report",
        coverage: "Documents the additive control checks against printed totals.",
      },
      {
        label: "Native I-B machine audit",
        kind: "data",
        path: "analysis/hb_native_ib_rollup_audit.json",
        purpose: "Machine audit payload for the I-B tree",
        coverage: "Hashes, node counts, and check results for automation.",
      },
      {
        label: "Native I-C project tree",
        kind: "data",
        path: "analysis/hb_dpwh_native_ic_projects.json",
        purpose: "Named-project layer from Volume I-C",
        coverage:
          "15,972 named project leaves + 29 FAP totals · 3,380 office-node occurrences · 2,477/2,477 internals balance · MOOE+CO ₱639,179,718,000 · passes 56 independent I-B cross-volume checks.",
      },
      {
        label: "Native I-C audit",
        kind: "doc",
        path: "analysis/docs/hb_native_ic_rollup_checks.md",
        purpose: "Human-readable I-C rollup, repairs, and cross-volume checks",
        coverage:
          "Documents native repair of the former ₱5.596B OCR-era Convergence shortfall.",
      },
      {
        label: "Native I-C machine audit",
        kind: "data",
        path: "analysis/hb_dpwh_native_ic_rollup_audit.json",
        purpose: "Machine audit payload for the I-C tree",
        coverage: "Source/code hashes, repairs, and check tallies.",
      },
      {
        label: "3rd reading · Native I-B tree",
        kind: "data",
        path: "analysis/hb_dpwh_native_rollup_3rd_reading.json",
        purpose: "Side-by-side third-reading control extract",
        coverage:
          "Same ₱654.102015B new-appropriations total as second reading.",
      },
      {
        label: "3rd reading · Native I-C tree",
        kind: "data",
        path: "analysis/hb_dpwh_native_ic_projects_3rd_reading.json",
        purpose: "Side-by-side third-reading named-project extract",
        coverage:
          "₱134M reallocation from Support-to-Operations Right-of-Way into five Caloocan City projects (Flood Management +₱68M, Convergence BIP +₱66M).",
      },
      {
        label: "3rd reading · I-B machine audit",
        kind: "data",
        path: "analysis/hb_native_ib_rollup_audit_3rd_reading.json",
        purpose: "Machine audit for the third-reading I-B extract",
        coverage: "Companion to hb_dpwh_native_rollup_3rd_reading.json.",
      },
      {
        label: "3rd reading · I-C machine audit",
        kind: "data",
        path: "analysis/hb_dpwh_native_ic_rollup_audit_3rd_reading.json",
        purpose: "Machine audit for the third-reading I-C extract",
        coverage: "Companion to hb_dpwh_native_ic_projects_3rd_reading.json.",
      },
    ],
  },
  {
    id: "transparency",
    title: "DPWH Transparency NEP datasets",
    blurb:
      "Retained BetterGov / Transparency API snapshot. Incomplete coverage versus the full NEP budget; use as a listing baseline, not the executive proposal total.",
    workspace: "transparency",
    items: [
      {
        label: "API hierarchy tree",
        kind: "data",
        path: "analysis/dpwh_transparency_nep_tree.json",
        purpose: "Hierarchy built from the retained FY2027 API listing",
        coverage:
          "11,372 projects · ₱445,378,063,000 · all 2,662 derived grouping checks pass · release/document coverage still needs confirmation.",
      },
      {
        label: "API tree validation",
        kind: "data",
        path: "analysis/dpwh_transparency_nep_tree_validation.json",
        purpose: "Validation report for the Transparency hierarchy",
        coverage: "Derived grouping checks and audit metadata.",
      },
      {
        label: "FY2027 combined JSON snapshot",
        kind: "data",
        path: "analysis/fy2027-combined.json",
        purpose: "Raw saved BetterGov combined project rows",
        coverage:
          "11,372 project rows · ₱445,378,063,000. Separate incomplete coverage baseline; not the full NEP budget.",
      },
    ],
  },
  {
    id: "comparison",
    title: "Comparison outputs",
    blurb:
      "Workbench comparison payloads. Candidate matches remain provisional; unmatched rows alone do not establish insertions, removals, or policy changes.",
    workspace: "compare",
    items: [
      {
        label: "Stage trace",
        kind: "data",
        path: "analysis/stage_trace_2027.json",
        purpose: "PAP/project/listing-gap comparison across stages",
        coverage: "Powers the Compare stages workspace totals and tables.",
      },
      {
        label: "Source comparison",
        kind: "data",
        path: "analysis/source_comparison_2027.json",
        purpose: "House native I-C × NEP candidate pairing payload",
        coverage:
          "Printed budgets, PAP controls, coverage, and project candidates for House / NEP detail.",
      },
      {
        label: "PAP controls",
        kind: "data",
        path: "analysis/current_pap_controls.json",
        purpose: "Mapped House ↔ NEP PAP and FAP control rows",
        coverage: "Includes local PAPs plus the separate FAP control.",
      },
      {
        label: "Build/input manifest",
        kind: "data",
        path: "analysis/comparison_manifest.json",
        purpose: "Build timestamp, input versions, and matching method notes",
        coverage: "Records which House/NEP artifacts fed the comparison run.",
      },
      {
        label: "House reading changes",
        kind: "data",
        path: "analysis/house_reading_changes_2027.json",
        purpose: "Second- vs third-reading House project amount differences",
        coverage:
          "Includes the ₱134M Caloocan reallocation visible under Compare → House readings.",
      },
      {
        label: "Source verification overview",
        kind: "data",
        path: "analysis/source_verification_overview.json",
        purpose: "Home-page status cards for each independent source",
        coverage: "Rollup check counts, totals, and native I-C project-detail summary.",
      },
    ],
  },
];

export const kindLabel = {
  data: "JSON",
  doc: "Docs",
  pdf: "PDF",
  repo: "Repo",
  external: "Link",
};
