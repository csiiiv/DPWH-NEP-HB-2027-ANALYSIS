# FY2027 DPWH data — user guide and primer

Updated: **11 October 2026**. A practical guide for analysts using this
repository's datasets in their own work: what each dataset contains, which one
to pick for a given question, how records link across sources, and the caveats
that keep conclusions honest.

Companion documents: [data pipeline](data_pipeline.md) (how everything is
built), [dataset structure and comparison gate](data_structure_and_crosscheck_design.md)
(design invariants), and the [workbench README](../README.md) (repo layout).
This guide is about **using the outputs**, not rebuilding them.

## The three budget sources in one paragraph

FY2027 DPWH appropriations exist in three independent electronic records:
the **DBM NEP** (executive proposal, Volume II-B PDF), the **House GAB**
(congressional bill, HB 10858 Volumes I-B summary and I-C project detail,
2nd and 3rd readings), and the **DPWH Transparency** listing (the public API
snapshot). They disagree in scope and totals — ₱642.6B NEP vs ₱586.9B House
operations vs ₱445.4B Transparency — so **no single dataset is "the budget."**
Every dataset below carries its source's own numbers, linked by candidate
matching rather than asserted identity.

## Quick chooser: which file answers my question?

| Question | Start with |
|---|---|
| "What did each source record for project/region/PAP X?" | `stage_trace_2027.json` — one row per comparison record with House (both readings), NEP and Transparency sides attached |
| "Show me NEP → House changes (amount deltas, new items, removals)" | `comparison_projects_2027.json` (SPA-ready) or `stage_trace_2027.json` (full) — filter by `house_match` / `trace` |
| "How did the House bill change between 2nd and 3rd reading?" | `house_reading_changes_2027.json` — `second` vs `third` per key, `delta_php` |
| "Which projects exist only in one source?" | `stage_trace_2027.json` filtered to `house_only_candidate` / `nep_only_candidate` |
| "Road lengths, price-per-km, chainage oddities" | `chainage_units_2027.json` — one unit per record with chainage, `length_m`, `length_review` |
| "The official NEP project list with amounts" | `nep_2027_source_projects.json` (source rows) or `nep_2027_tree.json` (full hierarchy) |
| "House project line items as printed in I-C" | `hb_dpwh_native_ic_projects.json` (3rd reading) / `..._3rd_reading.json` (2nd reading) |
| "PAP-level printed controls and coverage gaps" | `current_pap_controls.json` / `comparison_overview_2027.json` |
| "NEP items missing from the Transparency site" | `nep_2027_api_reconciliation.json` (`unpaired_source`) or `stage_trace_2027.json` `api_presence='nep_not_in_transparency'` |
| "Possible OCR/spelling pairs to review" | `normalization_candidates.json` and fuzzy rows tagged `diff_tags` in `stage_trace_2027.json` |

## Datasets

All paths are under `analysis/data/`. Amounts are **integer PHP** everywhere
(never floats). IDs are stable strings (`p589:r3` = NEP tree node, `hb:ic:c18561`
= House I-C node, `nep-…`/API ids for Transparency).

### 1. `stage_trace_2027.json` — the unified comparison table

The main analytical table: **17,745 rows**, one per comparison record
(House-anchored where a House reading exists, NEP-only rows otherwise).
Each row links every source that could be attached:

```jsonc
{
  "id": "…", "trace": "amount_same",          // combined lifecycle status
  "house_match": "exact_candidate",           // NEP↔House pairing status
  "api_presence": "paired",                   // Transparency coverage
  "reading_status": "same_amount",            // HGAB2↔HGAB3 outcome
  "house_minus_nep_php": 0,                   // House minus NEP amount
  "title": "…", "program": "…", "pap": "…", "region": "…", "zone": "local",
  "house": { … }, "nep": { … }, "api": { … }, // attached source records
  "suggestions": [                            // fuzzy NEP candidates (if any)
    {"confidence": 0.9487, "diff_tags": ["chainage_digit"], "nep": { … }}
  ],
  "reason": null                              // why a non-plain match attached
}
```

