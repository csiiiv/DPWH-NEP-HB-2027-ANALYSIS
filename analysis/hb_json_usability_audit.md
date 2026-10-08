> **House repair update:** use [hb_known_defect_repairs.md](hb_known_defect_repairs.md) and [hb_dpwh_leaves_corrected_v5.json](hb_dpwh_leaves_corrected_v5.json) for the repaired candidate. v5 has 16,148 positive allocations totaling ₱581.345349B; 38/42 PAP controls and all FAP funding splits balance. The remaining ₱5.596312B net operations gap is confined to four Convergence PAPs. Earlier v4b completeness, program-delta, zero-region, and grand-upper-bound claims below are historical. The printed House grand total is ₱654.102015B. Earlier API matcher/dashboard artifacts have not been regenerated.

# House JSON usability audit — FY2027 DPWH

All saved House datasets and related crosscheck/validation JSONs were inventoried. Originals were not modified.

## Recommendation

Use native PDF summary controls for grand/program totals, `crosscheck_2027_pap_drilldown.json` for PAP controls after the page checks below, and [House v5](hb_dpwh_leaves_corrected_v5.json) as the current repaired candidate project table. See the [current source comparison](source_comparison_2027.html) for printed controls, four unresolved PAPs, and candidate project matches. No existing project table is complete or safe to sum as a certified budget.

`hb_dpwh_leaves_corrected_v3.json` and `textlayer_audit_v3.json` are the amount-repair/provenance baseline. v4/v4b retain the same amounts; their improvements are attribution. The hierarchy and block tree retain pre-repair amounts and damaged heading controls.

## Dataset comparison

| File | Rows | Total ₱B | Missing region | Exact native title+amount | Heading-only exact hits |
|---|---:|---:|---:|---:|---:|
| hb_dpwh_items.json | 15,066 | 593.368882 | 20 | 13,546 | 3 |
| hb_dpwh_leaves_validated.json | 15,487 | 538.804830 | 2,248 | 14,006 | 29 |
| hb_dpwh_leaves_corrected.json | 15,487 | 528.250579 | 2,248 | 14,062 | 31 |
| hb_dpwh_leaves_corrected_v2.json | 15,487 | 522.296863 | 2,248 | 14,130 | 29 |
| hb_dpwh_leaves_corrected_v3.json | 15,487 | 520.651663 | 2,248 | 14,130 | 29 |
| hb_dpwh_leaves_corrected_v4.json | 15,487 | 520.651663 | 2,248 | 14,130 | 29 |
| hb_dpwh_leaves_corrected_v4b.json | 15,487 | 520.651663 | 32 | 14,130 | 29 |
| hb_dpwh_leaves_corrected_v5.json | 16,148 | 581.345349 | 0 | Not rerun | Not rerun |

Exact native presence does not establish completeness, uniqueness, correct attribution, or valid additive status. Office allocation rows can legitimately be budget units even when classified as headings.

## Printed controls and coverage

- Volume I-B PDF page 9: new appropriations ₱654.102015B = PS ₱14.922297B + MOOE ₱24.685746B + CO ₱614.493972B.
- Operations including local/FAP projects: ₱586.941661B. Current candidate leaves: ₱520.651663B; net coverage shortfall ₱66.289998B. This is a net reconciliation gap, not a quantified list of missing projects.
- GAS and S2O combined: ₱67.160354B. Thus ₱586.941661B + ₱67.160354B = ₱654.102015B. Leaves plus MOOE is not a grand-total upper bound.
- Missing regions in v4b: {'pap': 10, 'fap': 22}. This contradicts the previous summary claim of zero region-less leaves; any filtered matcher counts must be distinguished from full-table coverage.
- v4b retains 32 rows tagged `pdf3:verified_rollup`, totaling ₱4.565125B. Review additive status; do not automatically delete all of them.

## Program crosscheck — local operations excluding FAP

| Program | House printed ₱B | NEP source ₱B | House − NEP ₱B |
|---|---:|---:|---:|
| Asset Preservation Program | 79.720290 | 68.418283 | +11.302007 |
| Network Development Program | 92.435879 | 92.179924 | +0.255955 |
| Bridge Program | 37.590473 | 38.987589 | -1.397116 |
| Flood Management Program | 87.187778 | 83.846944 | +3.340834 |
| Convergence and Special Support Program | 231.382287 | 157.308648 | +74.073639 |
| Local Program | 13.875943 | 14.433675 | -0.557732 |

House local operations sum to ₱542.192650B versus NEP non-FAP operations ₱455.175063B: +₱87.017587B. House FAP ₱44.749011B versus NEP FAP ₱117.749011B: −₱73B. Operations therefore increase ₱14.017587B; GAS/S2O decline ₱2.527587B, giving the printed total increase of ₱11.49B.

## PAP crosscheck

