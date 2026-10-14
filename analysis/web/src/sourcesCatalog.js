// Shareable, normalized dataset catalog for the Sources workspace.
//
// Every entry names the canonical repository path (linked on GitHub), what the
// dataset contains, how it can be used, and its documented limits. `site`
// marks artifacts that are also packaged with the hosted workbench and can be
// downloaded from the deployed site; everything else is repository-only.
// `kind` drives the link target and badge: repo → GitHub blob, data → packaged
// site download, doc → GitHub markdown, external → outside link.
export const sourceGroups = [
  {
    id: "about",
    title: "How to use these datasets",
    blurb:
      "All artifacts live in one public repository. Each dataset is rebuilt deterministically from the retained source PDFs; machine audits record the checks each rebuild passes.",
    items: [
      {
        label: "Repository root",
        kind: "external",
        path: "https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS",
        purpose: "Datasets, extraction scripts, audits, tests, and the React workbench in one place",
        coverage:
          "Hosted workbench: csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS. Clone to rebuild every artifact from source PDFs; npm run dev serves a local copy.",
      },
      {
        label: "From budget PDFs to auditable datasets",
        kind: "doc",
        path: "analysis/docs/pdf_budget_dataset_method.md",
        purpose: "The shared extraction and accounting method behind every workspace",
        coverage:
          "Agency-to-project paths, funding partitions, edge cases, source evidence, and rebuild commands, with House and NEP worked examples.",
      },
      {
        label: "Conventions and caveats",
        kind: "text",
        purpose: "Reading the catalogs below safely",
        coverage:
          "Amounts are integer Philippine pesos, new appropriations only. Candidate cross-document pairs are provisional, never certified insertions or deletions. House legislative readings are not independently authenticated. Each dataset's machine audit JSON records its own checks; provenance fields tie every row to a source PDF page.",
      },
    ],
  },
  {
    id: "dpwh",
    title: "DPWH · budget stages",
    blurb:
      "Native House GAB (I-B controls, I-C named projects), canonical DBM NEP tree, and the retained Transparency API snapshot — the three DPWH baselines plus their comparison outputs.",
    workspace: "compare",
    items: [
      {
        label: "Native House I-C project tree (2nd reading)",
        kind: "repo",
        path: "analysis/data/hb_dpwh_native_ic_projects.json",
        purpose: "Named-project layer from House Volume I-C: 15,972 project leaves + 29 FAP totals with titles, amounts, offices, and PDF page references",
        coverage:
          "2,686/2,686 internal nodes balance · MOOE+CO ₱639,179,718,000 · passes 56 independent I-B cross-volume checks. Primary House baseline for comparisons.",
      },
      {
        label: "Native House I-C project tree (3rd reading)",
        kind: "repo",
        path: "analysis/data/hb_dpwh_native_ic_projects_3rd_reading.json",
        purpose: "Side-by-side third-reading named-project extract for reading-change analysis",
        coverage:
          "Captures the ₱134M reallocation from Support-to-Operations Right-of-Way into five Caloocan City projects.",
      },
      {
        label: "Native House I-B control tree (2nd reading)",
        kind: "repo",
        path: "analysis/data/hb_dpwh_native_rollup.json",
        purpose: "Additive control baseline from Volume I-B: agency → program → project with all four expenditure columns",
        coverage:
          "660/660 internal nodes balance · 1,746 leaves reproduce ₱654.102015B new appropriations.",
      },
      {
        label: "Canonical NEP tree",
        kind: "repo",
        path: "analysis/data/nep_2027_tree.json",
        purpose: "DBM NEP hierarchy and program/PAP controls for new appropriations",
        coverage:
          "₱642,612,015,000 total · 2,552 additive rollups balance exactly. Primary NEP baseline.",
      },
      {
        label: "NEP atomic budget units",
        kind: "repo",
        path: "analysis/data/nep_2027_budget_units.json",
        purpose: "Leaf units that reproduce the NEP root without double-counting parents",
        coverage: "14,190 units. GOP/loan units partition project totals; they are not separate projects.",
      },
      {
        label: "Transparency API snapshot (FY2027)",
        kind: "repo",
        path: "analysis/data/fy2027-combined.json",
        purpose: "Retained BetterGov/DPWH Transparency project listing — 11,372 rows, ₱445,378,063,000",
        coverage:
          "Incomplete coverage versus the full NEP budget; use as a listing baseline. A derived hierarchy and its validation report sit beside it.",
      },
      {
        label: "Stage trace (comparison across stages)",
        kind: "repo",
        path: "analysis/data/stage_trace_2027.json",
        purpose: "Per-project records joining Transparency, NEP, HGAB2, and HGAB3 with match status and evidence",
        coverage:
          "Powers Compare stages. Candidate matches stay provisional; unmatched rows alone do not establish policy changes.",
      },
      {
        label: "House reading changes",
        kind: "repo",
        path: "analysis/data/house_reading_changes_2027.json",
        purpose: "Second- vs third-reading House project amount differences",
        coverage: "Includes the ₱134M Caloocan reallocation with per-project before/after amounts.",
      },
    ],
  },
  {
    id: "fmr",
    title: "DA · farm-to-market roads",
    blurb:
      "Both FMR annexes extracted natively, with normalized coordinates, PSGC geocoding, and review flags. The two documents are never merged; comparisons live in the workbench.",
    workspace: "fmr/compare",
    items: [
      {
        label: "House FMR final dataset",
        kind: "repo",
        path: "other-analysis/data/hgab_fmr_final_dataset.json",
        purpose: "One JSON release artifact for the House FMR annex: 964 projects, ₱19,628,100,000",
        coverage:
          "Per project: title, amount, region, review flags, raw coordinate text, normalized per-segment coordinates, source PDF/page/bbox lineage, and PSGC geocoding (PSA 2023) with location-agreement classification.",
      },
      {
        label: "NEP FMR final dataset",
        kind: "repo",
        path: "other-analysis/data/nep_fmr_final_dataset.json",
        purpose: "One JSON release artifact for the NEP FMR annex: 704 projects, ₱16,000,000,000",
        coverage:
          "Same schema as the House artifact. All 16 regional totals and the independent NEP Volume I controls reconcile.",
      },
      {
        label: "FMR shareable bundle (CSV set + 7z archive)",
        kind: "data",
        path: "other-analysis/data/shareable/fmr_data.7z",
        purpose: "Compact download of the normalized CSV layers: projects, segments, points, and audits for both documents",
        coverage:
          "Accompanied in-repo by per-file CSVs and FMR_DATA_README.md describing every column. Rebuilt by build_fmr_final_dataset.py.",
      },
      {
        label: "FMR workbench payload",
        kind: "data",
        path: "other-analysis/data/fmr_workbench.json",
        purpose: "The compared dataset the FMR workspace renders: both schedules, pairing candidates, and provenance",
        coverage:
          "Candidate pairs remain provisional. Both source IDs and PDF references are retained on every row.",
      },
      {
        label: "Coordinate review flags and audits",
        kind: "doc",
        path: "other-analysis/FMR_COORDINATE_REVIEW_FLAGS.md",
        purpose: "What each coordinate flag means and how flagged cells were reviewed against the PDFs",
        coverage:
          "950/964 House and 696/704 NEP projects normalize cleanly; the remainder carry documented printed-source anomalies with PSGC cross-validation.",
      },
    ],
  },
  {
    id: "hfep",
    title: "DOH · health facilities",
    blurb:
      "HFEP capital-outlay annexes from both documents with per-cell provenance and a documented printed-defect ledger. No coordinates printed; facility identity is source-local.",
    workspace: "hfep/home",
    items: [
      {
        label: "HGAB HFEP facilities and controls",
        kind: "repo",
        path: "analysis-hfep/data/hgab_hfep_data_list.json",
        purpose: "House HFEP consolidated dataset: 513 facility rows and 312 controls with provenance",
        coverage:
          "₱10,021,659,000 capital outlays; all 311 internal controls reconcile on all four funding columns. Facility CSV and audit JSON sit beside it.",
      },
      {
        label: "NEP HFEP data list",
        kind: "repo",
        path: "analysis-hfep/data/nep_hfep_data_list.json",
        purpose: "NEP HFEP consolidated dataset: 464 items + 348 controls, PP-StructureV3-token-based with per-cell amount lineage",
        coverage:
          "₱14,472,659,000 printed total; 342/347 controls reconcile, the other 5 trace to one documented printed defect (missing ₱140,000 Metro Manila row).",
      },
      {
        label: "HFEP method and extraction notes",
        kind: "doc",
        path: "analysis-hfep/HFEP_EXTRACTION.md",
        purpose: "How each annex was extracted, reconciled, and audited",
        coverage:
          "Covers the HGAB ruled-band native extractor and the NEP OCR pipeline with its VL cross-check. Per-document accounting stays separate by design.",
      },
      {
        label: "HFEP workbench payload",
        kind: "data",
        path: "other-analysis/data/hfep_workbench.json",
        purpose: "The compared dataset behind the HFEP workspace",
        coverage:
          "341 title-similarity candidate pairs are proposals within the same region and province, not certified matches.",
      },
    ],
  },
  {
    id: "nia",
    title: "NIA · irrigation",
    blurb:
      "The irrigation annex from both documents under six sub-programs, with sub-program controls that reconcile to the agency table and an AI-monitoring lens.",
    workspace: "nia/home",
    items: [
      {
        label: "HGAB NIA projects and tree",
        kind: "repo",
        path: "analysis-nia/data/hgab_nia_dataset.json",
        purpose: "House irrigation annex dataset: 828 project line items under six sub-program controls",
        coverage:
          "₱17,999,305,000; every sub-program sum reconciles and agrees with the independently read agency table, including the CARP-linked ₱698,067,000 row. Source-row JSON, CSVs, and audit beside it.",
      },
      {
        label: "NEP NIA projects and tree",
        kind: "repo",
        path: "analysis-nia/data/nep_nia_dataset.json",
        purpose: "NEP irrigation annex dataset: 791 rows for comparison",
        coverage:
          "₱17,598,181,000. The ₱401,124,000 House−NEP difference and 509 provisional unique-title candidate pairs are analyzed in the workspace.",
      },
      {
        label: "NIA workbench payload",
        kind: "data",
        path: "analysis-nia/data/nia_workbench.json",
        purpose: "The compared dataset the NIA workspace renders, including AI-monitoring classification",
        coverage:
          "Separates NEP OCR title variants (Al/AL/AT → AI Monitoring) while keeping original titles and PDF evidence intact.",
      },
      {
        label: "NIA extraction guide",
        kind: "doc",
        path: "analysis-nia/README.md",
        purpose: "Extraction method, engineering worklog, and reconciliation tables",
        coverage: "PDF pages 896–941 of Volume I-B; per-sub-program control reconciliation and checks.",
      },
    ],
  },
  {
    id: "geo",
    title: "Geolocation · GPS inventory",
    blurb:
      "Cross-dataset inventory of coordinate text embedded in budget records, plus the geocoded layers the map workspace renders.",
    workspace: "geo/map",
    items: [
      {
        label: "GPS inventory (all datasets)",
        kind: "repo",
        path: "gps-analysis/data/gps_inventory.json",
        purpose: "Which budget records print coordinates, in which notation, from every annex scanned",
        coverage:
          "Decimal pairs, DMS, START/END cells, axis labels, and common OCR variants, tagged per source dataset. CSV hit list and summary JSON beside it.",
      },
      {
        label: "Geolocation workbench payload",
        kind: "data",
        path: "gps-analysis/data/gps_workbench.json",
        purpose: "Geocoded overlay points behind the map workspace: FMR segments, DPWH title coordinates, and PSGC assignments",
        coverage:
          "Built by build_gps_workbench.py from the provenance-certified FMR pipelines; review flags carried through.",
      },
      {
        label: "GPS analysis guide",
        kind: "doc",
        path: "gps-analysis/README.md",
        purpose: "Scanner design, run commands, and dataset registry",
        coverage: "Explains why FMR annexes dominate and how DPWH title-embedded coordinates were parsed.",
      },
    ],
  },
  {
    id: "comparison",
    title: "Workbench payloads (packaged with the site)",
    blurb:
      "Derived files the hosted app loads. Useful for reproducing workbench numbers without rebuilding from scratch; canonical inputs remain the repository datasets above.",
    items: [
      {
        label: "Overview summary",
        kind: "data",
        path: "analysis/main_overview_2027.json",
        purpose: "Landing-page insertion/deletion/adjustment summaries per workspace",
        coverage: "Small JSON with counts, amounts, and links; regenerated on every build.",
      },
      {
        label: "Comparison overview + projects",
        kind: "data",
        path: "analysis/comparison_overview_2027.json",
        purpose: "PAP totals, headline analytics, and Highlights data (≈1.9 MB)",
        coverage:
          "Project records lazily load comparison_projects_2027.json (≈50 MB) with full source records and grouped members. Both carry input SHA-256 hashes; mixed-build pairs are rejected.",
      },
      {
        label: "Chainage units benchmark",
        kind: "data",
        path: "analysis/chainage_units_2027.json",
        purpose: "Every chainage-bearing allocation unit across DBM NEP, HGAB2, and HGAB3 for ₱/km benchmarking",
        coverage: "Powers Analysis → Chainage peer benchmarks and outlier screens.",
      },
      {
        label: "Road grouping candidates",
        kind: "data",
        path: "analysis/road_group_candidates_2027.json",
        purpose: "Same-shell groups with unpaired House (insertion) and unpaired NEP (deletion) candidates",
        coverage: "₱23.4B insertion candidates · ₱12.2B deletion candidates across 627 shells. Powers Analysis → Groupings.",
      },
    ],
  },
  {
    id: "sources",
    title: "Source PDFs",
    blurb:
      "Primary printed evidence. Dataset page numbers are one-based file pages into these retained copies; page references resolve in the workbench PDF viewer.",
    items: [
      {
        label: "House GAB 2nd reading · Volumes I-A to II",
        kind: "repo",
        path: "HB_BUDGET",
        purpose: "HB 10858 working copy: I-B summary controls, I-C DPWH project details (942 pp)",
        coverage:
          "PDF page 9 prints ₱654,102,015,000 new appropriations (₱586,941,661,000 operations). Legislative reading not independently authenticated.",
      },
      {
        label: "House GAB 3rd reading · Volumes I-A to II",
        kind: "repo",
        path: "HB_BUDGET_3rd_reading",
        purpose: "Third-reading copies used for the reading-change comparison",
        coverage: "Same ₱654.102015B total as second reading; source of the ₱134M Caloocan reallocation checks.",
      },
      {
        label: "DBM NEP · Volume II-B (retained OCR)",
        kind: "data",
        path: "pdfs/NEP-2027-VOLUME-2B_OCR.pdf",
        purpose: "Executive proposal DPWH detail — source for the canonical NEP tree",
        coverage:
          "722 pages. Page 8 new appropriations; pp. 13–28 PS rows; pp. 115–690 PAP details. SHA-256 recorded in tree provenance.",
      },
      {
        label: "DBM NEP · Volumes I, II-A, III",
        kind: "repo",
        path: "dbm-nep-data",
        purpose: "Retained OCR of the remaining NEP volumes",
        coverage: "Volume III lightly recompressed under GitHub's 100 MB limit; page counts and text spot-checks match.",
      },
      {
        label: "Annex PDFs (FMR, HFEP, NIA)",
        kind: "repo",
        path: "dbm-other-nep-line-data",
        purpose: "Standalone NEP annex prints scanned for the FMR/HFEP extractions",
        coverage: "Includes FMR.pdf and HFEP_2.pdf (Volume II-A PDF 727–739) used by the annex pipelines.",
      },
    ],
  },
];

export const kindLabel = {
  data: "Download",
  repo: "GitHub",
  doc: "Docs",
  external: "Link",
  text: "Note",
};
