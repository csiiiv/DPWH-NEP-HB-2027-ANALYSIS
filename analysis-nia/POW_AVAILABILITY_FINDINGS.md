# NIA PBC Drop — Program of Works Mapping

**Built:** 12 November 2026  
**Source:** `…/PEOPLE_S BUDGET COALITION REQUIREMENTS/PROGRAM OF WORKS AND PICTURES (ONGOING UPLOADING)/`  
**Target records:** NIA Senate hearing workbook project rows (`senate_nia_dataset.json`, submission / fixed titles)  
**Artifact:** [`data/program_of_works/pow_availability.json`](data/program_of_works/pow_availability.json)  
**UI:** Analysis → Document availability (`#nia/analysis?view=documents`)

Brief note on how folders and files in the POW drop were inventoried, linked to Senate submitted projects, and validated.

---

## 1. What we treat as a “package”

Region folders (`CAR`, `REGION 9`, `UPRIIS`, …) hold either:

| Layout | How we invent |
|---|---|
| Project folder with PDFs / pictures | One package per folder |
| Loose PDFs at region root | Group by stem; merge `PICTURE-…` with the matching POW PDF |
| Category-only folder (`Resto-CIS`, `SPIP`, `REPAIR OF NIS`) | Expand to inner project folders or loose PDFs |

Each package counts **POW PDFs**, **site pictures** (images + `PICTURE*` PDFs), and other files.

---

## 2. Filename parse → Senate candidate

Package names are mostly **work-type / system / amount**, e.g. `SERVICEROADSCIS-CONSUELO CIS-15.4M`.

1. Map region folder → Senate `region`
2. Parse work-type hint → hierarchy category boost  
3. Parse system tokens + trailing `…M` amount (millions of pesos)
4. Score against Senate **submission / fixed titles** in that region (title similarity, token overlap, amount hit, category boost)

Labels: **strong** / **weak** / **review** / **unmatched**. These are triage candidates, not certified identity.

---

## 3. Validation from file contents

Weak (and unmatched) packages are re-checked against the POW PDF body:

- Prefer the non-picture POW PDF when both POW and `PICTURE` files exist
- Use the native text layer when present
- If the PDF is image-only (e.g. MARIIS Quirino pack), OCR the first pages (tesseract)
- Re-rank with system/site phrases, distinctive tokens, and amounts printed in the form

PDF confirmation can **promote** a weak filename hit to strong and may **retarget** the Senate row (e.g. UPRIIS `PENRIS SPIP` picture sheet → Bantog SPIP Site 2 via “Bantog I.A”, not Buga Sapang).

Confirmed examples from the current drop: LARPIS / Aupagan ₱300M, BBRIS / BACO-BUCAYAO ₱18M, LABRIS / Labangan ₱200M, Quirino NMC extension ₱10M (OCR).

---

## 4. Coverage scale (current extract)

| Bucket | Senate submitted projects | Meaning |
|---|---:|---|
| With POW | 61 | At least one Program of Works PDF attributed |
| With geotagged photos | 34 | Site pictures / picture sheets (may overlap POW) |
| No supporting docs | 876 | No package in this drop mapped to the row |

**62** packages → **61** distinct Senate rows (POW + picture for the same Bantog project share one row). All packages currently score **strong** after PDF confirmation. Absence of a package only means it was missing from this ongoing PBC upload—not that no POW exists elsewhere.

---

## 5. Rebuild

```bash
python3 analysis-nia/data/program_of_works/extract_pow_availability.py
python3 -m unittest analysis-nia.tests.test_pow_availability -v
```

See also [`data/program_of_works/README.md`](data/program_of_works/README.md).
