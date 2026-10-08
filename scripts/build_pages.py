#!/usr/bin/env python3
"""Package committed static viewers without rerunning local PDF extraction."""
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
DOWNLOADS = [
    'source_verification_overview.json', 'source_verification_manifest.json',
    'source_review_evidence.json', 'nep_2027_amount_column_reassessment.json',
    'hb_native_ib_rollup_audit.json', 'nep_2027_source_audit.json',
    'dpwh_transparency_nep_tree.json', 'dpwh_transparency_nep_tree_validation.json',
    'nep_2027_tree.json', 'nep_2027_tree_validation.json',
    'nep_2027_native_amount_review.json', 'nep_2027_native_amount_audit.json',
    'nep_2027_budget_units.json', 'nep_2027_api_reconciliation.json',
    'hb_dpwh_leaves_corrected_v5.json', 'hb_known_defect_repairs.json',
    'source_comparison_2027.json', 'stage_trace_2027.json', 'current_pap_controls.json',
    'comparison_manifest.json',
]
SCRIPTS = ['nep_tree_viewer.js', 'budget_display.js', 'source_verification.js', 'source_verification.css']
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
            if not path.is_relative_to(OUTPUT.resolve()) or not path.is_file():
                raise ValueError(f'Broken local link: {file.name}: {link}')


def main():
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
    validate_site()
    print(f'Prepared and checked {len(VIEWER_NAMES)} dashboards in {OUTPUT}')


if __name__ == '__main__':
    main()
