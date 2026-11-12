"""Include the NIA workspace and retained evidence in an existing SPA package."""
import importlib.util
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def package_nia(output):
    spec = importlib.util.spec_from_file_location('nia_builder', ROOT / 'analysis-nia/build_nia_workbench.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    data = builder.build()
    evidence = output / 'analysis-nia'
    evidence.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'analysis-nia/data', evidence / 'data', dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__'))
    for path in (ROOT / 'analysis-nia').glob('*.md'):
        shutil.copy2(path, evidence / path.name)
    for document in data['documents'].values():
        path = document['path']
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file():
            continue
        source = ROOT / path
        if source.is_file():
            shutil.copy2(source, target)
        elif document.get('page_count') is None:
            # Metadata-only registry entry: the NIA_DATA Senate workbook is
            # gitignored source material; its retained evidence is the
            # committed analysis-nia/data/senate_nia_dataset.json.
            print(f'Skipped untracked document source: {path}')
        else:
            raise FileNotFoundError(f'Servable document missing from repo: {path}')
    landing = output / 'nia'
    landing.mkdir(exist_ok=True)
    # Preserve full prefixed hashes and accept the short /nia/#nep alias.
    (landing / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>NIA workbench</title>
<a href="../app/#nia/home">Open NIA workbench</a>
<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md">Repository README</a>
<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis-nia/README.md">NIA source README</a><script>
const target = new URL('../app/', location.href);
const fragment = location.hash.slice(1);
target.search = location.search;
target.hash = fragment.startsWith('nia/') ? fragment : 'nia/' + (fragment || 'home');
location.replace(target.href);
</script></html>''')
    print(f'Packaged NIA evidence: {len(data["stages"]["house"]["projects"])} House and {len(data["stages"]["nep"]["projects"])} NEP rows')