Key enum values:

- `house_match`: `exact_candidate` (9,668) · `chainage_candidate` (277) ·
  `fuzzy_candidate` (493) · `ambiguous` (5) · `house_unmatched` (5,827) ·
  `nep_unmatched` (1,475)
- `trace`: `amount_same` · `candidate_increase` / `candidate_decrease`
  (paired, amount differs) · `house_only_candidate` · `nep_only_candidate` ·
  `fuzzy_candidate` · `ambiguous` · plus `transparency_gap_then_*` /
  `outside_api_then_*` compounds
- `api_presence`: `paired` (11,372) · `nep_not_in_transparency` (23) ·
  `outside_api_scope` (25, mostly FAP) · `no_nep_anchor` (no NEP side to pair)
- `reading_status`: `same_amount` · `third_only` (new at 3rd reading) ·
  `repeated_key` · `no_house_record`

Side records (`house`, `nep`, `api`, suggestion `nep`) share a common shape:
`id`, `title`, `amount_php`, `region`, `office`, `office_canonical`,
`pap`/`pap_id`, `program`, `zone`, `pdf_page`, plus normalization annotations
(`title_match_key`, `title_base`, `chainages`, `chainage_length_review`).
NEP sides also carry `evidence` — the native-amount audit status
(`within_bbox_agreement`, `native_row_ambiguity`, `native_text_review`,
`nearby_alignment_candidate`, `not_checked`). House sides carry `funding_php`
(GOP/loan splits for FAP) and `source` (printed-row provenance).

**Use it for**: cross-source per-project analysis, insertion/deletion queues,
Transparency-gap hunting, fuzzy-pair review.

### 2. `comparison_projects_2027.json` — compact SPA payload

Same rows as the stage trace but compacted for the browser (redundant fields
inherited from the row are trimmed; the app re-hydrates them). Prefer the
stage trace for offline analysis; this file documents the browser contract.
`comparison_overview_2027.json` holds the SPA's headline summaries, PAP
controls, and Transparency gaps without the project rows.

### 3. `house_reading_changes_2027.json` — 2nd vs 3rd reading

16,272 keyed rows pairing the two House readings of HB 10858 I-C:
`second` / `third` records (title, amounts, assignments as printed),
`delta_php` (third − second), `match_basis` (the key that paired them —
normalized title + PAP + region + office + allocation kind + zone).
Use for congressional-amendment analysis: the five `third_only` additions,
amount changes, and the three `repeated_key` groups where no unique pairing
was possible.

### 4. `chainage_units_2027.json` — road-length sidecar

12,243 units (NEP 3,570 · HGAB2 4,334 · HGAB3 4,339), one per record with a
parseable chainage. Fields: `source` (`nep`/`hb2`/`hb3`), `title_base`,
`chainages` (spans with `meters_from`/`meters_to`/`length_m`), computed
`length_m`, `point_only`, and `length_review` (`absurd`/`repaired`/null —
flagged absurd or OCR-repaired lengths). Use for price-per-km work, length
outliers, and scope-vs-budget stories. Note `with_length: 11,920` — the rest
are point stations with no computable length.

### 5. `nep_2027_source_projects.json` and `nep_2027_tree.json`

The NEP side alone. `…_source_projects.json` is the flat source-row list
(11,420 project/funding rows with `pap3`, `region`, `office`, `allocation_kind`,
`zone`) plus `pap_controls` (the 45 printed PAP controls). `nep_2027_tree.json`
(94MB) is the full additive hierarchy: every node with `label`, `amount_php`,
`kind` (program/PAP/region/office/project/funding), `parent`, `children`, and
source bbox evidence. Use the tree when you need the document's own structure
(e.g., office subtotals inside a region) rather than the comparison grain.

### 6. `hb_dpwh_native_ic_projects.json` (and `…_3rd_reading.json`)

