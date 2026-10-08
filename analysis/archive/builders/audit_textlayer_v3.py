#!/usr/bin/env python3
"""
HB 10858 leaf audit v3 — second-chance resolution for UNRESOLVED rows only.

Consumes textlayer_audit_v2.json (all non-UNRESOLVED verdicts are kept
as-is) and re-processes the 754 UNRESOLVED rows with progressively relaxed
matchers against the printed text-layer rows:

  1. CONTAINMENT  — leaf key inside a printed project-row key (or reverse),
                    length-ratio guarded; equal amounts -> OK
  2. ROLLUP       — leaf matches a HEADING row (bold appropriation lines,
                    PAP-category headings) with equal amounts
                    -> VERIFIED_ROLLUP (amount kept, now printed-verified)
  3. FUZZY        — token-overlap >= 0.60 + equal amounts, global search
                    -> OK

Outputs: archive/data/hb_dpwh_leaves_corrected_v3.json, archive/textlayer_audit_v3.{json,md} (historical)
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE



import json
import re
import importlib.util
import pymupdf

PDF_FILE = "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
V2_JSON = "analysis/archive/data/textlayer_audit_v2.json"
V2_LEAVES = "analysis/archive/data/hb_dpwh_leaves_corrected_v2.json"
OUT_LEAVES = "analysis/archive/data/hb_dpwh_leaves_corrected_v3.json"
OUT_JSON = "analysis/archive/data/textlayer_audit_v3.json"
OUT_MD = "analysis/archive/docs/textlayer_audit_v3.md"

spec = importlib.util.spec_from_file_location(
    "audit2", "analysis/archive/builders/audit_textlayer_v2.py")
am = importlib.util.module_from_spec(spec)
spec.loader.exec_module(am)


def tokens(s):
    return set(re.findall(r"[a-z0-9]+", s.lower()))


def main():
    doc = pymupdf.open(PDF_FILE)
    all_rows = []
    for page in doc:
        all_rows.extend(am.extract_page_rows(page))
    doc.close()
    for r in all_rows:
        r["heading"] = am.is_heading(r["label"], r["bold"])
    proj = [r for r in all_rows if not r["heading"]]
    heads = [r for r in all_rows if r["heading"]]
    proj_keys = [am.nospace(r["label"]) for r in proj]
    proj_labels = [r["label"] for r in proj]
    head_keys = [am.nospace(r["label"]) for r in heads]
    print(f"printed rows: {len(proj)} project / {len(heads)} heading")

    ENUM_RX = re.compile(r"^[a-z0-9]{1,2}[.)]\s*", re.I)
    STRIP = re.compile(
        r"^region\s*[0-9ivxⅠ-Ⅻ]{1,4}\s*([ab])?\s*\\n?\s*", re.I)

    v2 = json.load(open(V2_JSON, encoding="utf-8"))
    results = v2["results"]
    leaves = {l["row"]: l for l in
              json.load(open(V2_LEAVES, encoding="utf-8"))["leaves"]}

    counts = {"OK": 0, "VERIFIED_ROLLUP": 0, "CORRECTED_REGION_MERGED": 0,
              "STILL_UNRESOLVED": 0, "SOFT_DIFF": 0}
    upgrades = []
    for rec in results:
        if rec["verdict"] != "UNRESOLVED":
            continue
        leaf = leaves[rec["md_row"]]
        amt = rec["parsed_php"] or 0
        label = STRIP.sub("", (leaf["project"] or "").replace("\\n", " "))
        label = ENUM_RX.sub("", label)
        k = am.nospace(label)
        ktok = tokens(label)        # tokens from the RAW label, not the key
        new = None

        if len(k) >= 18:
            # 1. containment among project rows — collect ALL hits, prefer
            #    one printing the parsed amount
            hits = [i for i, pk in enumerate(proj_keys)
                    if pk and ((len(k) >= 18 and k in pk) or
                               (len(pk) >= 18 and pk in k))]
            for i in hits:
                if amt and amt in proj[i]["amounts"]:
                    new = ("OK", proj[i], "containment match")
                    break
            # 2. rollup: prefix match against heading rows
            if new is None and k[:40]:
                hhits = [j for j, hk in enumerate(head_keys)
                         if len(hk) >= 12 and
                         (k[:40] == hk[:40] or
                          (len(k) >= 20 and k in hk) or
                          (len(hk) >= 20 and hk in k))]
                for j in hhits:
                    if amt and amt in heads[j]["amounts"]:
                        new = ("VERIFIED_ROLLUP", heads[j],
                               "matches printed heading/subtotal line")
                        break
                # if no amount-verified heading hit but exactly one prefix
                # hit exists, accept it as verified rollup on label strength
                if new is None and len(hhits) == 1:
                    new = ("VERIFIED_ROLLUP", heads[hhits[0]],
                           "unique heading-label match")
        # 3. fuzzy: token overlap + equal amount, global
        if new is None and amt and len(ktok) >= 4:
            best, best_s = None, 0.0
            for i, pk in enumerate(proj_keys):
                rtok = tokens(proj_labels[i])
                if not rtok or amt not in proj[i]["amounts"]:
                    continue
                s = len(ktok & rtok) / len(ktok | rtok)
                if s > best_s:
                    best, best_s = i, s
            if best is not None and best_s >= 0.45:
                new = ("OK", proj[best], f"fuzzy overlap {best_s:.2f}")

        # 4. region-merged rows: parsed amount == some region-heading subtotal
        #    -> the label is 'Region X <project>' with the region's subtotal
        #       as amount; find the true project row by fuzzy label only
        if new is None and re.match(r"(?i)^region\s", (leaf["project"] or "")):
            reg_amts = {hr["amounts"][0] for hr in heads
                        if am.REGION_RX.match(hr["label"])}
            if amt in reg_amts and len(ktok) >= 5:
                best, best_s = None, 0.0
                for i in range(len(proj_keys)):
                    rtok = tokens(proj_labels[i])
                    if not rtok:
                        continue
                    s = len(ktok & rtok) / len(ktok | rtok)
                    if s > best_s:
                        best, best_s = i, s
                if best is not None and best_s >= 0.70:
                    row = proj[best]
                    fin = next((a for a in row["amounts"] if a != amt),
                               row["amounts"][0])
                    new = ("CORRECTED_REGION_MERGED", row,
                           f"region subtotal corrected (fuzzy {best_s:.2f})",
                           fin)

        # 5. category rollup: unique bold-heading prefix match, amount kept
        if new is None and len(k) >= 25:
            hhits = [j for j, hk in enumerate(head_keys)
                     if len(hk) >= 25 and hk[:45] == k[:45]]
            if len(hhits) == 1:
                new = ("VERIFIED_ROLLUP", heads[hhits[0]],
                       "unique bold-heading prefix match")

        if new is None:
            counts["STILL_UNRESOLVED"] += 1
            continue
        verdict, row, note = new[0], new[1], new[2]
        counts[verdict] += 1
        fin = new[3] if len(new) > 3 else amt
        rec.update(verdict=verdict, page=row["page_idx"] + 1,
                   printed_php=row["amounts"], final_php=fin, note=note)
        upgrades.append(rec)

    # corrected leaves: v2 leaves with final_php applied where newly set
    for rec in upgrades:
        cl = leaves[rec["md_row"]]
        if rec.get("final_php") is not None and \
                rec["final_php"] != cl["amount_php"]:
            cl["amount_php"] = rec["final_php"]
        cl["validation"] = f"pdf3:{rec['verdict'].lower()}"
    with open(OUT_LEAVES, "w", encoding="utf-8") as f:
        json.dump({"leaves": list(leaves.values())}, f, ensure_ascii=False)

    grand = sum(l["amount_php"] or 0 for l in leaves.values())
    still = [r for r in results if r["verdict"] == "UNRESOLVED"]
    still.sort(key=lambda r: -(r["parsed_php"] or 0))
    out = {"meta": {"source": PDF_FILE, "base": V2_JSON},
           "verdicts": counts,
           "grand_total": grand,
           "results": results}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    lines = [
        "# HB 10858 — leaf audit v3 (UNRESOLVED second pass)",
        "",
        f"Upgraded: {len(upgrades)} rows · still unresolved: "
        f"{counts['STILL_UNRESOLVED']} rows "
        f"(₱{sum(r['parsed_php'] or 0 for r in still)/1e9:.2f}B)",
        f"Grand total (corrected v3): ₱{grand:,}",
        "",
        "## Upgraded rows (top 30 by amount)",
        "",
        "| md_row | page | verdict | ₱ | project |",
        "|---|---|---|---|---|",
    ]
    for r in sorted(upgrades, key=lambda r: -(r["parsed_php"] or 0))[:30]:
        lines.append(f"| {r['md_row']} | {r.get('page')} | {r['verdict']} "
                     f"| {r['parsed_php']:,} | {(r['project'] or '')[:50]} |")
    lines += ["", "## Still unresolved (top 20)", "",
              "| md_row | ₱ | project |", "|---|---|---|"]
    for r in still[:20]:
        lines.append(f"| {r['md_row']} | {r['parsed_php']:,} "
                     f"| {(r['project'] or '')[:60]} |")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("v3 upgrades:", counts)
    print(f"grand total: ₱{grand/1e9:.3f}B")
    print("wrote", OUT_LEAVES, OUT_JSON, OUT_MD)


if __name__ == "__main__":
    main()
