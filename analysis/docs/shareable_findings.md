# Shareable data findings

The React workbench stores active searches and filters in its hash routes.
Use **Copy link**, **Link to this finding**, or copy the browser address.
Opening the URL loads the source data and applies those settings. Editing
filters updates the current history entry without reloading data; Back and
Forward restore findings reached through page navigation. Links refer to the
current retained datasets, rather than freezing a historical data snapshot.

## Comparison tables

`#compare?view=readings&q=Caloocan&status=third_only`
shows third-reading additions matching Caloocan.

Supported parameters:

| Parameter | Meaning |
|---|---|
| `view` | `paps`, `projects`, `readings`, or `gaps` |
| `q` | Search text |
| `program`, `region`, `office` | Exact recorded filter values; use the UI to obtain the office key |
| `status` | Match status; `all` includes unchanged reading records |
| `sort` | `title`, stage index `0`/`1`/`2`, `reading_delta`, or listing-gap `amount`/`region`/`pdf_page`, depending on table |
| `metric` | `total`, `delta`, or `percent` |
| `order` | `asc` (default) or `desc` |
| `page` | One-based results page; pages beyond the results clamp to the last page |

Search, filters and sorting apply to the full dataset before pagination.
Changing a filter resets the page. House readings default to changed allocations;
`status=all` explicitly overrides that default.

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
