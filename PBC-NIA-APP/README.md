# NIA FY2027 budget browser (standalone)

A dedicated React + Vite web app for browsing the National Irrigation
Administration's FY2027 budget, extracted from the shared workbench's NIA
workspace so it can run (and be deployed) on its own.

## What it shows

- **Home / Highlights / Compare** — the House GAB ↔ DBM NEP stage comparison
  (1,013 records: 606 candidate pairs, 222 House-only, 185 NEP-only)
- **Analysis** — overview distributions, insertion/deletion/adjustment
  candidates, statistics, AI monitoring, and the **Senate workbook**
  reconciliation (NIA's own hearing workbook: 937 rows, 145 official House
  insertions, 108 zeroed NEP items, per-category crosstab with House ledger
  checksums)
- **Map** — consolidated Senate workbook locations on a MapLibre canvas
  (title GPS by default, toggle to PSGC centroids or both; one project id,
  never double-counted pesos)
- **House GAB / DBM NEP** — the retained source trees with in-app PDF
  evidence (982-page House Volume I-B, 30-page NEP annex)

URL hashes are identical to the main workbench (`#nia/analysis?view=senate`
etc.), so deep links interoperate both ways.

## Development

```bash
npm install
npm run dev        # serves the app at the repo root so evidence paths resolve
```

The dev server proxies five repository directories read-only:
`analysis-nia/`, `HB_BUDGET/`, `dbm-other-nep-line-data/`, `NIA_DATA/`,
`disclaimer/`.

## Tests

```bash
npm test                    # unit tests (model layer, 22 tests)
node src/niaSmoke.mjs       # SSR smoke render of every view
python3 scripts/check.py    # full browser verification (needs `npm run
                            # build && npm run package` first, plus Python
                            # playwright)
```

## Production build

```bash
npm run build      # Vite bundle → dist/
npm run package    # copies retained evidence (datasets, PDFs, workbook,
                   # evidence crops, methodology docs) next to the bundle
```

The packaged `dist/` is self-contained (≈233 MB, dominated by the source
PDFs) and runs from any static host.

## Relationship to the main workbench

The NIA module family (`NiaApp.jsx`, `NiaMap.jsx`, `niaModel.js`,
`niaAnalysis.js`, `niaLocationModel.js`, shared UI primitives and CSS) was
copied from `analysis/web/src/` as a forkable starting point. Three modules
were replaced with standalone shims holding the same contracts:

- `routes.js` — registers only the NIA workspace (bare hashes resolve to NIA)
- `data.js` — origin-rooted `siteUrl()` instead of the packaged `../` prefix
- `fmrModel.js` — only the pure formatting helpers the NIA closure uses
- `WorkbenchHeader.jsx` — NIA tab row without the cross-workspace selector

One upstream change was ported into `NiaApp.jsx`: it accepts an
`initialData` prop (same convention as `FmrApp`/`HfepApp`) so the SSR smoke
test can render without a fetch round-trip; the main workbench ignores the
prop.

To pick up future main-workbench changes, re-copy the module family and
re-apply the shim list above.
