#!/usr/bin/env python3
"""Native text-layer extractor for HB 10858 VOL I-C (DPWH project details).

Geometry-first, same pattern as the VOL I-B extractor (hb_native_extract3.py),
extended for I-C's deeper outline and its two known text-layer artifacts:

  1. Mirrored margins: odd pages shift content ~+13.6pt; normalize by parity
     before band matching.
  2. Rows: tolerance-based y-clustering of words (label + amount of one
     printed row can differ ~0.3pt in y).
  3. Amount tokens live in the single AMOUNT column (x > 280 after shift
     removal); other numerals are label content (coordinates, loan numbers).
  4. Title wraps: continuation lines at the project indent carry no amount
     and attach to the amount row ABOVE them (post-wrap). One amount row has an unreadable standalone title glyph (U+0000);
     three continuation lines contain trailing nulls. Preserve the title
     text and attach every continuation to its preceding amount row.
  5. Narrative paragraphs are size ~7.7 Tahoma; table rows are 8.5. Font
     weight (Tahoma,Bold) marks printed control headings; regular weight
     marks region/office/project detail rows.
  6. Levels by normalized label-x band (built from amount rows only):
     I-C detail tables use ~59/68/79/89/100/112/123/141 (some sections add
     ~154). Textual fallbacks snap known heading patterns to their level.
  7. Lightly re-typeset pages (3rd-reading amendments) print their tables
     at 8.2pt with wider indent steps, so their raw x values never match
     the 8.5pt bands and must never seed band construction. Their rows are
     clustered into a separate re-typeset ladder and renormalized onto the
     standard bands by optimal order-preserving rung assignment (a band the
     re-typeset pages dropped — the two-digit enumerator drift band — is
     simply left unassigned).

Every retained amount row is accounted for: rows failing level assignment or
wrap attachment are reported, never silently dropped.

Usage:
  python3 hb_native_ic_extract.py <vol-ic.pdf> [start_page] [end_page] [out.json]
"""
import json
import re
import sys

import pymupdf

AMT = re.compile(r"^\d{1,3}(?:,\d{3})+$")
SMALL_INT = re.compile(r"^\d{1,3}$")
ENUM_RX = re.compile(r"^(?:\d{1,2}|[a-k])[.)]\s*")
ENUM_REGION_RX = re.compile(r"^(\d{1,2})\.\s+Region\b")
AMOUNT_X = 280.0      # normalized: everything right of this is the amount column
ODD_SHIFT = 13.6      # odd pages: content shifted right by this much
Y_MERGE = 2.5         # words within this y distance belong to one visual row
TABLE_SIZE = 8.0      # table rows are 8.5pt; narrative paragraphs are ~7.7pt
ARTIFACT = "\x00"     # one standalone glyph and three trailing continuation glyphs

SUBTOTAL = re.compile(r"^(Sub-total|Subtotal|Total)\b", re.I)
REGION_RE = re.compile(
    r"^(Region [IVX]{1,4}[A-B]?\b[-–]? ?|National Capital Region\b(?: \(?NCR?\)?)?"
    r"|Cordillera Administrative Region\b|Negros Island Region\b(?: \(?NIR?\)?)?"
    r"|MIMAROPA Region\b|Nationwide\b|BARMM\b)")
DEO_RE = re.compile(r"(District Engineering Office|Central Office\b"
                    r"|Regional Office\b|District Office\b|Bureau Proper\b)")
