#!/usr/bin/env python3
"""Load GEOAGRI region shapefile export, validate geometry, simplify, and emit
GeoJSON + match table for the test webapp.

Usage: python3 build_geoagri_shapefile_dataset.py [zip_or_dir ...]
Outputs (in DA_FMR_DATA/):
  geoagri_shp_features.geojson  — validated/simplified alignments
  geoagri_shp_matches.json      — NEP/HGAB title+locality matches w/ geometry flags
"""
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

import shapefile
from shapely.geometry import LineString, MultiLineString
from shapely.ops import transform

BASE = Path(__file__).resolve().parent
NEP = BASE.parent / 'other-analysis' / 'data' / 'nep_fmr_final_dataset.json'
HGAB = BASE.parent / 'other-analysis' / 'data' / 'hgab_fmr_final_dataset.json'

PH_LAT = (4.5, 21.5)
PH_LNG = (116.5, 127.0)

FIELD_MAP = {
    'id': 'id', 'road_name': 'road_name', 'road_width': 'road_width',
    'estimate_r': 'estimate_road_length', 'estimate_p': 'estimate_project_cost',
    'status': 'status', 'reg_proper': 'region', 'reg_short_': 'reg_short_name',
    'district': 'district', 'province': 'province',
    'municipali': 'municipality', 'barangay': 'barangay',
}

SIMP_TOL = 5e-5          # ~5 m simplify tolerance (deg)
MAX_VERTS = 4000         # per emitted part
PART_VERT_CAP = 6000     # hard cap per MultiLineString part before split


def norm(s):
    s = (s or '').casefold().replace('brgy.', 'barangay').replace('brgy', 'barangay')
    return re.sub(r'[^a-z0-9]+', '', s)


