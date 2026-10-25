#!/usr/bin/env python3
"""Browser smoke test for PSGC2LEG/viz/index.html (Playwright, headless).

Serves viz/ over localhost (module imports + fetch need http), then checks:
1. page loads all 254 district features, including Metro Manila splits
2. district layers render with no console errors
3. colors: Bulacan vs Nueva Ecija fill hues differ strongly (adjacency hues)
4. click pins a popup containing the rep photo <img> that survives
   mouse-out; clicking the ocean unpins
5. photos fetch 200

Run:  python3 tests/check_viz_browser.py
"""
from __future__ import annotations

import json
import re
import sys
import threading
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler, test
from pathlib import Path

VIZ = Path(__file__).resolve().parent.parent / "viz"
PORT = 8917


def serve() -> HTTPServer:
    handler = partial(SimpleHTTPRequestHandler, directory=str(VIZ))
    srv = HTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def hsl_hue(color: str) -> float:
    m = re.match(r"hsl\((\d+)", color)
    return float(m.group(1)) if m else -1


def main() -> int:
    from playwright.sync_api import sync_playwright

    srv = serve()
    ok = True
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        page.wait_for_function("window.map && window.map.isStyleLoaded()", timeout=30000)
        page.wait_for_function(
            "window.districtFeatures && window.districtFeatures.length === 254",
            timeout=120000,
        )
        page.wait_for_function(
            "window.map.getSource('districts') && window.map.isSourceLoaded('districts')",
            timeout=120000,
        )
        page.wait_for_timeout(1000)   # labels + images

        # 1. layers present
        layers = page.evaluate("window.map.getLayersBySource ? window.map.getLayersBySource('districts').map(l=>l.id) : []") \
            if page.evaluate("!!window.map.getLayersBySource") else \
            page.evaluate("window.map.getStyle().layers.map(l => l.id)")
        need = {"districts-fill", "districts-line", "district-labels"}
        missing = need - set(layers)
        print(f"layers ok: {not missing}" + (f"  missing: {missing}" if missing else ""))
        ok &= not missing

        rendered = page.evaluate("""() => {
          const unique = new Map(window.districtFeatures.map(f =>
            [f.properties.leg_id, f.properties]));
          const counts = {};
          for (const p of unique.values())
            counts[p.jurisdiction] = (counts[p.jurisdiction] || 0) + 1;
          return {total: unique.size, counts};
        }""")
        ncr_expected = {"Manila": 6, "Quezon City": 6, "Caloocan": 3,
                        "Makati": 2, "Marikina": 2, "Parañaque": 2,
                        "Taguig–Pateros": 2, "Valenzuela": 2}
        ncr_actual = {name: rendered["counts"].get(name, 0) for name in ncr_expected}
        complete = rendered["total"] == 254 and ncr_actual == ncr_expected
        print(f"district features: {rendered['total']}/254; NCR counts: {ncr_actual}")
        ok &= complete

        # 2. adjacency contrast: Bulacan vs Nueva Ecija hues
        hues = json.loads((VIZ / "province_hues.json").read_text())
        b, n = hues["Bulacan"], hues["Nueva Ecija"]
        sep = min(abs(b - n), 360 - abs(b - n))
        print(f"hue table: Bulacan {b}° vs Nueva Ecija {n}° -> separation {sep}°")
        ok &= sep >= 40

        # rendered color of Bulacan's 1st district feature actually uses the hue
        col = page.evaluate("""() => {
          const fs = window.map.querySourceFeatures('districts',
            {sourceLayer: '', filter: ['all',['==',['get','jurisdiction'],'Bulacan']]});
          return fs.length ? fs[0].properties.color : null;
        }""")
        print("bulacan rendered color:", col)
        if col:
            ok &= hsl_hue(col) == float(b)

        # 3. click-to-pin with photo: zoom to Bulacan, click it
        page.evaluate("""() => {
          const fs = window.map.queryRenderedFeatures({layers:['districts-fill']})
            .filter(f => f.properties.jurisdiction === 'Bulacan');
          if (fs.length) {
            let a=1e9,b=1e9,c=-1e9,d=-1e9;
            const walk = co => { if (typeof co[0]==='number'){a=Math.min(a,co[0]);c=Math.max(c,co[0]);b=Math.min(b,co[1]);d=Math.max(d,co[1]);} else co.forEach(walk); };
            walk(fs[0].geometry.coordinates);
            window.map.fitBounds([[a,b],[c,d]], {padding: 120, maxZoom: 9, duration: 0});
          } else {
            window.map.jumpTo({center:[121.0,15.0], zoom:8});
          }
        }""")
        page.wait_for_timeout(1500)

        # click a point inside Bulacan D1: project a vertex near the polygon
        # bbox center to screen coords (robust to any camera position)
        pt = page.evaluate("""() => {
          const fs = window.map.queryRenderedFeatures({layers:['districts-fill']})
            .filter(f => f.properties.jurisdiction === 'Bulacan' && f.properties.district_no === 1);
          if (!fs.length) return null;
          const g = fs[0].geometry;
          let ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
          let a=1e9,b=1e9,c=-1e9,d=-1e9;
          for (const [x,y] of ring){a=Math.min(a,x);c=Math.max(c,x);b=Math.min(b,y);d=Math.max(d,y);}
          const cx=(a+c)/2, cy=(b+d)/2;
          let best=ring[0], bd=1e18;
          for (const [x,y] of ring){const dd=(x-cx)**2+(y-cy)**2; if(dd<bd){bd=dd;best=[x,y];}}
          return window.map.project(best);
        }""")
        if not pt:
            print("FAIL: Bulacan D1 not rendered/queryable")
            ok = False
        else:
            page.mouse.click(pt["x"], pt["y"])
        page.wait_for_timeout(800)
        pin_img = page.evaluate("""() => {
          const el = document.querySelector('.maplibregl-popup img.rep-photo');
          return el ? el.getAttribute('src') : null;
        }""")
        print("pinned popup rep photo:", pin_img)
        ok &= bool(pin_img and pin_img.startswith("photos/"))

        # move mouse away — popup must survive
        page.mouse.move(60, 60)
        page.wait_for_timeout(600)
        still = page.evaluate("!!document.querySelector('.maplibregl-popup')")
        print("popup survives mouse-out:", still)
        ok &= still

        # photo request actually resolved
        if pin_img:
            status = page.evaluate(
                "url => fetch(url).then(r => r.status)", pin_img)
            print("photo fetch status:", status)
            ok &= status == 200

        # click ocean -> unpin (pan to open water first)
        page.evaluate("window.map.jumpTo({center:[124.5,17.5], zoom:6})")
        page.wait_for_timeout(1200)
        page.mouse.click(700, 450)
        page.wait_for_timeout(500)
        gone = page.evaluate("!document.querySelector('.maplibregl-popup')")
        print("ocean click unpins:", gone)
        ok &= gone

        # The retained preview makes the completed NCR district boundaries easy
        # to inspect instead of ending on the open-water unpin test.
        page.evaluate("window.map.jumpTo({center:[121.02,14.59], zoom:10.2})")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(VIZ / "preview.png"), full_page=False)

        # console errors (ignore tile/network noise from remote basemap)
        hard = [e for e in errors if "basemaps.cartocdn" not in e
                and "favicon" not in e and "Failed to load resource" not in e]
        print("console errors:", hard if hard else "none")
        ok &= not hard

        browser.close()
    srv.shutdown()
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
