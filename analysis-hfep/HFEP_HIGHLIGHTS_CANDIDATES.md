# HFEP Highlights — what we can build

Planning note only. No UI or data build yet.

Audience prompt: citizen-facing stories about where HFEP money goes, what
changed between NEP and House, and what patterns deserve a closer look.

Source: `other-analysis/data/hfep_workbench.json` (House I-B vs
NEP II-A HFEP capital-outlay annexes; both include national and LGU facilities). Existing thin cards live in
`analysis/web/src/HfepApp.jsx` (`Highlights`); this list is the fuller set
the citizen prompt can support.

## Available evidence (what the dataset already has)

| Evidence | Status |
| --- | --- |
| Printed annex controls by funding column (infra / med equip / motor vehicle / total) | Yes |
| Category → subcategory → region → province → facility trees | Yes |
| Facility line items with PDF page sources | Yes |
| Column-total reconciliation House vs NEP | Yes (`comparison.column_totals`) |
| Title-similarity pairs (≥0.95, mostly 1.0) with per-column amounts | Yes (341 pairs) |
| House-only / NEP-only facilities | Yes (172 / 123) |
| Line-item record view (added / dropped / revised; column switches) | Yes (Compare) |
| Documented NEP ₱140,000 Metro Manila medical-equipment overhang | Yes |
| Agency PAP CO check (annex = capital outlay; MOOE outside) | Yes |
| OCR / interpretation flags on NEP rows | Yes (small set) |
| Repeated facility total bands | Computable from facility ledgers |
| Regional / category concentration | Computable from controls + path labels |
| National vs LGU population gap | Partial — scopes differ by design; not a clean matched universe |

Not available today (do not plan Highlights that require them):

- Certified project identity across annexes (pairs are suggestions)
- HGAB 2nd vs 3rd HFEP differences (House annex text is identical across readings)
- Delivery, staffing, utilization, or unit-cost proof beyond printed amounts
- Map geometry

## Snapshot numbers (for ranking)

| Fact | Figure |
| --- | ---: |
| House annex control | ₱10.02B · 513 facilities |
| NEP annex control | ₱14.47B · 464 facilities |
| Control gap (NEP − House) | ₱4.45B |
| Infrastructure gap | ₱1.40B |
| Medical equipment gap | ₱2.93B |
| Motor vehicle gap | ₱0.12B |
| Matched pairs | 341 (331 exact title) |
| Pairs with total change | 89 |
| House-only facilities | 172 · ~₱2.40B |
| NEP-only facilities | 123 · ~₱6.67B |
| NEP DOH Hospitals share | ₱9.51B of ₱14.47B |
| House LGU Hospitals share | ₱5.56B of ₱10.02B |
| Single motor-vehicle row | DOH Central Office (NEP ₱252M / House ₱130.7M) |

## Candidate story angles (ranked)

Suggested 8–10. Each can get a card + unique modal per the prompt.

### 1. `funding-mix` — Medical equipment carries most of the annex gap

- **Citizen question:** Where did the extra NEP money go by funding type?
- **Claim shape:** NEP is ₱4.45B above House; medical equipment alone is ₱2.93B of that.
- **Card:** control totals for all four columns; short mix note (NEP ~51% infra / 47% med / 2% vehicles).
- **Modal:** printed control reconciliation; column breakdown; optional CSV of column totals; PDF links to annex title / agency pages.
- **href:** `#hfep/compare`
- **Optionals:** Share link, multi-stage columns, workbench continue link.
- **Upgrade of:** current `lgu-split` (keep population note, lead with money mix).

### 2. `doh-hospitals` — DOH hospitals dominate the NEP book

- **Citizen question:** Which facility class gets the money?
- **Claim shape:** NEP puts ₱9.51B in DOH Hospitals vs ₱2.43B in LGU Hospitals; House flips the weight toward LGU Hospitals (₱5.56B).
- **Card:** category controls side by side.
- **Modal:** category comparison table; top DOH hospital facilities; nested drill-down category → facilities; PDF on selected rows.
- **href:** `#hfep/analysis` or NEP tree on category 3.
- **Optionals:** search/sort/pagination, Share, PDF viewer modal.

