# Source page references after native I-C integration

Date: **9 October 2026**.

Each reference identifies its reading, PDF volume and one-based file page.
The page belongs to that specific PDF; it is not interchangeable with the same
number in another volume, the combined CR 638, or a differently paginated NEP
publication.

| Webpage record | Source document | Link label |
|---|---|---|
| House control hierarchy | 2nd-reading Volume I-B | House 2nd · I-B p.… |
| House/NEP PAP and project comparisons | 2nd-reading Volume I-C | House 2nd · I-C p.… |
| House reading comparison, second side | 2nd-reading Volume I-C | House 2nd · I-C p.… |
| House reading comparison, third side | 3rd-reading Volume I-C | House 3rd · I-C p.… |
| NEP comparison projects | Retained Volume II-B OCR PDF | NEP · II-B (retained OCR) p.… |

I-B remains the agency/control hierarchy source. I-C is the source of current
House operations project titles and the PAP controls shown beside those
projects. The retained NEP OCR file's page numbers must not be applied to the
other NEP PDFs linked on Resources.

For example, the second-reading Convergence **control** is on I-B page **80**,
while its project-detail heading is on I-C page **373**. Both references are
valid for their respective volumes.

Examples from third-reading I-C:

- Convergence program heading: page **373**.
- Regional Office I allocation, ₱9M: page **402**.
- J.P. Rizal box culverts in Caloocan, ₱36M and ₱32M: page **323**.

The labels previously shortened House links to “House p.…”, “House PDF p.…”,
or “PDF page …”, obscuring the volume and reading. They now name both; previews
also identify the selected source document. The audited page numbers were
already mapped to the appropriate native source and have not been renumbered.

## Checks

The audit compared **16,270 second-reading** and **16,275 third-reading**
operations allocation references against their native I-C node's source page,
checked every page against the corresponding PDF's page count, and inspected
the Convergence heading on page 373 of both PDFs. All **32,545** references
agreed. Current House/NEP project references were also checked against the
second-reading I-C nodes.

Frontend regressions verify that an I-B tree control, an I-C project, the two
House readings and a retained NEP project resolve to their distinct documents
without applying a page offset. Browser checks cover explicit volume labels
and rendered I-B/I-C previews at mobile and desktop widths.

```sh
npm test --prefix analysis/web
node --test analysis/tests/test_source_verification_viewer.cjs
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/check_react_pages.py
```

## Project browsing and search

The House workspace provides separate I-B controls and native I-C project
hierarchies for both readings. Open `#house?view=projects&reading=third` for
third-reading projects, or use `reading=second` for the second reading. Their
MOOE+CO totals remain separate from I-B's full agency total; no detail is added
to the control tree. The synthetic I-C root has no standalone printed control
or source-page button. Actual source nodes retain their I-C page references.

NEP's `#nep?view=projects` selects project line items from its existing full
source hierarchy. Parent paths and the recorded II-B OCR pages remain available.
The verification filter can switch between project line items and all nodes.

Search matches words regardless of punctuation or order and treats “Barangays”
as “Barangay”. For example, `J.P. Rizal box culvert, Barangays 34–35, Caloocan`
finds the ₱32M third-reading record on I-C page 323. It has no second-reading
counterpart. The House/NEP comparison retains the second-reading baseline and
links explicitly to the third-reading project tree and reading comparison.

The default House workspace now uses third-reading I-B controls. Reading and
I-B/I-C view toggles preserve the other selection. Third-reading I-B references
open `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf`;
second-reading I-B references continue to open their original PDF. The complete
agency total includes PS in either I-B view; I-C remains a separate project view.
