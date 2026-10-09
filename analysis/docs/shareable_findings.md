# Shareable data findings

The React workbench stores active searches and filters in its hash routes.
Use **Copy link**, **Link to this finding**, or copy the browser address.
Opening the URL loads the source data and applies those settings. Editing
filters updates the current history entry without reloading data; Back and
Forward restore findings reached through page navigation. Links refer to the
current retained datasets, rather than freezing a historical data snapshot.

## Comparison tables

`#compare?view=projects&q=Caloocan&change=third_only`
shows third-reading additions matching Caloocan.

Supported parameters:

| Parameter | Meaning |
|---|---|
| `view` | `paps`, `projects`, or `gaps` |
| `q` | Search text |
| `program`, `region`, `office` | Exact recorded filter values; use the UI to obtain the office key |
| `status` | NEP/HGAB2 candidate match status |
| `change` | House reading change: `reading_changed`, `third_only`, `same_amount`, `amount_changed`, `second_only`, `repeated_key`, or `no_house_record` |
| `sort` | `title`, stage index `0`/`1`/`2`/`3`, `reading_delta`, or listing-gap `amount`/`region`/`pdf_page`, depending on table |
| `metric` | `total`, `delta`, or `percent` |
| `order` | `asc` (default) or `desc` |
| `record`, `path_source` | Expanded project record ID and selected tree source (`third`, `second`, `nep`, `api`) |
| `page` | One-based results page; pages beyond the results clamp to the last page |

Search, filters and sorting apply to the full dataset before pagination.
Changing a filter resets the page. Both tables show all records by default. HGAB2 and HGAB3 appear together.
Old `view=readings` links open Project records with the equivalent House change
filter; their status and two-column sorting parameters are translated.

## Source hierarchies

`#house?view=projects&reading=third&q=J.P.+Rizal&node=c5246`
opens the third-reading Caloocan culvert and retains the search context.

House links record `reading=second|third` and `view=controls|projects`.
House, NEP and Transparency hierarchy links support `q`, `filter`, `node`,
`viewer=tree|queue`, `branch` (review branch), `expense` (NEP expense-root node),
`exact=1`, `limit`, and `panel=evidence`. Unsupported select values are ignored;
unknown node IDs fall back to the source root. Selected entries retain their
reading-specific, volume-specific source reference. Expanded branches unrelated
to the selected entry, PDF paging, and PDF zoom are not serialized.

## Retained detailed workspaces

House/NEP detail (`#house-nep`) supports project `q`, `region`, `office`,
`status`, `zone`, `amount`, `sort` (zero-based column), `order`, and `page`.
PAP controls on that page use `pap_q`, `pap_program`, `pap_status`, `pap_sort`.

NEP detail (`#nep-detail`) supports `q`, `tree=program|expense`, `filter`
(evidence status), `refs=1`, `node`, and `limit`.

A copied link restores UI state and recorded source context. Matching and
source-review qualifications remain the same as on the unfiltered page.

Click a project title in Project records to expand its complete source-tree
ancestry. Source buttons switch between HGAB3, HGAB2, NEP and Transparency where
recorded. Each ancestor links to its actual source node. Grouped House records
show separate paths for every member. Paths are loaded from the retained source
hierarchies on demand, rather than inferred from title geography. Copy link also
retains the expanded record and selected path source.

### Candidates with different regions

Project records default to **Require same region**. The **Region matching**
selector can instead **Allow different regions · flag candidates**. Share this
mode with `region_match=ignore`, for example:

`#compare?view=projects&region_match=ignore&q=4432-PHI`

This optional display join combines only previously unpaired, unique normalized
House/NEP titles within the same funding zone. Recorded region, office, program
and PAP labels may differ between the two sources; each is kept separately on
the merged row. Uniqueness is checked across all records, including existing
matches. Repeated House groups and duplicate titles stay separate; amounts do
not identify projects. Existing matches are retained. The join preserves
NEP/API records, source pages, full tree paths and every amount; the retained
JSON and PAP controls are unchanged. Region and office filters use the recorded
assignments of either source.

