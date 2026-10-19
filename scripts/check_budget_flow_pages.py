#!/usr/bin/env python3
"""Check the compact Budget flow experiment, evidence links and image exports."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import struct
import tempfile
import threading
import xml.etree.ElementTree as ET
from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = Path('/tmp/budget-flow-ui-verification')
    screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'budget').symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in (390, 1440):
                    context = browser.new_context(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page = context.new_page()
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)
                    requests = []
                    page.on('request', lambda r: requests.append(r.url))
                    base = f'http://127.0.0.1:{server.server_port}/budget/app/'
                    page.goto(base + '#experiments?tab=budget', wait_until='networkidle')
                    expect(page.get_by_role('heading', name='DPWH · five-stage budget flow')).to_be_visible()
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('Budget flow')
                    expect(page.locator('.experiments-tabs a')).to_have_count(6)
                    # The default overview keeps the top three NEP categories
                    # and combines the other four without dropping any money.
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('top3')
                    expect(page.locator('.bf-group-row')).to_have_count(4)
                    expect(page.locator('.bf-cell')).to_have_count(18)
                    expect(page.locator('.bf-ribbon')).to_have_count(41)
                    expect(page.locator('.bf-stub')).to_have_count(7)
                    expect(page.locator('.bf-reduction-sink')).to_have_count(4)
                    expect(page.locator('.bf-group-row').last).to_have_attribute('data-group', 'others')
                    compact_height = page.locator('.revision-flow-scroll svg').evaluate('svg => svg.viewBox.baseVal.height')
                    assert compact_height < 1400
                    totals = page.locator('.budget-flow-metrics').inner_text()
                    assert not any('comparison_projects_2027.json' in url for url in requests)
                    page.get_by_label('Focus category', exact=True).select_option('others')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('4,553 comparison rows')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱205,686,491,000')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱218,442,484,000')
                    expect(page.locator('.budget-flow-others-detail a')).to_have_count(4)
                    assert all('program=others' not in href for href in page.locator('.budget-flow-others-detail a').evaluate_all('els => els.map(el => el.getAttribute("href"))'))
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    cell = page.locator('.bf-cell[data-group="others"][data-category="reduced"]')
                    cell.focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('84 comparison rows')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download SVG', exact=True).click()
                    compact_svg = ET.fromstring(Path(result.value.path()).read_text())
                    compact_metadata = json.loads(compact_svg.find('{http://www.w3.org/2000/svg}metadata').text)
                    assert compact_metadata['rollup']['top'] == 3 and compact_metadata['rollup']['rankBy'] == 'before'
                    assert len(compact_metadata['rollup']['members']) == 4
                    assert compact_metadata['selection'] == {'group': 'others', 'revision': 'reduced'}
                    page.locator('.budget-flow-others-detail a').filter(has_text='Asset Preservation Program').click()
                    expect(page.locator('.result-count')).to_contain_text('38 of 17,613 comparison rows', timeout=30000)
                    page.go_back(wait_until='networkidle')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    page.get_by_role('button', name='Expand Others', exact=True).click()
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('all')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('')
                    expect(page).to_have_url(re.compile('detail=all'))
                    assert page.locator('.budget-flow-metrics').inner_text() == totals
                    assert page.locator('.revision-flow-scroll svg').evaluate('svg => svg.viewBox.baseVal.height') > compact_height / .72
                    page.get_by_role('button', name='Clear selection', exact=True).click()
                    expect(page.locator('.bf-cell')).to_have_count(33)
                    expect(page.locator('.bf-ribbon')).to_have_count(74)
                    expect(page.locator('.bf-stage')).to_have_count(5)
                    expect(page.locator('rect[data-stage="B"]')).to_have_count(7)
                    expect(page.locator('rect[data-stage="D"][data-node="ledger"]')).to_have_count(7)
                    expect(page.locator('.bf-stub')).to_have_count(13)
                    expect(page.locator('.bf-reduction-sink')).to_have_count(7)
                    expect(page.locator('rect[data-stage="D"][data-node="reductions"]')).to_have_count(7)
                    expect(page.locator('.bf-group-row[data-group="fap"] .bf-cell[data-category="increased"]')).to_have_count(0)
                    expect(page.locator('.bf-group-row[data-group="fap"] .bf-cell[data-category="deletion"]')).to_have_count(0)
                    assert page.locator('.revision-flow-scroll svg').evaluate('''svg => {
                      const scale = Number(svg.dataset.scale);
                      const bands = svg.querySelectorAll('.bf-revision-node,.bf-stub-band,[data-node="reductions"],[data-node="ledger"]');
                      return [...bands].every(el => Math.abs(Number(el.getAttribute('height')) - Number(el.dataset.value)*scale) < 1e-6);
                    }''')
                    assert page.locator('.bf-stub-band').evaluate_all("els => els.reduce((sum,el) => sum+Number(el.dataset.value),0)") == 177170632000
                    assert page.locator('[data-node="reductions"]').evaluate_all("els => els.reduce((sum,el) => sum+Number(el.dataset.value),0)") == 87348816000
                    # The report view matches outer ledger segments to each
                    # group by default. Top and centered remain comparison
                    # options; all three preserve values and scale.
                    svg = page.locator('.revision-flow-scroll svg')
                    expect(svg).to_have_attribute('data-alignment', 'midpoint')
                    expect(svg.locator('rect[data-node="outer-ledger"][data-stage="A"]')).to_have_count(7)
                    expect(svg.locator('rect[data-node="outer-ledger"][data-stage="E"]')).to_have_count(7)
                    midpoint_y = float(svg.locator('rect[data-stage="A"]').first.get_attribute('y'))
                    assert float(svg.locator('rect[data-stage="B"]').first.get_attribute('y')) == midpoint_y
                    assert float(svg.locator('rect[data-stage="E"]').first.get_attribute('y')) == float(svg.locator('rect[data-stage="D"][data-node="ledger"]').first.get_attribute('y'))
                    values = svg.locator('.bf-ribbon').evaluate_all('els => els.map(el => el.dataset.value)')
                    scale = svg.get_attribute('data-scale')
                    page.get_by_label('Flow alignment', exact=True).select_option('top')
                    expect(svg).to_have_attribute('data-alignment', 'top')
                    expect(page).to_have_url(re.compile('align=top'))
                    expect(svg.locator('rect[data-node="total-ledger"][data-stage="A"]')).to_have_count(1)
                    top_y = float(svg.locator('rect[data-stage="A"]').get_attribute('y'))
                    assert float(svg.locator('rect[data-stage="E"]').get_attribute('y')) == top_y
                    assert float(svg.locator('rect[data-stage="B"]').first.get_attribute('y')) == top_y
                    assert float(svg.locator('rect[data-stage="D"][data-node="ledger"]').first.get_attribute('y')) == top_y
                    assert float(svg.locator('.bf-revision-node').first.get_attribute('y')) == top_y
                    page.get_by_label('Flow alignment', exact=True).select_option('center')
                    expect(svg).to_have_attribute('data-alignment', 'center')
                    expect(page).to_have_url(re.compile('align=center'))
                    assert float(svg.locator('rect[data-stage="A"]').get_attribute('y')) > top_y
                    assert svg.get_attribute('data-scale') == scale
                    assert svg.locator('.bf-ribbon').evaluate_all('els => els.map(el => el.dataset.value)') == values
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Flow alignment', exact=True)).to_have_value('center')
                    page.get_by_label('Flow alignment', exact=True).select_option('midpoint')
                    expect(svg).to_have_attribute('data-alignment', 'midpoint')
                    assert float(svg.locator('rect[data-stage="A"]').first.get_attribute('y')) == midpoint_y
                    expect(page).not_to_have_url(re.compile('align='))
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱572.924B')
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱587.076B')
                    expect(page.locator('.budget-flow-caveat')).to_contain_text('not confirmed edits')
                    # FAPs are explicitly grouped; evidence links partition
                    # them from ordinary programs and persist on reload.
                    page.get_by_label('Focus category', exact=True).select_option('fap')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('29 comparison rows')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱117,749,011,000')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱44,749,011,000')
                    page.locator('.budget-flow-detail a').click()
                    expect(page.locator('.result-count')).to_contain_text('29 of 17,613 comparison rows', timeout=30000)
                    page.goto(base + '#experiments?tab=budget&detail=all', wait_until='networkidle')
                    page.get_by_label('Focus category', exact=True).select_option('Asset Preservation Program')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('1,675 comparison rows')
                    page.locator('.budget-flow-detail a').click()
                    expect(page.locator('.result-count')).to_contain_text('1,675 of 17,613 comparison rows', timeout=30000)
                    expect(page).to_have_url(re.compile('exclude_fap=1'))
                    page.reload(wait_until='networkidle')
                    expect(page.locator('.result-count')).to_contain_text('1,675 of 17,613 comparison rows', timeout=30000)
                    page.get_by_role('button', name='More filters', exact=True).click()
                    expect(page.get_by_label('Exclude foreign-assisted projects', exact=True)).to_be_checked()
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    expect(page.locator('.result-count')).to_contain_text('17,613 of 17,613 comparison rows')
                    expect(page).not_to_have_url(re.compile('exclude_fap='))
                    page.goto(base + '#experiments?tab=budget&detail=all', wait_until='networkidle')
                    legend = page.get_by_role('group', name='Highlight a revision type')
                    legend.get_by_role('button', name='Increased', exact=True).click()
                    expect(page).to_have_url(re.compile('revision=increased'))
                    expect(page.locator('#budget-detail-heading')).to_have_text('Increased · detail')
                    expect(page.locator('.budget-flow-detail a')).to_have_attribute('href', '#compare?view=projects&flag=amount_increase')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('203 comparison rows')
                    page.reload(wait_until='networkidle')
                    expect(legend.get_by_role('button', name='Increased', exact=True)).to_have_attribute('aria-pressed', 'true')
                    page.get_by_label('Show exact pesos', exact=True).check()
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱572,924,074,000')
                    expect(page.locator('.budget-flow-table')).to_contain_text('₱11,320,356,000')
                    # Keyboard selection works on the actual SVG category cells.
                    cell = page.locator('.bf-cell[data-category="reduced"][data-group="Asset Preservation Program"]')
                    cell.focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('#budget-detail-heading')).to_have_text('Asset Preservation Program · Decreased · detail')
                    page.locator('.budget-flow-exports button').first.focus()
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download SVG', exact=True).click()
                    exported = ET.fromstring(Path(result.value.path()).read_text())
                    metadata = json.loads(exported.find('{http://www.w3.org/2000/svg}metadata').text)
                    assert metadata['selection'] == {'group': 'Asset Preservation Program', 'revision': 'reduced'}
                    assert metadata['grouping']['key'] == 'category'
                    assert metadata['unit'] == 'PHP' and metadata['date']
                    assert metadata['alignment'] == 'midpoint'
                    assert metadata['source']['sha256']
                    assert 'not confirmed edits' in metadata['caveat']
                    assert '₱572,924,074,000' in ''.join(exported.itertext())
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download PNG', exact=True).click()
                    png = Path(result.value.path()).read_bytes()
                    assert png[:8] == b'\x89PNG\r\n\x1a\n'
                    png_width, png_height = struct.unpack('>II', png[16:24])
                    assert png_width == 2960 and png_height > 1800
                    # Whole-section export reflows a detached copy at report
                    # width and includes scroll-hidden cells, table and notes.
                    page.locator('.revision-flow-scroll').evaluate('el => {el.scrollTop=180; el.scrollLeft=120;}')
                    before_scroll = page.locator('.revision-flow-scroll').evaluate('el => [el.scrollTop,el.scrollLeft]')
                    before_hash = page.evaluate('location.hash')
                    page.evaluate('''() => {
                      const draw = CanvasRenderingContext2D.prototype.drawImage;
                      CanvasRenderingContext2D.prototype.drawImage = function(picture,...args) {
                        const result = draw.call(this,picture,...args);
                        if (picture.src?.startsWith('data:image/svg+xml') && picture.src.includes('foreignObject')) {
                          window.sectionExportSvg = decodeURIComponent(picture.src.slice(picture.src.indexOf(',')+1));
                          const report = document.querySelector('iframe[title="Preparing section image"]').contentDocument;
                          const table = report.querySelector('.budget-flow-table').getBoundingClientRect();
                          const notes = report.querySelector('.budget-flow-provenance').getBoundingClientRect();
                          const fullDiagram = report.querySelector('.revision-flow-scroll');
                          window.sectionExportLayout = {
                            tableBottom: table.bottom, notesTop: notes.top,
                            diagramHeight: fullDiagram.getBoundingClientRect().height,
                            svgHeight: fullDiagram.querySelector('svg').getBoundingClientRect().height,
                          };
                          const small = document.createElement('canvas'); small.width=96; small.height=192;
                          const ctx = small.getContext('2d'); ctx.drawImage(this.canvas,0,0,96,192);
                          const pixels = ctx.getImageData(0,0,96,192).data;
                          window.sectionExportInk = [0,1,2].map(third => {
                            let ink=0;
                            for(let i=third*96*64*4;i<(third+1)*96*64*4;i+=4) {
                              if (pixels[i]<240 || pixels[i+1]<240 || pixels[i+2]<240) ink++;
                            }
                            return ink/(96*64);
                          });
                        }
                        return result;
                      };
                    }''')
                    with page.expect_download(timeout=60000) as result:
                        page.get_by_role('button', name='Download section PNG', exact=True).click()
                    assert result.value.suggested_filename == 'dpwh-2027-budget-flow-section.png'
                    section_png = Path(result.value.path()).read_bytes()
                    assert section_png[:8] == b'\x89PNG\r\n\x1a\n'
                    section_width, section_height = struct.unpack('>II', section_png[16:24])
                    assert section_width == 3072 and section_height > png_height + 1000
                    Path(screenshots / f'budget-flow-section-{width}.png').write_bytes(section_png)
                    assert all(ink > .005 for ink in page.evaluate('window.sectionExportInk')), 'export must contain painted content throughout'
                    report_layout = page.evaluate('window.sectionExportLayout')
                    assert report_layout['notesTop'] >= report_layout['tableBottom'], 'source notes must follow the entire table'
                    assert report_layout['diagramHeight'] >= report_layout['svgHeight'], 'the complete diagram must be expanded'
                    section_svg = ET.fromstring(page.evaluate('window.sectionExportSvg'))
                    snapshot = section_svg.find('{http://www.w3.org/2000/svg}foreignObject')
                    text = ''.join(snapshot.itertext())
                    assert 'DPWH · five-stage budget flow' in text
                    assert 'Revision totals across all categories' in text
                    assert 'Sources, reconciliation and interpretation' in text
                    assert '₱572,924,074,000' in text
                    assert 'Download section PNG' not in text
                    assert len([el for el in snapshot.iter() if el.get('class') == 'bf-group-row']) == 7
                    assert len([el for el in snapshot.iter() if 'bf-revision-node' in el.get('class', '')]) == 33
                    assert all(el.get('open') is not None for el in snapshot.iter() if el.tag.endswith('}details'))
                    assert page.locator('.revision-flow-scroll').evaluate('el => [el.scrollTop,el.scrollLeft]') == before_scroll
                    assert page.evaluate('location.hash') == before_hash
                    assert not page.locator('.budget-flow-provenance').evaluate('el => el.open')
                    expect(page.locator('iframe[title="Preparing section image"]')).to_have_count(0)
                    expect(page.get_by_role('button', name='Download section PNG', exact=True)).to_be_enabled()
                    # Bands, cells and labels stay within the SVG viewBox.
                    assert page.locator('.revision-flow-scroll svg').evaluate('''svg => {
                      const v = svg.viewBox.baseVal;
                      return [...svg.querySelectorAll('path,rect,text')].every(el => {
                        const r = el.getBBox();
                        return r.x >= -1 && r.y >= -1 && r.x+r.width <= v.width+1 && r.y+r.height <= v.height+1;
                      });
                    }''')
                    page.screenshot(path=str(screenshots / f'budget-flow-{width}.png'), full_page=True)
                    legend.get_by_role('button', name='Clear selection', exact=True).click()
                    expect(page).not_to_have_url(re.compile('revision=|group='))
                    page.get_by_label('Show exact pesos', exact=True).uncheck()
                    page.locator('.revision-flow-scroll').evaluate('el => {el.scrollTop=0; el.scrollLeft=0;}')
                    page.screenshot(path=str(screenshots / f'budget-flow-overview-{width}.png'), full_page=True)
                    # A focused full-detail category maps into Others when
                    # collapsing; the compact section export contains four blocks.
                    page.get_by_label('Focus category', exact=True).select_option('Asset Preservation Program')
                    page.get_by_label('Category detail', exact=True).select_option('top3')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('4,553 comparison rows')
                    page.get_by_role('button', name='Clear selection', exact=True).click()
                    with page.expect_download(timeout=60000) as result:
                        page.get_by_role('button', name='Download section PNG', exact=True).click()
                    compact_png = Path(result.value.path()).read_bytes()
                    compact_width, compact_section_height = struct.unpack('>II', compact_png[16:24])
                    assert compact_width == 3072 and compact_section_height < section_height
                    Path(screenshots / f'budget-flow-compact-section-{width}.png').write_bytes(compact_png)
                    compact_export = ET.fromstring(page.evaluate('window.sectionExportSvg'))
                    assert len([el for el in compact_export.iter() if el.get('class') == 'bf-group-row']) == 4
                    assert 'Others contains:' in ''.join(compact_export.itertext())
                    assert 'Top 3 by NEP' in ''.join(compact_export.itertext())
                    page.screenshot(path=str(screenshots / f'budget-flow-compact-{width}.png'), full_page=True)
                    # Existing links to a hidden category preserve that category's scope.
                    page.evaluate('hash => {location.hash = hash;}', '#experiments?tab=budget&group=Asset%20Preservation%20Program')
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('all')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('1,675 comparison rows')
                    # Other established experiment routes still load.
                    page.get_by_role('link', name='3-stage alluvial', exact=True).click()
                    expect(page.locator('#experiments-flow-heading')).to_be_visible()
                    page.get_by_role('link', name='Allocation flows', exact=True).click()
                    expect(page.locator('.flow-sankey')).to_have_count(4)
                    context.close()
                browser.close()
        finally:
            server.shutdown()
    assert not errors, errors
    assert not bad, bad
    print(f'Budget flow checks passed at 390px and 1440px; SVG/PNG and geometry verified. Screenshots: {screenshots}')


if __name__ == '__main__':
    main()
