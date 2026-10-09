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
House/NEP titles within the same program, canonical PAP and funding zone.
Uniqueness is checked across all records, including existing matches. Repeated
House groups and duplicate titles stay separate; amounts do not identify projects.
Existing matches are retained. The join preserves NEP/API records, source pages,
full tree paths and every amount; the retained JSON and PAP controls are unchanged.
Each additional candidate labels the original House and NEP regions separately.
Region and office filters use the recorded assignments of either source.

The current data yields **28 additional candidates: 24 FAP and four local**.
BCIB (4432-PHI), LLRN Phase I (PHL-27) and Davao Bypass III (PH-P282) each join
House Nationwide records to NEP NCR/Central Office records. These are candidates,
not manually certified identities. Disable the mode to restore separate rows.
