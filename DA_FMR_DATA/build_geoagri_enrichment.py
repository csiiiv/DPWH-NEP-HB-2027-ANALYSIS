#!/usr/bin/env python3
"""Integrate the GEOAGRI FMR Proposals API into the existing FMR datasets.

Strategy: the API list endpoint embeds full MultiLineString geometry per row,
so province-wide pages can reach hundreds of MB (Isabela -> 457 MB/page) and
time out. Instead we harvest per (municipality, province) — every target pair
in NEP/DA parses to that level, pages are small (~1 MB) and complete.

Pipeline:
  1. Collect target (municipality, province) pairs from NEP title_locality and
     DA trailing title parts ("..., Brgy, Municipality, Province").
  2. Pull GEOAGRI list rows per pair (page_size=100, ~1 req/s, cached to disk,
     geometry slimmed to centroid/first/last/vertex_count).
  3. Match NEP projects (title + municipality/province/barangay + amount),
     carry matches to HGAB by exact title, match DA rows the same way.
  4. Write geoagri_fmr_enrichment.json — joinable via nep project_id /
     hgab project_id / da control_no.

Usage:
  python3 build_geoagri_enrichment.py [--refresh] [--max-pairs N]
"""
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.parse
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
OTHER = BASE.parent / 'other-analysis'
CACHE = BASE / 'geoagri_cache'
OUT = BASE / 'geoagri_fmr_enrichment.json'

API = 'https://geoagri.bafe.gov.ph/api/fmr-proposals/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

STRONG = 1.4
POSSIBLE = 1.15

PH_LAT = (4.5, 21.5)
PH_LNG = (116.5, 127.0)


# ---------- API helpers ----------

def curl_json(url, retries=3, timeout=60):
    for attempt in range(retries):
        try:
            out = subprocess.check_output(
                ['curl', '-sS', '-H', 'Accept: application/json',
                 '-H', f'User-Agent: {UA}', '--max-time', str(timeout), url],
                text=True)
            return json.loads(out)
        except subprocess.CalledProcessError as e:
            if e.returncode == 28:  # timeout — retry once at most
                time.sleep(2)
                continue
            raise
        except json.JSONDecodeError:
            time.sleep(2)
    return None


def slim_record(g):
    """Keep match fields + geometry summary; drop the MultiLineString paths."""
    c = g.get('coordinates') or {}
    cen = c.get('centroid') or {}
    gj = c.get('geojson') or {}
    nverts = sum(len(line) for line in (gj.get('coordinates') or []))
    lat, lng = cen.get('lat'), cen.get('lng')
    ok = (lat is not None and lng is not None
          and PH_LAT[0] <= float(lat) <= PH_LAT[1]
          and PH_LNG[0] <= float(lng) <= PH_LNG[1])
    return {
        'id': g['id'],
        'fmrcode': g.get('fmrcode'),
        'road_name': g.get('road_name'),
        'status': g.get('status'),
        'estimate_project_cost': g.get('estimate_project_cost'),
        'estimate_road_length': g.get('estimate_road_length'),
        'road_width': g.get('road_width'),
        'counterpart_amount': g.get('counterpart_amount'),
        'location': g.get('location'),
        'geometry': {
            'flag': 'valid' if ok else 'invalid',
            'centroid': cen,
            'first': c.get('first_coordinate'),
            'last': c.get('last_coordinate'),
            'vertex_count': nverts,
            'api_detail_url': f"{API.rstrip('/')}/{g['id']}/",
        },
    }


def fetch_pair(municipality, province, refresh=False):
    """Pull list rows for one (municipality, province); cache slimmed to disk."""
    slug = re.sub(r'[^a-z0-9]+', '_', f'{municipality}_{province}'.casefold()).strip('_')
    cache = CACHE / f'{slug}.json'
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({'municipality': municipality,
                                    'province': province,
                                    'page': page, 'page_size': 100})
        res = curl_json(f'{API}?{q}')
        if res is None or 'data' not in res:
            sys.stderr.write(f'  !! {municipality}, {province} page {page}: fetch failed\n')
            break
        rows.extend(slim_record(g) for g in res['data'])
        if page >= res.get('total_pages', 1):
            break
        page += 1
        time.sleep(1.05)  # list rate limit: 60/60s
    CACHE.mkdir(exist_ok=True)
    cache.write_text(json.dumps(rows))
    return rows


# ---------- normalization / scoring ----------

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
    stop = {'of', 'the', 'and', 'fmr', 'brgy', 'barangay', 'construction',
            'concreting', 'road', 'to', 'phase', 'ii', 'iii'}
    ta -= stop
    tb -= stop
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def score_candidate(title, municipality, province, barangay, amount, g):
    score = title_similar(title, g.get('road_name'))
    gl = g.get('location') or {}
    if municipality and gl.get('municipality') \
            and norm(gl['municipality']) == norm(municipality):
        score += 0.25
    if province and gl.get('province') \
            and norm(gl['province']) == norm(province):
        score += 0.15
    if barangay and gl.get('barangay') \
            and norm(gl['barangay']) == norm(barangay):
        score += 0.2
    cost = g.get('estimate_project_cost') or 0
    if amount and cost:
        score += 0.15 * (min(amount, cost) / max(amount, cost))
    return score


def match_one(title, muni, prov, brgy, amount, candidates):
    best, best_score = None, 0.0
    for g in candidates:
        s = score_candidate(title, muni, prov, brgy, amount, g)
        if s > best_score:
            best, best_score = g, s
    return best, best_score


