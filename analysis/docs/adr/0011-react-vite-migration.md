# ADR 0011: Incremental React + Vite migration with PDF.js evidence

Date: 9 October 2026
Status: Accepted for migration preview; root cutover pending parity validation

## Context

The workbench has seven static pages with repeated navigation/templates and
large embedded payloads. Shared interaction code and a source PDF pane are
increasingly useful, while Python builders already enforce source provenance,
accounting, and freshness. An existing local React viewer demonstrates PDF.js
selected-page rendering and byte-range loading.

## Decision

Build the new presentation layer under `analysis/web`, publish its first slice
at `/app/`, and retain the existing site and viewers during migration. Keep
Python JSON/audit builders as the data authority. Use hash navigation and a
relative Vite asset base compatible with the GitHub Pages project prefix.

Load comparison code/data and PDF.js on demand. Serve retained PDFs on the same
origin and validate NEP source identity against the canonical SHA-256. Use
64 KiB range requests, disable streaming and automatic prefetching, and cancel
obsolete renders. The local packaged preview server supports HTTP byte ranges.

## Consequences

Frontend builds add Node dependencies and a committed lockfile. Pages CI must
build React and package its assets alongside current static outputs. The exact
NEP Volume II-B PDF adds about 73 MiB to retained source/publication size. PDF
range requests reduce unnecessary transfer but do not guarantee one chunk per
page. The reference viewer's local API plugins do not run on GitHub Pages and
are not carried over.

This first slice does not replace source verification, matching, or extraction.
A root cutover requires feature parity and compatibility checks for existing
URLs. React alone does not make large datasets faster or source values correct.

Implementation and acceptance stages: [migration plan](../react_vite_migration.md).


## Local route cutover, 9 October 2026

The user requested migration of all current pages into one SPA. All seven
workspaces now share a React shell and hash routes. Verification and detail
controllers retain their established rendering inside scoped React-owned views;
no iframe or runtime script evaluation is used. Packaging defaults to the SPA
and redirects root and historical viewer URLs, preserving review/section
fragments. Data is still produced and checked by Python. Publication uses the Pages workflow.
