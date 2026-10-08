#!/usr/bin/env python3
"""Package committed static viewers without rerunning local PDF extraction."""
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '_site'
REPO = 'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/'
VIEWERS = ['nep_2027_tree.html', 'crosscheck_2027.html', 'taxonomy_comparison.html']
DOWNLOADS = ['nep_2027_tree.json', 'nep_2027_tree_validation.json',
             'nep_2027_native_amount_review.json', 'nep_2027_api_reconciliation.json']


def hosted_viewer(name, text):
    # Keep original offline artifacts intact. Local PDF paths cannot work online.
    if name == 'nep_2027_tree.html':
        old = 'const link=n.source.pdf_page?`<p><a href="${esc(data.provenance.inputs.pdf)}#page=${n.source.pdf_page}" target="_blank" rel="noopener">Open source PDF, page ${n.source.pdf_page}</a></p>`:\'\';'
        new = 'const link=n.source.pdf_page?`<p>Source PDF page ${n.source.pdf_page} (local PDF; not hosted).</p>`:\'\';'
        if old not in text:
            raise ValueError('NEP source-link markup changed; review the hosted adaptation.')
        text = text.replace(old, new).replace(
            'PDF links use the recorded local source path. If your browser cannot access it, open that PDF in your IDE at the shown page.',
            'Source PDFs are not hosted. Open your local source PDF at the shown page.')
    if name == 'crosscheck_2027.html':
        old = '<a href="${PDFURL}#page=${pg}" target="_blank" rel="noopener">p.${pg}</a>'
        if old not in text:
            raise ValueError('Crosscheck source-link markup changed; review the hosted adaptation.')
        text = text.replace(old, '<span title="Local source PDF; not hosted">p.${pg}</span>')
    # GitHub renders reports; Pages otherwise serves Markdown as raw downloads.
    text = re.sub(r'href="([A-Za-z0-9_]+\.md)"', lambda m: f'href="{REPO}{m[1]}"', text)
    note = ('NEP rollups balance; PDF-text review candidates remain open.' if name == 'nep_2027_tree.html'
            else 'Historical viewer: incomplete House/API extraction. Consult the current audits before interpreting budget changes.')
    banner = f'<nav style="padding:12px 20px;background:#fff1d9;color:#203147;font:14px/1.5 system-ui"><a href="../index.html">All dashboards</a> · {note} <a href="{REPO}FY2027_work_summary.md">Current summary</a></nav>'
    return re.sub(r'(<body[^>]*>)', lambda m: m[1]+banner, text, count=1)


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        self.links.extend(value for key,value in attrs if key in ('href','src') and value)


def validate_site():
    for file in OUTPUT.rglob('*.html'):
        text = file.read_text()
        if '__TREE_DATA__' in text:
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
    OUTPUT.mkdir(exist_ok=True)
    # Delete only the dedicated generated deployment directory's contents.
    for path in OUTPUT.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    target = OUTPUT/'analysis'
    target.mkdir()
    shutil.copyfile(ROOT/'site/index.html', OUTPUT/'index.html')
    for name in VIEWERS:
        (target/name).write_text(hosted_viewer(name,(ROOT/'analysis'/name).read_text()))
    for name in DOWNLOADS:
        shutil.copyfile(ROOT/'analysis'/name,target/name)
    (OUTPUT/'.nojekyll').touch()
    validate_site()
    print(f'Prepared and checked {len(VIEWERS)} dashboards in {OUTPUT}')


if __name__ == '__main__':
    main()
