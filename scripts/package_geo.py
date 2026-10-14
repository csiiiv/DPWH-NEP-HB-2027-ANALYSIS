"""Include the Geolocation workspace data and docs in an existing SPA package."""
import importlib.util
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def package_geo(output):
    spec = importlib.util.spec_from_file_location('geo_builder', ROOT / 'gps-analysis/build_gps_workbench.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    data = builder.build()
    evidence = output / 'gps-analysis'
    evidence.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'gps-analysis/data', evidence / 'data', dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__'))
    for path in (ROOT / 'gps-analysis').glob('*.md'):
        shutil.copy2(path, evidence / path.name)
    landing = output / 'geo'
    landing.mkdir(exist_ok=True)
    # Preserve full prefixed hashes and accept the short /geo/#map alias.
    (landing / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Geolocation workbench</title>
<a href="../app/#geo/home">Open the Geolocation workbench</a>
<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md">Repository README</a>
<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/gps-analysis/README.md">Geolocation source README</a><script>
const target = new URL('../app/', location.href);
const fragment = location.hash.slice(1);
target.search = location.search;
target.hash = fragment.startsWith('geo/') ? fragment : 'geo/' + (fragment || 'home');
location.replace(target.href);
</script></html>''')
    print(f'Packaged Geolocation evidence: {data["totals"]["records_with_gps"]} GPS records '
          f'({data["totals"]["points_parsed"]} parsed points)')
