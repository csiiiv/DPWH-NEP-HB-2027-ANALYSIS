# Program of Works availability

Inventory of the PBC drop folder **PROGRAM OF WORKS AND PICTURES (ONGOING UPLOADING)** and per-project supporting-document counts against the Senate workbook.

## Rebuild

```bash
python3 analysis-nia/data/program_of_works/extract_pow_availability.py
```

Requires the external PBC drop mounted at the path in `extract_pow_availability.py`.

## Artifact

`pow_availability.json`

- `packages` — one row per POW package (folder or loose PDF group), with PDF/image counts and best Senate candidate
- `projects` — Senate rows that received at least one attributed package, with `doc_count` / `pdf_count` / `image_count`
- `by_region` — package and file totals by region folder

Naming is treated as **work-type / system / amount**. Category-only folders (`Resto-CIS`, `SPIP`, …) expand to inner PDFs or project subfolders. Weak filename matches are re-scored against POW PDF text (native text layer, or tesseract OCR when image-only) and may promote to **strong** with a `pdf_evidence` record. Matches remain triage scores, not certified identity.

## UI

Analysis → **Document availability** (`#nia/analysis?view=documents`).
