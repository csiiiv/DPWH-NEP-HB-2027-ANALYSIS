# Road and shell groupings — how same-project allocations are analyzed

Updated: **13 November 2026**. Methodology for `road_group_candidates_2027.json`
and the Analysis → **Groupings** tab (`#analysis?view=roadgroups`). Companion
documents: [data pipeline](data_pipeline.md) (how the comparison is built),
[data user guide](data_user_guide.md) (which dataset to pick),
[shareable findings](shareable_findings.md) (URL parameters per view).

## The question this analysis answers

Two budget documents list largely the same DPWH projects. After the matcher
pairs what it can, some rows remain unpaired on one side. The Groupings view
asks a narrower question than the global insertion/deletion queues: **when
unpaired rows sit inside a group of lookalike allocations on the same road or
place, does the group's own NEP supply explain them?**

A single ₱50M barangay road with no NEP counterpart might be a re-titled NEP
item. Fifty-eight allocations in one municipality where the only paired NEP
item is an ₱835M building is a different signal: the NEP never listed those
small works at all. Grouping makes that distinction visible.

## Where it sits in the pipeline

```text
source_comparison_2027.json          the matcher's committed output
        │  (every HGAB3 ↔ NEP comparison record, with match status)
        ▼
analysis/builders/build_road_groups.py
        │  groups, collapses pairs, classifies, rolls up
        ▼
analysis/data/road_group_candidates_2027.json   (schema_version 1)
        │
        ├── Analysis → Groupings tab (this view)
        └── road_group review flags on stage-trace rows
```

The builder never re-matches anything. It consumes the matcher's verdicts as
given and re-arranges them by shell — so this view can surface what the
dashboard did **not** book, but it can never contradict what the dashboard
**did** book.

## Step 1 — Build the group key

Every comparison record contributes its House side and/or NEP side to exactly
one group per side, keyed by **(funding zone, PAP, region, kind, shell)**. The
same road under different PAPs is deliberately two groups. Two kinds:

| Kind | Rows | Shell key | Why |
| --- | --- | --- | --- |
| `road` | title has parsed chainage spans and a `title_base_match_key` | chainage-stripped title base, normalized | segments of one corridor land together regardless of station runs |
| `place_shell` | everything else | work phrase + municipality + province (from the address-slot parser) | barangay / sitio / zone / street slots are **dropped** — that is the axis a single allocation gets salami-sliced along |

The title base comes from chainage parsing upstream
(`normalize_labels.py`): `parse_chainage` strips station runs
(`Sta. 1+040 – Sta. 3+200, K0127 …`) from the title, and the remainder is
normalized into `title_base_match_key`. Non-road titles go through
`parse_title_slots`, which fills named address slots from comma segments and
positional markers; the shell keeps only work + municipality + province, so
"Construction of Barangay Hall, Brgy. 7, Laoag City, Ilocos Norte" and the
same title for Brgy. 12 share one place shell.

A side that lands in a different shell than its pair (e.g. a relocated
municipality between readings) is still added somewhere — rows are never
dropped.

## Step 2 — Collapse to the final budget sheet

Group members model the **final sheet**, not the two source listings:

- **Attached pairs collapse** into one HGAB-anchored member. The NEP amount,
  NEP id and House−NEP delta ride along as provenance
  (`nep_amount_php`, `nep_id`, `delta_php`).
- **Unattached HGAB rows** stand alone.
- **NEP-only rows** remain as that shell's NEP supply (and appear in the
  deletion direction below).

"Attached" is the matcher's own set of committed statuses: `exact_candidate`,
`chainage_candidate`, `location_amendment_candidate`, `soft_match_candidate`,
`scope_amendment_candidate`, `segment_scope_candidate`. Per-member cost per km
(`amount_per_km_php`) is computed where a chainage length parsed.

## Step 3 — Two finding directions

For each group, with `paired` = attached House anchors, `leftover` =
unattached House rows, and `nep_only` = unpaired NEP rows:

**`hgab_leftover` (exhausted group)** — *unsupported insertion candidates*.
Requires: NEP supply existed, **every** NEP row is accounted for by a
collapsed pair, **and** unattached House rows remain. Reading: the House sheet
carries more allocations on this shell than the NEP ever listed, and there is
no NEP row left in the shell that could explain them.

**`nep_leftover`** — *deletion candidates*. Mirror conditions: pairs anchor
the shell, **no** House leftovers here, and NEP supply remains unmatched.
Reading: NEP items in this shell never received House funding — dropped or
re-titled. These overlap the global deletion queues; here they gain shell
context (roads with segments left unclaimed, shells where a lookalike was
funded instead).

Groups with unpaired supply on **both** sides are excluded from both
directions — the matcher's open-candidate queues cover them (see the Relations
view).

## Step 4 — Scale-pattern classification (insertion direction only)

Each exhausted group is classified by the scale relationship between the
paired NEP items and the leftovers:

```text
ratio = median(paired NEP amounts) / median(leftover amounts)

split_like          0.2 ≤ ratio ≤ 5      reads like one NEP allocation
                                         sliced into several lookalike rows
unsupplied_cluster  ratio > 5            the paired NEP item is far larger
                                         than every leftover — different work
                                         sharing the shell
micro_supplied      ratio < 0.2          reverse: a tiny paired NEP item
                                         beside large leftovers
```

