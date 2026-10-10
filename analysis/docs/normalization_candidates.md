# Normalization candidates

Generated: 2026-10-10T14:48:46Z. Read-only mine over `source_comparison_2027.json`. Does not rewrite payloads.

## Offices — promote

Paired House/NEP rows split only by office spelling: **94**.

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

Fuzzy/chainage rows scanned: **886**.
Substitution patterns: promote 30, reject 295, review 385.

### Existing abbreviation effect

Exact pairs that already match only after Brgy./repeat normalization: **306**.

### Promote (abbreviation / OCR / typo class)

- 11× `['building']` ↔ `['bldg']`
  - e.g. conf=0.9762: Construction (Completion) of Multi-Purpose Building in Barangay Molos, Tampilisan, Zamboan
    vs Construction (Completion) of Multi-Purpose Bldg. in Brgy. Molos, Tampilisan, Zamboanga del
- 3× `['covered']` ↔ `['coverd']`
  - e.g. conf=0.9956: Construction (Completion) of Multi-Purpose Building (Covered Court), Barangay Bal- ason, G
    vs Construction (Completion) of Multi-Purpose Building (Coverd Court ), Barangay Bal- ason, G
- 2× `['structures']` ↔ `['structure']`
  - e.g. conf=0.8615: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an
- 2× `['systems']` ↔ `['system']`
  - e.g. conf=0.8615: Construction of Flood Mitigation Structures and Drainage Systems along Iligan River (Ubald
    vs Construction of Flood Mitigation Structure and Drainage System along Iligan River (Puga-an
- 2× `['enrique']` ↔ `['enrigue']`
  - e.g. conf=0.9902: Construction of Nanas-Batuan Road, Barangay Bagonawa and Barangay Batuan, Municipality of 
    vs Construction of Nanas-Batuan Road, Barangay Bagonawa and Barangay Batuan, Municipality of 
- 2× `['buidling']` ↔ `['building']`
  - e.g. conf=0.9648: Construction (Completion) of Multi-Purpose Buidling, Sentro Komunidad de Santa Cruz, Manil
    vs Construction (Completion) of Multi-Purpose Building, Sentro Komuniudad de Santa Cruz, Mani
- 2× `['building']` ↔ `['bidg']`
  - e.g. conf=0.9753: Construction of Multi-Purpose Building (Barangay Hall) in Barangay Punta, Liloy, Zamboanga
    vs Construction of Multi-Purpose Bidg . (Barangay Hall) in Brgy. Punta, Liloy, Zamboanga del 
- 2× `['constuction']` ↔ `['construction']`
  - e.g. conf=0.8732: Constuction of Multi-Purpose Building in Barangay Solar, Olutanga, Zamboanga Sibugay
    vs Construction of Multi-Purpose Building in Brgy. Nanan, Payao, Zamboanga Sibugay
- 1× `['oroquieta']` ↔ `['oroguieta']`
  - e.g. conf=0.9762: Dipolog-Oroquieta National Rd - K1810 + 000 - K1813 + 005
    vs Dipolog-Oroguieta National Rd - K1810 + 000 - K1813 + 005
- 1× `['chainaga']` ↔ `['chainage']`
  - e.g. conf=0.9891: Daang Maharlika-Daet Mercedes Road Link, Bactas Section, Chainage 2361.7 - Chainaga 3486.7
    vs Daang Maharlika-Daet Mercedes Road Link, Bactas Section, Chainage 2361.7 - Chainage 3486.7
- 1× `['kabitanganan']` ↔ `['kabitangahan']`
  - e.g. conf=0.9787: Kabitanganan Br. (B03135LZ) along Talaba-Summit-Panaon Rd
    vs Kabitangahan Br . (B03135LZ) along Talaba-Summit-Panaon Rd
- 1× `['antique']` ↔ `['antigue']`
  - e.g. conf=0.9787: Inguan Br. (B00004PN) along Jct Bancal-Leon-Antique Bdry Rd
    vs Inguan Br . (B00004PN) along Jct Bancal-Leon-Antigue Bdry Rd
- 1× `['cauayan']` ↔ `['cauavan']`
  - e.g. conf=0.9951: Construction of Public Water Supply System (Level II) at Barangays Buena Suerte, Carabatan
    vs Construction of Public Water Supply System (Level II) at Barangays Buena Suerte, Carabatan
- 1× `['aborlan']` ↔ `['aborian']`
  - e.g. conf=0.9875: Construction of Public Water Supply System, Isla Sombrero, Barangay Poblacion, Aborlan, Pa
    vs Construction of Public Water Supply System, Isla Sombrero, Barangay Poblacion, Aborian, Pa
- 1× `['joaquin']` ↔ `['joaguin']`
  - e.g. conf=0.9921: Construction of Road Concrete Centro, Barangay Joaquin Macias, Sindangan to Centro Sitio P
    vs Construction of Road Concrete Centro, Brgy. Joaguin Macias, Sindangan to Centro Sitio Pase
- 1× `['orienta']` ↔ `['oriental']`
  - e.g. conf=0.9952: Construction of Laguindingan-Iligan City Alternate Road, Barangay Ayaˇaya Section, Sta. 44
    vs Construction of Laguindingan-Iligan City Alternate Road, Barangay Aya aya Section, Sta. 44
- 1× `['kiotoy']` ↔ `['kitoy']`
  - e.g. conf=0.9961: Construction of NRJ Daang Maharlika Bunawan Proper–San Isidro–Kiotoy–Mabunao–Kauswagan–Jct
    vs Construction of NRJ Daang Maharlika Bunawan Proper-San Isidro-Kitoy-Mabunao-Kauswagan-Jct.
- 1× `['pasuquin']` ↔ `['pasuguin']`
  - e.g. conf=0.9811: Construction of Bridge, Barangay Surong, Pasuquin, Ilocos Norte
    vs Construction of Bridge, Barangay Surong, Pasuguin, Ilocos Norte
- 1× `['buacan']` ↔ `['bulacan']`
  - e.g. conf=0.993: Construction of Drainage Canal at Gulod Rd., Barangay Camalig, Meycauayan City, Buacan
    vs Construction of Drainage Canal at Gulod Rd ., Barangay Camalig, Meycauayan City, Bulacan
- 1× `['including']` ↔ `['inicuding']`
  - e.g. conf=0.9727: Construction of Road including Drainage and Slope Protection, Barangay Padre Castillo, San
    vs Constructionl Road inIcuding Drainage and Slope Protection, Barangay Padre Castillo, San P
- 1× `['gelerang']` ↔ `['galerang']`
  - e.g. conf=0.9894: Construction of Road including Drainage and Slope Protection, Barangay Gelerang Kawayan, S
    vs Construction of Road including Drainage and Slope Protection, Barangay Galerang Kawayan, S
- 1× `['kalabasa']` ↔ `['calabasa']`
  - e.g. conf=0.9818: Construction of Road, Sitio Kalabasa, Barangay Biga, Lobo, Batangas
    vs Construction of Road, Sitio Calabasa, Barangay Biga, Lobo, Batangas
- 1× `['franciso']` ↔ `['francisco']`
  - e.g. conf=0.9067: Construction of Road, Barangay Pagsangahan, Municipality of San Franciso, Quezon
    vs Construction of Road, Sitio Cumbahan, Barangay Pagsangahan, Municipality of San Francisco,
- 1× `['manjuyod']` ↔ `['manuyod']`
  - e.g. conf=0.9912: Construction of Road, Barangay San Isidro, Manjuyod, Negros Oriental
    vs Construction of Road, Barangay San Isidro, Manuyod, Negros Oriental
- 1× `['komunidad']` ↔ `['komuniudad']`
  - e.g. conf=0.9648: Construction (Completion) of Multi-Purpose Buidling, Sentro Komunidad de Santa Cruz, Manil
    vs Construction (Completion) of Multi-Purpose Building, Sentro Komuniudad de Santa Cruz, Mani
- 1× `['abatan']` ↔ `['batan']`
  - e.g. conf=0.9197: Construction of Multi-Purpose Building, Barangay Peñabatan, Pulilan, Bulacan
    vs Construction (Completion) of Multi-Purpose Building, Barangay Pe ñ batan, Pulilan, Bulacan
- 1× `['building']` ↔ `['buildingg']`
  - e.g. conf=0.9921: Construction of Multi-Purpose Building, Barangay Bulakin 2, Dolores, Quezon
    vs Construction of Multi-Purpose Buildingg, Barangay Bulakin 2, Dolores, Quezon
- 1× `['pupose']` ↔ `['purpose']`
  - e.g. conf=0.8605: Construction of Multi-Pupose Building (Covered Court), Barangay Vito Elementary School, Si
    vs Construction of Multi-Purpose Building (Covered Court ), Barangay Matandang-Siruma, Siruma
- 1× `['macawayan']` ↔ `['macauwayan']`
  - e.g. conf=0.9937: Construction of Multi-Purpose Building (Covered Court) at Barangay Macawayan, Irosin, Sors
    vs Construction of Multi-Purpose Building (Covered Court) at Barangay Macauwayan, Irosin, Sor
- 1× `['purikay']` ↔ `['purkay']`
  - e.g. conf=0.9296: Construction of Multi-Purpose Building, Barangay Purikay, Lebak, Sultan Kudarat
    vs Construction of Multi-Purpose Building (Gymnasium ), Barangay Purkay, Lebak, Sultan Kudara

### Review (inspect before adding rules)

- 4× `['pala', 'o']` ↔ `['puga', 'an']`
- 4× `['roque']` ↔ `['rogue']`
- 3× `['aque']` ↔ `['ague']`
- 3× `['iii']` ↔ `['iv']`
- 3× `['agusan']` ↔ `['lanao']`
- 2× `['ubaldo', 'laya', 'tubod']` ↔ `['puga', 'an']`
- 2× `['granada']` ↔ `['alangilan']`
- 2× `['suso']` ↔ `['malinas']`
- 2× `['alacan']` ↔ `['ambalangan', 'dalin']`
- 2× `['wakas']` ↔ `['opias']`
- 2× `['rizaliana']` ↔ `['baao']`
- 2× `['el', 'salvador', 'city']` ↔ `['lugait']`
- 2× `['rehabilitation', 'completion']` ↔ `['construction']`
- 1× `['aquino']` ↔ `['aguino']`
- 1× `['viewpoint']` ↔ `['view', 'point']`
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

### Reject samples (work type / chainage / different entity)

- 22× `['rehabilitation']` ↔ `['construction']`
- 5× `['bridge']` ↔ `['footbridge']`
- 3× `['improvement']` ↔ `['construction']`
- 2× `['k0359']` ↔ `['k0357']`
- 2× `['1', '210']` ↔ `['0', '000']`
- 2× `['1', '600']` ↔ `['0', '252']`
- 2× `['2']` ↔ `['1']`
- 2× `['construction']` ↔ `['improvement']`
- 2× `['completion']` ↔ `['construction']`
- 1× `['519']` ↔ `['469']`
- 1× `['181']` ↔ `['197']`
- 1× `['063']` ↔ `['187']`
- 1× `['788']` ↔ `['777']`
- 1× `['k0039', '885', 'k0040', '064']` ↔ `['k0049', '288', 'k0049', '663']`
- 1× `['354']` ↔ `['000', 'k0042', '591']`

## Working from fuzzy matches

Fuzzy/chainage rows are the main OCR triage queue: high-similarity House and NEP titles in the same scope are evidence of a real counterpart with residual spelling. Exact matches are already done; House-only / NEP-only without a suggestion are a weaker signal.

## Next step

`annotate_source_labels` already writes `office_canonical` / `title_match_key` on comparison payloads. Promote mined title pairs into live rules only after an explicit rebuild.
