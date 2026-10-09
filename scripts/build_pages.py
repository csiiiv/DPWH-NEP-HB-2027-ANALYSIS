#!/usr/bin/env python3
"""Package committed static viewers without rerunning local PDF extraction."""
import argparse
import hashlib
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from validate_current_pages import validate_current_pages

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '_site'
ANALYSIS = ROOT / 'analysis'
DATA = ANALYSIS / 'data'
VIEWERS = ANALYSIS / 'viewers'
REPO = 'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/'
VIEWER_NAMES = [
    'hb_native_verification.html', 'nep_source_verification.html', 'dpwh_nep_api_verification.html',
    'nep_2027_tree.html', 'source_comparison_2027.html', 'stage_trace_2027.html',
]
APP_ROUTES = {
    'hb_native_verification.html': 'house', 'nep_source_verification.html': 'nep',
    'dpwh_nep_api_verification.html': 'transparency', 'stage_trace_2027.html': 'compare',
    'source_comparison_2027.html': 'house-nep', 'nep_2027_tree.html': 'nep-detail',
}


def app_redirect(destination, route, root=False):
    """Keep historical entry points and fragments working on project hosting."""
    return ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>DPWH workbench</title><p><a href="' + destination + '#' + route + '">Open workbench</a></p>'
            '<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md">Repository README</a> '
            '<a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/README.md">Workbench README</a>'
            '<script>const fragment=location.hash.slice(1);location.replace(' + json.dumps(destination) +
            '+"#"+' + ('(fragment || "home")' if root else json.dumps(route) +
                         '+(fragment ? "?"+(fragment==="review" ? "view=review" : "section="+encodeURIComponent(fragment)) : "")') +
            ');</script></html>')
DOWNLOADS = [
    'source_verification_overview.json', 'source_verification_manifest.json',
    'source_review_evidence.json', 'nep_2027_amount_column_reassessment.json',
    'hb_native_ib_rollup_audit.json', 'nep_2027_source_audit.json',
    'dpwh_transparency_nep_tree.json', 'dpwh_transparency_nep_tree_validation.json',
    'nep_2027_tree.json', 'nep_2027_tree_validation.json',
    'nep_2027_native_amount_review.json', 'nep_2027_native_amount_audit.json',
    'nep_2027_budget_units.json', 'nep_2027_api_reconciliation.json',
    'hb_dpwh_native_ic_projects.json', 'hb_dpwh_native_ic_rollup_audit.json',
    'source_comparison_2027.json', 'stage_trace_2027.json', 'current_pap_controls.json',
    'comparison_manifest.json',
]
SCRIPTS = ['nep_tree_viewer.js', 'budget_display.js', 'source_verification.js', 'source_verification.css', 'page_navigation.css']
def hosted_report_links(text, source):
    """Open repository Markdown as rendered GitHub documents at hosted URLs."""
    def report_link(match):
        url = urlsplit(match[1])
        if url.scheme or url.netloc:
            return match[0]
        target = (source.parent / unquote(url.path)).resolve()
        rel = target.relative_to(ROOT).as_posix()
        if not target.is_file():
            raise ValueError(f'Missing Markdown reference: {source}: {url.path}')
        fragment = '#' + url.fragment if url.fragment else ''
        return 'href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/' + rel + fragment + '"'
    return re.sub(r'href="([^"?]+\.md(?:#[^"?]*)?)"', report_link, text)


def hosted_viewer(name, text):
    text = hosted_report_links(text, VIEWERS / name)
    if name in ('hb_native_verification.html', 'nep_source_verification.html', 'dpwh_nep_api_verification.html'):
        text = text.replace('<head>', '<head><script>window.SITE_CONFIG={hosted:true,housePdf:"../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf",reportBase:"' + REPO + 'docs/"};</script>', 1)
    if name == 'nep_2027_tree.html':
        text = text.replace('<head>', '<head><script>window.SITE_CONFIG={sourcePdf:null};</script>', 1)
    text = text.replace('href="../site/index.html"', 'href="../index.html"')
    text = text.replace('href="../../site/index.html"', 'href="../index.html"')
    # Local regroup uses ../data and ../docs; packaged site flattens JSON beside viewers.
    text = text.replace('href="../data/', 'href="')
    text = text.replace('href="../docs/', 'href="')
    # Viewers use ../../HB_BUDGET locally; packaged site has HB_BUDGET beside analysis/.
    text = text.replace('href="../../HB_BUDGET/', 'href="../HB_BUDGET/')
    text = text.replace("href='../../HB_BUDGET/", "href='../HB_BUDGET/")

    return text


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        self.links.extend(value for key, value in attrs if key in ('href', 'src') and value)


