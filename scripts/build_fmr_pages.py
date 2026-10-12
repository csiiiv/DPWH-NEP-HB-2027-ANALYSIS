#!/usr/bin/env python3
"""Package the FMR SPA and its retained evidence for a static project path."""
import importlib.util
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def main():
    dist = ROOT / 'analysis/web/dist'
    if not (dist / 'index.html').is_file():
        raise SystemExit('Run npm run build --prefix analysis/web first')
    spec = importlib.util.spec_from_file_location('fmr_builder', ROOT / 'other-analysis/build_fmr_workbench.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    import json
    data = builder.build()
    dataset = ROOT / 'other-analysis/data/fmr_workbench.json'
    dataset.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    site = ROOT / '_site'
    if site.exists():
        shutil.rmtree(site)
    shutil.copytree(dist, site / 'app')
    # Preserve original document paths so source evidence and PDF ranges agree.
    for path in sorted({p for s in data['stages'].values() for p in (s['metadata']['source_pdf'], s['metadata']['cross_volume_source_pdf'])}):
        destination = site / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / path, destination)
    shutil.copytree(ROOT / 'other-analysis/data', site / 'other-analysis/data', ignore=shutil.ignore_patterns('__pycache__'))
    for path in (ROOT / 'other-analysis').iterdir():
        if path.is_file() and path.suffix in ('.md','.csv','.json'):
            shutil.copy2(path, site / 'other-analysis' / path.name)
    (site / '.nojekyll').touch()
    (site / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FMR workbench</title>
<a href="app/">Open FMR workbench</a><script>
const target = new URL('app/', location.href);
target.search = location.search; target.hash = location.hash;
location.replace(target.href);
</script></html>''')
    print(f'Packaged FMR workbench and source evidence in {site}')


if __name__ == '__main__':
    main()