The current data yields **29 additional candidates: 25 FAP and four local**.
BCIB (4432-PHI), LLRN Phase I (PHL-27) and Davao Bypass III (PH-P282) each join
House Nationwide records to NEP NCR/Central Office records. PSRRRP (9251-PH)
joins despite a National Building Program versus Local Program label
difference. These are candidates, not manually certified identities. Disable
the mode to restore separate rows.


### Search responsiveness

Comparison search keeps typed text visible immediately and updates results and
URL after a 250 ms pause. Enter or leaving the search input applies it immediately.
Opening a shared URL restores its search without the typing delay. Switching
to another finding cancels pending text. Switching comparison tables preserves
the applied search and shared program filter; leaving the input first commits
its draft. Filters that do not apply to a table are ignored there and restored
when returning. Sort orders,
searchable source fields and filter options are cached; initial project search
indexing runs in small batches to keep the page responsive.


### Analytics for project findings

**Show analytics** on Project records opens a modal for all filtered results,
including rows on other pages. The modal captures the applied search and filters.
Source totals/coverage with HGAB3 and NEP hero amounts, side-by-side House/NEP
region and engineering-office distributions, House reading changes, match
statuses and overlapping review flags are computed from those rows. Distribution
groups chart each source under its own recorded label, so differing region or
office assignments stay visible instead of being merged.

HGAB3-only/HGAB2-only records describe recorded reading differences. Unmatched
NEP/House rows are candidate statuses, not certified policy insertions or removals.
Review flags identify differing source assignments, repeated keys, missing offices,
provisional matching and retained NEP amount-evidence review statuses. They do not
establish fraud or replace the full source-review queue. Totals sum project or
allocation records once; FAP funding components are not additional projects.
Grouped entries show both comparison-row and member-allocation counts. Empty
source coverage shows an unavailable amount, rather than a claimed zero budget.


The analytics modal separates **Overview**, **Distribution**, **Changes & matches**
and **Review flags**. Its header, applied filters and close control remain visible
while results scroll. Each status and flag has an **i** button that expands a
plain-language definition, including the source stages and limits of the claim.
Definitions work with keyboard and touch. Distribution charts show House (HGAB3)
and DBM NEP amounts side by side per group on one shared scale, with per-source
shares under each group. Charts initially show the top eight
groups, with an option to expand all groups. The review badge counts distinct
flagged rows; individual categories can overlap.


### Comparison workspace and filtered exports

The comparison starts with PAP totals, search and results. **Source scopes,
reading controls and downloads** expands global source coverage and the House
control reconciliation. These totals describe the source scope, not the filtered
rows. **More filters** reveals engineering office, reading change, region matching
and candidate match status; active filter chips remove individual constraints,
and **Clear filters** resets the finding.

Amounts show each stage independently. The dedicated change column always means
**HGAB3 minus HGAB2**. Header sorting menus name their comparison baseline:
NEP versus Transparency describes listing coverage, HGAB2 versus NEP describes
a candidate difference, and HGAB3 versus HGAB2 describes a reading difference.
Status information expands inline. Select a project title for its full source-tree
path, or a page reference for a closable PDF panel. The table uses the full width
until a source opens; mobile records show a labeled grid of stage amounts and
a separate sorting control.

**Export CSV** and **Export JSON** include every currently filtered row in the
selected order, across all pages. CSV keeps exact PHP values, blank unavailable
amounts and both House columns. JSON includes the finding settings, PHP unit and
source records, including grouped members. These are finding exports; canonical
dataset downloads remain in the source-context section.

The build generates `comparison_overview_2027.json` and
`comparison_projects_2027.json` from the retained stage trace and House reading
comparison. The initial overview is about **82 KB** (including Analysis headlines); Project records lazily loads
about **26 MB**, compared with about **86 MB** for both original inputs. Sizes are
uncompressed. Compact sources preserve original amounts, identities, recorded
assignments, evidence and page references; repeated fields are restored on load.
Both payloads carry their input SHA-256 hashes and a mixed-build pair is rejected.
Canonical inputs are retained independently. `npm run dev`, `npm run build` and
the React packaging step regenerate these derived files.