def validate_site():
    for file in OUTPUT.rglob('*.html'):
        text = file.read_text()
        if any(marker in text for marker in ('__TREE_DATA__', '__EVIDENCE_DATA__', '__PAYLOAD__', '__INDEX_DATA__')):
            raise ValueError(f'Unrendered template: {file}')
        if re.search(r'%24%7B|%2524%257B', text, re.I):
            raise ValueError(f'Encoded JavaScript URL placeholder: {file}')
        parser = LinkParser()
        parser.feed(text)
        readmes = {'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md',
                   'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/README.md'}
        if not readmes.issubset(set(parser.links)):
            raise ValueError(f'Missing repository/workbench README links: {file}')
        for link in parser.links:
            url = urlsplit(link)
            if url.scheme or url.netloc or not url.path:
                continue
            path = (file.parent / unquote(url.path)).resolve()
            if path.is_dir():
                path = path / 'index.html'
            if not path.is_relative_to(OUTPUT.resolve()) or not path.is_file():
                raise ValueError(f'Broken local link: {file.name}: {link}')


def main(with_react=True):
    validate_current_pages()
    OUTPUT.mkdir(exist_ok=True)
    for path in OUTPUT.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    target = OUTPUT / 'analysis'
    target.mkdir()
    index = hosted_report_links((ROOT / 'site/index.html').read_text(), ROOT / 'site/index.html')
    # Site template still uses ../analysis/<viewer>.html — rewrite to packaged layout.
    index = index.replace('href="../analysis/', 'href="analysis/').replace('src="../analysis/', 'src="analysis/')
    # After regroup, live viewers sit under analysis/viewers/; package flattens them under analysis/.
    for name in VIEWER_NAMES + SCRIPTS:
        index = index.replace(f'href="analysis/viewers/{name}"', f'href="analysis/{name}"')
        index = index.replace(f'src="analysis/viewers/{name}"', f'src="analysis/{name}"')
    for name in DOWNLOADS:
        index = index.replace(f'href="analysis/data/{name}"', f'href="analysis/{name}"')
    # The new homepage creates source-card links from its embedded payload.
    index = index.replace('analysis/viewers/${s.page}', 'analysis/${s.page}')
    (OUTPUT / 'index.html').write_text(index)
    for name in VIEWER_NAMES:
        (target / name).write_text(hosted_viewer(name, (VIEWERS / name).read_text()))
    for name in DOWNLOADS:
        shutil.copyfile(DATA / name, target / name)
    shutil.copyfile(ROOT / 'analysis/data/hb_dpwh_native_rollup.json', target / 'hb_dpwh_native_rollup.json')
    shutil.copyfile(ROOT / 'dpwh-transparency-nep-data/json/fy2027-combined.json', target / 'fy2027-combined.json')
    shutil.copytree(DATA / 'source_review_evidence', target / 'source_review_evidence')
    for name in SCRIPTS:
        shutil.copyfile(VIEWERS / name, target / name)
    pdfs = OUTPUT / 'HB_BUDGET'
    pdfs.mkdir()
    for name in ['2 - HB 10858 VOL IB.pdf', '3 - HB 10858 VOL IC.pdf']:
        shutil.copyfile(ROOT / 'HB_BUDGET' / name, pdfs / name)
    (OUTPUT / '.nojekyll').touch()
    if with_react:
        frontend = ROOT / 'analysis/web/dist'
        if not (frontend / 'index.html').is_file():
            raise ValueError('Build the React preview first: npm run build --prefix analysis/web')
        pdf = ROOT / 'dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf'
        expected = json.loads((DATA / 'nep_2027_tree.json').read_text())['provenance']['sha256']['pdf']
        if not pdf.is_file() or hashlib.sha256(pdf.read_bytes()).hexdigest() != expected:
            raise ValueError('React PDF preview requires the exact retained NEP Volume II-B source PDF')
        shutil.copytree(frontend, OUTPUT / 'app')
        for key, name in [('hb', 'hb_native_verification.html'), ('nep', 'nep_source_verification.html'),
                          ('dpwh_nep_api', 'dpwh_nep_api_verification.html')]:
            html = (VIEWERS / name).read_text()
            payload = re.search(r'<script id="sourceData" type="application/json">([\s\S]*?)</script>', html).group(1)
            (target / f'verification_{key}.json').write_text(payload)
        for name, route in APP_ROUTES.items():
            (target / name).write_text(app_redirect('../app/', route))
        (OUTPUT / 'index.html').write_text(app_redirect('app/', 'home', root=True))
        aliases = target / 'viewers'
        aliases.mkdir()
        for name, route in APP_ROUTES.items():
            (aliases / name).write_text(app_redirect('../../app/', route))
        (OUTPUT / 'site').mkdir()
        (OUTPUT / 'site/index.html').write_text(app_redirect('../app/', 'home', root=True))
        (OUTPUT / 'pdfs').mkdir()
        shutil.copyfile(pdf, OUTPUT / 'pdfs' / pdf.name)
    validate_site()
    print(f'Prepared and checked {len(VIEWER_NAMES)} dashboards in {OUTPUT}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-react', action='store_true', help='Compatibility flag; the SPA is included by default')
    parser.add_argument('--static-only', action='store_true', help='Build historical standalone viewers for diagnostics')
    main(with_react=not parser.parse_args().static_only)
