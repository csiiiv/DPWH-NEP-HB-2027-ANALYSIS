# Retained NEP PDF source

`NEP-2027-VOLUME-2B_OCR.pdf` is the exact OCR PDF used by the canonical FY2027
DPWH source extraction. It has 722 PDF pages. Its SHA-256 is
`bfc8282de8e3603f347f82aa2be34c25a38147e30aa34c12b11413766b7e7523`, also recorded
in `analysis/data/nep_2027_tree.json` provenance.

The production SPA package copies this file to `_site/pdfs/`. Stage
comparisons and the DBM NEP tree reuse the embedded PDF viewer; tree selections
and page-reference buttons open the recorded page using byte-range loading.
The development server serves this retained file directly. Page references are 1-based PDF indices in this retained document;
separately published DPWH summary/details PDFs have different page numbering.

See the [source audit](../analysis/docs/nep_2027_source_audit.md),
[migration plan](../analysis/docs/react_vite_migration.md), and
[repository source links](../README.md) for context.

Build with `npm run build --prefix analysis/web` followed by
`python scripts/build_pages.py`, both from the repository root. The packager
checks the file against the canonical hash before including it. Cropped images
are no longer displayed in the migrated DBM tree; retained crops remain audit
artifacts. See the [frontend guide](../analysis/web/README.md).
