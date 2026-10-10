# Normalization candidates

Generated: 2026-10-10T16:22:46Z. Read-only mine over `source_comparison_2027.json`. Does not rewrite payloads.

## Offices — promote

Paired House/NEP rows split only by office spelling: **108**.

### `Las Piñas Muntinlupa District Engineering Office` · 128 assignments

- 65× `Las Piñas Muntinlupa District Engineering Office` (house)
- 61× `Las Pi ñ as Muntinlupa District Engineering Office` (nep)
- 1× `Las Piñas-Muntinlupa District Engineering Office` (house)
- 1× `Las Pi ñ as-Muntinlupa District Engineering Office` (nep)

### `Siquijor District Engineering Office` · 104 assignments

- 72× `Siquijor District Engineering Office` (house, nep)
- 32× `Siguijor District Engineering Office` (nep)

### `Malabon Navotas District Engineering Office` · 60 assignments

- 58× `Malabon Navotas District Engineering Office` (house, nep)
- 2× `Malabon-Navotas District Engineering Office` (house, nep)

### `Marinduque District Engineering Office` · 50 assignments

- 26× `Marinduque District Engineering Office` (house, nep)
- 24× `Marindugue District Engineering Office` (nep)

## Titles — triage summary

Fuzzy/chainage rows scanned: **531**.
Substitution patterns: promote 4, reject 101, review 320.

### Existing abbreviation effect

Exact pairs that already match only after Brgy./repeat normalization: **356**.

### Promote (abbreviation / OCR / typo class)

- 2× `['structures']` ↔ `['structure']`
  - e.g. conf=0.8525: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an
- 2× `['systems']` ↔ `['system']`
  - e.g. conf=0.8525: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an
- 1× `['orienta']` ↔ `['oriental']`
  - e.g. conf=0.9948: Construction of Laguindingan-Iligan City Alternate Road, Barangay Ayaˇaya Section, Sta. 44
    vs Construction of Laguindingan-Iligan City Alternate Road, Barangay Aya aya Section, Sta. 44
- 1× `['abatan']` ↔ `['batan']`
  - e.g. conf=0.9091: Construction of Multi-Purpose Building, Barangay Peñabatan, Pulilan, Bulacan
    vs Construction (Completion) of Multi-Purpose Building, Barangay Pe ñ batan, Pulilan, Bulacan

### Review (inspect before adding rules)

- 5× `['roque']` ↔ `['rogue']`
- 4× `['pala', 'o']` ↔ `['puga', 'an']`
- 3× `['aque']` ↔ `['ague']`
- 3× `['agusan']` ↔ `['lanao']`
- 2× `['ubaldo', 'laya', 'tubod']` ↔ `['puga', 'an']`
- 2× `['granada']` ↔ `['alangilan']`
- 2× `['wakas']` ↔ `['opias']`
- 2× `['anoling']` ↔ `['mahabang', 'lalim']`
- 2× `['poblacion']` ↔ `['hall', 'barangay', 'alga']`
- 2× `['el', 'salvador', 'city']` ↔ `['lugait']`
- 1× `['aquino']` ↔ `['aguino']`
- 1× `['2', '880', '3', '760', 'secton']` ↔ `['10', '732', '5', 'sta', '10', '840', 'section']`
- 1× `['ii']` ↔ `['iii']`
- 1× `['12', '159', 'tiaong']` ↔ `['10', '305', 'san', 'antonio']`
- 1× `['ni', 'o']` ↔ `['nino']`
- 1× `['baguio']` ↔ `['baquio']`
- 1× `['blvd']` ↔ `['bivd']`
- 1× `['natl']` ↔ `['nati']`
- 1× `['mitigation', 'structure']` ↔ `['control', 'wall']`
- 1× `['sta', '27', '861']` ↔ `['and', 'utilities']`
- 1× `['sta', '28', '693']` ↔ `['and', 'utilities']`
- 1× `['bagumbayan']` ↔ `['bayunan']`
- 1× `['r']` ↔ `['l']`
- 1× `['tubod']` ↔ `['puga', 'an', 'sta', '0', '675', '00']`
- 1× `['ubaldo', 'laya']` ↔ `['puga', 'an']`

### Reject samples (work type / chainage / different entity)

- 18× `['rehabilitation']` ↔ `['construction']`
- 5× `['bridge']` ↔ `['footbridge']`
- 2× `['construction']` ↔ `['improvement']`
- 2× `['completion']` ↔ `['construction']`
- 1× `['519']` ↔ `['469']`
- 1× `['181']` ↔ `['197']`
- 1× `['063']` ↔ `['187']`
- 1× `['219']` ↔ `['671']`
- 1× `['598']` ↔ `['973']`
- 1× `['260']` ↔ `['000', 'k0465', '563']`
- 1× `['k0460']` ↔ `['k0462']`
- 1× `['k0460', '509']` ↔ `['k0463', '000']`
- 1× `['k1528', '120', 'k1528', '500']` ↔ `['k1552', '068', 'k1552', '145']`
- 1× `['014']` ↔ `['288', 'k0104', '449', 'k0104']`
- 1× `['500']` ↔ `['620']`

## Working from fuzzy matches

Fuzzy/chainage rows are the main OCR triage queue: high-similarity House and NEP titles in the same scope are evidence of a real counterpart with residual spelling. Exact matches are already done; House-only / NEP-only without a suggestion are a weaker signal.

## Next step

`annotate_source_labels` already writes `office_canonical` / `title_match_key` on comparison payloads. Promote mined title pairs into live rules only after an explicit rebuild.