# anchored office-heading shape used for echo detection: the row must END
# with the office designation (optionally after a short comma-free prefix
# and enumerator), so project titles that merely CONTAIN office words
# ("Rehabilitation of DPWH Building, Iloilo 2nd District Engineering
# Office, Barangay …" — has commas and continues past the designation)
# never match. Mirrors hb_native_ic_rollup.classify's office test.
OFFICE_HEADING_RE = re.compile(
    r"^(?:[a-k]\. |\d{1,3}\. |\d{1,2}\) )?"
    r"(?!Construction\b|Rehabilitation\b|Repair\b|Improvement\b|Completion\b"
    r"|Upgrading\b|Procurement\b)"
    r"(?:[A-Z][A-Za-z0-9’' -]* )?"
    r"(?:District Engineering Office(?: \d+)?|District Office|Bureau Proper"
    r"|Central Office|Regional Office(?: [A-Z0-9][A-Z0-9 -]*)?"
    r"(?: \([^)]*\))?)$")
FUNDING_RE = re.compile(r"^(GOP|Loan Proceeds|Grant Proceeds|GOP Counterpart"
                        r"|GOP Equity|Counterpart Funding)\b", re.I)
# bold headings that define the fixed semantic levels
SECTION_RE = re.compile(
    r"^(MAINTENANCE AND OTHER OPERATING EXPENSES|CAPITAL OUTLAYS|OPERATIONS"
    r"|GENERAL ADMINISTRATIVE AND SUPPORT|SUPPORT TO OPERATIONS"
    r"|LOCALLY-FUNDED PROJECTS|FOREIGN-ASSISTED PROJECTS)$")
FAP_PAP_RE = re.compile(r"^[1-9]\. .+")
PROGRAM_RE = re.compile(r"^(ORGANIZATIONAL OUTCOME \d+|CONVERGENCE AND SPECIAL SUPPORT PROGRAM)")


def page_rows(page):
    """Visual rows with font metadata: [(x, y, text, font, size), ...].
    Second-chance merge: a few rows print the amount up to ~6pt off the
    title baseline (typesetting defect). After primary clustering, a lone
    amount cluster merges with a lone label cluster within 6pt."""
    words = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            for span in line["spans"]:
                for token in span["text"].split(" "):
                    if token:
                        words.append((span["bbox"][0], span["bbox"][1], token,
                                      span["font"], round(span["size"], 1)))
    words.sort(key=lambda w: (w[1], w[0]))
    clusters = []
    for w in words:
        if clusters and w[1] - clusters[-1][0] <= Y_MERGE:
            clusters[-1][1].append(w)
        else:
            clusters.append([w[1], [w]])
    merged = _merge_split_amounts(clusters, page.rect.width)
    rows = []
    for _, ws in merged:
        ws.sort(key=lambda w: w[0])
        rows.append(ws)
    return rows


def _merge_split_amounts(clusters, page_width):
    """Merge lone-amount clusters into a lone-label cluster within 6pt.
    Returns the cluster list with merges applied."""
    def is_amount_only(ws):
        return ws and all(AMT.match(w[2]) and w[0] > AMOUNT_X for w in ws)

    def is_label_only(ws):
        return ws and not any(AMT.match(w[2]) and w[0] > AMOUNT_X for w in ws)

    out = []
    used = set()
    for i, (y, ws) in enumerate(clusters):
        if i in used:
            continue
        if is_amount_only(ws):
            # find label cluster within 6pt
            best = None
            for j, (y2, ws2) in enumerate(clusters):
                if j in used or j == i:
                    continue
                if is_label_only(ws2) and 0 < abs(y2 - y) <= 6.0:
                    if best is None or abs(y2 - y) < abs(clusters[best][0] - y):
                        best = j
            if best is not None:
                by, bws = clusters[best]
                used.update({i, best})
                out.append((min(y, by), ws + bws))
                continue
        out.append((y, ws))
    return out


