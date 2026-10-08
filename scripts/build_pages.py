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
REPO = 'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/'
VIEWERS = ['nep_2027_tree.html', 'source_comparison_2027.html', 'crosscheck_2027.html', 'taxonomy_comparison.html']
DOWNLOADS = ['nep_2027_tree.json', 'nep_2027_tree_validation.json',
             'nep_2027_native_amount_review.json', 'nep_2027_native_amount_audit.json',
             'nep_2027_budget_units.json', 'nep_2027_api_reconciliation.json',
             'hb_dpwh_leaves_corrected_v5.json', 'hb_known_defect_repairs.json',
             'source_comparison_2027.json', 'current_pap_controls.json', 'comparison_manifest.json']



def hosted_viewer(name, text):
    # Explicit runtime configuration keeps retained local NEP paths out of hosted links.
    if name == 'nep_2027_tree.html':
        text = text.replace('<head>', '<head><script>window.SITE_CONFIG={sourcePdf:null};</script>', 1)
    text = text.replace('href="../site/index.html"', 'href="../index.html"')
    # GitHub renders reports; Pages otherwise serves Markdown as raw downloads.
    text = re.sub(r'href="([A-Za-z0-9_]+\.md)"', lambda m: f'href="{REPO}{m[1]}"', text)
    if name in ('crosscheck_2027.html', 'taxonomy_comparison.html') and 'data-historical="true"' not in text:
        banner = ('<nav style="padding:12px 20px;background:#fff1d9;color:#203147;font:14px/1.5 system-ui">'
                  '<a href="../index.html">All dashboards</a> · Historical artifact: older incomplete House/API extracts; '
                  'budget upper-bound and insertion/removal labels below are superseded. '
                  '<a href="source_comparison_2027.html">Open the current House v5 / NEP source comparison</a></nav>')
        text = re.sub(r'(<body[^>]*>)', lambda m: m[1]+banner, text, count=1)
    return text



class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        self.links.extend(value for key,value in attrs if key in ('href','src') and value)


def validate_site():
    for file in OUTPUT.rglob('*.html'):
        text = file.read_text()
        if any(marker in text for marker in ('__TREE_DATA__', '__EVIDENCE_DATA__', '__PAYLOAD__', '__INDEX_DATA__')):
            raise ValueError(f'Unrendered template: {file}')
        parser = LinkParser()
        parser.feed(text)
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
    # Delete only the dedicated generated deployment directory's contents.
    for path in OUTPUT.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    target = OUTPUT/'analysis'
    target.mkdir()
    (OUTPUT/'index.html').write_text((ROOT/'site/index.html').read_text().replace('href="../analysis/', 'href="analysis/').replace('src="../analysis/', 'src="analysis/'))
    for name in VIEWERS:
        (target/name).write_text(hosted_viewer(name,(ROOT/'analysis'/name).read_text()))
    for name in DOWNLOADS:
        shutil.copyfile(ROOT/'analysis'/name,target/name)
    for name in ['nep_tree_viewer.js', 'budget_display.js']:
        shutil.copyfile(ROOT/'analysis'/name, target/name)
    pdfs = OUTPUT/'HB_BUDGET'
    pdfs.mkdir()
    for name in ['2 - HB 10858 VOL IB.pdf', '3 - HB 10858 VOL IC.pdf']:
        shutil.copyfile(ROOT/'HB_BUDGET'/name, pdfs/name)
    (OUTPUT/'.nojekyll').touch()
    validate_site()
    print(f'Prepared and checked {len(VIEWERS)} dashboards in {OUTPUT}')


if __name__ == '__main__':
    main()