def tiered(best, best_score, tier):
    if best and best_score >= STRONG:
        m = dict(best)
        m['match_score'] = round(best_score, 3)
        m['match_tier'] = 'strong'
        tier['strong'] += 1
        return m
    if best and best_score >= POSSIBLE:
        m = dict(best)
        m['match_score'] = round(best_score, 3)
        m['match_tier'] = 'possible'
        tier['possible'] += 1
        return m
    tier['none'] += 1
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true', help='ignore cache')
    ap.add_argument('--max-pairs', type=int, default=0)
    args = ap.parse_args()

    nep = json.loads((OTHER / 'data' / 'nep_fmr_final_dataset.json').read_text())['projects']
    hgab = json.loads((OTHER / 'data' / 'hgab_fmr_final_dataset.json').read_text())['projects']
    da = json.loads((OTHER / 'data' / 'da_fmr_draft.json').read_text())['projects']

    # 1) target (municipality, province) pairs
    pairs = {}
    for p in nep:
        loc = p.get('title_locality') or {}
        if loc.get('municipality') and loc.get('province'):
            pairs.setdefault((loc['municipality'], loc['province']), []).append('nep')
    for p in da:
        title = p.get('effective_title') or p.get('from_title') or ''
        parts = [x.strip() for x in title.split(',') if x.strip()]
        if len(parts) >= 3:
            pairs.setdefault((parts[-2], parts[-1]), []).append('da')
    todo = sorted(pairs)
    if args.max_pairs:
        todo = todo[:args.max_pairs]
    print(f'target (municipality, province) pairs: {len(todo)} (of {len(pairs)} seen)')

    # 2) harvest per pair
    by_pair = {}
    zero, failed = [], []
    for i, (muni, prov) in enumerate(todo, 1):
        slug = re.sub(r'[^a-z0-9]+', '_', f'{muni}_{prov}'.casefold()).strip('_')
        cached = (CACHE / f'{slug}.json').exists()
        rows = fetch_pair(muni, prov, refresh=args.refresh)
        by_pair[(muni, prov)] = rows
        if not rows:
            zero.append(f'{muni}, {prov}')
        if not cached:
            time.sleep(1.05)  # only throttle actual API hits
        if i % 25 == 0:
            print(f'[{i}/{len(todo)}] harvested, {sum(len(v) for v in by_pair.values())} rows so far', flush=True)
    for k, v in by_pair.items():
        if not v:
            failed.append(k)
    print(f'pairs harvested: {len(by_pair)}, zero-row pairs: {len(zero)}')

    api_by_pair = {k: v for k, v in by_pair.items()}

    # 3) match NEP (+ HGAB carry-over by exact title)
    h_by_title = {norm(p['title']): p for p in hgab}
    nep_out = []
    tier = Counter()
    for p in nep:
        loc = p.get('title_locality') or {}
        muni, prov = loc.get('municipality'), loc.get('province')
        brgy = loc.get('barangay')
        candidates = api_by_pair.get((muni, prov), []) if muni else []
        best, best_score = match_one(p['title'], muni, prov, brgy,
                                     p.get('amount_php'), candidates)
        rec = {'nep_id': p['project_id'], 'title': p['title'],
               'amount_php': p['amount_php'],
               'municipality': muni, 'province': prov,
               'nep_coordinates': p.get('coordinates')}
        rec['geoagri'] = tiered(best, best_score, tier)
        if rec['geoagri'] is None:
            rec['best_score_below_threshold'] = round(best_score, 3)
        hp = h_by_title.get(norm(p['title']))
        rec['hgab_id'] = hp['project_id'] if hp else None
        nep_out.append(rec)

    # 4) match DA
    da_out = []
    da_tier = Counter()
    for p in da:
        title = p.get('effective_title') or p.get('from_title') or ''
        parts = [x.strip() for x in title.split(',') if x.strip()]
        province = parts[-1] if len(parts) >= 2 else None
        municipality = parts[-2] if len(parts) >= 3 else None
        # barangay: often the 3rd-from-last part ("Brgy. X")
        barangay = None
        if len(parts) >= 4 and re.match(r'(?i)brgy', parts[-3]):
            barangay = parts[-3]
        candidates = api_by_pair.get((municipality, province), []) if municipality else []
        best, best_score = match_one(title, municipality, province, barangay,
                                     p.get('effective_amount_php'), candidates)
        rec = {'control_no': p.get('control_no'), 'kind': p.get('kind'),
               'disposition': p.get('disposition'), 'title': title,
               'amount_php': p.get('effective_amount_php'),
               'municipality': municipality, 'province': province}
        rec['geoagri'] = tiered(best, best_score, da_tier)
        da_out.append(rec)

    # 5) write
    out = {
        'metadata': {
            'generated': time.strftime('%Y-%m-%d %H:%M'),
            'api': API,
            'harvest': 'per (municipality, province) list pages, page_size=100, ~1 req/s',
            'geometry_note': 'Geometry patched server-side 2026-11-11; geometry.flag '
                             'per record. Fetch geometry.api_detail_url for the full '
                             'MultiLineString when rendering.',
            'thresholds': {'strong': STRONG, 'possible': POSSIBLE},
            'pairs_pulled': {f'{m}, {pr}': len(r) for (m, pr), r in by_pair.items()},
            'pairs_zero_rows': zero,
            'nep': dict(tier),
            'hgab_via_nep_title': sum(1 for r in nep_out if r['hgab_id'] and r['geoagri']),
            'da': dict(da_tier),
        },
        'nep_projects': nep_out,
        'da_projects': da_out,
    }
    OUT.write_text(json.dumps(out, indent=1))
    print('\nNEP:', dict(tier))
    print('HGAB (exact NEP title + GEOAGRI):', out['metadata']['hgab_via_nep_title'])
    print('DA:', dict(da_tier))
    print('wrote', OUT, f'{OUT.stat().st_size/1e6:.1f} MB')


if __name__ == '__main__':
    main()
