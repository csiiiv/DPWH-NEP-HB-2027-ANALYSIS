#!/usr/bin/env python3
"""
Hierarchical parser for HB 10858 VOL IC (DPWH PAP details) — v4.

Stack model (depths)
    section(0) -> outcome(1) -> program(2) -> subprog(3) -> pap(4)
        -> region(5) -> office(6) -> leaf

Zones
    alloc (rows before first ORGANIZATIONAL OUTCOME): MOOE / support
          allocations — activity outline, captured as flat alloc lines.
    pap   : project detail hierarchy.
    fap   : FOREIGN-ASSISTED / LOCALLY-FUNDED tail — GOP / Loan Proceeds
          funding-split rows are skipped, letter-enum rows are leaves.

Anti-double-count mechanisms
    * region/office/PAP/program rows are containers, never emitted as leaves;
    * repeated identical region/office headers (page-break continuations,
      incl. inside literal-"\\n" merged labels) are skipped;
    * forward structural promotion: a leaf-verb row sitting at program/
      subprog depth is promoted to program/subprog/pap by the kind of the
      next significant row (fixes backward-classification cascades);
    * pure-stationing fragments ('K0378 + 268') are noise, but project names
      CONTAINING stationing remain leaves;
    * recursive rollup audit: expected = direct leaves + child contributions.

Outputs
    analysis/archive/data/hb_dpwh_leaves_validated.json  (historical)
    analysis/archive/data/hb_tree_validation.json        (historical)
    analysis/archive/data/hb_block_tree.json             (historical)
    analysis/archive/data/hb_dpwh_pap_hierarchy.json             (active export; feeds printed-subtotal attachment)"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE



import json
import re
import html
from collections import Counter, defaultdict
from datetime import datetime, timezone

SRC = "HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md"
OUT_LEAVES = "analysis/archive/data/hb_dpwh_leaves_validated.json"
OUT_STATS = "analysis/archive/data/hb_tree_validation.json"
OUT_TREE = "analysis/archive/data/hb_block_tree.json"
OUT_EXPORT = "analysis/archive/data/hb_dpwh_pap_hierarchy.json"

# ------------------------------------------------------------------ text utils

def texts_of(r):
    out = []
    for _a, body in re.findall(r"<td([^>]*)>(.*?)</td>", r, re.S):
        t = re.sub(r"<[^>]+>", " ", body)
        out.append(re.sub(r"\s+", " ", html.unescape(t)).strip())
    return out


ENUM_LEAF_RX = re.compile(r"^(\(?[0-9]{1,2}|[ivxlc]{1,5}|[a-h])?\)?$", re.I)
ENUM_DIGIT_RX = re.compile(r"^\(?([0-9]{1,2}|[ivxlc]{1,5})[.)]\s+\S", re.I)
ENUM_LETTER_RX = re.compile(r"^\(?[a-h][.)]\s+\S", re.I)


AMOUNT_CHUNK_RX = re.compile(r"\d{1,3}(?:,\d{3})+")
DEO_END_RX = re.compile(r"District Engineering Offi", re.I)


def decompose_merged_row(label, amount_text):
    """Split a page-break-merged row: 'Region<DEO><Project>' +
    '<region_total><office_total><project_amt>' into segments."""
    chunks = AMOUNT_CHUNK_RX.findall(amount_text)
    if len(chunks) < 2:
        return None
    if "".join(chunks) != re.sub(r"\s", "", amount_text):
        return None
    segs = []
    rest = label
    # leading region?
    probe = rest[:40].lower()
    region_lbl = None
    for cand in sorted(NAMED_REGIONS | {f"region {r}" for r in
                      ["i", "ii", "iii", "iv-a", "iv-b", "v", "vi", "vii",
                       "viii", "ix", "x", "xi", "xii", "xiii"]},
                      key=len, reverse=True):
        if probe.startswith(cand):
            region_lbl = rest[:len(cand)]
            rest = rest[len(cand):]
            break
    if region_lbl is None:
        m = re.match(r"(region\s+[ivx0-9]+(?:-[ab])?)", rest, re.I)
        if m:
            region_lbl = m.group(1)
            rest = rest[m.end():]
    # office up to 'District Engineering Office'
    office_lbl = None
    m = DEO_END_RX.search(rest)
    if m:
        office_lbl = rest[:m.end() + 2]
        rest = rest[m.end() + 2:]
    project = rest.strip()
    if region_lbl:
        segs.append((region_lbl.strip(), "region"))
    if office_lbl:
        segs.append((office_lbl.strip(), "office"))
    if project:
        segs.append((project, "amt"))
    if len(segs) == len(chunks):
        return list(zip(segs, chunks))
    return None


def parse_row(texts):
    """(label, amount) normalizing 2-col, 3-col summary, page-break, enum-split."""
    if not texts:
        return ("", None)
    amount, amt_idx = None, None
    for k, t in enumerate(texts):
        if re.fullmatch(r"[\d,]{4,}", t):
            amount, amt_idx = int(t.replace(",", "")), k
            break
    if amt_idx is None:
        return (next((t for t in texts if t), ""), None)
    label = next((t for k, t in enumerate(texts)
                  if k != amt_idx and t and not re.fullmatch(r"[\d,]{4,}", t)), "")
    if len(texts) >= 3 and amt_idx >= 2 and texts[0] and ENUM_LEAF_RX.match(texts[0]) \
            and texts[1] and not re.fullmatch(r"[\d,]{4,}", texts[1]):
        label = texts[1]
    return (label, amount)


# ------------------------------------------------------------------ classifiers

ROMAN = {"Ⅰ": "i", "Ⅱ": "ii", "Ⅲ": "iii", "Ⅳ": "iv", "Ⅴ": "v", "Ⅵ": "vi",
         "Ⅶ": "vii", "Ⅷ": "viii", "Ⅸ": "ix", "Ⅹ": "x", "Ⅺ": "xi", "Ⅻ": "xii",
         "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii", "ⅳ": "iv", "ⅴ": "v", "ⅵ": "vi",
         "ⅶ": "vii", "ⅷ": "viii", "ⅸ": "ix", "ⅹ": "x"}
SUFFIX_MAP = {"4-a": "iv-a", "4a": "iv-a", "iva": "iv-a", "iv-a": "iv-a",
              "4-b": "iv-b", "4b": "iv-b", "ivb": "iv-b", "iv-b": "iv-b"}
NAMED_REGIONS = {
    "national capital region", "ncr", "cordillera administrative region",
    "ilocos region", "cagayan valley", "central luzon", "calabarzon",
    "mimaropa region", "mimaropa", "bicol region", "western visayas",
    "central visayas", "eastern visayas", "zamboanga peninsula",
    "northern mindanao", "davao region", "soccsksargen", "caraga",
    "negros island region", "bangsamoro autonomous region in muslim mindanao",
    "barmm", "region iv-a", "region iv-b", "nationwide",
}


def norm_region(label):
    n = (label or "").lower().strip()
    for u, a in ROMAN.items():
        n = n.replace(u, a)
    n = re.sub(r"^[\s.\-–—:]*[0-9]{1,3}[\s.\-–—:]+", "", n)
    n = re.sub(r"^[\s.\-–—:]+", "", n)
    n = n.replace("region region", "region")
    if re.match(r"^e?gion\s", n):
        n = "r" + n
    n = re.sub(r"\s+", " ", n).strip()
    parts = n.rsplit(" ", 1)
    if len(parts) == 2 and parts[0] == "region":
        suf = SUFFIX_MAP.get(parts[1].replace(" ", ""), parts[1].replace(" ", ""))
        n = f"region {suf}"
    return n


def is_region(label):
    n = norm_region(label)
    if n in NAMED_REGIONS:
        return True
    return bool(re.match(r"^region\s+(i{1,3}|iv|v|vi{1,3}|ix|x|xi{1,2}|xiii|[0-9]{1,2})(-[ab])?$", n))


OFFICE_RX = re.compile(
    r"(district engineering offi(?:ce)?|regional office)(\s+no\.?\s*[ivx0-9]+)?$|^central office\b",
    re.I)


def is_office(label):
    n = re.sub(r"^\(?[0-9]{1,2}[.)]\s*", "", (label or "").strip())
    if not n:
        return False
    if OFFICE_RX.search(n):
        return True
    return bool(re.search(r"[dc]istrict engineering offi", n, re.I))


ORG_SEARCH_RX = re.compile(r"ganizational\s+outcome", re.I)
SECTION_RX = re.compile(
    r"^(perations|o?perations|locally[- ]funded projects|ocally[- ]funded projects|"
    r"foreign[- ]assisted projects|ional building program|national building program)$", re.I)
HEADER_RX = re.compile(r"^(programs?\s*/?\s*activities\s*/?\s*projects|amount\s*\(php\))$", re.I)
GEO_RX = re.compile(r"(start\s*:|end\s*:|lat\s*:|long\s*:)", re.I)
PURE_STATION_RX = re.compile(r"^[kK\d\s+,\-–—().]+$")
LEAF_START_RX = re.compile(
    r"^(concreting|construction|rehabilitation|improvement|reconstruction|"
    r"upgrading|replacement|installation|procurement|repair|maintenance|"
    r"flood\s*control|dredging|restoration|completion|rectification|"
    r"detailed\s*engineering|survey|acquisition|right[- ]of[- ]way|"
    r"regravelling|asphalting|widening|supply\s*(&|and)\s*delivery|"
    r"constr\.|rehab\.|improv\.|reconstr\.|slope\s*protection|"
    r"river\s*protection|causeway|drainage)", re.I)
NARR_RX = re.compile(
    r"^(the\s|this\s|these\s|it\s|below\s|is\s|are\s|provides\s|"
    r"covers\s|supports\s|involves\s|includes\s|aims\s|focuses\s|fund\s|funds\s)",
    re.I)
NARR_IN_RX = re.compile(r"\s(aims to|focuses on|involves|is a sub-program|are the|includes)\s", re.I)
FUND_RX = re.compile(r"^(gop(\s*(aca|-aca))?(\s*loan\s*proceeds)?|loan\s*proceeds|grants?)$", re.I)


def is_narrative(label):
    return bool(NARR_RX.match(label) and len(label) > 60) or bool(NARR_IN_RX.search(label))


def is_funding(label):
    return bool(FUND_RX.match(label.replace("\\n", " ").strip()))


LEAFY_TOKEN_RX = re.compile(
    r"(k\s?\d{3,4}|\bbr\.|\brd\.?\b|\bsta\.\s|chainage|\(s\d{4,6}|\bbdry\b|\bjct\b)", re.I)


def looks_like_leaf(label):
    return bool(LEAF_START_RX.match(label) or LEAFY_TOKEN_RX.search(label))


# province/city tokens inside DEO names -> owning region (OCR-tolerant)
PROVINCE_REGION = [
    ("quezon city", "National Capital Region"),
    ("north manila", "National Capital Region"),
    ("south manila", "National Capital Region"),
    ("metro manila", "National Capital Region"),
    ("las pi", "National Capital Region"),
    ("malabon", "National Capital Region"),
    ("valenzuela", "National Capital Region"),
    ("ilocos norte", "Region I"),
    ("ilocos sur", "Region I"),
    ("la union", "Region I"),
    ("pangasinan", "Region I"),
    ("abra", "Cordillera Administrative Region"),
    ("apayao", "Cordillera Administrative Region"),
    ("benguet", "Cordillera Administrative Region"),
    ("baguio", "Cordillera Administrative Region"),
    ("ifugao", "Cordillera Administrative Region"),
    ("kalinga", "Cordillera Administrative Region"),
    ("province", "Cordillera Administrative Region"),   # Mt. Province
    ("batanes", "Region II"),
    ("cagayan 1st", "Region II"),
    ("cagayan 2nd", "Region II"),
    ("cagayan 3rd", "Region II"),
    ("isabela", "Region II"),
    ("nueva vizcaya", "Region II"),
    ("quirino", "Region II"),
    ("aurora", "Region III"),
    ("bataan", "Region III"),
    ("bulacan", "Region III"),
    ("nueva ecija", "Region III"),
    ("pampanga", "Region III"),
    ("tarlac", "Region III"),
    ("zambales", "Region III"),
    ("batangas", "Region IV-A"),
    ("cavite", "Region IV-A"),
    ("laguna", "Region IV-A"),
    ("rizal", "Region IV-A"),
    ("quezon 1st district", "Region IV-A"),
    ("quezon 2nd district", "Region IV-A"),
    ("marinduque", "MIMAROPA Region"),
    ("mindoro occidental", "MIMAROPA Region"),
    ("mindoro oriental", "MIMAROPA Region"),
    ("palawan", "MIMAROPA Region"),
    ("romblon", "MIMAROPA Region"),
    ("albay", "Region V"),
    ("camarines", "Region V"),
    ("catanduanes", "Region V"),
    ("masbate", "Region V"),
    ("sorsogon", "Region V"),
    ("aklan", "Region VI"),
    ("antique", "Region VI"),
    ("capiz", "Region VI"),
    ("guimaras", "Region VI"),
    ("iloilo", "Region VI"),
    ("negros occidental", "Negros Island Region"),
    ("negros oriental", "Negros Island Region"),
    ("siquijor", "Negros Island Region"),
    ("bohol", "Region VII"),
    ("cebu", "Region VII"),
    ("biliran", "Region VIII"),
    ("eastern samar", "Region VIII"),
    ("leyte", "Region VIII"),
    ("northern samar", "Region VIII"),
    ("samar", "Region VIII"),
    ("southern leyte", "Region VIII"),
    ("zamboanga del norte", "Region IX"),
    ("zamboanga sibugay", "Region IX"),
    ("zamboanga del sur", "Region IX"),
    ("zamboanga city", "Region IX"),
    ("bukidnon", "Region X"),
    ("camiguin", "Region X"),
    ("cagayan de oro", "Region X"),
    ("lanao del norte", "Region X"),
    ("misamis occidental", "Region X"),
    ("misamis oriental", "Region X"),
    ("davao de oro", "Region XI"),
    ("compostela", "Region XI"),
    ("davao city", "Region XI"),
    ("davao del norte", "Region XI"),
    ("davao del sur", "Region XI"),
    ("davao occidental", "Region XI"),
    ("davao oriental", "Region XI"),
    ("cotabato", "Region XII"),
    ("sarangani", "Region XII"),
    ("south cotabato", "Region XII"),
    ("sultan kudarat", "Region XII"),
    ("general santos", "Region XII"),
    ("agusan", "Region XIII"),
    ("dinagat", "Region XIII"),
    ("surigao", "Region XIII"),
    ("butuan", "Region XIII"),
    ("basilan", "BARMM"),
    ("lanao del sur", "BARMM"),
    ("maguindanao", "BARMM"),
    ("sulu", "BARMM"),
    ("tawi-tawi", "BARMM"),
]


def infer_region_from_office(name):
    n = name.lower()
    for tok, reg in PROVINCE_REGION:
        if tok in n:
            return reg
    return None


def split_segments(label):
    if "\\n" in label:
        return [s.strip() for s in label.split("\\n") if s.strip()]
    return [label.strip()]


# ------------------------------------------------------------------ structure

DEPTH = {"section": 0, "outcome": 1, "program": 2, "subprog": 3,
         "pap": 4, "region": 5, "office": 6}
PATH_KEY = {1: "org_outcome", 2: "program", 3: "sub_program",
            4: "pap", 5: "region", 6: "office"}


class Block:
    __slots__ = ("kind", "depth", "label", "total", "row", "direct_sum",
                 "n_direct", "status", "children", "leaves", "contrib")

    def __init__(self, kind, label, total, row):
        self.kind, self.label, self.total, self.row = kind, label, total, row
        self.depth = DEPTH[kind]
        self.direct_sum, self.n_direct = 0, 0
        self.status, self.children, self.leaves = "open", [], []
        self.contrib = 0


def main():
    with open(SRC, encoding="utf-8") as f:
        content = f.read()
    raw = re.findall(r"<tr[^>]*>(.*?)</tr>", content, re.S)

    # ---- phase 1: static base rows -------------------------------------------
    def classify_static(label, amount):
        if not label and amount is None:
            return "empty"
        if ORG_SEARCH_RX.search(label) or SECTION_RX.match(label):
            return "outcome"
        if not LEAF_START_RX.match(label) and is_region(label):
            return "region"
        if not LEAF_START_RX.match(label) and is_office(label):
            return "office"
        if is_funding(label):
            return "funding"
        if is_narrative(label):
            return "narrative"
        if (not label) or GEO_RX.search(label) or PURE_STATION_RX.fullmatch(label):
            return "noise"
        return "amt"

    base = []
    for r in raw:
        rtexts = texts_of(r)
        if any(HEADER_RX.match(t) for t in rtexts if t):
            base.append(("", None, "header"))
            continue
        label, amount = parse_row(rtexts)
        # merged multi-amount cells: region + office + project totals
        if label and amount is not None:
            amt_texts = [t for t in rtexts if re.fullmatch(r"[\d,]{7,}", t)]
            if amt_texts:
                dec = decompose_merged_row(label, amt_texts[0])
                if dec:
                    for (seg, _sk), chunk in dec:
                        av = int(chunk.replace(",", ""))
                        base.append((seg, av, classify_static(seg, av)))
                    continue
        # page-break merged rows: literal-\n segments each with own amount
        if label and "\\n" in label:
            amt_cell = next((t for t in rtexts
                             if re.fullmatch(r"[\d,\s\\n]+", t) and "\\n" in t), None)
            if amt_cell:
                labs = [s.strip() for s in label.split("\\n") if s.strip()]
                amts = [s.strip() for s in amt_cell.split("\\n") if s.strip()]
                if len(labs) == len(amts):
                    ok_split = True
                    pairs = []
                    for ls, a_s in zip(labs, amts):
                        try:
                            av = int(a_s.replace(",", ""))
                        except ValueError:
                            ok_split = False
                            break
                        pairs.append((ls, av))
                    if ok_split:
                        for ls, av in pairs:
                            base.append((ls, av, classify_static(ls, av)))
                        continue
        base.append((label, amount, classify_static(label, amount)))

    n = len(base)
    outcome_start = next(i for i, b in enumerate(base) if b[2] == "outcome")
    fap_start = next(i for i, b in enumerate(base)
                     if b[0].upper().replace("\\n", " ").startswith("FOREIGN-ASSISTED")
                     or b[0].upper().startswith("OCALLY-FUNDED")
                     or b[0].upper().startswith("LOCALLY-FUNDED"))

    # ---- phase 2: backward container resolution for 'amt' rows ---------------
    SKIP = {"header", "noise", "narrative", "funding", "empty"}

    def next_sig(i):
        j = i + 1
        while j < n and base[j][2] in SKIP:
            j += 1
        return j if j < n else None

    kinds = [b[2] for b in base]

    def fap_tail_kind(i):
        lbl = base[i][0]
        j = next_sig(i)
        nxt = base[j][0] if j is not None else ""
        if ENUM_DIGIT_RX.match(lbl):
            return "pap" if (ENUM_LETTER_RX.match(nxt)
                             or nxt.upper().startswith("GOP")
                             or nxt.upper().startswith("LOAN")) else "leaf"
        if ENUM_LETTER_RX.match(lbl):
            return "program" if re.search(r"program[s]?\s*$", lbl, re.I) else "leaf"
        if re.search(r"program[s]?\s*$", lbl, re.I):
            return "program"
        if re.search(r"(structures|facilities)\s*$", lbl, re.I):
            return "pap"
        return "leaf"

    for i in range(n - 1, -1, -1):
        if kinds[i] != "amt":
            continue
        lbl = base[i][0]
        if i >= fap_start:
            kinds[i] = fap_tail_kind(i)
            continue
        j = next_sig(i)
        k = kinds[j] if j is not None else None
        if i < outcome_start:
            # alloc zone: irregular activity outline (MOOE/support detail),
            # not construction PAPs — captured as flat reference lines.
            kinds[i] = "alloc_line"
            continue
        # pap zone
        if not LEAF_START_RX.match(lbl):
            if k in ("region", "office"):
                kinds[i] = "pap"
            elif k == "pap":
                kinds[i] = "subprog"
            elif k in ("subprog", "program", "outcome", "section"):
                kinds[i] = "program"
            else:
                kinds[i] = "leaf"
        elif ENUM_DIGIT_RX.match(lbl) and k in ("region", "pap"):
            kinds[i] = "pap"
        elif ENUM_LETTER_RX.match(lbl) and k == "region":
            kinds[i] = "pap"
        else:
            kinds[i] = "leaf"

    # ---- phase 3: forward stack parse -----------------------------------------
    root = Block("section", "<doc>", None, -1)
    root.depth = -1
    stack = [root]
    leaves, allocs = [], []
    events = Counter()

    def zone_of(i):
        return "alloc" if i < outcome_start else ("fap" if i >= fap_start else "pap")

    def path_of():
        p = {k: "" for k in PATH_KEY.values()}
        for b in stack[1:]:
            if b.depth in PATH_KEY:
                p[PATH_KEY[b.depth]] = b.label
        return p

    def emit_leaf(i, lbl, amount, status):
        rec = dict(path_of(), project=lbl, amount_php=amount, row=i,
                   zone=zone_of(i), validation=status)
        (allocs if rec["zone"] == "alloc" else leaves).append(rec)

    def close(b):
        if b.depth < 0:
            return
        child_contrib = sum(c.contrib for c in b.children)
        expected = b.direct_sum + child_contrib
        if b.total is None:
            if b.n_direct == 0 and not b.children:
                b.status = "rollup_only"
                b.contrib = 0
            else:
                b.status = "container"
                b.contrib = expected
        elif b.n_direct == 0 and not b.children:
            b.status = "rollup_only"
            b.contrib = b.total
        elif expected == b.total:
            b.status = "validated"
            b.contrib = b.total
        else:
            b.status = "review"
            b.contrib = b.total
        stack[-1].children.append(b)

    def find_open_same(kind, label, amount):
        """Index of an open block with same kind+label whose total is unset or
        equals `amount` (page-break continuation). None otherwise."""
        for idx in range(len(stack) - 1, 0, -1):
            b = stack[idx]
            if b.kind == kind and b.label.strip().lower() == label.strip().lower():
                if amount is None or b.total is None or b.total == amount:
                    return idx
                return None
        return None

    def open_chain(segs, amount, i):
        """Open (or reuse) a chain of region/office containers. The amount
        belongs to the DEEPEST segment (the office/project-level total)."""
        opened = None
        for s in segs:
            kind = "region" if is_region(s) else "office"
            idx = find_open_same(kind, s, None)
            if idx is not None:
                while len(stack) - 1 > idx:
                    close(stack.pop())
                opened = stack[idx]
                continue
            while stack and stack[-1].depth >= DEPTH[kind]:
                close(stack.pop())
            blk = Block(kind, s, None, i)
            stack.append(blk)
            opened = blk
        if opened is not None and amount is not None and opened.total is None:
            opened.total = amount
        return opened

    def heading_kind(i):
        """For an overflowing leaf-verb row: classify heading kind by the next
        significant row's kind."""
        j = next_sig(i)
        k2 = kinds[j] if j is not None else None
        if k2 in ("region", "office"):
            return "pap"
        if k2 == "pap":
            return "subprog"
        if k2 in ("program", "outcome"):
            return "program"
        # a smaller leaf-verb row following a hugely-overflowing row means the
        # current row starts the next section (its children follow)
        cur = base[i][1] or 0
        if k2 == "leaf" and LEAF_START_RX.match(base[j][0]) \
                and base[j][1] is not None and cur \
                and base[j][1] < cur * 0.8 and cur >= 500_000_000:
            return "subprog"
        return None

    def open_office(self_val=None):
        pass

    for i, (lbl, amount, _) in enumerate(base):
        k = kinds[i]
        if k in ("header", "noise", "narrative", "funding", "empty"):
            continue

        # alloc zone: flat reference lines (no hierarchy — irregular outline)
        if zone_of(i) == "alloc":
            if amount is not None:
                allocs.append({"section": lbl.replace("\\n", " "),
                               "amount_php": amount, "row": i, "zone": "alloc"})
            continue

        if k in ("outcome", "program", "subprog", "pap", "region", "office"):
            # lost-header repair: an office whose province token contradicts
            # the open region gets re-anchored under the correct region
            if k == "office" and amount is not None:
                top_region = next((b for b in reversed(stack) if b.kind == "region"), None)
                inferred = infer_region_from_office(lbl)
                if top_region is not None and inferred \
                        and norm_region(top_region.label) != norm_region(inferred):
                    inferred_norm = norm_region(inferred)
                    # reuse a matching region open inside the same PAP
                    pap = next((b for b in reversed(stack) if b.kind == "pap"), None)
                    target = None
                    if pap:
                        for c in pap.children:
                            if c.kind == "region" and c.status == "open" \
                                    and norm_region(c.label) == inferred_norm:
                                target = c
                                break
                    if target is not None:
                        while len(stack) - 1 > stack.index(target):
                            close(stack.pop())
                        events["office_reanchored"] += 1
                    else:
                        while stack and stack[-1].depth >= DEPTH["region"]:
                            close(stack.pop())
                        nr = Block("region", inferred, None, i)
                        nr.status = "inferred"
                        stack.append(nr)
                        events["office_reanchored_new_region"] += 1
            # page-break dedupe: same kind+label (and same/unset total) open
            # anywhere up the stack -> reopen that block
            idx = find_open_same(k, lbl, amount)
            if idx is not None:
                while len(stack) - 1 > idx:
                    close(stack.pop())
                if stack[idx].total is None and amount is not None:
                    stack[idx].total = amount
                events["dedupe_reopens"] += 1
                continue
            # demotion guard: pap/subprog/program can never legitimately open
            # inside a region/office (depth >= 5), and at pap depth (4) real
            # PAP aggregates are multi-billion. Sub-billion rows arriving at
            # that depth are page-break fragments / OCR-split project rows;
            # leaf-worded rows up to 6B are projects too.
            if k in ("pap", "subprog", "program") \
                    and stack[-1].depth >= DEPTH["pap"] \
                    and ((amount is None or amount < 1_000_000_000)
                         or (looks_like_leaf(lbl) and amount < 6_000_000_000)):
                k = "leaf"
                events["demoted_container_rows"] += 1
            else:
                if "\\n" in lbl:
                    segs = split_segments(lbl)
                    if all(is_region(s) or is_office(s) for s in segs):
                        open_chain(segs, amount, i)
                        continue
                while stack and stack[-1].depth >= DEPTH[k]:
                    close(stack.pop())
                stack.append(Block(k, lbl, amount, i))
                continue

        if k == "leaf":
            amount = amount or 0
            clean = lbl.replace("\\n", " ")
            if "\\n" in lbl:
                segs = split_segments(lbl)
                if all(is_region(s) or is_office(s) for s in segs[:-1]):
                    open_chain(segs[:-1], None, i)
                    clean = segs[-1]
            if outcome_start <= i < fap_start:
                b = stack[-1]
                overflow = (b.total is not None
                            and b.depth >= DEPTH["region"]
                            and b.direct_sum + amount > b.total)
                # promotion A: overflowing leaf-verb row directly followed by
                # another container is a heading (requires container lookahead
                # so OCR-short region totals don't swallow real projects)
                if LEAF_START_RX.match(lbl) and overflow and heading_kind(i):
                    hk = heading_kind(i)
                    while stack and stack[-1].depth >= DEPTH[hk]:
                        close(stack.pop())
                    stack.append(Block(hk, clean, amount, i))
                    events["promoted_" + hk] += 1
                    continue
                # promotion B: overflowed leaf (any wording) followed by a
                # region/pap row starts a headingless PAP
                if overflow:
                    j = next_sig(i)
                    k2 = kinds[j] if j is not None else None
                    if k2 in ("region", "pap"):
                        while stack and stack[-1].depth > DEPTH["pap"]:
                            close(stack.pop())
                        nb = Block("pap", "<headingless @%d> %s" % (i, clean[:40]),
                                   None, i)
                        stack.append(nb)
                        events["overflow_pap"] += 1
                        b = nb
                # structural promotion: leaf-kind row at program/subprog depth
                if stack[-1].depth <= DEPTH["subprog"]:
                    j = next_sig(i)
                    k2 = kinds[j] if j is not None else None
                    newk = "pap" if k2 in ("region", "office") else (
                        "subprog" if k2 == "pap" else "program")
                    while stack and stack[-1].depth >= DEPTH[newk]:
                        close(stack.pop())
                    stack.append(Block(newk, clean, amount, i))
                    events["promoted_" + newk] += 1
                    continue
            b = stack[-1]
            b.direct_sum += amount
            b.n_direct += 1
            b.leaves.append((clean, amount, i))
            status = "ok"
            if b.total is not None and b.kind in ("region", "office") \
                    and b.direct_sum > b.total:
                status = "spillover"
                events["spillover_leaves"] += 1
            emit_leaf(i, clean, amount, status)

    while stack:
        close(stack.pop())

    # ---- recursive audit -------------------------------------------------------
    all_blocks = []

    def audit(b):
        if b.depth >= 0:
            all_blocks.append(b)
        for c in b.children:
            audit(c)
    audit(root)

    by_kind = defaultdict(Counter)
    for b in all_blocks:
        by_kind[b.kind][b.status] += 1

    # duplicate-project flags within the same office block (page-break
    # repeats or repeated line items — flagged, not removed)
    seen_keys = {}
    for l in leaves:
        key = (l["pap"], l["region"], l["office"],
               l["project"].strip().lower(), l["amount_php"])
        if key in seen_keys:
            l["validation"] = "dup_in_block"
            l["dup_of_row"] = seen_keys[key]
        else:
            seen_keys[key] = l["row"]

    ok_leaves = [l for l in leaves if l["validation"] in ("ok", "ok_merged")]
    sum_by_zone, n_by_zone = defaultdict(int), Counter()
    for l in leaves:
        sum_by_zone[l["zone"]] += l["amount_php"] or 0
        n_by_zone[l["zone"]] += 1

    review = [{"kind": b.kind, "label": b.label[:70], "row": b.row,
               "total": b.total, "direct": b.direct_sum,
               "children": len(b.children),
               "expected": b.direct_sum + sum(c.contrib for c in b.children)}
              for b in all_blocks if b.status == "review"]

    def slim(b):
        return {"kind": b.kind, "label": b.label[:80], "row": b.row,
                "total": b.total, "status": b.status, "contrib": b.contrib,
                "direct_sum": b.direct_sum, "n_direct": b.n_direct,
                "children": [slim(c) for c in b.children]}
    tree = {"roots": [slim(c) for c in root.children]}

    # ---- consumer export: full hierarchy with nested leaves -------------------
    flag_by_row = {l["row"]: l["validation"] for l in leaves}

    def export_block(b):
        node = {"kind": b.kind, "name": b.label.replace("\\n", " "),
                "row": b.row, "printed_total_php": b.total,
                "children_sum_php": b.direct_sum + sum(c.contrib for c in b.children),
                "arithmetic": b.status, "n_direct_leaves": b.n_direct}
        kids = [export_block(c) for c in b.children]
        if kids:
            node["children"] = kids
        projects = [{"name": ln.replace("\\n", " "), "amount_php": la,
                     "row": lr, "flag": flag_by_row.get(lr, "ok")}
                    for ln, la, lr in b.leaves]
        if projects:
            node["projects"] = projects
        return node

    def export_outcome(b):
        node = {"kind": "outcome", "name": b.label.replace("\\n", " "),
                "row": b.row, "printed_total_php": b.total,
                "children_sum_php": b.direct_sum + sum(c.contrib for c in b.children),
                "arithmetic": b.status}
        projects = [{"name": ln.replace("\\n", " "), "amount_php": la,
                     "row": lr, "flag": flag_by_row.get(lr, "ok")}
                    for ln, la, lr in b.leaves]
        if projects:
            node["projects"] = projects
        node["children"] = [export_block(c) for c in b.children]
        return node

    export = {
        "dataset": "HB 10858 (House FY 2027) — DPWH PAP hierarchy, validated",
        "source": SRC,
        "parser": "analysis/archive/builders/parse_hb_tree.py",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "zone_row_ranges": {"alloc": [0, outcome_start],
                            "pap": [outcome_start, fap_start],
                            "fap": [fap_start, n]},
        "currency": "PHP (amounts as printed; VOL IC prints pesos, not thousands)",
        "validation_legend": {
            "validated": "sum(children) == printed total",
            "rollup_only": "summary row without direct children",
            "container": "no printed total; children roll up cleanly",
            "review": "sum(children) != printed total after repairs (OCR damage upstream)",
            "inferred": "region reconstructed from DEO province token (header lost in OCR)",
        },
        "project_flags": {
            "ok": "leaf verified within block arithmetic",
            "spillover": "attaches past block's printed total (region total OCR-shortened)",
            "dup_in_block": "same name+amount repeats within block (page-break repeat or multi-site)",
        },
        "summary": {
            "n_projects": len(leaves),
            "sum_projects_php": sum(l["amount_php"] or 0 for l in leaves),
            "n_projects_ok": sum(1 for l in leaves if l["validation"] == "ok"),
            "alloc_lines": len(allocs),
            "alloc_lines_sum_php": sum(a["amount_php"] or 0 for a in allocs),
            "operations_total_php": 586_941_661_000,
            "foreign_assisted_total_php": 44_749_011_000,
        },
        "outcomes": [export_outcome(c) for c in root.children],
        "alloc_lines": [
            {"name": a["section"], "amount_php": a["amount_php"], "row": a["row"]}
            for a in allocs],
    }

    stats = {
        "source": SRC,
        "rows": n,
        "zones": {"pap_start": outcome_start, "fap_start": fap_start},
        "blocks_by_kind": {k: dict(c) for k, c in sorted(by_kind.items())},
        "leaves": {"n": len(leaves), "n_ok": len(ok_leaves),
                   "n_by_zone": dict(n_by_zone), "sum_by_zone": dict(sum_by_zone),
                   "sum_all": sum(l["amount_php"] or 0 for l in leaves)},
        "alloc_lines": {"n": len(allocs),
                        "sum": sum(a["amount_php"] or 0 for a in allocs)},
        "events": dict(events),
        "n_review": len(review),
        "review_head": review[:60],
    }

    with open(OUT_STATS, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    with open(OUT_LEAVES, "w", encoding="utf-8") as f:
        json.dump({"source": SRC,
                   "parser": "parse_hb_tree.py v4 (stack + promotion + audit)",
                   "n_leaves": len(leaves), "leaves": leaves,
                   "alloc_lines": allocs}, f, indent=1, ensure_ascii=False)
    with open(OUT_TREE, "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=1, ensure_ascii=False)
    with open(OUT_EXPORT, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=1, ensure_ascii=False)

    print(json.dumps({k: v for k, v in stats.items() if k != "review_head"},
                     indent=2, ensure_ascii=False))
    print("\nreview by (zone, kind):")
    cz = Counter()
    for r_ in review:
        z = "alloc" if r_["row"] < outcome_start else ("fap" if r_["row"] >= fap_start else "pap")
        cz[(z, r_["kind"])] += 1
    for kk, v in sorted(cz.items()):
        print("  ", kk, v)
    print("\nfirst review blocks:")
    for r_ in review[:20]:
        print("  ", r_)


if __name__ == "__main__":
    main()
