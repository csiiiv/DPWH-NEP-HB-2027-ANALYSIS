# HB 10858 (House FY 2027 Budget) vs DPWH NEP FY 2027 — Crosscheck Report

**Data sources**
- `HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md` — *Details of DPWH's Programs/Projects* (project-level appropriations, printed in pesos)
- `dpwh-transparency-nep-data/json/fy2027-combined.json` — DPWH NEP FY 2027 proposal API dump (11,372 projects, amounts in thousands of pesos)
- Matching: 3-pass name matching (raw exact → normalized exact → fuzzy ≥92, with 85–92 flagged for review)

## 1. Headline numbers

| Metric | Count | Amount |
|---|---:|---:|
| NEP projects | 11,372 | P445.38B |
| HB project line items | 15,066 | P593.37B |
| Matched, same amount | 8,375 | — |
| Matched, amount changed | 465 | P6.49B net |
| Matched, needs review (fuzzy 85–92) | 365 | — |
| **In HB but not in NEP** (House insertions*) | **6,225** | **P284.82B** |
| **In NEP but not in HB** (House removals*) | **2,534** | **P143.36B** |

\* *Assumes HB = NEP + amendments. OCR garble and section re-scoping can inflate both buckets; the review bucket isolates ambiguous cases.*

## 2. Amount changes on retained projects

- **271 projects increased** (+P16.95B)
- **194 projects decreased** (P-10.46B)

### Top 15 increases