House I-C project detail as an additive tree, extracted natively from the PDF
(no OCR layer): programs → PAPs → regions → offices → projects, with FAP
funding partitions. 16,270 allocations, ₱586,941,661,000. The 2nd-reading
variant carries the same shape. `record_kind` distinguishes `region`
headings vs `allocation` leaves vs `fap_project`/`funding` nodes — **sum only
leaves of one kind**, or you will double-count.

### 7. Control/audit datasets

- `current_pap_controls.json` — per-PAP printed controls for all three
  sources plus coverage differences; the accounting spine.
- `nep_2027_api_reconciliation.json` — NEP ↔ Transparency pairing:
  `pap_checks`, `api_pairs`, `unpaired_source` (the 23 Transparency gaps),
  `unpaired_api` rows.
- `dpwh_transparency_nep_tree.json` (+`_validation`) — the API snapshot
  hierarchy and its derived-grouping checks.
- `normalization_candidates.json` — mined title/office normalization
  candidates (promote/reject/review triage) from fuzzy suggestions.
- `gab_reference_crosscheck.json` — cross-check against a pinned external
  GAB extraction (reference evidence, not a baseline).
- `hb_dpwh_native_rollup*.json`, `nep_2027_tree_validation.json`,
  `*_rollup_audit*.json` — internal arithmetic audits; consult before
  doubting a total, and read `nep_2027_native_amount_review.json` for the
  NEP amount-evidence queue.

## How records link across sources

Identity between House and NEP is **candidate matching**, never asserted:

1. **Exact candidates** — unique normalized title + region + PAP (FAP by
   program+zone). Normalization is token-wise (Brgy.↔Barangay, place-name OCR
   slips, structure-ID `O`→`0`, repeated-token collapse) and *additive*: the
   printed `title` is never rewritten.
2. **Stage-qualifier bridge** — `Construction (Completion)` ↔ `Construction`
   pairs when the stripped key is unique on both sides.
3. **Chainage candidates** — same road `title_base`, different station
   spans; attached with a reason (station-marker adjustment, length change,
   re-segmentation).
4. **Fuzzy suggestions** — similarity ≥ 0.85 in the same scope; **not
   attached**. Each carries `confidence` and now `diff_tags` classifying the
   residual title difference (`work_type_change`, `stage_qualifier`,
   `work_phrase_modifier`, `connector_word`, `city_suffix`,
   `facility_qualifier`, `unit_count`, `chainage_digit`,
   `structure_id_digit`, `same_gps_coordinates`,
   `different_gps_coordinates`, `parenthetical_modifier`,
   `location_subname`, `spelling_ocr`, `other_place_or_word`). Sub-flags
   refined from the old generic "different place/word": `location_subname`
   means the municipality/province tail matches and only the barangay or
   earlier location segment differs; `same_gps_coordinates` means the titles
   carry matching decimal coordinates (~4-decimal precision) with wording
   differences elsewhere; `parenthetical_modifier` means titles are identical
   outside parentheses (e.g. an added `(Phase 2)`); `work_phrase_modifier`
   covers one-sided "Preventive Maintenance along …" phrasing.

In the webapp, the **Flags** dropdown has a "Fuzzy title-difference tags"
group with one option per tag (`flag=diff:<tag>` in the URL), and the
analytics dialog's **Review flags** tab breaks down rows per tag with
plain-language explanations — each tag is its own review queue.
5. **Ambiguous** — duplicate keys; left unresolved on purpose.

`id` linkage: the same NEP record appears as `nep` on at most one row but can
appear inside many rows' `suggestions`. House readings link HGAB2↔HGAB3 by
their own key (`match_basis`), independent of NEP matching.

## Recipes

Load-and-filter patterns in plain Python (pandas works equally well — field
names are stable):