**House only · no NEP / Transparency** in the House reading change filter keeps
HGAB2/HGAB3 records with neither an attached NEP reference nor a Transparency
source. This includes paired, single-reading and grouped House records. They are
**insertion candidates**: unmatched titles, regions or offices can also explain
missing anchors, so this does not establish absence from the printed NEP. Optional
region matching can resolve some candidates and remove them from this selection.
On PAP totals the same rule applies to recorded source controls. Share this
selection with `#compare?view=projects&change=house_records_only`; analytics and
exports use the same filtered result set.


### Inspecting suggested NEP matches

On Project records, **Review N NEP suggestions** or the project title expands
the retained fuzzy/ambiguous candidates above the full House source-tree path.
A compact comparison table stacks the full title above its assignment in one
column, with separate columns for source/similarity, amount, differences and evidence.
It shows House sources once, followed by each suggested
NEP record. Each suggestion shows its recorded text-similarity score, exact House/NEP amounts,
full titles, region, office, program/PAP, source ID, page and amount-evidence flag.
Open the suggested NEP source-tree entry or preview its PDF page to cross-check.
The expanded record is preserved in shared URLs.

The score is a normalized-title similarity measure, not a calibrated probability.
Fuzzy matching retains up to three suggestions above 0.85 from a token-overlap
shortlist of at most 20 unmatched NEP records in the same region/PAP/funding scope.
Common abbreviation variants (`Brgy.`/`Barangay`) and repeated-token doubling
(`Sta. Sta.`) are normalized before matching. When a suggestion differs from the
House title only in chainage or station numbers, the row is labeled a
**Same road · different chainage** candidate instead: that pattern usually
reflects re-segmentation or coverage amendments rather than a new insertion.
For example, Muntinlupa-Insular
Prison Rd’s differing chainage end (`146` vs `204`) yields 0.9636. Ambiguous
candidates instead share a duplicate
exact key. Suggestions do not attach NEP sources, consume counterpart records
or contribute additional amounts to comparison or analytics totals.


### What record counts mean

Project result counts and analytics show **comparison rows**, not deduplicated
unique projects. A House fuzzy candidate and its unlinked NEP counterpart can
appear as two rows even when they likely describe the same project. Suggested
NEP counterpart rows are marked as unresolved and retained separately pending
review. The badges identify suggestions, not accepted matches.

Source coverage reports **source allocation records** independently for HGAB2,
HGAB3, NEP and Transparency, including grouped members. Do not sum those counts
across stages to estimate unique projects. Match-status counts also count rows;
a suggested pair must not be interpreted as both a confirmed insertion and
a confirmed removal. JSON finding exports label the counting units explicitly.


**Foreign-assisted projects (FAPs)** in the Project records program filter selects
the recorded `zone: "fap"` funding category across all individual programs.
It does not infer FAP status from loan numbers or titles. The selection is shared
with `#compare?view=projects&program=fap` and applies to office options, analytics
and exports. When carried to PAP totals it selects the FAP control. Region matching
can change the number of comparison rows by joining optional candidates; source
allocation totals remain independent of these row counts.

### Main Analysis page

**Analysis** (`#analysis`) defaults to HGAB3 and shows source allocation record
counts and PHP totals by office category and program. Switch to HGAB2, NEP or
Transparency to inspect that source independently. Central Office, DEOs, regional
offices, other recorded offices and missing office assignments are separate;
no office is inferred from geography. Grouped records contribute their individual
member counts and amounts, without counting the parent again. These counts are
not cross-stage unique projects.

FAP records are counted exclusively in the FAP bucket using their funding zone,
so they do not also appear under their individual programs. National Building is
included to account for sources where that program occurs. Every office and
program partition reconciles to its source count and allocation total.

Top insertion candidates are ranked by House allocation amount, with separate
lists for no attached NEP/Transparency source and no NEP suggestion, unresolved
suggestions, and new third-reading records. Optional unique different-region
matches are applied for review before classifying candidates. No list certifies
policy insertions. Each top-20 row links to its comparison finding and House
source tree; grouped entries link to the first allocation and their comparison
retains all member paths. Shared routes preserve source and ranking selections.