def norm_row(ws, page_number):
    """Normalize one visual row: parity shift, strip running heads/echoes,
    split label vs amount tokens. Returns dict or None for noise rows."""
    odd = (page_number + 1) % 2 == 1
    shift = ODD_SHIFT if odd else 0.0
    toks = [(x - shift, t, f, s) for x, _, t, f, s in ws]
    # running heads and column headers repeat on every page
    text_probe = " ".join(t for _, t, _, _ in toks)
    if re.match(r"^(GENERAL APPROPRIATIONS BILL|DETAILS OF DPWH|PROGRAMS / ACTIVITIES)", text_probe):
        return None
    # left printed line numbers and their right-margin echoes
    while toks and SMALL_INT.match(toks[0][1]) and toks[0][0] < 60:
        toks = toks[1:]
    if re.match(r"^(GENERAL APPROPRIATIONS BILL|DETAILS OF DPWH|PROGRAMS / ACTIVITIES|AMOUNT)",
                " ".join(t for _, t, _, _ in toks)):
        return None
    # amounts: trailing comma-grouped numerals at the row's right edge (the
    # single AMOUNT column). Long titles can cross x=280; only the FINAL
    # numeric token group counts as the amount, earlier numerals stay label.
    amounts = []
    label = list(toks)
    while label:
        x, t, f, s = label[-1]
        if AMT.match(t):
            amounts.append(int(t.replace(",", "")))
            label.pop()
        else:
            break
    amounts.reverse()
    label = [(x, t, f, s) for x, t, f, s in label if t != "P" or x < AMOUNT_X]
    if not label:
        return None
    bold = all("Bold" in f for _, _, f, _ in label)
    size = max(s for _, _, _, s in label)
    # narrative paragraphs between headings are ~7.7pt; table rows are 8.5
    if size < TABLE_SIZE and not amounts:
        return None
    x = label[0][0]
    retype = 8.05 <= size <= 8.4  # lightly re-typeset pages (3rd-reading edits)
    # Two-digit enumerators ("10.") print ~4-5pt left of one-digit ("9.").
    # Widen by the enumerator width ONLY when the raw x matches no band:
    # rows already sitting on a band (indent drift or deeper heading) keep it.
    # Re-typeset pages fixed the enumerator drift: their rows print at the
    # same x regardless of enumerator width, so they never take this rule.
    m = ENUM_RX.match(" ".join(t for _, t, _, _ in label))
    if m and amounts and not retype and _off_band(x, _NORM_BANDS):
        x = round(x + min(len(m.group(0).rstrip("). ")) * 2.2, 5.0), 1)
    return {"x": round(x, 1), "retype": retype,
            "text": " ".join(t for _, t, _, _ in label),
            "bold": bold, "size": size, "amounts": sorted(set(amounts))}


# nearest-band probe shared with the enumerator rule (set by extract_rows)
_NORM_BANDS = []


def _off_band(x, bands, tol=5.0):
    return all(abs(x - b) > tol for b in bands)


def extract_rows(doc, p_start, p_end):
    """All normalized rows from pages [p_start, p_end) (0-based). Two passes:
    pass 1 collects rows without band knowledge; pass 2 re-normalizes with
    band-aware enumerator widening once bands are known. Rows from lightly
    re-typeset (8.2pt) pages are renormalized onto the standard bands after
    collection (see module docstring §7)."""
    global _NORM_BANDS
    _NORM_BANDS = []
    rows = _collect(doc, p_start, p_end)
    bands = build_bands(rows)
    if bands:
        _NORM_BANDS = bands
        rows = _collect(doc, p_start, p_end)
    _renorm_retyped_x(rows, bands)
    return rows


def _collect(doc, p_start, p_end):
    rows = []
    for pno in range(p_start, p_end):
        for ws in page_rows(doc[pno]):
            r = norm_row(ws, pno)
            if r is None:
                continue
            r["page"] = pno + 1
            r["source_row"] = len(rows)
            rows.append(r)
    return rows


