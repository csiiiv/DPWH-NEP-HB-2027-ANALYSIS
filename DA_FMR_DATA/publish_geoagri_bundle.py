#!/usr/bin/env python3
"""Publish the app-facing GEOAGRI bundle.

Reads DA_FMR_DATA/geoagri_fmr_enrichment.json (match results + geometry
summaries), fetches the FULL surveyed MultiLineString for every matched
proposal from the API detail endpoint (rate limit 120/min -> ~0.55s spacing),
and writes other-analysis/data/geoagri_fmr_geometry.json:

  {
    metadata: {...},
    by_nep_id:   { "<workbench nep id>":      {tier, score, proposal...} },
    by_house_id: { "<workbench house id>":    {...} },
    by_control_no: { "<DA control_no>":       {...} },
  }

Each entry: {tier, score, id, fmrcode, road_name, status, estimate_*,
counterpart_amount, location, connectivity_rating, coordinates:
{first,last,centroid,lines: [[[lng,lat],...] x N]}}
"""
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

from shapely.geometry import LineString

BASE = Path(__file__).resolve().parent
OTHER = BASE.parent / 'other-analysis'
ENRICH = BASE / 'geoagri_fmr_enrichment.json'
OUT = OTHER / 'data' / 'geoagri_fmr_geometry.json'

API = 'https://geoagri.bafe.gov.ph/api/fmr-proposals'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

DETAIL_RATE_S = 0.55  # 120 req/min cap
# ~5 m tolerance: keeps visible shape at street zooms, drops survey density.
SIMPLIFY_TOL = 5e-5


def simplify_lines(lines, tol=SIMPLIFY_TOL):
    out = []
    for line in lines:
        if not isinstance(line, list) or len(line) < 2:
            continue
        try:
            simplified = LineString(line).simplify(tol, preserve_topology=False)
            coords = list(simplified.coords)
        except Exception:
            coords = line
        # keep at least the endpoints even if simplification collapses
        if len(coords) < 2:
            coords = [line[0], line[-1]]
        out.append([[round(c[0], 6), round(c[1], 6)] for c in coords])
    return out


def curl_json(url, timeout=60, retries=2):
    for _ in range(retries + 1):
        try:
            out = subprocess.check_output(
                ['curl', '-sS', '-H', 'Accept: application/json',
                 '-H', f'User-Agent: {UA}', '--max-time', str(timeout), url],
                text=True)
            return json.loads(out)
        except subprocess.CalledProcessError as e:
            if e.returncode == 28:
                time.sleep(2)
                continue
            raise
        except json.JSONDecodeError:
            time.sleep(2)
    return None


def unique_proposals(enrich):
    """Deduplicate matched proposals across NEP/House/DA join keys."""
    props = {}
    for r in enrich['nep_projects']:
        g = r.get('geoagri')
        if g:
            props.setdefault(g['id'], g)
    for r in enrich['da_projects']:
        g = r.get('geoagri')
        if g:
            props.setdefault(g['id'], g)
    return props


def main():
    refresh = '--refresh' in sys.argv
    enrich = json.loads(ENRICH.read_text())
    props = unique_proposals(enrich)
    print(f'{len(props)} unique matched proposals to fetch')

    # resume support: keep previously fetched geometries
    prev = {}
    if OUT.exists() and not refresh:
        try:
            prev = {e['id']: e for e in json.loads(OUT.read_text()).get('proposals', [])}
        except Exception:
            prev = {}
    todo = [pid for pid in props if pid not in prev]
    print(f'cached: {len(prev)}, to fetch: {len(todo)}')

    entries = dict(prev)
    for i, pid in enumerate(todo, 1):
        d = curl_json(f'{API}/{pid}/')
        if not d or 'coordinates' not in d:
            sys.stderr.write(f'  !! detail {pid} failed\n')
            continue
        c = d['coordinates']
        entries[pid] = {
            'id': d['id'],
            'fmrcode': d.get('fmrcode'),
            'road_name': d.get('road_name'),
            'status': d.get('status'),
            'estimate_project_cost': d.get('estimate_project_cost'),
            'estimate_road_length': d.get('estimate_road_length'),
            'road_width': d.get('road_width'),
            'counterpart_amount': d.get('counterpart_amount'),
            'connectivity_rating': d.get('connectivity_rating'),
            'location': d.get('location'),
            'coordinates': {
                'first': c.get('first_coordinate'),
                'last': c.get('last_coordinate'),
                'centroid': c.get('centroid'),
                'lines': simplify_lines((c.get('geojson') or {}).get('coordinates') or []),
            },
        }
        if i % 25 == 0:
            print(f'[{i}/{len(todo)}] fetched', flush=True)
        time.sleep(DETAIL_RATE_S)

    # build join indexes (reference proposals by id — the full entry lives in
    # `proposals`; duplicating it per index tripled the file size)
    def entry_for(g):
        if g['id'] not in entries or not entries[g['id']]['coordinates']['lines']:
            return None
        return {
            'tier': g['match_tier'],
            'score': g['match_score'],
            'pid': g['id'],
        }

    by_nep, by_house, by_ctrl = {}, {}, {}
    for r in enrich['nep_projects']:
        g = r.get('geoagri')
        if not g:
            continue
        e = entry_for(g)
        if e and r['nep_id'] not in by_nep:
            by_nep[r['nep_id']] = e
        if e and r.get('hgab_id') and r['hgab_id'] not in by_house:
            by_house[r['hgab_id']] = e
    for r in enrich['da_projects']:
        g = r.get('geoagri')
        if not g or not r.get('control_no'):
            continue
        e = entry_for(g)
        if e and r['control_no'] not in by_ctrl:
            by_ctrl[r['control_no']] = e

    out = {
        'metadata': {
            'generated': time.strftime('%Y-%m-%d %H:%M'),
            'source': f'{API}/ (detail endpoint, full MultiLineString)',
            'match_source': 'DA_FMR_DATA/geoagri_fmr_enrichment.json',
            'simplify_tolerance_deg': SIMPLIFY_TOL,
            'counts': {
                'proposals': len(entries),
                'by_nep_id': len(by_nep),
                'by_house_id': len(by_house),
                'by_control_no': len(by_ctrl),
            },
        },
        'proposals': list(entries.values()),
        'by_nep_id': by_nep,
        'by_house_id': by_house,
        'by_control_no': by_ctrl,
    }
    OUT.write_text(json.dumps(out))
    print('wrote', OUT, f'{OUT.stat().st_size/1e6:.1f} MB')
    print('counts:', out['metadata']['counts'])


if __name__ == '__main__':
    main()
