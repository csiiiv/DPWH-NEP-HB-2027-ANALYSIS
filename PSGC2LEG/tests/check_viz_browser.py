#!/usr/bin/env python3
"""Browser smoke test for PSGC2LEG/viz/index.html (Playwright, headless).

Serves viz/ over localhost (module imports + fetch need http), then checks:
1. page loads, district layers render, no console errors
2. colors: Bulacan vs Nueva Ecija fill hues differ strongly (adjacency hues)
3. click pins a popup containing the rep photo <img> that survives
   mouse-out; clicking the ocean unpins
4. photos fetch 200

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
        page.wait_for_timeout(2500)   # tiles + images

        # 1. layers present
        layers = page.evaluate("window.map.getLayersBySource ? window.map.getLayersBySource('districts').map(l=>l.id) : []") \
            if page.evaluate("!!window.map.getLayersBySource") else \
            page.evaluate("window.map.getStyle().layers.map(l => l.id)")
        need = {"districts-fill", "split-fill", "district-labels"}
        missing = need - set(layers)
        print(f"layers ok: {not missing}" + (f"  missing: {missing}" if missing else ""))
        ok &= not missing

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