def title_similar(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.95
    ta = set(re.findall(r'[a-z0-9]+', (a or '').casefold()))
    tb = set(re.findall(r'[a-z0-9]+', (b or '').casefold()))
    stop = {'of', 'the', 'and', 'fmr', 'brgy', 'barangay', 'construction', 'concreting', 'road', 'to', 'phase', 'ii', 'iii'}
    ta -= stop; tb -= stop
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def load_source(path):
    """Accept .zip or directory; return list of (props, parts[[pts]])"""
    path = Path(path)
    temp = None
    if path.suffix == '.zip':
        temp = BASE / 'extracted' / path.stem.replace(' ', '_')
        temp.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as z:
            z.extractall(temp)
        root = temp
    else:
        root = path
    shps = list(root.rglob('*.shp')) or list(root.rglob('*.shx'))
    if not shps:
        raise SystemExit(f'no shapefile under {root}')
    stem = shps[0].with_suffix('')
    r = shapefile.Reader(str(stem), encoding='latin-1')
    fields = [f[0] for f in r.fields[1:]]
    out = []
    for i in range(len(r)):
        d = dict(zip(fields, list(r.record(i))))
        props = {v: d.get(k) for k, v in FIELD_MAP.items()}
        try:
            props['id'] = int(float(props['id']))
        except (TypeError, ValueError):
            props['id'] = None
        shp = r.shape(i)
        parts = []
        for j in range(len(shp.parts)):
            s = shp.parts[j]
            e = shp.parts[j + 1] if j + 1 < len(shp.parts) else len(shp.points)
            seg = shp.points[s:e]
            if len(seg) >= 2:
                parts.append([(round(p[0], 7), round(p[1], 7)) for p in seg])
        out.append((props, parts))
    return out, len(r)


def validate_and_simplify(props, parts):
    """Return (flag, reasons, coords) with coords as MultiLineString parts."""
    reasons = []
    if not parts:
        return 'missing', ['no_coordinates'], None
    flat = [p for part in parts for p in part]
    lats = [p[1] for p in flat]; lngs = [p[0] for p in flat]
    outside = sum(1 for la, ln in zip(lats, lngs)
                  if not (PH_LAT[0] <= la <= PH_LAT[1] and PH_LNG[0] <= ln <= PH_LNG[1]))
    if outside == len(flat):
        reasons += ['outside_ph_bbox', 'vertices_outside_ph']
    elif outside:
        reasons += ['partial_outside_ph']
    span_lat = max(lats) - min(lats)
    span_lng = max(lngs) - min(lngs)
    if max(span_lat, span_lng) < 1e-5:
        reasons.append('collapsed_geometry')
    if outside == len(flat) or 'collapsed_geometry' in reasons:
        return 'invalid', reasons, None

    # Simplify per part (drop outside verts when partial), cap verts
    out_parts = []
    for part in parts:
        seg = [p for p in part
               if PH_LAT[0] <= p[1] <= PH_LAT[1] and PH_LNG[0] <= p[0] <= PH_LNG[1]] \
            if 'partial_outside_ph' in reasons else part
        if len(seg) < 2:
            continue
        line = LineString(seg)
        simp = line.simplify(SIMP_TOL, preserve_topology=True)
        pts = list(simp.coords)
        if len(pts) >= 2:
            out_parts.append(pts)
    if not out_parts:
        return 'invalid', ['no_valid_parts_after_simplify'], None
    flag = 'valid' if not reasons else 'suspect'
    return flag, reasons, out_parts


def cap_parts(parts):
    """Thin parts to MAX_VERTS if over cap."""
    capped = []
    for part in parts:
        if len(part) <= MAX_VERTS:
            capped.append(part)
            continue
        step = len(part) / MAX_VERTS
        capped.append([part[0]] + [part[int(step * k)] for k in range(1, MAX_VERTS)] + [part[-1]])
    return capped


def main():
    srcs = sys.argv[1:]
    if not srcs:
        zips = sorted(BASE.glob('*.zip'))
        srcs = zips
        print('no sources given; using zips:', [z.name for z in zips])
    records = []
    for src in srcs:
        recs, n = load_source(src)
        print(f'{src}: {n} shapes -> {len(recs)} w/ parts')
        records.extend(recs)

    # Load NEP/HGAB for matching
    nep = json.loads(NEP.read_text())['projects']
    hgab = json.loads(HGAB.read_text())['projects']
    h_by_title = {norm(p['title']): p for p in hgab}

    features = []
    matches = []
    flags = Counter()
    for props, parts in records:
        flag, reasons, coords = validate_and_simplify(props, parts)
        flags[flag] += 1
        if coords:
            coords = cap_parts(coords)
        cen = None
        if coords:
            xs = [p[0] for part in coords for p in part]
            ys = [p[1] for part in coords for p in part]
            cen = {'lng': round(sum(xs) / len(xs), 7), 'lat': round(sum(ys) / len(ys), 7)}

        # match against NEP by title+locality
        best = None
        for p in nep:
            if norm(p.get('region', '')) and 'region i' not in norm(p.get('region', '')):
                continue  # crude region filter for this Region I export
            loc = p.get('title_locality') or {}
            if norm(loc.get('province')) and norm(loc['province']) != norm(str(props.get('province'))):
                continue
            score = title_similar(p['title'], str(props.get('road_name')))
            if norm(loc.get('municipality')) == norm(str(props.get('municipality'))):
                score += 0.25
            if loc.get('barangay') and norm(loc.get('barangay')) == norm(str(props.get('barangay'))):
                score += 0.2
            amt = p.get('amount_php') or 0
            c = props.get('estimate_project_cost')
            try:
                c = float(c)
            except (TypeError, ValueError):
                c = 0
            if amt and c:
                score += 0.15 * (min(amt, c) / max(amt, c))
            if best is None or score > best[0]:
                best = (score, p)
        matched_nep = best[1] if best and best[0] >= 1.35 else None
        matched_hgab = h_by_title.get(norm(matched_nep['title'])) if matched_nep else None

        fp = {
            'feature_role': 'alignment',
            'geoagri_id': props['id'],
            'fmrcode_hint': f"{props.get('reg_short_name', '')}-{props.get('id')}",
            'road_name': props.get('road_name'),
            'status': props.get('status'),
            'road_width': props.get('road_width'),
            'estimate_road_length': props.get('estimate_road_length'),
            'estimate_project_cost': props.get('estimate_project_cost'),
            'region': props.get('region'),
            'district': props.get('district'),
            'province': props.get('province'),
            'municipality': props.get('municipality'),
            'barangay': props.get('barangay'),
            'geometry_flag': flag,
            'geometry_reasons': reasons,
            'nep_id': matched_nep['project_id'] if matched_nep else None,
            'nep_title': matched_nep['title'] if matched_nep else None,
            'nep_amount': matched_nep['amount_php'] if matched_nep else None,
            'hgab_id': matched_hgab['project_id'] if matched_hgab else None,
            'hgab_amount': matched_hgab['amount_php'] if matched_hgab else None,
            'match_score': round(best[0], 3) if best else None,
        }
        if coords:
            features.append({'type': 'Feature',
                             'geometry': {'type': 'MultiLineString', 'coordinates': coords},
                             'properties': fp})
            if cen:
                fp2 = dict(fp); fp2['feature_role'] = 'centroid'
                features.append({'type': 'Feature',
                                 'geometry': {'type': 'Point', 'coordinates': [cen['lng'], cen['lat']]},
                                 'properties': fp2})
        matches.append({**fp, 'centroid': cen})

    counts = Counter(m['geometry_flag'] for m in matches)
    n_matched = sum(1 for m in matches if m['nep_id'])
    out_gj = {
        'type': 'FeatureCollection',
        'metadata': {
            'source': 'GEOAGRI region shapefile export (fmr_profile_flipLine)',
            'features': len([f for f in features if f['properties']['feature_role'] == 'alignment']),
            'geometry_flags': dict(counts),
            'matched_to_nep': n_matched,
            'simplify_tolerance_deg': SIMP_TOL,
        },
        'features': features,
    }
    (BASE / 'geoagri_shp_features.geojson').write_text(json.dumps(out_gj))
    (BASE / 'geoagri_shp_matches.json').write_text(json.dumps({
        'metadata': out_gj['metadata'], 'matches': matches}, indent=1))
    print('geometry flags:', dict(counts))
    print('matched to NEP:', n_matched)
    print('features:', len(features))
    print('wrote geoagri_shp_features.geojson',
          (BASE / 'geoagri_shp_features.geojson').stat().st_size)


if __name__ == '__main__':
    main()
