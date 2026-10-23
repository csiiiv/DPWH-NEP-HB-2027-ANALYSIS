# Disclaimer — FY2027 Budget Workbenches

Last updated: 23 October 2026.

**Independent and unofficial.** These workbenches provide independent analysis
of retained FY2027 National Expenditure Program (NEP), House General
Appropriations Bill (GAB), and related source materials. They are not official
records of the DBM, DPWH, DA, DOH, NIA, the House of Representatives, or the
Senate, and are not presented as reviewed or endorsed by those institutions.
Verify a figure against the specific source document, edition, and budget stage
cited for it. A supplied copy's reading label, or identical text across selected
annex pages, does not independently authenticate the legislative stage of the
entire bill. Figures describe the allocations in those sources; they do not
establish amounts obligated or disbursed, or work completed.

**Links and endorsements.** A link from a government office, legislature, media
outlet, or other third party does not itself imply endorsement or official
review. Correspondence or document exchanges with an office do not make the
workbench an official or peer-reviewed product of that office.

**Source records, extraction, and interpretation.** Budget datasets are built
from retained documents and, where identified, API snapshots. Extraction uses
native PDF text where available and OCR where needed. The workbenches apply
documented normalization and review rules, but errors can arise at several
distinct stages: defects in the printed source, OCR or extraction errors,
normalization errors, and uncertain cross-document matching. An extraction
disagreement is not attributed to the printed source unless checked against
that source. Retained raw text, repair annotations, and review flags should be
consulted alongside normalized values where available.

**Matching is provisional.** Project pairings and classifications such as
*retained*, *increased*, *decreased*, *insertion candidate*, and *deletion
candidate* result from documented rules applied to titles, locations, amounts,
and road-station text. Source-local identifiers do not by themselves certify
cross-document identity. Different reasonable matching rules can produce
different classifications from the same source rows. **Pairings and change
classifications are candidates and review leads, not certified findings.**
Unmatched rows alone do not establish that a project was inserted, removed, or
reduced. Matching uncertainty is distinct from whether a printed amount was
transcribed correctly.

**Ambiguity remains visible.** The DPWH comparison holds zero-overlap segment
pairs in scope review and excludes their deltas from same-project
increase/decrease totals. Cross-program title-and-amount twins remain unpaired
with review cross-references; reading-only rows with NEP twins carry possible
restoration markers without certifying restoration. Similar titles, equal
amounts, and membership in the same road or building family do not establish
project identity. Human review remains necessary for unresolved cases. See the
[ambiguity remediation notes](../analysis/docs/remediation_honest_ambiguities.md)
and [data user guide](../analysis/docs/data_user_guide.md).

**Reconciliation and coverage.** Reconciliation results and known exceptions
are documented for each dataset. Balanced totals do not establish that every
title, location, or pairing is correct. For example, the NEP HFEP printed
controls exceed the extracted facility ledger by a documented **₱140,000**;
both values are retained rather than forced to agree. Source stages, parent
controls and child rows, and repeated or multi-segment records must not be
added together as separate funding. Workspaces cover the stated schedules and
record grains, rather than every agency's entire budget. See the
[HFEP source limits](../analysis-hfep/README.md#status-and-scope),
[FMR guide](../other-analysis/FMR_WORKBENCH.md), and
[NIA guide](../analysis-nia/NIA_WORKBENCH.md).

**Office and legislative-district associations.** The DEO mapping associates
offices with legislative districts; it does not establish that a representative
requested, sponsored, or controlled a project, or that each project lies in
every district associated with its office. Shared-office totals remain
undivided and must not be split among the districts served. Office-based views
must retain attribution tiers, co-served districts, unattributable residuals,
and upstream uncertainty annotations. Historical or undated amounts retained
as mapping evidence are separate from the FY2027 project ledger and must not
be quoted as FY2027 allocations. See the
[DEO mapping restrictions](../DEO2LEG/README.md#disclaimers).

**No allegations.** An insertion, deletion, or amount-change candidate describes
a provisional comparison between identified sources. That classification alone
does not establish irregularity or wrongdoing by any office or official and
should not be represented as such. Absence from an API snapshot likewise does
not establish absence from the printed NEP or concealment.

**Additional reading limits.**

- **Chainage, coordinates, and derived costs.** Parsed or repaired road-station
  spans and GPS coordinates remain subject to their review flags. A repair is
  not a certified survey correction. Allocation divided by parsed length is an
  analytical ratio, not a certified construction unit cost: an allocation may
  cover work beyond the stated span. Coordinates and geocoding do not certify
  project boundaries or legislative-district attribution.
- **Units and budget basis.** Check currency units, fiscal year, funding column,
  and scope before comparing amounts. Some agency forms, including BP201, use
  thousands of pesos. Annual allocations, total project costs, and loan/GOP
  components are different bases and must not be compared or combined without
  an explicit scope reconciliation.
- **Document-specific pages.** Cite the filename or document identifier,
  reading, volume, and one-based PDF file page; include the printed page label
  separately where available. Page numbers are not interchangeable across
  copies, volumes, or readings. See the
  [source page reference guide](../analysis/docs/source_page_reference_checks.md).
- **Verification sources.** Check retained figures against the cited primary
  documents and their provenance. Third-party transcriptions, including
  BetterGov material where used, are supplementary evidence and should not be
  described as official records without documented authority. Human-reviewed
  records should identify the source and extent of review.

**Citation, revision, and corrections.** When quoting, retain the dataset
filename, record ID, build identifier or repository commit, access date, and
the underlying source filename/edition, volume, and PDF page/row. If no build
identifier is supplied, retain the dataset file and its checksum alongside
the repository commit. Screenshots and links alone may omit this context.
Results may change following source corrections, extraction or normalization
repairs, or revisions to matching rules. Check for subsequent corrections
before republication while preserving the version originally quoted. Report
suspected errors through the
[repository issue tracker](https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/issues),
with the record, version, source reference, and proposed correction.

The workbenches are provided as-is, without warranty of accuracy or completeness.
Readers remain responsible for checking the cited evidence before relying on
or republishing a figure.