def build_bands(rows, min_members=6, tol=3.0):
    """Standard indent bands from standard-typeset (non-retype) amount rows.
    Re-typeset pages print wider indent steps at 8.2pt; letting them seed or
    chain clusters would merge neighbouring standard bands (89.5 and 95.5
    became one 93.1 band on the 3rd-reading PDFs). Retype rows are only
    ADMITTED into a cluster (within tol of a non-retype member) so a band
    whose 6th member happens to sit on a re-typeset page still exists; they
    never move the mean and never bridge clusters."""
    standard = sorted(r["x"] for r in rows if r["amounts"] and not r.get("retype"))
    clusters = []
    for x in standard:
        if clusters and x - clusters[-1][-1] <= tol:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    retype_xs = [r["x"] for r in rows if r["amounts"] and r.get("retype")]
    bands = []
    for cluster in clusters:
        lo, hi = cluster[0] - tol, cluster[-1] + tol
        admitted = sum(1 for x in retype_xs if lo <= x <= hi)
        if len(cluster) + admitted >= min_members:
            bands.append(round(sum(cluster) / len(cluster), 1))
    return bands


def _assign_ladder_rungs(rungs, bands):
    """Optimal order-preserving assignment of re-typeset indent rungs
    (ascending cluster means) to standard bands: monotone in rung and band
    index, minimizing total |rung - band| distance, every rung assigned.
    A standard band the re-typeset pages dropped (the two-digit enumerator
    drift band) stays unused. Returns {rung_x: band_index}."""
    if not rungs or not bands:
        return {}
    n, m = len(rungs), len(bands)
    INF = float("inf")
    # dp[i][j] = min cost of assigning rungs[i:] to bands >= j.
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    pick = [[-1] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[n][j] = 0.0
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            skip = dp[i][j + 1]           # leave standard band j unused
            take = abs(rungs[i] - bands[j]) + dp[i + 1][j + 1]
            if take < skip:
                dp[i][j], pick[i][j] = take, j
            else:
                dp[i][j], pick[i][j] = skip, -1
        # dp[i][m] stays INF: rung i must take some band
    ladder = {}
    i = j = 0
    while i < n and j < m:
        b = pick[i][j]
        if b < 0:                         # band j unused; advance
            j += 1
            continue
        ladder[round(rungs[i], 1)] = b
        i += 1
        j = b + 1
    return ladder if len(ladder) == n else {}


# semantic levels (fixed ints BELOW any geometry band index so band rows
# nest beneath sections/programs instead of popping them)
LEVEL_SECTION, LEVEL_PROGRAM = -2, -1


def band_index(r, bands, tol=5.0):
    """Nearest indent band index for a row's normalized label x."""
    best, dist = None, 1e9
    for i, b in enumerate(bands):
        d = abs(r["x"] - b)
        if d < dist:
            best, dist = i, d
    return best if dist <= tol else None


def row_level(r, bands):
    """Outline level: fixed semantic level for the six section headings and
    the OPERATIONS-family program banners; band index for everything else.
    Region/office/funding rows stay at their band — in I-C they are parents,
    not terminal leaves, so fixed deep levels would break band nesting."""
    if r["bold"]:
        if SECTION_RE.match(r["text"]):
            return LEVEL_SECTION
        if PROGRAM_RE.match(r["text"]):
            return LEVEL_PROGRAM
    return band_index(r, bands)


def _renorm_retyped_x(rows, bands):
    """Rewrite the indent x of re-typeset (8.2pt) rows onto the standard
    bands. The re-typeset pages print the same logical indent ladder with
    wider steps, so their rungs (x clusters) are matched to standard bands
    by optimal order-preserving assignment; each row's x becomes its rung's
    band x. Wrap continuation rows take their nearest rung's band so the
    post-wrap attach rule (x >= owner_x - 5) keeps its original meaning.
    Rows whose rung found no band keep their x (reported as skipped)."""
    retype_rows = [r for r in rows if r.get("retype")]
    amount_rows = [r for r in retype_rows if r["amounts"]]
    if not amount_rows or not bands:
        return
    # cluster retype amount-x values into rungs with the band chain tolerance
    xs = sorted(r["x"] for r in amount_rows)
    clusters = []
    for x in xs:
        if clusters and x - clusters[-1][-1] <= 3.0:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    rung_means = [round(sum(c) / len(c), 1) for c in clusters]
    ladder = _assign_ladder_rungs(rung_means, bands)
    if not ladder:
        return
    rung_of_x = {}
    for cluster, mean in zip(clusters, rung_means):
        for x in cluster:
            rung_of_x[round(x, 1)] = mean
    for r in amount_rows:
        mean = rung_of_x.get(round(r["x"], 1))
        band = ladder.get(round(mean, 1)) if mean is not None else None
        if band is not None:
            r["x"] = bands[band]
    # wrap continuation rows: nearest rung by original x, then its band
    for r in retype_rows:
        if r["amounts"]:
            continue
        mean = min(rung_means, key=lambda m: abs(m - r["x"]))
        band = ladder.get(mean)
        if band is not None and abs(mean - r["x"]) <= 8.0:
            r["x"] = bands[band]


def _make_node(r, lvl):
    """Shared amount-row → outline node constructor (used by echo retention)."""
    text = r["text"].replace(ARTIFACT, " ").strip()
    return {"page": r["page"], "level": lvl, "text": text,
            "title_recovered_from_wraps": not text,
            "null_glyph_cleanup": ARTIFACT in r["text"],
            "source_row": r["source_row"], "label_x": r["x"],
            "title_rows": [r["source_row"]], "bold": r["bold"],
            "amount": r["amounts"][-1], "amounts": r["amounts"], "children": []}


def _promote_reference_wrappers(top):
    """Post-pass: settle reference echoes into the additive hierarchy.

    Reference nodes (formerly suppressed rollup echoes) are second printed
    observations. Settlements, in order:

    (a) wrapper chain — consecutive references whose LAST member's amount is
        closed exactly by the following non-reference siblings (same or deeper
        outline level) become nested additive wrappers
        (NCR → Central Office → activities; Region XII → Cotabato 3rd DEO →
        project). Same-level detail is allowed: office headings and their
        first activity lines often share an indent band.
    (a2) parent-equal banner — the echo chain reprints the parent total
        (node.amount == last.amount) and the following non-reference siblings
        close that amount even when printed shallower than the office
        (MOOE S2O: NCR → CO at deeper indent, then a/b/c at NCR indent).
        Detail still nests under the last echo so provenance is
        parent → NCR → Central Office → a/b/c.
    (b) leaf echo — a reference that is its parent's ONLY content and repeats
        the parent's amount is the printed allocation itself (PAP → DEO row
        with no deeper detail); it becomes an additive leaf.
    (c) exact-amount echo chain — consecutive references that share one amount
        nest as parent→child for provenance when they still cannot absorb
        detail (rare after a/a2).
    (d) differing-amount consecutive refs stay siblings (FAP GOP / Loan
        Proceeds funding summary under Central Office).
    """
    def settle_chain(chain):
        for c in chain:
            c.pop("reference", None)
            c["second_observation"] = True

    def nest_chain(chain):
        for a, b in zip(chain[:-1], chain[1:]):
            a["children"].append(b)

    def absorb(node, kids, i, j, chain, m):
        last = chain[-1]
        last["children"].extend(kids[j:m])
        nest_chain(chain)
        settle_chain(chain)
        node["children"] = kids[:i] + [chain[0]] + kids[m:]
        for c in chain:
            walk(c)

    def walk(node):
        kids = node["children"]
        for child in kids:
            walk(child)
        i = 0
        while i < len(kids):
            if not kids[i].get("reference"):
                i += 1
                continue
            j = i
            while j < len(kids) and kids[j].get("reference"):
                j += 1
            chain = kids[i:j]
            last = chain[-1]
            run, m = 0, j
            while m < len(kids) and run < last["amount"] \
                    and not kids[m].get("reference") \
                    and kids[m]["level"] >= last["level"]:
                run += kids[m]["amount"]
                m += 1
            if run == last["amount"] and m > j:
                # (a) nested wrapper chain over same/deeper closing detail
                absorb(node, kids, i, j, chain, m)
                kids = node["children"]
                continue
            if node["amount"] == last["amount"]:
                run, m = 0, j
                while m < len(kids) and run < last["amount"] \
                        and not kids[m].get("reference"):
                    run += kids[m]["amount"]
                    m += 1
                if run == last["amount"] and m > j:
                    # (a2) parent-equal banner owns the closing siblings
                    absorb(node, kids, i, j, chain, m)
                    kids = node["children"]
                    continue
                if len(kids) == len(chain):
                    # (b) leaf echo: the chain is the parent's whole content
                    nest_chain(chain)
                    settle_chain(chain)
                    node["children"] = [chain[0]]
                    return
            # (c) nest exact-amount runs for provenance; keep non-additive
            if len(chain) > 1:
                heads = []
                k = 0
                while k < len(chain):
                    start = k
                    k += 1
                    while k < len(chain) and chain[k]["amount"] == chain[start]["amount"]:
                        k += 1
                    run = chain[start:k]
                    if len(run) > 1:
                        nest_chain(run)
                    heads.append(run[0])
                node["children"] = kids = kids[:i] + heads + kids[j:]
                i += len(heads)
                continue
            i = j
    walk(top)


def build_outline(rows, bands):
    """Outline from amount rows. Wrap fragments (no amount, same band) attach
    to the amount row ABOVE them (post-wrap). Consecutive duplicate-printed
    controls collapse. Section/program banners reset the stack so a new
    section never nests under the previous section's deepest row. Family
    containers (bold heading at the same band as its parts) are folded by a
    post-pass when the parts sum to the heading exactly. A null-only title
    recovers its text from following wraps; trailing nulls are cleaned.

    Returns (nodes, skipped, suppressed) where skipped lists amount rows not placed in
    the outline (outside every band) for audit reporting."""
    nodes, stack, skipped = [], [], []
    suppressed = []        # second printed observations (rollup echoes)
    last_node = None       # continuation owner, including across a page break
    last_enum_region = None  # (enum_value, level) of the last region row
    for r in rows:
        lvl = row_level(r, bands)
        if not r["amounts"]:
            if FUNDING_RE.match(r["text"]):
                # A printed dash/blank funding partition is a zero observation,
                # never a continuation of the preceding funding label.
                if len(stack) >= 2 and FUNDING_RE.match(stack[-1]["text"]):
                    stack[-2].setdefault("zero_funding_rows", []).append(r["source_row"])
                continue
            if last_node is not None and r["page"] <= last_node["page"] + 1 \
                    and r["x"] >= last_node["label_x"] - 5.0:
                last_node["text"] = (last_node["text"] + " " + r["text"]).strip()
                last_node["title_rows"].append(r["source_row"])
                if ARTIFACT in r["text"]:
                    last_node["null_glyph_cleanup"] = True
            continue
        # section/program banners clear all pending structure
        if lvl in (LEVEL_SECTION, LEVEL_PROGRAM):
            stack.clear()
            last_enum_region = None
            nodes.append({"page": r["page"], "level": lvl, "text": r["text"],
                          "source_row": r["source_row"], "amount": r["amounts"][-1],
                          "amounts": r["amounts"], "children": [],
                          "label_x": r["x"], "title_rows": [r["source_row"]]})
            last_node = nodes[-1]
            stack.append(nodes[-1])
            continue
        if r["amounts"]:
            if lvl is None:
                skipped.append(r)
                continue
            # FAP head funding summary: GOP/Loan totals printed directly under
            # the FOREIGN-ASSISTED PROJECTS banner summarize the per-project
            # funding splits below — a second decomposition, not allocations.
            # Retained as non-additive reference nodes for provenance; they
            # attach under a preceding CO/region reference banner when present.
            if stack and FUNDING_RE.match(r["text"]) \
                    and stack[-1].get("level") == LEVEL_SECTION \
                    and "FOREIGN-ASSISTED" in stack[-1]["text"]:
                host = None
                for child in reversed(stack[-1]["children"]):
                    if child.get("reference") and (REGION_RE.match(child["text"])
                                                   or OFFICE_HEADING_RE.fullmatch(child["text"])):
                        host = child
                    break
                host = host if host is not None else stack[-1]
                node = _make_node(r, lvl)
                node["reference"] = True
                host["children"].append(node)
                continue
            # rollup echo: a REGION/OFFICE heading that would become the FIRST
            # CHILD of a childless parent while repeating the parent's amount —
            # a second printed observation of the same control (p9/45/49
            # NCR/CO pattern; FAP head prints the same trio in bold).
            # Equal-amount SIBLINGS (lvl == parent level) are legitimate.
            # Echoes are never dropped: they attach as non-additive reference
            # nodes (provenance preserved, excluded from sums), and a later
            # post-pass promotes one to an additive wrapper when the detail
            # that follows nests under it and closes its amount exactly.
            # The office test is anchored to the heading's END so project
            # titles that merely CONTAIN office words ("Rehabilitation of
            # DPWH Building, Iloilo 2nd District Engineering Office, …")
            # never qualify as echoes.
            if stack and not [c for c in stack[-1]["children"] if not c.get("reference")] \
                    and lvl > stack[-1]["level"] \
                    and r["amounts"][-1] == stack[-1]["amount"] \
                    and (REGION_RE.match(r["text"]) or OFFICE_HEADING_RE.fullmatch(r["text"])):
                node = _make_node(r, lvl)
                node["reference"] = True
                stack[-1]["children"].append(node)
                continue
            # enumerated-region drift: "14. Region X" prints ~5pt right of its
            # sequence siblings; the enumerator continues the sequence, so it
            # snaps to the previous region's level (indent drift repair).
            m = ENUM_REGION_RX.match(r["text"])
            if m and last_enum_region:
                enum_value, lvl_prev = last_enum_region
                if int(m.group(1)) == enum_value + 1 and lvl > lvl_prev:
                    lvl = lvl_prev
                last_enum_region = (int(m.group(1)), lvl)
            elif m:
                last_enum_region = (int(m.group(1)), lvl)
            text = r["text"].replace(ARTIFACT, " ").strip()
            node = {"page": r["page"], "level": lvl, "text": text,
                    "title_recovered_from_wraps": not text,
                    "null_glyph_cleanup": ARTIFACT in r["text"],
                    "source_row": r["source_row"], "label_x": r["x"],
                    "title_rows": [r["source_row"]], "bold": r["bold"],
                    "amount": r["amounts"][-1], "amounts": r["amounts"], "children": []}
            while stack and stack[-1]["level"] >= lvl:
                stack.pop()
            target = stack[-1]["children"] if stack else nodes
            if target and target[-1]["text"] == node["text"] and \
                    target[-1]["amount"] == node["amount"] and \
                    target[-1]["level"] == lvl and text:
                continue  # consecutive duplicate-printed control
            if stack:
                stack[-1]["children"].append(node)
            else:
                nodes.append(node)
            stack.append(node)
            last_node = node
    for top in nodes:
        _fold_family_containers(top)
        _promote_reference_wrappers(top)
    return nodes, skipped, suppressed


def _fold_family_containers(node):
    """Post-pass: a childless BOLD heading followed by consecutive same-band
    BOLD siblings takes the sibling prefix whose sum reaches its amount
    exactly as its children. I-C prints 'Preventive Maintenance' (container)
    and '- Primary/- Secondary/- Tertiary Roads' (parts) at the SAME indent
    band; the parts appear in order and cumulatively close the container."""
    kids = node["children"]
    for k in kids:
        _fold_family_containers(k)
    i = 0
    while i < len(kids):
        k = kids[i]
        if not k["children"] and k.get("bold") and not k.get("reference"):
            run, j = 0, i + 1
            while j < len(kids) and run < k["amount"]:
                part = kids[j]
                if part.get("reference") or part["level"] < k["level"] or \
                        (part["level"] == k["level"] and not part.get("bold")):
                    break  # a reference, shallower or non-bold sibling ends the family
                run += part["amount"]
                j += 1
            if run == k["amount"] and j > i + 2:
                # at least two parts (a single equal part is a duplicate print)
                k["children"] = kids[i + 1:j]
                k["family_container"] = True
                del kids[i + 1:j]
        i += 1


def attach_post_wraps(nodes, rows, bands):
    """Normalize labels after build_outline has attached each continuation.

    Kept as the extractor's finalization entry point. A null-only amount row
    must have recovered actual text; trailing nulls never erase a title.
    """
    def fix(node):
        node["text"] = re.sub(r"\s+", " ", node["text"].replace(ARTIFACT, " ")).strip()
        if not node["text"]:
            raise ValueError(f"Empty title at source row {node['source_row']}")
        for child in node["children"]:
            fix(child)
    for node in nodes:
        fix(node)
    return nodes


def sum_leaf(node):
    if node.get("reference"):
        return 0
    kids = [c for c in node["children"] if not c.get("reference")]
    if not kids:
        return node["amount"]
    return sum(sum_leaf(c) for c in kids)


def validate(node, rep, depth=0):
    if node.get("reference"):
        return
    kids = [c for c in node["children"] if not c.get("reference")]
    if kids:
        s = sum_leaf(node)
        if node["amount"]:
            rep["checked"] += 1
            if s != node["amount"]:
                rep["failed"] += 1
                rep["fails"].append({"page": node["page"], "level": node["level"],
                                     "text": node["text"][:70], "printed": node["amount"],
                                     "leaf_sum": s, "diff": node["amount"] - s})
        for c in node["children"]:
            validate(c, rep, depth + 1)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
    p_start = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 8
    p_end = int(sys.argv[3]) if len(sys.argv) > 3 else None
    out_path = sys.argv[4] if len(sys.argv) > 4 else None

    doc = pymupdf.open(path)
    p_end = p_end if p_end is not None else len(doc)
    rows = extract_rows(doc, p_start, p_end)
    bands = build_bands(rows)
    print(f"rows: {len(rows)}  amount rows: {sum(1 for r in rows if r['amounts'])}")
    print(f"indent bands ({len(bands)}): {bands}")
    nodes, skipped, suppressed = build_outline(rows, bands)
    print(f"amount rows skipped (outside every band): {len(skipped)}")
    print(f"rollup echoes suppressed: {len(suppressed)}")
    for r in skipped[:10]:
        print(f"  p{r['page']:>3} x={r['x']:>6} {r['text'][:60]!r} {r['amounts']}")
    nodes = attach_post_wraps(nodes, rows, bands)
    rep = {"checked": 0, "failed": 0, "fails": []}
    for node in nodes:
        validate(node, rep)
    print(f"top-level nodes: {len(nodes)}")
    print(f"internal checks: {rep['checked']}  failed: {rep['failed']}")
    for f in rep["fails"][:25]:
        print(f"  p{f['page']:>3} L{f['level']} {f['text'][:55]:55s} "
              f"printed {f['printed']:>15,} sum {f['leaf_sum']:>15,} "
              f"diff {f['diff']:>14,}")
    if out_path:
        with open(out_path, "w") as fh:
            json.dump({"bands": bands, "tree": nodes, "report": rep}, fh, ensure_ascii=False, indent=1)
        print(f"tree -> {out_path}")


if __name__ == "__main__":
    main()