### 3. `big-facilities` — A few named hospitals absorb huge blocks

- **Citizen question:** Which specific facilities hold the largest checks?
- **Claim shape:** Philippine Cancer Center ₱900M (NEP-only); DOH Central Office ₱827M; several ₱200–350M DOH hospitals.
- **Card:** top 3–5 names with amounts.
- **Modal:** ranked facility table with column split; worked example panel; PDF page viewer per row.
- **href:** Compare filtered to those titles / NEP analysis.
- **Optionals:** worked example, PDF modal, CSV export.

### 4. `pair-revisions` — Same-name facilities, different pesos

- **Citizen question:** For facilities that look like the same place, what did the House change?
- **Claim shape:** 89 of 341 pairs change totals; large moves include Dr. Jose N. Rodriguez (+₱460M House), Laoag City General (+₱258M), Davao Occidental (−₱175M House vs NEP), West Visayas State University Medical Center (₱200M House infra vs ₱100M NEP med equip).
- **Card:** count of changed pairs + largest absolute delta example.
- **Modal:** changed-pair records with House/NEP/Δ columns; worked example with side-by-side sources; PDF links both sides.
- **href:** `#hfep/compare` with changed filter.
- **Optionals:** search/sort/pagination, worked example, PDF modals, CSV.

### 5. `column-switch` — Money moves between infra and equipment

- **Citizen question:** Is the change real funding, or just which column it sits in?
- **Claim shape:** WVSU Medical Center and at least two clear column switches (Bataan General, Passi City Hospital); Compare already treats column switches as drop+add records, not silent revisions.
- **Card:** one concrete example with before/after column.
- **Modal:** record-level panel of column switches; side-by-side worked example; PDF pages.
- **href:** Compare record view / q= facility name.
- **Optionals:** worked example, PDF modal, Share.

### 6. `house-only` — House adds facilities NEP does not list

- **Citizen question:** What did the House put in that is not in the executive annex?
- **Claim shape:** 172 House-only facilities · ~₱2.40B; large examples include Cauayan City Medical Center ₱360M.
- **Card:** count + amount + top name.
- **Modal:** House-only table by amount; category/region rollups; PDF links.
- **href:** Compare house-only filter.
- **Optionals:** CSV, search/sort, Share.
- **Note:** both schedules include national and LGU facilities. Category allocations, titles and funding columns differ; unmatched facilities remain candidates, not certified additions.

### 7. `nep-only` — NEP funds national facilities House annex omits

- **Citizen question:** What national / non-LGU money sits only in NEP?
- **Claim shape:** 123 NEP-only · ~₱6.67B; Philippine Cancer Center ₱900M, Jose B. Lingad ₱350M, Vicente Sotto ₱320M, etc.
- **Card:** amount + top national names.
- **Modal:** NEP-only table; split by category (DOH Hospitals vs others); PDF links.
- **href:** Compare nep-only filter.
- **Optionals:** nested category drill-down, CSV, Share.
- **Pairs with #6** as the “two populations” story citizens need in money terms.

### 8. `central-office-vehicles` — One row holds every motor vehicle peso

- **Citizen question:** Who gets the vehicle money?
- **Claim shape:** Motor vehicle is a single DOH Central Office line in both annexes (NEP ₱252M, House ₱130.7M); that row also carries large medical-equipment funding.
- **Card:** vehicle totals + the one facility name.
- **Modal:** that facility’s four columns across stages; PDF pages; prompt about fleet plan / beneficiaries.
- **href:** Compare q=`DOH Central Office`.
- **Optionals:** worked example, PDF modal.

### 9. `repeated-amounts` — Standard packages show up as repeated totals

