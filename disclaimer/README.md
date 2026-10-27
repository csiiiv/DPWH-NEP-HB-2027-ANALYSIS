# Disclaimer — FY2027 Budget Workbenches

Last updated: 26 October 2026.

## In plain language

- **No allegations of wrongdoing.** These workbenches compare budget records.
  A difference, flag, or ranking is not a finding of corruption, misconduct,
  or an unlawful act by any person or office.
- **No claim that a representative inserted a project.** Showing a project
  alongside a representative, district, or engineering office does not mean
  that the representative requested, inserted, sponsored, or controlled it.
  District and office totals are not personal allocations to a representative.
- **Comparisons are provisional.** Labels such as *insertion candidate*,
  *deletion candidate*, *increased*, and *decreased* are review leads. An
  unmatched row alone does not prove that a project was added or removed;
  titles, locations, or matching errors may explain the difference.
- **Independent and unofficial.** This analysis is not an official government
  record. A link or document exchange with an office does not imply its
  endorsement or review.
- **Allocations are not spending or completed work.** Amounts describe the
  cited budget sources; they do not establish money released, obligated, or
  disbursed, or projects completed.
- **Verify before quoting or sharing.** Source documents, text extraction,
  matching, and location mapping can contain errors or uncertainty. Check the
  cited source edition and page, keep the dataset version, and preserve the
  relevant caveats when sharing a result. Results may be corrected or revised.

The full disclaimer below explains the methods, coverage, and source-specific
limits behind these key points.

## Full disclaimer

These limitations apply when reading, quoting, or sharing results from the
FY2027 Budget Workbenches. Read them together with the scope, methods, source
references, and review flags documented for the dataset you are using.

### 1. Purpose and independence

The workbenches provide independent, unofficial analysis of retained FY2027
National Expenditure Program (NEP), House General Appropriations Bill (GAB),
and related source materials. They are not official records of the DBM, DPWH,
DA, DOH, NIA, the House of Representatives, or the Senate, and are not presented
as reviewed or endorsed by those institutions.

A link from a government office, legislature, media outlet, or other third
party does not itself imply endorsement or official review. Correspondence or
document exchanges with an office do not make the analysis an official or
peer-reviewed product of that office.

### 2. No allegations or personal attribution

A difference, flag, ranking, or change classification is an analytical result,
not a finding of corruption, misconduct, or an unlawful act. An insertion,
deletion, or amount-change candidate describes a provisional comparison
between identified sources. It does not, by itself, establish irregularity or
wrongdoing by any person or office and should not be represented as such.
Absence from an API snapshot likewise does not establish absence from the
printed NEP or concealment.

Displaying a representative's name alongside a project, office, or district
does not establish that the representative requested, inserted, sponsored, or
controlled the project, or was involved in a budget change. District and
office totals are not personal allocations to a representative.