If either side has no measurable amount the group defaults to `split_like`.
Thresholds (0.2 / 5.0) are heuristics for review triage, not statistical
claims.

## Current shape of the data

Built 2026-10-22 from the FY2027 retained comparison:

| Measure | Value |
| --- | --- |
| Shell groups total | 10,815 |
| …of which carry any NEP supply | 7,606 |
| Exhausted groups (insertion direction) | 487 (56 road · 431 place shell) |
| — `split_like` / `unsupplied_cluster` / `micro_supplied` | 447 · 21 · 19 |
| Unpaired HGAB rows (insertion candidates) | 1,244 worth **₱23.38B** |
| `nep_leftover` shells (deletion direction) | 140 |
| Unpaired NEP rows (deletion candidates) | 242 worth **₱12.20B** |

Region IV-A leads both directions (₱5.59B insertion · ₱4.69B deletion
context), followed by Region III and Region I on the insertion side. A
`region_summary` rollup in the sidecar conserves the group totals across both
directions.

## Worked examples

**Metro Cebu Expressway (Region VII · road · split_like)** — the largest
insertion signal: 2 unpaired HGAB rows worth ₱620M beside 1 collapsed pair,
scale-comparable. Reads like NEP-listed scope carried by the House in more,
smaller line items.

**Quirino Highway (road)** — the largest deletion signal: one NEP row worth
₱2.195B with the shell's House side fully paired elsewhere. Dropped or
re-titled at HGAB — review before calling it a cut.

**Laoag INSPIRE (Region I · place_shell · unsupplied_cluster)** — 58 final
rows in the shell; the single paired item is the ₱835M INSPIRE building
(exact match, delta 0), while 57 barangay-scale leftovers worth ₱609.6M sit
beside it. The ₱835M item is a genuine pair of *different work*; it is not
those leftovers' supply. This is exactly the case a flat
"same-municipality grouping" would blur.

## Reading the Groupings tab

`#analysis?view=roadgroups` renders the summary strip, a region rollup, the
insertion-candidate table (both filters apply) and the deletion-candidate
table (kind filter only — patterns classify the insertion direction).
Filters ride the URL, so links are shareable:

| Param | Values | Effect |
| --- | --- | --- |
| `kind` | `all` (default) · `road` · `place_shell` | both tables |
| `pattern` | `all` (default) · `split_like` · `unsupplied_cluster` · `micro_supplied` | insertion table |
| `table` | any tableId (via the `#` anchor) | scroll/highlight deep link |
| `shell` + `side` + `zone` + `pap` + `region` | full group key | member modal (`side=hgab` / `nep`) |

Example:
`#analysis?view=roadgroups&kind=road&pattern=split_like` reopens with both
filters applied (50 groups in the current build).

The member modal lists every final-sheet row with paired/unpaired status,
length, ₱/km and spans, and links into Compare stages with
`flag=group_exhausted` / `group_nep_leftover`. The same leftover rows carry a
`road_group` block on their stage-trace records, flagged
`insertion_candidate_group_exhausted` (House side) or
`deletion_candidate_group_house_paired` (NEP side), so the review context
follows the row everywhere it appears.

## Reusing the data

Everything below is downloadable without cloning the repo. Two URL styles
serve the same committed bytes: the **Pages site** (rendered dashboards, fast
CDN) and **raw GitHub** (stable for programmatic `fetch`/`curl`). Sizes are
for the current build.

### Datasets to pull

| Dataset | Size | Pages URL | Raw GitHub URL |
| --- | --- | --- | --- |
| This analysis (groups, region rollup, summary, manifest) | 2.1 MB | `…/analysis/road_group_candidates_2027.json` | [analysis/data/road_group_candidates_2027.json](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/road_group_candidates_2027.json) |
| Matcher input — one record per comparison pair with statuses | 45 MB | `…/analysis/source_comparison_2027.json` | [analysis/data/source_comparison_2027.json](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/source_comparison_2027.json) |
| Stage trace — per-row match status + `road_group` flags (57 MB) | 57 MB | `…/analysis/stage_trace_2027.json` | [analysis/data/stage_trace_2027.json](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/stage_trace_2027.json) |
| Full comparison, one CSV row per record (spreadsheet-friendly) | 8.6 MB | `…/analysis/dpwh_comparison_all_2027.csv` | [analysis/data/dpwh_comparison_all_2027.csv](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/dpwh_comparison_all_2027.csv) |
| Comparison manifest — scope, versions, matching method | small | `…/analysis/comparison_manifest.json` | [analysis/data/comparison_manifest.json](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/comparison_manifest.json) |
| Chainage units — every chainage-bearing row for ₱/km work | — | `…/analysis/chainage_units_2027.json` | [analysis/data/chainage_units_2027.json](https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/chainage_units_2027.json) |