| PAP | House native control ₱B | NEP source control ₱B | v4b exact-label sum ₱B | Native heading agrees |
|---|---:|---:|---:|---|
| BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities | 134.927811 | 105.725209 | 132.686016 | True |
| BIP - Multi-Purpose Buildings/ Facilities to support Social Services | 83.706551 | 40.974839 | 78.585593 | True |
| Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems | 70.964897 | 62.988802 | 64.053040 | True |
| Construction of By-Pass and Diversion Roads | 44.786384 | 46.458080 | 29.421484 | True |
| Construction of Missing Links/ New Roads | 22.661099 | 23.911762 | 22.366099 | True |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Primary Roads | 18.611152 | 18.330366 | 4.207570 | True |
| Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers | 16.222881 | 20.858142 | 16.371025 | True |
| Preventive Maintenance - Secondary Roads | 14.433303 | 11.678686 | 11.473265 | True |
| Preventive Maintenance - Primary Roads | 14.395583 | 13.343175 | 8.324667 | True |
| Widening of Permanent Bridges | 13.493005 | 15.291066 | 15.557270 | True |
| Buildings And Other Structures | 12.875943 | 13.433675 | 12.066095 | True |
| Replacement of Permanent Weak Bridges | 11.690636 | 12.030210 | 0.000000 | True |
| Road Widening - Secondary Roads | 10.900467 | 10.362723 | 11.063882 | True |
| Water Supply System | 7.740725 | 6.171400 | 8.254366 | True |
| Preventive Maintenance - Tertiary Roads | 7.265937 | 5.720057 | 6.028609 | True |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Secondary Roads | 6.587927 | 4.733762 | 4.939331 | True |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary Roads | 5.736126 | 4.817064 | 15.032909 | True |
| Construction of New Bridges | 5.719293 | 4.592468 | 0.000000 | True |
| Road Widening - Primary Roads | 4.836582 | 4.475859 | 2.800866 | True |
| Rehabilitation/ Major Repair of Permanent Bridges | 3.845294 | 3.866717 | 3.844294 | True |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Tertiary Roads | 3.575480 | 2.932241 | 1.649867 | True |
| Off-Carriageway Improvement - Secondary Roads | 3.030074 | 1.983747 | 4.175481 | True |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads | 2.885909 | 1.953964 | 2.885909 | True |
| Retrofitting/ Strengthening of Permanent Bridges | 2.842245 | 3.007128 | 2.842245 | True |
| Road Widening - Tertiary Roads | 2.376194 | 1.630698 | 2.376194 | True |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Secondary Roads | 2.226501 | 1.379850 | 2.955575 | True |
| BIP - Coastal Roads to augment Resiliency of Coastal Communities | 1.670000 | 1.381000 | 3.126800 | True |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Primary Roads | 1.668650 | 1.651164 | 0.000000 | True |
| Off-Carriageway Improvement - Primary Roads | 1.656179 | 1.313665 | 2.188672 | True |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roads | 1.604318 | 1.693051 | 0.731728 | True |
| Off-Carriageway Improvement - Tertiary Roads | 1.077879 | 0.741599 | 0.000000 | True |
| Rainwater Collector System | 1.027200 | 1.027200 | 0.099000 | True |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Tertiary Roads | 0.729404 | 0.184903 | 0.000000 | True |
| BIP - Local Ports and Boat Landings | 0.700000 | 0.419000 | 5.893000 | True |
| Paving of Unpaved Roads - Tertiary Roads | 0.569029 | 0.540082 | 1.138058 | True |
| Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges | 0.515000 | 0.734717 | 0.515000 | True |
| Facilities for Elderlies/ Senior Citizen | 0.340000 | 0.340000 | 0.340000 | True |
| Septage and Sewerage | 0.100000 | 0.100000 | 0.000000 | True |
| Facilities for Persons with Disabilities (PWD) | 0.085000 | 0.085000 | 0.000000 | True |
| Gender-Responsive Facilities | 0.085000 | 0.085000 | 0.085000 | True |
| Paving of Unpaved Roads - Secondary Roads | 0.021992 | 0.021992 | 0.043984 | True |
| Paving of Unpaved Roads - Primary Roads | 0.005000 | 0.005000 | 0.000000 | True |

## Historical v4b defects and downstream use

The v5 repair report supersedes the repaired paving, Rainwater, PM-Primary, subtype, bridge, facility, local-program, and FAP defects below. Four Convergence PAPs remain unresolved. Native-title hit metrics have not been rerun for v5.

- All 42 saved PAP local controls agree with native PDF heading amounts on their referenced pages and map to audited NEP PAP controls. This checks printed controls, not completeness of project rows or all regional subtotals.
- Secondary-road paving: PDF page 255 prints ₱21.992M; v4b retains that subtotal plus all three projects, totaling ₱43.984M. Confirmed double count.
- Rainwater: PDF page 401 prints ₱1.0272B; the dedicated region/office crosscheck balances, but v4b captures only ₱99M under that label.
- Preventive Maintenance Primary: PDF page 110 prints ₱14.395583B. The OCR hierarchy and v4b validation use ₱12.353654B, which is the following NCR subtotal. Their reported parser gap uses the wrong control.
- `crosscheck_2027_lineitems.json` uses the incomplete v4b local table against the incomplete API, not the complete audited NEP source. Matches are candidates and unmatched rows are not established additions/deletions.
- `nep_2027_hb_only_reassessment.json` improves source-presence review but covers only the old API-unmatched pool and is not a full House–NEP rematch.
- `hb_dpwh_items.json`, `crosscheck_results.json`, and `crosscheck_summary.json` reflect older mixed-scope/raw extraction and should not supply current conclusions.
- `crosscheck_2027_v4b_validation.json` is diagnostic only: stale OCR controls and parent/child scope mismatches make some gaps misleading.

## Structural files

- `hb_dpwh_pap_hierarchy.json`: 2,592 nodes; statuses {'rollup_only': 315, 'review': 261, 'validated': 1912, 'container': 104}; 15,487 embedded projects, ₱538.804830B. Original amounts agree: True.
- `hb_block_tree.json`: 2,592 nodes; statuses {'rollup_only': 315, 'review': 261, 'validated': 1912, 'container': 104}; 0 embedded projects, ₱0.000000B. Original amounts agree: not applicable — no embedded project rows.

## Method limits

- Native exact checks are conservative global title/amount presence checks, not one-to-one page-scoped verification.
- NEP candidate checks require equal PAP/title/amount; title or amount changes remain unresolved, not proven insertions.
- PAP heading checks use native PDF fonts/rows; failure to match is an extraction limitation, not proof a heading is absent.
- Printed controls are from local PDFs; plenary amendment inclusion is not established.
