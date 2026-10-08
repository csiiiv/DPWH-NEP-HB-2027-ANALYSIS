#!/usr/bin/env python3
"""
Repair the headingless-leaf pool (₱39.0B, 1,082 rows in 22 blocks).

Each `<headingless @N> <text>` leaf is one whose block heading failed to
parse as a PAP heading; the text captured is the first project row of the
block, not the PAP name. The strict hierarchy (hb_dpwh_pap_hierarchy.json)
nonetheless places every block under its true PAP ancestry — so we walk
each headingless node's ancestors and take the nearest clean type-split
PAP label (skipping program containers, section names, and other
headingless nodes).

Special fixes:
- 'ff-Carriageway' -> 'Off-Carriageway' (dropped-capital OCR)
- Bundled-package sections (Daang Maharlika B3-B, Davao City Bypass II)
  keep their type-split PAP (e.g., 'Widening of Permanent Bridges') so
  they aggregate with their sibling PAP blocks.
- S2O/office rows (Regional Office I/II/VI/VII/X inside Flood Management)
  are attributed to their printed parent heading (kept as-is; not
  project-level PAPs).

Output: archive/hb_dpwh_leaves_corrected_v4.json (v3 + pap_repaired fields, historical) and
a console summary of the recovered attribution.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import json
import re
import unicodedata
from collections import Counter, defaultdict


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).lower()
    return re.sub(r"\s+", " ", s).strip()

HIER = "../analysis/data/hb_dpwh_pap_hierarchy.json"
IN = "analysis/archive/hb_dpwh_leaves_corrected_v3.json"
OUT = "analysis/archive/hb_dpwh_leaves_corrected_v4.json"

# labels that are containers/sections, never PAP attributions
CONTAINER_RX = re.compile(
    r"^(daang maharlika|davao city bypass|laguna lakeshore|"
    r"construction of multi-purpose building, barangay (poblacion|6)|"
    r"construction of multi-purpose building, sitio|"
    r"construction of multi-purpose building \(municipal plaza\)|"
    r"construction of public water supply|rehabilitation of lakewall|"
    r"construction/ rehabilitation of water supply/ septage|"
    r"construction/rehabilitation/improvement of facilities for persons|"
    r"impasug-ong|malaybalay)", re.I)
# program banners: last-resort attribution only
BANNER_RX = re.compile(
    r"(asset preservation program|network development program|"
    r"flood management program|bridge program|convergence and special "
    r"support program|national building program|basic infrastructure|"
    r"zational outcome \d)", re.I)
TYPE_SPLIT_RX = re.compile(r" - (primary|secondary|tertiary) roads$", re.I)
OCR_FIX = [("ff-Carriageway", "Off-Carriageway"),
           ("ff- Carriageway", "Off-Carriageway")]

# canonical labels usable for own-text attribution
PAP_CANDIDATES = None  # filled in main(): API pap3 names + family intros


def is_clean_pap(name):
    if not name or "<headingless" in name:
        return False
    if CONTAINER_RX.match(name.strip()):
        return False
    return True


def walk(node, path=()):
    yield node, path
    for ch in node.get("children", []) or []:
        yield from walk(ch, path + (node,))


def own_text_pap(text, pap_cands, type_split_map):
    """If the headingless text IS itself a canonical PAP label, use it."""
    n = text.strip()
    nl = n.lower()
    for c in pap_cands:
        if nl == c.lower():
            return c
    # near-miss: 'Paving of Unpaved Roads' vs '- Tertiary Roads' splits
    for c in pap_cands:
        if nl.startswith(c.lower()) and TYPE_SPLIT_RX.search(c.lower()) \
                and len(nl) <= len(c.lower()) + 4:
            return c
    # type-split map: 'Paving of Unpaved Roads - Tertiary Roads' full text
    if n in type_split_map:
        return type_split_map[n]
    # 'Paving of Unpaved Roads' (no class) kept under its rollup parent in
    # the API? map to the closest parent by fuzzy startswith
    starts = [c for c in pap_cands if c.lower().startswith(nl)]
    if len(starts) == 1 and len(nl) >= 14:
        return starts[0]
    return None


def block_pap_ancestry():
    """Map headingless tag @N -> nearest clean PAP from hierarchy path."""
    h = json.load(open(HIER, encoding="utf-8"))
    amap = {}
    for node, path in walk({"children": h["outcomes"]}):
        nm = node.get("name") or ""
        if "<headingless" not in nm:
            continue
        m = re.search(r"@(\d+)", nm)
        if not m:
            continue
        start = int(m.group(1))
        # nearest clean ancestor (walk path backwards)
        pap = None
        for anc in reversed(path):
            an = (anc.get("name") or "").replace("\n", " ").strip()
            if is_clean_pap(an):
                pap = an
                break
        amap.setdefault(start, pap)
    return amap


def main():
    # canonical PAP candidates: API pap3 names + ' - ' base families
    nep = json.load(open("../dpwh-transparency-nep-data/json/fy2027-combined.json",
                         encoding="utf-8"))["data"]["data"]
    pap_cands = sorted({(i.get("pap3") or "").strip() for i in nep
                        if i.get("pap3")})
    # type-split resolution map for base labels ('Paving of Unpaved Roads')
    type_split_map = {}
    bases = defaultdict(list)
    for c in pap_cands:
        m = re.match(r"^(.*?) - (primary|secondary|tertiary) roads$",
                     c, re.I)
        if m:
            bases[norm(m.group(1))].append(c)
    amap = block_pap_ancestry()
    print("block -> repaired PAP:")
    for s in sorted(amap):
        print(f"  @{s:<7} -> {amap[s]}")

    data = json.load(open(IN, encoding="utf-8"))
    leaves = data["leaves"]
    patched = 0
    stats = Counter()
    for l in leaves:
        pap = l.get("pap") or ""
        m = re.search(r"<headingless @(\d+)>\s*(.*)", pap, re.S)
        if not m:
            continue
        start = int(m.group(1))
        own = m.group(2).replace("\n", " ").strip()
        rep = own_text_pap(own, pap_cands, type_split_map)
        src = "own-text"
        if not rep:
            rep = amap.get(start)
            src = "ancestry"
        if not rep:
            stats["<no attribution>"] += 1
            continue
        if BANNER_RX.search(rep) and "outcome" in rep.lower():
            # outcome banner: attribute to parent heading stored in
            # sub_program if it looks like a PAP
            sp = (l.get("sub_program") or "").strip()
            rep = sp if sp else rep
            src = "sub-program"
        for a, b in OCR_FIX:
            rep = rep.replace(a, b)
        l["pap_raw"] = pap
        l["pap"] = rep
        l["pap_repaired"] = src
        patched += 1
        stats[rep[:60]] += 1
    data["parser"] = data.get("parser", "") + " + headingless-pap repair v4"
    json.dump(data, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    php = sum(l["amount_php"] or 0 for l in leaves if l.get("pap_repaired"))
    print(f"\npatched {patched} leaves (₱{php/1e9:.2f}B) -> {OUT}")
    print("\nrepaired PAP distribution:")
    for k, n in stats.most_common():
        print(f"  {n:>5}  {k}")


if __name__ == "__main__":
    main()