The district engineering office (DEO) mapping associates offices with
legislative districts. It does not establish that each project lies in every
district associated with its office. Shared-office totals remain undivided
and must not be split among the districts served. Office-based views must
retain attribution tiers, co-served districts, unattributable residuals, and
upstream uncertainty annotations. Historical or undated amounts used as
mapping evidence are separate from the FY2027 project ledger and must not be
quoted as FY2027 allocations. See the
[DEO mapping restrictions](../DEO2LEG/README.md#disclaimers).

### 3. Budget sources, stages, and coverage

Each figure must be read against its cited source document, edition, and
budget stage. A supplied copy's reading label, or identical text across
selected annex pages, does not independently authenticate the legislative
stage of the entire bill.

Amounts describe allocations in the cited sources. They do not establish
money released, obligated, or disbursed, or work completed. Each workspace
covers its documented schedules and types of records. It does not necessarily
cover an agency's entire budget. Consult the
[HFEP source limits](../analysis-hfep/README.md#status-and-scope),
[FMR guide](../other-analysis/FMR_WORKBENCH.md), and
[NIA guide](../analysis-nia/NIA_WORKBENCH.md) for dataset-specific coverage.

### 4. Extraction, interpretation, and verification

Datasets are built from retained documents and, where identified, API
snapshots. Extraction uses native PDF text where available and optical
character recognition (OCR) where needed, followed by documented normalization
and review rules. Errors may originate in the printed source, text extraction
or OCR, normalization, or cross-document matching. An extraction disagreement
is not attributed to the printed source unless checked against that source.
Consult retained raw text, repair annotations, and review flags alongside
normalized values where available.

Verify figures against the cited primary documents and their provenance.
Third-party transcriptions, including BetterGov material where used, are
supplementary evidence and should not be described as official records
without documented authority. A human-review label should identify both the
source checked and the extent of review; it does not certify unreviewed
parts of a record or dataset.

### 5. Provisional matching and unresolved cases

Project pairings and classifications such as *retained*, *increased*,
*decreased*, *insertion candidate*, and *deletion candidate* result from
documented rules applied to titles, locations, amounts, and road-station text.
Source-local identifiers do not, by themselves, certify that records in
different documents describe the same project. Similar titles, equal amounts,
and membership in the same road or building family are also insufficient to
establish project identity.

**Pairings and change classifications are candidates and review leads, not
certified findings.** Different reasonable matching rules can produce
different classifications from the same source rows. Unmatched rows alone do
not establish that a project was inserted, removed, or reduced. Correctly
transcribing an amount does not resolve uncertainty about its project match.

The DPWH comparison preserves specific unresolved cases:

- **Segments with no overlap:** pairs remain in scope review, with their
  amount differences excluded from same-project increase/decrease totals.
- **Cross-program title-and-amount twins:** records remain unpaired, with
  review cross-references.
- **Reading-only rows with NEP twins:** possible restoration markers identify
  review leads without certifying that a project was restored.

Human review remains necessary to resolve these cases. See the
[ambiguity remediation notes](../analysis/docs/remediation_honest_ambiguities.md)
and [data user guide](../analysis/docs/data_user_guide.md).

### 6. Amounts, reconciliation, and units

Reconciliation results and known exceptions are documented for each dataset.
Balanced totals do not establish that every title, location, or pairing is
correct. For example, the NEP HFEP printed controls exceed the extracted
facility ledger by a documented **₱140,000**; both values are retained rather
than forced to agree.

Check currency units, fiscal year, funding column, and scope before comparing
amounts. Some agency forms, including BP201, use thousands of pesos. Annual
allocations, total project costs, and loan-funded or Government of the
Philippines (GOP) components use different bases and must not be compared or
combined without an explicit scope reconciliation.

Avoid double counting. Amounts from different budget stages, parent controls
and their child rows, or repeated or multi-segment records must not be added
together as separate funding.

### 7. Locations, road lengths, and derived costs

Parsed or repaired road-station spans (chainage), GPS coordinates, and derived
locations remain subject to their review flags. A repair is not a certified
survey correction. Coordinates and geocoding do not certify project
boundaries or legislative-district attribution.

Allocation divided by parsed length is an analytical ratio, not a certified
construction unit cost. An allocation may cover work beyond the stated span.
Interpret the ratio together with the source description, scope, and any
length or location uncertainty.

### 8. Quoting and sharing results

Check the cited evidence before quoting or republishing a result, and preserve
the relevant scope limits, provisional classifications, and review flags.
Retain enough information for another reader to identify both the analysis
version and its underlying evidence:

- **Dataset and record:** dataset filename and record ID.
- **Analysis version:** build identifier or repository commit, and access
  date. If no build identifier is supplied, retain the dataset file and its
  checksum alongside the repository commit.
- **Source reference:** source filename or document identifier, edition or
  reading, volume, and one-based PDF file page and relevant row. Include the
  printed page label separately where available.

Page numbers are not interchangeable across copies, volumes, or readings.
Screenshots and links alone may omit the information needed to reproduce a
result. See the
[source page reference guide](../analysis/docs/source_page_reference_checks.md).

### 9. Revisions, corrections, and responsibility

Results may change following source corrections, extraction or normalization
repairs, or revisions to matching rules. Check for subsequent corrections
before republication while preserving the version originally quoted.

Report suspected errors through the
[repository issue tracker](https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/issues),
including the affected record, dataset version, source reference, and proposed
correction.

The workbenches are provided as-is, without warranty of accuracy or
completeness. Readers remain responsible for checking the cited evidence
before relying on or republishing a figure.