- **Citizen question:** Are many facilities getting the same standard allotment?
- **Claim shape:** NEP has tight bands (e.g. 35× ₱3.24M, 30× ₱2.9M, 22× ₱50M); House has 49× ₱500K, many ₱10–50M repeats.
- **Card:** strongest band count × amount.
- **Modal:** repeated-amount bands; member facilities; PDF on sample rows.
- **href:** Analysis or Compare q= amount / band filter if added.
- **Optionals:** search/sort/pagination, CSV.
- **Pattern lead** from analysis results (prompt’s “look into patterns” clause).

### 10. `regional-concentration` — Money clusters in a few regions / Metro Manila

- **Citizen question:** Which places get the most?
- **Claim shape:** Region/province controls and path rollups show heavy NCR / Metro Manila and a short list of high-total regions (Region III, X, VII, I, etc.). Exact ranking should use printed region controls, not improvised path parsing.
- **Card:** top 3 region controls + share of annex.
- **Modal:** region table; drill-down region → facilities/PAPs; PDF on controls.
- **href:** `#hfep/analysis` region view / NEP tree.
- **Optionals:** nested drill-downs, Share, PDF modal.

### 11. `nep-defect` — ₱140,000 ghost in Metro Manila medical equipment *(keep, demote)*

- **Citizen question:** Do the printed controls match the facility list?
- **Claim shape:** Documented ₱140K overhang from Metro Manila province control up to annex title (already implemented).
- **Why demote:** Real and documentable, but small money vs citizen ranking by pesos at stake.
- **Modal:** existing overhang chain table + PDF; keep as integrity / trust story.
- **href:** NEP tree `nep_hfep:p2:r47`.

### 12. `agency-check` — Annex is the capital-outlay slice *(keep as supporting, not lead)*

- **Citizen question:** Is this the whole HFEP budget?
- **Claim shape:** Annex totals match agency CO (House ₱10.02B, NEP ₱14.47B); MOOE ₱67.2M sits outside.
- **Modal:** agency check panels + PDF to Volume I-A / II-A PAP rows.
- **Role:** context card or footer of `#1`, not a top money story.

### 13. `house-balance` / `ocr-flags` — integrity stories *(optional fillers)*

- House: 311/311 controls reconcile; good trust card, weak citizen money story.
- OCR flags: small NEP review set; useful for “can we trust the digits?” not for “where did billions go?”
- Include only if you want 10 cards and need integrity coverage.

## Recommended shortlist (build later)

Citizen-money first, unique modals, 8 stories:

1. `funding-mix`
2. `doh-hospitals`
3. `big-facilities`
4. `pair-revisions`
5. `nep-only`
6. `house-only`
7. `column-switch` *(or fold into `pair-revisions` if you want 7)*
8. `repeated-amounts` **or** `regional-concentration` **or** `central-office-vehicles`

Keep `nep-defect` + `agency-check` as secondary / supporting evidence inside those modals rather than lead cards, unless you explicitly want a trust section.

## Modal kit already reusable from DPWH / HFEP UI

| Prompt optional | HFEP readiness |
| --- | --- |
| Share + `?story=<id>` | Already on thin Highlights |
| PDF page viewer modal | Already via `onPdf` / source fields |
| CSV of visible set | Compare / analysis exporters exist; wire per story |
| Search, sort, pagination | `SortableTable` ready |
| Nested drill-downs | Pattern exists in DPWH Highlights; HFEP trees support it |
| Worked example side-by-side | Natural for WVSU / Central Office / Cancer Center |
| Multi-stage columns | House vs NEP (no HGAB2/3 split for this annex) |

## Out of scope for v1 Highlights

- Treating title pairs as proven same facility
- Treating unmatched NEP rows as confirmed House cuts or describing the House annex as LGU-only
- Per-bed / per-patient adequacy without external capacity data
- Anything needing 2nd vs 3rd reading HFEP diffs
