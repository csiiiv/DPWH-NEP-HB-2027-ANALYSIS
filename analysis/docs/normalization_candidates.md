# Normalization candidates

Generated: 2026-10-11T19:47:31Z. Read-only mine over `source_comparison_2027.json`. Does not rewrite payloads.

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

Fuzzy/chainage rows scanned: **385**.
Substitution patterns: promote 2, reject 83, review 277.

### Existing abbreviation effect

Exact pairs that already match only after Brgy./repeat normalization: **369**.

### Promote (abbreviation / OCR / typo class)

- 2× `['structures']` ↔ `['structure']`
  - e.g. conf=0.8525: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an
- 2× `['systems']` ↔ `['system']`
  - e.g. conf=0.8525: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an

### Review (inspect before adding rules)

- 2× `['aque']` ↔ `['ague']`
- 2× `['pala', 'o']` ↔ `['puga', 'an']`
- 2× `['ubaldo', 'laya', 'tubod']` ↔ `['puga', 'an']`
- 2× `['granada']` ↔ `['alangilan']`
- 2× `['san', 'agustin']` ↔ `['hall', 'barangay', 'nagbayan']`
- 2× `['wakas']` ↔ `['opias']`
- 2× `['anoling']` ↔ `['mahabang', 'lalim']`
- 2× `['building']` ↔ `['hall']`
- 2× `['el', 'salvador', 'city']` ↔ `['lugait']`
- 1× `['2', '880', '3', '760', 'secton']` ↔ `['10', '732', '5', 'sta', '10', '840', 'section']`
- 1× `['ii']` ↔ `['iii']`
- 1× `['12', '159', 'tiaong']` ↔ `['10', '305', 'san', 'antonio']`
- 1× `['ni', 'o']` ↔ `['nino']`
- 1× `['mitigation', 'structure']` ↔ `['control', 'wall']`
- 1× `['sta', '27', '861']` ↔ `['and', 'utilities']`
- 1× `['sta', '28', '693']` ↔ `['and', 'utilities']`
- 1× `['bagumbayan']` ↔ `['bayunan']`
- 1× `['tubod']` ↔ `['puga', 'an', 'sta', '0', '675', '00']`
- 1× `['ubaldo', 'laya']` ↔ `['puga', 'an']`
- 1× `['bislig']` ↔ `['bisliq']`
- 1× `['c', '4']` ↔ `['luna']`
- 1× `['along', 'f', 'carlos']` ↔ `['at', 'del', 'nacia', 'iv']`
- 1× `['baesa']` ↔ `['barangay', 'sauyo']`
- 1× `['balite', 'san', 'luis']` ↔ `['banalo', 'lobo']`
- 1× `['santa', 'lucia', 'mauban']` ↔ `['sta', 'catalina', 'pagbilao']`

### Reject samples (work type / chainage / different entity)

- 20× `['rehabilitation']` ↔ `['construction']`
- 2× `['construction']` ↔ `['improvement']`
- 2× `['completion']` ↔ `['construction']`
- 1× `['519']` ↔ `['469']`
- 1× `['181']` ↔ `['197']`
- 1× `['063']` ↔ `['187']`
- 1× `['k0460']` ↔ `['k0462']`
- 1× `['k0460', '509']` ↔ `['k0463', '000']`
- 1× `['014']` ↔ `['288', 'k0104', '449', 'k0104']`
- 1× `['202']` ↔ `['059', '5', 'baguio', 'city']`
- 1× `['11', '554']` ↔ `['8', '354']`
- 1× `['11', '674']` ↔ `['10', '859']`
- 1× `['12', '355']` ↔ `['10', '305']`
- 1× `['16', '285']` ↔ `['11', '381', '46']`
- 1× `['16', '325']` ↔ `['11', '474', '46']`

## Working from fuzzy matches

Fuzzy/chainage rows are the main OCR triage queue: high-similarity House and NEP titles in the same scope are evidence of a real counterpart with residual spelling. Exact matches are already done; House-only / NEP-only without a suggestion are a weaker signal.

## Next step

`annotate_source_labels` already writes `office_canonical` / `title_match_key` on comparison payloads. Promote mined title pairs into live rules only after an explicit rebuild.