```python
import json
rows = json.load(open('analysis/data/stage_trace_2027.json'))['projects']

# 1. Amount changes between NEP and House (3rd reading)
changes = [r for r in rows if r['house_match'] == 'exact_candidate'
           and (r['house_minus_nep_php'] or 0) != 0]
print(len(changes), sum(r['house_minus_nep_php'] for r in changes))

# 2. Insertion candidates (House-only, no NEP suggestion)
insertions = [r for r in rows if r['trace'] == 'house_only_candidate'
              and not (r.get('suggestions') or [])]

# 3. NEP items missing from the Transparency site
gaps = [r for r in rows if r['api_presence'] == 'nep_not_in_transparency']

# 4. Fuzzy pairs whose only difference is an OCR/spelling slip
ocr = [r for r in rows if r['house_match'] == 'fuzzy_candidate'
       and (r['suggestions'][0].get('diff_tags') or []) == ['spelling_ocr']]

# 5. Biggest per-region House-vs-NEP swings (paired rows only)
by_region = {}
for r in rows:
    if r['house_match'] == 'exact_candidate' and r.get('region'):
        by_region.setdefault(r['region'], 0)
        by_region[r['region']] += r['house_minus_nep_php'] or 0
top = sorted(by_region.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]

# 6. Price-per-km outliers among NEP road units
units = json.load(open('analysis/data/chainage_units_2027.json'))['units']
nep_roads = [u for u in units if u['source'] == 'nep'
             and u.get('length_m') and u['length_m'] > 0]
ppk = sorted(nep_roads, key=lambda u: u['amount_php'] / (u['length_m']/1000),
             reverse=True)
```

Aggregation rules that keep totals right:

- House↔NEP deltas: sum `house_minus_nep_php` **only over paired rows**
  (`exact_candidate` + `chainage_candidate`).
- Reading deltas: sum `delta_php` over `house_reading_changes_2027.json` rows.
- Source totals: use each dataset's own summary (e.g.
  `summary.nep_printed_php`, `readingSummary`), never a filtered subset.
- Trees: sum leaves of a single `kind` only; project totals already include
  their funding children.

## Caveats — read before publishing anything

1. **Matching is provisional.** `exact_candidate` is a review candidate, not
   a certified identity. Zero pairs are manually certified in this run
   (`reviewed_pairs: 0`). Unmatched ≠ insertion; NEP-only ≠ deletion.
2. **Amounts don't prove identity.** Equal amounts paired by unique title are
   still candidates; different amounts on a paired row don't invalidate the
   pairing. `Amount does not determine identity` is a build invariant.
3. **NEP amount evidence is graded.** Check `evidence` /
   `nep_2027_native_amount_review.json` before quoting a single NEP amount:
   3,193 printed-row checks are still open (3,149 ambiguous row areas, 28
   text disagreements, 14 alignment candidates, 2 summary controls).
4. **Transparency coverage is open.** "Not in Transparency" is a listing-gap
   observation, not a finding of concealment; FAP sits outside the API scope
   by design (25 rows `outside_api_scope`).
5. **Scope differences are real, not errors.** NEP includes GAS/S2O that the
   House operations extract does not; the House bill adds ₱11.49B at printed
   total. Compare within one scope (the files separate `zone`, program and
   PAP for exactly this reason).
6. **Chainage lengths are parsed, not authoritative.** `length_review:
   'absurd'` flags OCR-damaged spans; treat repaired lengths as provisional.
7. **Region/office labels are per-source.** A paired row can carry different
   regions/offices per side; filters in the app use the row-level (House)
   assignment. Don't infer assignment changes from matching alone.
8. **Don't re-derive match keys ad hoc.** Use the shipped
   `title_match_key`/`office_canonical` annotations; if you need new rules,
   mine them (`mine_normalization_candidates.py`) and rebuild rather than
   patching data downstream.

## Reproducibility

Every dataset carries a manifest with SHA-256 hashes of inputs and
generators (`manifest.inputs`, `manifest.generator`) — a stale mix fails
validation loudly:

```sh
python scripts/validate_current_pages.py      # freshness + accounting gate
python -m unittest discover -s analysis/tests # full suite
```

To cite a dataset, cite the manifest `built_at`, the generator commit, and
the source PDF hashes. The workbench SPA
([live](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)) renders these
same files; use its share links (they encode filters in the URL hash) to
point collaborators at an exact filtered view.