| Project | NEP | HB | Δ | Office |
|---|---:|---:|---:|---|
| Butuan City - Agusan del Norte Logistical Highway, Sta. 14+780 - Sta. 15+934.3, Sta. Sta.  | P400.0M | P4.65B | +P4.25B | Butuan City District Engineering Office |
| Bacolod North Rd - K0092+118 - K0094 + 000 | P71.2M | P1.14B | +P1.06B | Negros Occidental 5th District Engineering Office |
| Construction of Camarines Sur Iconic Capitol Building, CamSur Uptown Center, Pili, Camarin | P360.0M | P1.40B | +P1.04B | Camarines Sur 3rd District Engineering Office |
| Jct Milagros-Baleno-Lagta Rd - K0080 + 663 - K0081 + 730 | P75.0M | P922.1M | +P847.1M | Masbate 2nd District Engineering Office |
| Construction (Completion) of Multi-Purpose Building, Barangay Cadunan, Mabini, Davao de Or | P5.0M | P651.5M | +P646.5M | Davao de Oro 1st District Engineering Office |
| Alicante Br. (B00374NR) along Jct Bagonawa-La Castellana-Isabela Rd | P31.0M | P598.9M | +P567.9M | Negros Occidental 2nd District Engineering Office |
| Cangaranan Parallel Br. along Iloilo-Antique Rd | P270.5M | P795.5M | +P525.0M | Antique District Engineering Office |
| Construction of Multi-purpose Building (Covered Court) at Brgy. Cabangan, Tabaco City, Alb | P12.0M | P331.0M | +P319.0M | Albay 1st District Engineering Office |
| Labangan-Midsalip Road, Labangan, Zamboanga del Sur Sta 25+610 - Sta 28+610 | P105.0M | P410.0M | +P305.0M | Zamboanga del Sur 1st District Engineering Office |
| Cabuluan Br. (B04806LZ) along Maharlika Highway (LZ) | P51.0M | P329.0M | +P278.0M | Camarines Norte District Engineering Office |
| Construction (Completion) of Multi-Purpose Building (Covered Court), Barangay Matacla, Goa | P5.0M | P264.0M | +P259.0M | Camarines Sur 4th District Engineering Office |
| Iloilo East Coast-Capiz Rd - K0257 + 700 - K0257 + 950, K0258 + 300 - K0258 + 650, K0262 + | P44.2M | P288.6M | +P244.4M | Iloilo 2nd District Engineering Office |
| Construction of Drainage Structure, Felipe Street (Sta. 0+000 - Sta. 0+400), Luz Village,  | P10.0M | P218.0M | +P208.0M | Butuan City District Engineering Office |
| Arteche, Brgy. Catumsan - Jipapad - Las Navas - Catubig - Rawis Road (Sta. 22+183 - Sta. 2 | P59.3M | P265.0M | +P205.7M | Eastern Samar District Engineering Office |
| Construction of Access Road, Barangay Matandang Gasan, Gasan, Marinduque | P20.0M | P189.5M | +P169.5M | Marinduque District Engineering Office |

### Top 15 decreases

| Project | NEP | HB | Δ | Office |
|---|---:|---:|---:|---|
| Davao City Bypass Construction Project, Package II | P2.00B | P1.00B | P-1.00B | Davao City 2nd District Engineering Office |
| Construction of Flood Control Structure along Lamunan River, Downstream, Barangay San Andr | P688.9M | P103.2M | P-585.7M | Iloilo 3rd District Engineering Office |
| Construction of Concrete Road, Sta. 0 + 000 - 16 + 667, Barangay Umiray, Dingalan, Aurora | P400.0M | P57.0M | P-343.0M | Aurora District Engineering Office |
| Construction of Revetment along Carmona River, Barangay Cabilang Baybay, Carmona City, Cav | P450.0M | P150.0M | P-300.0M | Cavite 3rd District Engineering Office |
| Construction of Lake Mainit Circumferential - Lipata Port By-Pass Road to Wind Power Gener | P600.0M | P300.0M | P-300.0M | Surigao del Norte 2nd District Engineering Office |
| Construction (Completion) of Multi-Purpose Building, Sentro Komuniudad de Santa Cruz, Mani | P400.0M | P100.0M | P-300.0M | North Manila District Engineering Office |
| Construction of National Tobacco Administrative Building, Quezon City (14.635833, 121.0261 | P400.0M | P150.0M | P-250.0M | Quezon City 2nd District Engineering Office |
| Construction of University of the Philippines (UP) Diliman College of Arts and Letters (CA | P400.0M | P150.0M | P-250.0M | Quezon City 2nd District Engineering Office |
| Bacolod Negros Occidental Economic Highway (BANOCEH) (Victorias - Sagay), Sta. 11+380 - St | P380.0M | P160.0M | P-220.0M | Negros Occidental 1st District Engineering Office |
| Bacolod Negros Occidental Economic Highway (BANOCEH) (Victorias - Sagay), Sta. 3+000 - Sta | P375.0M | P168.8M | P-206.2M | Negros Occidental 1st District Engineering Office |
| Construction of Road, Barangay Plaridel to Magsaysay, Aborlan, Palawan | P225.0M | P25.0M | P-200.0M | Palawan 3rd District Engineering Office |
| Construction of Drainage Canal along Bulana-Bulanao Norte-Laya West-Laya East Road, Sta.0+ | P300.0M | P110.0M | P-190.0M | Lower Kalinga District Engineering Office |
| Tanudan-Barlig - Ifugao Road (Tanudan-Barlig Section) - Sta. 1+396 - Sta. 5+396 | P200.0M | P20.0M | P-180.0M | Mountain Province 2nd District Engineering Office |
| Construction Of Main Drainage Along R. Calo St., Montilla Street Jct. To Salvador Calo Jct | P300.0M | P150.0M | P-150.0M | Butuan City District Engineering Office |
| Construction of Water Supply, Subic, Zambales | P250.0M | P100.0M | P-150.0M | Zambales 2nd District Engineering Office |

## 3. House insertions (in HB, not in NEP)

### By DPWH program

| Program | Items | Amount |
|---|---:|---:|
| Basic Infrastructure Program | 4,983 | P148.13B |
| Asset Preservation Program | 264 | P38.92B |
| a. Asset Preservation Program | 19 | P30.76B |
| Flood Management Program | 577 | P27.72B |
| Network Development Program | 194 | P22.72B |
| Unknown/unattributed | 79 | P8.81B |
| a. Feasibility Study and Master Plan of Naga City Integrated | 5 | P3.54B |
| The Bridge Program aims to preserve and enhance the existing | 59 | P2.79B |
| Asset Preservation Program aims to construct, improve, and r | 45 | P1.42B |

### By region

| Region | Items | Amount |
|---|---:|---:|
| National Capital Region | 94 | P51.35B |
| Unattributed | 20 | P35.60B |
| Region XIII | 241 | P26.79B |
| Region II | 1,046 | P24.21B |
| Cordillera Administrative Region | 177 | P21.29B |
| Region IV-A | 754 | P16.75B |
| Region I | 884 | P14.20B |
| Region XII | 527 | P13.32B |
| Region V | 295 | P12.74B |
| Region X | 291 | P12.14B |
| Region VIII | 519 | P11.63B |
| Negros Island Region | 514 | P9.90B |
| Region VI | 379 | P7.24B |
| Region XI | 137 | P6.45B |
| 15. Region XII | 6 | P4.60B |
| Region VII | 33 | P3.81B |
| MIMAROPA Region | 107 | P3.28B |
| Region IX | 67 | P2.59B |
| Region III | 60 | P2.42B |
| 17. Region XIII | 1 | P2.31B |
| 5. Region IV-A | 32 | P1.26B |
| 12. Region X | 3 | P363.1M |
| 1. Region XIII | 7 | P291.1M |
| 2. Region II | 1 | P120.0M |
| 5. Region III | 17 | P63.0M |
| 1. National Capital Region | 6 | P36.5M |
| 14. Region XI | 3 | P24.7M |
| 16. Region XIII | 2 | P16.6M |
| 12. Region IX | 1 | P6.3M |
| 13. Region X | 1 | P6.0M |

### Top 25 largest insertions

| Amount | Project | Program | District Office |
|---:|---|---|---|
| P35.71B | 1. ORGANIZATIONAL OUTCOME 1: Ensure Safe and Reliable National Road System | Basic Infrastructure Program | Central Office |
| P10.92B | Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide | Asset Preservation Program | Dinagat Islands District Engineering Off |
| P8.21B | c. Laguna Lakeshore Road Network (LLRN) Project - Phase I, KEDCF Loan No. PHL-27, ADB Loan No.  | a. Asset Preservation Program | — |
| P5.74B | Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary R | Asset Preservation Program | Surigao del Sur 2nd District Engineering |
| P4.84B | Road Widening - Primary Roads | Network Development Program | — |
| P4.77B | Region III\nConstruction (Completion) of Multi-Purpose Building, Barangay Baras-Baras, Tarlac C | Basic Infrastructure Program | — |
| P3.92B | f. Davao City Bypass Construction Project (III) (South and Center Sections), Package I, JICA Lo | a. Asset Preservation Program | — |
| P3.92B | 2. Flood Control and Drainage Systems, Structures and Related Facilities | — | b. Cotabato 2nd District Engineering Off |
| P3.58B | Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide -\nTertiary R | Asset Preservation Program | Region XIII\nSurigao del Sur 2nd Distric |
| P3.07B | e. Cavite Industrial Area Flood Risk Management Project (CIA-FRIMP), JICA Loan Nos. PH-P265 and | a. Asset Preservation Program | — |
| P3.04B | a. Pasig - Marikina River Channel Improvement Project (PMRCIP), Phase IV, JICA Loan Nos. PH-P27 | a. Asset Preservation Program | — |
| P2.65B | Construction of Multi-Purpose Building, Barangay Impalutao, Municipality of | Basic Infrastructure Program | amboanga Sibugay 2nd District Engineerin |
| P2.57B | k. Cebu-Mactan Bridge (4th Bridge) and Coastal Road Construction Project, JICA Loan No. PH-P274 | a. Asset Preservation Program | — |
| P2.52B | a. Southeast Metro Manila Expressway (C6) Project; C5 Southlink Expressway Project; South Luzon | a. Feasibility Study and Maste | Central Office |
| P2.52B | Region II\nConstruction (Completion) of Evacuation Center, Barangay Minanga, San Mariano, Isabe | Basic Infrastructure Program | — |
| P2.39B | h. Davao City Bypass Construction Project (II) (South and Center Sections), Package 1, JICA Loa | a. Asset Preservation Program | — |
| P2.38B | Road Widening - Tertiary Roads | Network Development Program | Surigao del Norte 1st District Engineeri |
| P2.31B | d. Repair and Maintenance of Road Safety Facilities | — | c. Regional Office XII |
| P1.85B | Daang Maharlika Road Development Project - Package B3-A, Section: Quirino-Andaya Highway | Asset Preservation Program | — |
| P1.71B | a. Mindanao Transport Connectivity Improvement Project, IBRD Loan No. 9775-PH | a. Asset Preservation Program | — |
| P1.60B | Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roa | Asset Preservation Program | Dinagat Islands District Engineering Off |
| P1.58B | d. Integrated Flood Resilience and Adaptation 1 (InFRA 1) Project, ADB Loan No. 4345-PHI GOP | a. Asset Preservation Program | — |
| P1.57B | Daang Maharlika Road Development Project - Package B3-B, Section: R. Andaya Highway | Asset Preservation Program | — |
| P1.12B | a. Reconstruction and Development Plan for Greater Marawi, Stage 2, (Bangon Marawi Output 2), A | a. Asset Preservation Program | — |
| P1.00B | Public-Private Partnership Strategic Support Fund (including ROW, Subsidy, and Variations) | Basic Infrastructure Program | Surigao del Norte 1st District Engineeri |

## 4. House removals (in NEP, not in HB)

### By NEP program (pap2)

| Program | Items | Amount |
|---|---:|---:|
| Network Development Program | 323 | P34.29B |
| Basic Infrastructure Program | 828 | P31.21B |
| Asset Preservation Program | 469 | P31.03B |
| Flood Management Program | 316 | P26.30B |
| Bridge Program | 194 | P11.78B |
| National Building Program | 105 | P6.20B |
| Construction/ Rehabilitation of Water Supply/ Septage and Se | 248 | P2.04B |
| Construction/Rehabilitation/Improvement of Facilities for Pe | 51 | P510.0M |

### Top 25 largest removals

| Amount | Project | Office |
|---:|---|---|
| P2.20B | Quirino H-way - K0251 +(-511) - K0264 + 968 | Quezon 4th District Engineering Office |
| P2.09B | Pancian Viaduct along Manila North Road, Ilocos Norte | Ilocos Norte 1st District Engineering Of |
| P1.20B | Lopez Viaduct (FB50957LZ) along Maharlika Highway, Brgy. Canda Ibaba - Brgy. Pandanan, Calauag, | Quezon 4th District Engineering Office |
| P1.00B | Maharlika Highway (Sn Isidro-Sn Juanico Br) - K0816 + 000 - K0831 + 000 | Samar 2nd District Engineering Office |
| P1.00B | Maharlika Highway (Sn Isidro-Sn Juanico Br) - K0831 + 000 - K0846 + 000 | Samar 2nd District Engineering Office |
| P1.00B | Maharlika Highway (Sn Isidro-Sn Juanico Br) - K0846 + 000 - K0861 + 000 | Samar 2nd District Engineering Office |
| P1.00B | Maharlika Highway (Sn Isidro-Sn Juanico Br) - K0861 + 000 - K0876 + 000 | Samar 2nd District Engineering Office |
| P1.00B | Maharlika Highway (Sn Isidro-Sn Juanico Br) - K0876 + 000 - K0894 + 840 | Samar 2nd District Engineering Office |
| P743.7M | Construction of Road Dike along Abacan River, San Juan-San Jose Malino, Mexico, Pampanga, Sta.  | Pampanga 1st District Engineering Office |
| P575.0M | Improvement of Road and Drainage System along Taft Ave. (From UN Ave. to Ayala Blvd.), Manila C | South Manila District Engineering Office |
| P427.8M | Dagupan-Mangaldan Diversion Road, Dagupan City-Mangaldan, Sta. 0+861-Sta.1+512, Sta.5+280-Sta.- | Pangasinan 2nd District Engineering Offi |
| P410.0M | Construction of Matalahib Creek Pumping Station, Quezon City | Quezon City 1st District Engineering Off |
| P400.0M | Construction of DPWH Negros Island Region (NIR) Regional Office Building, Amlan, Negros Orienta | Negros Oriental 2nd District Engineering |
| P400.0M | Construction of Water System, Municipality of Bubong to Municipality of Ditsaan-Ramain, Lanao d | Regional Office X BARMM |
| P400.0M | Capas-Botolan Road (Sta. 008+320 - Sta. 009+845, Sta. 009+845 - Sta. 011+495), Tarlac | Tarlac 2nd District Engineering Office |
| P400.0M | Construction of Lumbocan Br. (6-lanes) along Butuan City-Agusan del Norte Logistical Highway, B | Butuan City District Engineering Office |
| P400.0M | Breakwater Construction at the Proposed Butuan Logistical Seaport, Section 1, Brgy. Lumbocan, B | Butuan City District Engineering Office |
| P400.0M | Dredging Works at the Proposed Butuan Logistical Seaport, Brgy. Lumbocan, Butuan City | Butuan City District Engineering Office |
| P400.0M | Construction of Multi-Purpose Building, Butuan City 8.942260, 125.508396 | Butuan City District Engineering Office |
| P400.0M | Construction of Sabo Dam Structures, Kabang (Masarawag) River, Main Dam per Final Master Plan R | Albay 3rd District Engineering Office |
| P393.4M | Samal Br. (B00055LZ) along Roman Expressway | Bataan 1st District Engineering Office |
| P393.2M | Naga-Jct. Magarao-Canaman-Libmanan Jct. PPH Road (Skybridge), Camarines Sur, Sta 419+082.25 - S | Camarines Sur 3rd District Engineering O |
| P389.1M | Camarines Sur Expressway Project - Anayan River Viaduct - (Sta. 443+480 - Sta. 443+900), Camari | Camarines Sur 3rd District Engineering O |
| P377.9M | Manila North Rd - K0212 + 007 - K0213 + 497, K0215 + (-927) - K0215 + (-837), K0215 + (-808) -  | La Union 2nd District Engineering Office |
| P373.0M | Bacolod Negros Occidental Economic Highway (BANOCEH), Sta. 6+603 - Sta. 9+975, E.B. Magalona, N | Negros Occidental 1st District Engineeri |

## 5. Caveats & next steps

1. **365 fuzzy pairs scored 85–92** (mostly OCR variants and chainage-only differences) — kept out of the headline match counts; see `crosscheck_results.json → matched_review`.
2. HB rows ≥ P1B aggregate captions (e.g. `Organizational Outcome 1 …`) were filtered as headers, not projects; a few large genuine foreign-assisted projects therefore sit in the insertion list (LLRN Phase I, Davao City Bypass III, CIA-FRIMP, PMRCIP IV — these exist in HB with loan-tagged names that the NEP dump does not contain as separate items).
3. District-office attribution for HB rows relies on the OCR table hierarchy; ~17% of rows lack an office context (mostly region-level lump sums like `Regionwide / Nationwide`).
4. Unit handling: HB prints pesos; NEP stores thousands. All comparisons use thousands.
5. Suggested next steps: reconcile the review bucket manually (365 rows), then link matched NEP codes to the DPWH transparency contracts data (`dpwh-transparency-data-api-scraper`) for implementation-stage tracking of House-inserted projects.