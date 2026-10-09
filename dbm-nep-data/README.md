# Retained NEP PDF source

`NEP-2027-VOLUME-2B_OCR.pdf` is the exact OCR PDF used by the canonical FY2027
DPWH source extraction. It has 722 PDF pages. Its SHA-256 is
`bfc8282de8e3603f347f82aa2be34c25a38147e30aa34c12b11413766b7e7523`, also recorded
in `analysis/data/nep_2027_tree.json` provenance.

The React migration package copies this file to `/pdfs/` for on-demand source
preview. Page references are 1-based PDF indices in this retained document;
separately published DPWH summary/details PDFs have different page numbering.

See the [source audit](../analysis/docs/nep_2027_source_audit.md),
[migration plan](../analysis/docs/react_vite_migration.md), and
[repository source links](../README.md) for context.