Pages URLs are prefixed
`https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS` (e.g.
<https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/analysis/road_group_candidates_2027.json>);
raw URLs are prefixed
`https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main`.
The in-app equivalent is the **Sources workspace** (`#sources` → *DPWH ·
budget stages*), which lists the same files with per-item coverage notes.

### Sidecar field map

`road_group_candidates_2027.json` top level: `manifest` (schema version,
build timestamp, generator + input SHA-256 digests), `summary` (the counts
tabled above), `groups` (insertion direction, `state: hgab_leftover`),
`nep_leftover_groups` (deletion direction, `state: nep_leftover`) and
`region_summary` (rollup conserving both directions).

Group rows carry the key (`zone`, `pap`, `region`, `kind`, `shell`), counts
(`house_rows`, `nep_rows`, `paired_rows`, `leftover_house_rows`,
`leftover_nep_rows`), money (`leftover_amount_php`, `house_amount_php`,
`nep_amount_php`, `leftover_nep_amount_php`), the classification `pattern`,
and `members` — the final-sheet rows. Each member has `id`, `title`,
`amount_php`, `attached` (bool), `status` (the matcher's status), `chainages`
(`from`/`to`/`length_m`), `length_m`, `amount_per_km_php`, `pdf_page`, and —
on collapsed pairs — `nep_id`, `nep_amount_php`, `delta_php`. The insertion
direction also exposes `leftover_ids`; the deletion direction
`leftover_nep_ids`.

### Join recipes

The sidecar's leftover ids are the join keys back into the stage trace and
the comparison records. House ids look like `hb:ic:c12297` (Volume I-C
continuation row); NEP ids like `p561:r16` (NEP tree page:row).

**All 1,244 insertion-candidate rows with their stage-trace context:**

```python
import json, urllib.request

base = "https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/analysis/data/"
groups = json.load(urllib.request.urlopen(base + "road_group_candidates_2027.json"))
trace = json.load(urllib.request.urlopen(base + "stage_trace_2027.json"))

by_house_id = {r["house"]["id"]: r for r in trace["projects"] if r.get("house")}
candidates = [
    {"shell": g["shell"], "kind": g["kind"], "pattern": g["pattern"],
     "region": g["region"], "pap": g["pap"],
     "house_id": hid, "amount_php": by_house_id[hid]["house"]["amount_php"],
     "title": by_house_id[hid]["house"]["title"],
     "pdf_page": by_house_id[hid]["house"].get("pdf_page")}
    for g in groups["groups"] for hid in g["leftover_ids"]
]
print(len(candidates), "rows ·", sum(c["amount_php"] for c in candidates), "PHP")
```

**Deletion candidates (242 NEP rows)** — same pattern with
`nep_leftover_groups`, `leftover_nep_ids`, and `r["nep"]` on the trace.

**Pull one shell's members with provenance** (works for either direction):

```python
shell = next(g for g in groups["groups"] if g["shell"] == "metrocebuexpresswaycebu")
for m in shell["members"]:
    print(m["attached"], m["amount_php"], m["title"][:60],
          m.get("nep_amount_php"), m.get("delta_php"))
```

**Spreadsheet route:** `dpwh_comparison_all_2027.csv` opens directly in
Excel/Sheets; filter its flag/trace column for the grouping flags. For
re-grouping experiments (different shell keys, other thresholds), clone the
repo and edit `analysis/builders/build_road_groups.py` — the pattern
thresholds (`_SCALE_LO`, `_SCALE_HI`) and the slot-drop list are the tuning
knobs. Rebuild with `python3 analysis/builders/build_road_groups.py`; the
unit tests in `analysis/web/src/roadGroups.test.js` reconcile the sidecar
against the summary and the stage-trace flags.

### Reproducing the numbers in this doc

Every figure above derives from the sidecar's own `summary` block and
region_summary — after pulling the JSON, `summary["exhausted_groups"]` is
487, `summary["leftover_house_rows"]` is 1,244, `summary["leftover_amount_php"]`
is 23,381,722,000, and so on. The manifest's `built_at` timestamp and input
digest tell you whether the build you pulled matches the one described here
(current: 2026-10-22). If a rebuild upstream moves rows between groups, the
URLs keep serving the new build — pin a commit SHA in the raw URL (replace
`/main/` with `/<sha>/`) for a citable snapshot.

## Limitations and vocabulary

- **Candidates, never verdicts.** "Unsupported insertion candidate" and
  "deletion candidate" are review vocabulary. Identity between rows is
  proposed by grouping and matching, not certified; obtain coordinates,
  designs and procurement packages before alleging project splitting.
- **Group context is a lens, not a test.** A `split_like` pattern is where to
  look, not what happened. Titles can genuinely repeat (multi-barangay
  programs legitimately produce same-shell rows).
- **Counts are allocation records**, including grouped members — not unique
  projects across stages.
- **Same shell can appear under different PAPs** as distinct groups (the key
  includes PAP); the same road corridor can therefore surface more than once.
- **The scale thresholds are heuristics.** Median ratios ignore distribution
  shape; a bimodal group can classify by its middle.
- **Grouping follows the matcher.** Re-reading, re-titling or matcher changes
  upstream move rows between groups; the sidecar is rebuilt with the
  comparison and its manifest pins the input digest.
