# House 2nd → 3rd reading comparison and office filters

Date: **9 October 2026**. Both native House baselines remain retained. The
House/NEP candidate view continues to use the second reading; the stage
comparison now includes a **House readings** tab comparing second and third
reading operations allocations. Open `#compare?view=readings` in the app.

## Source scope and totals

| Control | 2nd reading | 3rd reading | 3rd − 2nd |
|---|---:|---:|---:|
| Full agency total, PS/MOOE/CO | ₱654,102,015,000 | ₱654,102,015,000 | ₱0 |
| I-C MOOE+CO | ₱639,179,718,000 | ₱639,179,718,000 | ₱0 |
| Support to Operations, all expense classes | ₱49,082,061,000 | ₱48,948,061,000 | −₱134,000,000 |
| Operations including local/FAP | ₱586,941,661,000 | ₱587,075,661,000 | +₱134,000,000 |
| Named-project leaves | 15,972 | 15,977 | +5 |
| Operations comparison allocations | 16,270 | 16,275 | +5 |

Each reading passes 2,477 internal I-C controls and 56 independent I-B
cross-volume checks. The agency total and its expenditure columns are
unchanged; the operations increase is offset by the lower Support to
Operations control. Source amounts are retained without adjustment.

The [reading comparison JSON](../data/house_reading_changes_2027.json) contains
both source sides, project deltas, PAP deltas, printed controls and provenance.
Source documents remain distinct:

- Second reading: [I-B](../../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf),
  [I-C](../../HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf).
- Third reading: [I-B](../../HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf),
  [I-C](../../HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf).

The package includes both readings' native artifacts and I-B/I-C PDFs. Each
reading's source-reference button opens its own I-C document, even when the
page number is the same.

## Five additional printed records

All five third-reading-only records belong to **Metro Manila 3rd District
Engineering Office**, NCR. They total ₱134,000,000:

| Third-reading I-C page | Project | Amount |
|---|---|---:|
| 323 | Reinforced concrete box culvert, J.P. Rizal St., C 0+000–C 0+484, Barangay 28, Caloocan | ₱36,000,000 |
| 323 | Reinforced concrete box culvert, J.P. Rizal St., C 0+953–C 1+471, Barangays 34 and 35, Caloocan | ₱32,000,000 |
| 451 | Drainage and pathwalk, 1st/2nd/3rd Streets, Barangay 10, Caloocan | ₱25,000,000 |
| 451 | Drainage and pathwalk, Salaysay and Salmon Streets, Barangay 8, Caloocan | ₱15,000,000 |
| 451 | Roads and drainage, Tanigue St., C 0+000–C 0+180, Barangay 14, Caloocan | ₱26,000,000 |

The flood-mitigation PAP increases by ₱68,000,000 and BIP Access Roads by
₱66,000,000. No uniquely matched operations allocation changes its amount;
no second-reading-only key remains under this comparison method. These are
printed-record observations, not independent certification of project
identity or legislative intent.

## Matching and delta treatment

A reading key consists of normalized title, canonical PAP, region, recorded
office, allocation kind and local/FAP scope. Neither matching amounts nor
native node numbers establish identity between readings.

Unique keys pair directly. One repeated key in each reading is shown as a
group with its complete source records and aggregate amount, without an
invented individual pairing. Every operations allocation is consumed once.
The table contains 16,268 unique same-amount pairs, one repeated-key group
and five third-reading-only rows.

For ledger differences, an absent side contributes zero: **delta = third
amount − second amount**. The absent source amount remains displayed as
unavailable, not a printed zero. Presence-only rows remain labelled by their
reading. Row deltas sum to the printed operations difference of ₱134,000,000.

The comparison defaults to **Changed allocations**. Users can inspect all
records, same amounts, reading-only records, paired amount changes and
repeated keys. Sorting applies to the entire filtered result before pagination.

## Region and engineering office filters

The stage comparison, House readings table and House/NEP project detail expose
region and **Engineering office / DEO** selectors. Office options narrow to
the selected region; changing region clears the office selection. Office names
appear on project rows with their source labels.

A record matches a recorded office in any displayed source. Fuzzy suggestions
are excluded because they do not establish an office assignment. Central
Office and regional-office allocations remain selectable where recorded.
**No recorded office** selects records with no office in any displayed source;
project geography does not fill that gap.

The shared [office filter helper](../viewers/project_offices.mjs) works with
both native readings, the NEP/API stage trace and flat source omission rows.

## Rebuild and checks

After either House source changes, rebuild its native tree/audit first, then:

```sh
python analysis/builders/build_current_pages.py
python analysis/builders/build_house_readings.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
python -m unittest analysis.tests.test_house_readings -v
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/check_react_pages.py
```

Validation recomputes the entire reading comparison and checks source/code
hashes, both native audits, allocation consumption and all delta sums.
Regression tests cover amount-independent matching, office changes, repeated
keys and presence-only differences. Frontend tests cover office filtering
before pagination and distinct reading PDFs. Browser checks exercise office
selection, region resets, empty results, the reading-change table, deep links
and the third-reading PDF at mobile and desktop widths.

## FAP in PAP totals

The stage comparison and House/NEP PAP tables include a separate
**Foreign-assisted projects (FAP)** control row. Local PAPs plus this row
reconcile to each source's operations total. FAP uses printed control amounts
and sums project totals once, without adding their funding children again.

Official NEP FAP is ₱117,749,011,000; House second-reading FAP is
₱44,749,011,000, a House − NEP difference of −₱73,000,000,000. House FAP is
unchanged between second and third readings; the reading comparison's PAP
controls include that zero-delta FAP row. FAP is outside the Transparency
listing scope, so its API amount and API-to-NEP change are unavailable.
The 44 balanced local House PAP count continues to describe local controls.

## Combined comparison display

PAP totals and Project records now include explicit HGAB2 and HGAB3 columns,
with HGAB3-minus-HGAB2 beside Transparency and NEP. The latest House reading is
HGAB3; the earlier generic House column represented HGAB2. All rows are shown
by default. The `change` URL parameter filters House changes on either table;
legacy `view=readings` links translate to the combined Project records view.

The adapter attaches the audited reading ledger through each second-reading
record's retained `source_record_id`. It consumes every HGAB2 allocation once,
keeps repeated keys grouped, and adds third-only records. Both House columns
reconcile independently to their operations controls; NEP/API amounts are
preserved. Project rows total 18,440, including one grouped repeated House key.
The 46 PAP/FAP rows likewise reconcile, with two changed PAP controls (+₱68M
flood maintenance, +₱66M BIP access roads). Unmapped House controls remain
unavailable. PAP PDF references now carry each reading's printed heading pages.


## Optional candidates across different source regions

The 18,440-row count above describes the default strict comparison. Selecting
**Region matching → Allow different regions · flag candidates** combines 28
additional unique House/NEP candidates (24 FAP, four local), producing 18,412
rows. It retains every source amount, source ID, PDF page and full tree path.
Both recorded regions remain visible; region/office filters can use either
source's assignment. Duplicate identities and repeated House groups stay
separate. This is an optional display join, not a rewrite of the retained match
ledger or the reading-change classification.

Share with `#compare?view=projects&region_match=ignore`; filter match status to
`region_difference_candidate` to isolate these rows. See
[shareable findings](shareable_findings.md#candidates-with-different-regions) and
[the PDF dataset method](pdf_budget_dataset_method.md).
