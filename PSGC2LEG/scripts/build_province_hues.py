#!/usr/bin/env python3
"""Assign hues to jurisdictions so that adjacent ones contrast strongly.

Replaces the golden-angle sequence used previously: golden-angle spreads
hues evenly over ALL jurisdictions but ignores geography, so neighbors
could land on similar colours (Bulacan and Nueva Ecija both read green,
which prompted this). This script:

1. Groups the rendered district polygons (viz/leg_districts.geojson) by
   jurisdiction and unions them -> one shape per province / HUC / split
   city.
2. Builds the adjacency graph from shared borders. The geojson is
   dissolved from the same municity polygons, so shared borders are
   geometrically identical; a 0.001° (~110 m) buffer on one side makes
   the intersects() test robust to floating-point slivers. Islands that
   merely face each other across water (Cebu/Bohol, Guimaras/Negros)
   do NOT become adjacent at this tolerance.
3. Greedy hue assignment, highest-degree jurisdictions first. Each pick
   maximizes the minimum circular hue distance to already-coloured
   neighbors (ties broken by distance to *all* coloured jurisdictions,
   then by lower angle), so not only do neighbors differ, the whole map
   stays spread out. Split cities participate too — their stripe tint
   uses the same hue table, keeping Metro Manila readable.

Output: viz/province_hues.json  {name: hue_deg, ...} (+ meta block).
index.html loads this at runtime and falls back to the golden-angle
estimate for any name not present (e.g. geojson rebuilt, hues stale).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "viz" / "leg_districts.geojson"
OUT = ROOT / "viz" / "province_hues.json"

ADJ_EPS = 0.001        # degrees (~110 m) — border-match tolerance
CANDIDATES = list(range(0, 360, 5))   # 5° granularity is plenty


def circ_dist(a: int, b: int) -> int:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def main() -> int:
    fc = json.loads(GEOJSON.read_text(encoding="utf-8"))

    # jurisdiction -> union of all its rendered polygons
    shapes: dict[str, object] = {}
    for f in fc["features"]:
        name = f["properties"]["jurisdiction"]
        geom = shape(f["geometry"]).buffer(0)      # fix any self-intersections
        shapes[name] = unary_union([shapes[name], geom]) if name in shapes else geom

    names = sorted(shapes)
    n = len(names)
    print(f"jurisdictions: {n}")

    # adjacency (symmetric): buffer one side by eps, test intersection
    adj: dict[str, set[str]] = {k: set() for k in names}
    for i in range(n):
        gi = shapes[names[i]].buffer(ADJ_EPS)
        for j in range(i + 1, n):
            if gi.intersects(shapes[names[j]]):
                adj[names[i]].add(names[j])
                adj[names[j]].add(names[i])
    edges = sum(len(v) for v in adj.values()) // 2
    print(f"adjacency edges: {edges}")
    deg = max(len(v) for v in adj.values())
    hub = max(adj, key=lambda k: len(adj[k]))
    print(f"most connected: {hub} ({deg} neighbors)")

    # greedy: highest degree first, then alphabetical for determinism
    order = sorted(names, key=lambda k: (-len(adj[k]), k))
    hues: dict[str, int] = {}
    for name in order:
        neigh_hues = [hues[m] for m in adj[name] if m in hues]
        all_hues = list(hues.values())
        best, best_key = None, None
        for cand in CANDIDATES:
            # primary: as far as possible from coloured neighbors
            min_neigh = min((circ_dist(cand, h) for h in neigh_hues),
                            default=180)
            if min_neigh == 0:
                continue                      # exact clash with a neighbor
            # tie-break 1: spread from every coloured jurisdiction
            # tie-break 2: prefer lower angle (stable output)
            min_all = min((circ_dist(cand, h) for h in all_hues), default=180)
            key = (min_neigh, min_all, -cand)
            if best_key is None or key > best_key:
                best, best_key = cand, key
        hues[name] = best

    # report the nearest-neighbour hue distance as a quality metric
    worst = 360
    worst_pair = None
    for a in names:
        for b in adj[a]:
            d = circ_dist(hues[a], hues[b])
            if d < worst:
                worst, worst_pair = d, (a, b)
    print(f"minimum adjacent hue separation: {worst}°  {worst_pair}")

    OUT.write_text(json.dumps({
        "_meta": {
            "generated_by": "scripts/build_province_hues.py",
            "source": "viz/leg_districts.geojson",
            "adjacency_edges": edges,
            "min_adjacent_hue_distance": worst,
        },
        **{k: hues[k] for k in sorted(hues)},
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
