#!/usr/bin/env python3
"""Check the default Overview, accounting exports, links and recovery on project hosting."""
import csv
from functools import partial
from http.server import ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import re
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    data = json.loads((ROOT / '_site/analysis/main_overview_2027.json').read_text())
    screenshots = Path('/tmp/overview-ui-verification'); screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'budget-workbenches'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        root = f'http://127.0.0.1:{server.server_port}/{prefix}/'
        base = root + 'app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in check_widths():
                    context = browser.new_context(viewport={'width': width, 'height': 1000}, accept_downloads=True,
                        permissions=['clipboard-read', 'clipboard-write'])
                    page = context.new_page()
                    requests = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url,r.status)) if r.status >= 400 else None)
                    page.on('request', lambda r: requests.append(r.url))
                    page.goto(root + '?preview=overview', wait_until='networkidle')
                    assert '/app/?preview=overview#overview' in page.url
                    expect(page.get_by_role('heading', name='Budget allocation overview', exact=True)).to_be_visible()
                    nav = page.get_by_role('navigation', name='Workbench workspaces')
                    assert nav.locator('a').all_text_contents() == ['Overview','DPWH','DA Farm-to-Market Roads','DOH Health Facilities','NIA Irrigation','Geolocation','Sources','About','Congress']
                    expect(nav.get_by_role('link',name='Overview',exact=True)).to_have_attribute('aria-current','page')
                    expect(page.get_by_role('navigation',name='Workbench pages')).to_have_count(0)
                    expect(page.locator('.overview-workspace-card')).to_have_count(4)
                    assert not any(name in url for url in requests for name in ['comparison_projects_2027.json','fmr_workbench.json','hfep_workbench.json','nia_workbench.json','gps_workbench.json','pdf.worker'])
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    # click + explicit wait rather than .check(): the checkbox is
                    # React-controlled and its checked prop is derived from the
                    # URL hash, so on a slow runner Playwright's built-in
                    # post-click state verification can race the hashchange
                    # re-render ("Clicking the checkbox did not change its
                    # state") even though the navigation succeeded.
                    page.get_by_label('Show exact pesos',exact=True).click()
                    expect(page).to_have_url(re.compile(r'exact=1'))
                    expect(page.get_by_label('Show exact pesos',exact=True)).to_be_checked()
                    for w in data['workspaces']:
                        card = page.get_by_role('article',name=w['label']+' →',exact=True)
                        expect(card).to_contain_text(f"{w['insertions']['count']:,} {w['count_unit']}")
                        expect(card).to_contain_text(f"₱{w['insertions']['amount_php']:,}")
                        expect(card).to_contain_text(f"₱{w['deletions']['amount_php']:,}")
                        expect(card).to_contain_text(f"{w['adjustments']['count']:,} {w['adjustments']['count_unit']}")
                        # Five-group vocabulary: literal subheaders render in every card.
                        expect(card).to_contain_text('House Only Records')
                        expect(card).to_contain_text('NEP Only Records')
                        expect(card).to_contain_text('Same NEP-HGAB Titles, no adjustments')
                        expect(card).to_contain_text('Same Titles, increased budget')
                        expect(card).to_contain_text('Same Titles, decreased budget')
                        expect(card).to_contain_text(f"{w['unchanged']['count']:,} {w['count_unit']}")
                        expect(card).to_contain_text(f"₱{w['unchanged']['amount_php']:,}")
                        for key,label in [('insertions','insertions'),('deletions','deletions'),('unchanged','unchanged')]:
                            expect(card.get_by_role('link',name=w['label']+' '+label,exact=True)).to_have_attribute('href',w['links'][key])
                    hfep = page.get_by_role('article',name='DOH Health Facilities →',exact=True)
                    hfep.locator('summary').click()
                    expect(hfep).to_contain_text('₱140,000')
                    expect(hfep).to_contain_text('House minus NEP')
                    with page.expect_download() as result:
                        page.get_by_role('button',name='Export overview CSV',exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported)==4
                    for r,w in zip(exported,data['workspaces']):
                        assert int(r['insertion_records'])==w['insertions']['count']
                        assert int(r['insertion_house_php'])==w['insertions']['amount_php']
                        assert int(r['gross_reduction_php'])==w['adjustments']['reduced_php']
                        assert int(r['house_minus_nep_ledger_php'])==w['delta_php']
                    table = page.get_by_role('region',name='Overview source funding snapshot',exact=True)
                    table.get_by_role('button',name='House − NEP (PHP)',exact=True).click()
                    assert 'sort=delta_php' in page.url
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Show exact pesos',exact=True)).to_be_checked()
                    expect(table.locator('th[aria-sort="ascending"],th[aria-sort="descending"]')).to_have_count(1)
                    # Cross-workspace coverage and candidate-change tables.
                    coverage = page.get_by_role('region',name='Overview budget coverage by stage',exact=True)
                    expect(coverage.locator('tbody tr')).to_have_count(4)
                    assert coverage.locator('thead th').all_text_contents() == ['Workspace','DBM NEP','HGAB 2nd','HGAB 3rd']
                    for w in data['workspaces']:
                        row = coverage.locator('tbody tr').nth(['dpwh','fmr','hfep','nia'].index(w['key']))
                        expect(row).to_contain_text(f"{w['sources']['nep']['count']:,} {w['count_unit']}")
                        expect(row).to_contain_text(f"{w['sources']['house']['count']:,} {w['count_unit']}")
                    dpwh = data['workspaces'][0]
                    second = dpwh['readings']['second']
                    expect(coverage.locator('tbody tr').first).to_contain_text(f"{second['count']:,} {dpwh['count_unit']}")
                    # Annexes are covered at HGAB3 through verified text identity,
                    # not absent: three 'Unchanged from HGAB 2nd' cells.
                    expect(coverage.locator('tbody tr',has_text='Unchanged from HGAB 2nd')).to_have_count(3)
                    expect(coverage.locator('.highlights-unavailable')).to_have_count(0)
                    for w in data['workspaces'][1:]:
                        expect(coverage.locator('tbody tr').nth(['dpwh','fmr','hfep','nia'].index(w['key']))).to_contain_text(
                            f"verified across {w['readings']['third']['verified_identical_pages']} annex pages")
                    changes = page.get_by_role('region',name='Overview House versus NEP candidate changes',exact=True)
                    expect(changes.locator('tbody tr')).to_have_count(4)
                    for w in data['workspaces']:
                        index = ['dpwh','fmr','hfep','nia'].index(w['key'])
                        row = changes.locator('tbody tr').nth(index)
                        expect(row).to_contain_text(f"{w['insertions']['count']:,} {w['count_unit']}")
                        expect(row).to_contain_text(f"₱{w['insertions']['amount_php']:,}")
                        expect(row).to_contain_text(f"{w['deletions']['count']:,} {w['count_unit']}")
                        expect(row).to_contain_text(f"₱{w['deletions']['amount_php']:,}")
                        expect(row).to_contain_text(f"{w['adjustments']['increased_count']:,}")
                        expect(row).to_contain_text(f"{w['adjustments']['reduced_count']:,}")
                        expect(row.get_by_role('link',name=f"{w['label']} insertion candidates",exact=True)).to_have_attribute('href',w['links']['insertions'])
                        expect(row.get_by_role('link',name=f"{w['label']} deletion candidates",exact=True)).to_have_attribute('href',w['links']['deletions'])
                        # Unchanged column: every workspace links into its filtered population.
                        expect(row).to_contain_text(f"{w['unchanged']['count']:,} {w['count_unit']}")
                        expect(row).to_contain_text(f"₱{w['unchanged']['amount_php']:,}")
                        expect(row.get_by_role('link',name=f"{w['label']} unchanged pairs",exact=True)).to_have_attribute('href',w['links']['unchanged'])
                        expect(row.get_by_role('link',name=f"{w['label']} paired increases",exact=True)).to_have_attribute('href',w['links']['increases'])
                        expect(row.get_by_role('link',name=f"{w['label']} paired decreases",exact=True)).to_have_attribute('href',w['links']['decreases'])
                    # Totals row: pesos sum the four workspaces exactly (each
                    # workspace's funding bridge holds), while record counts
                    # add across different counting grains.
                    total = changes.locator('tfoot tr')
                    expect(total).to_have_count(1)
                    totals = {
                        'insertions': sum(w['insertions']['amount_php'] for w in data['workspaces']),
                        'deletions': sum(w['deletions']['amount_php'] for w in data['workspaces']),
                        'unchanged': sum(w['unchanged']['amount_php'] for w in data['workspaces']),
                        'house': sum(w['sources']['house']['amount_php'] for w in data['workspaces']),
                        'increased': sum(w['adjustments']['increased_php'] for w in data['workspaces']),
                        'reduced': sum(w['adjustments']['reduced_php'] for w in data['workspaces']),
                        'insertion_records': sum(w['insertions']['count'] for w in data['workspaces']),
                        'deletion_records': sum(w['deletions']['count'] for w in data['workspaces']),
                        'house_records': sum(w['sources']['house']['count'] for w in data['workspaces']),
                    }
                    total_text = total.inner_text()
                    for key, value in totals.items():
                        expected_text = f"{value:,}" if 'records' in key or key in ('increased','reduced') else f"₱{value:,}"
                        assert expected_text in total_text, f'totals row missing {key}: {expected_text}'
                    # Funding identity across the summed columns.
                    assert totals['insertions'] - totals['deletions'] + totals['increased'] - totals['reduced'] == \
                        totals['house'] - sum(w['sources']['nep']['amount_php'] for w in data['workspaces'])
                    page.screenshot(path=str(screenshots / f'overview-{width}.png'),full_page=True)
                    # Summary destinations restore the matching populations and
                    # preserve the new global entry alongside workspace pages.
                    page.get_by_role('article',name='NIA Irrigation →',exact=True).get_by_role('link',name='NIA Irrigation insertions',exact=True).click()
                    expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text('222 rows')
                    nav.get_by_role('link',name='Overview',exact=True).click()
                    expect(page.get_by_role('heading',name='Budget allocation overview',exact=True)).to_be_visible()
                    page.go_back(wait_until='networkidle')
                    expect(page.get_by_role('link',name='Insertions',exact=True)).to_have_attribute('aria-current','page')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='DOH Health Facilities →',exact=True).get_by_role('link',name='DOH Health Facilities deletions',exact=True).click()
                    expect(page.locator('.fmr-stats')).to_contain_text('163')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='DPWH →',exact=True).get_by_role('link',name='DPWH insertions',exact=True).click()
                    expect(page.get_by_label('Review flags',exact=True)).to_have_value('house_only')
                    assert 'region_match=ignore' in page.url
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='DPWH →',exact=True).get_by_role('link',name='DPWH unchanged',exact=True).click()
                    expect(page.get_by_label('Review flags',exact=True)).to_have_value('amount_same')
                    assert 'region_match=ignore' in page.url
                    expect(page.locator('.result-count').first).to_contain_text('9,670 of',timeout=30000)
                    # Unchanged deep-links land on the filtered populations.
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='DA Farm-to-Market Roads →',exact=True).get_by_role('link',name='DA Farm-to-Market Roads unchanged',exact=True).click()
                    expect(page.get_by_role('navigation',name='FMR project candidates pages',exact=True)).to_contain_text('605 rows')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='DOH Health Facilities →',exact=True).get_by_role('link',name='DOH Health Facilities unchanged',exact=True).click()
                    expect(page.get_by_role('heading',name='Which line-item records were revised, added or dropped between the annexes?',exact=True)).to_be_visible()
                    expect(page.get_by_label('Record event',exact=True)).to_have_value('same')
                    expect(page.locator('.fmr-result-bar').first).to_contain_text('281 of')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('article',name='NIA Irrigation →',exact=True).get_by_role('link',name='NIA Irrigation unchanged',exact=True).click()
                    expect(page.get_by_role('navigation',name='NIA project candidates pages',exact=True)).to_contain_text('602 rows')
                    page.goto(base+'#overview',wait_until='networkidle')
                    nav.get_by_role('link',name='DPWH',exact=True).click()
                    assert page.url.endswith('#home')
                    expect(page.get_by_role('heading',name='Budget stage workbench',exact=True)).to_be_visible()
                    page.goto(base+'#nia/analysis?view=overview',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='NIA allocation analysis',exact=True)).to_be_visible()
                    # Sources workspace: dataset catalog renders with repo and
                    # packaged-site links for every workspace domain.
                    page.goto(base+'#sources',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='Sources and datasets',exact=True)).to_be_visible()
                    expect(page.get_by_role('navigation',name='Workbench workspaces').get_by_role('link',name='Sources',exact=True)).to_have_attribute('aria-current','page')
                    expect(page.locator('.resource-group')).to_have_count(10)
                    nep_link=page.get_by_role('link',name='Canonical NEP tree',exact=True)
                    assert re.search(r'github\.com/.*/blob/main/analysis/data/nep_2027_tree\.json$',nep_link.get_attribute('href')),(nep_link.get_attribute('href'),)
                    fmr_bundle=page.get_by_role('link',name='FMR shareable bundle (CSV set + 7z archive)',exact=True)
                    assert fmr_bundle.get_attribute('download') == 'fmr_data.7z',(fmr_bundle.get_attribute('download'),)
                    # CSV dataset exports card: one complete CSV per dataset.
                    csv_group = page.locator('section.resource-group').filter(has=page.get_by_role('heading',name='CSV dataset exports',exact=True))
                    expect(csv_group.locator('.resource-list > li')).to_have_count(6)
                    dpwh_csv = page.get_by_role('link',name='DPWH comparison · all rows (Transparency, NEP, HGAB2, HGAB3)',exact=True)
                    assert dpwh_csv.get_attribute('download') == 'dpwh_comparison_all_2027.csv',(dpwh_csv.get_attribute('download'),)
                    overview_csv_url = dpwh_csv.get_attribute('href')
                    csv_response = page.request.get(overview_csv_url)
                    assert csv_response.status == 200,(overview_csv_url,csv_response.status)
                    csv_lines = csv_response.text().splitlines()
                    assert len(csv_lines) == 17614,(len(csv_lines),)  # header + 17,613 rows
                    assert csv_lines[0].startswith('"ID","Title","Program","Region"'),csv_lines[0][:80]
                    for name in ('hgab_hfep_facilities.csv','nep_hfep_facilities.csv','hgab_hfep_controls.csv'):
                        link = csv_group.locator(f'a[download="{name}"]')
                        expect(link).to_have_count(1)
                        assert page.request.get(link.get_attribute('href')).status == 200,name
                    expect(page.get_by_role('link',name='Open workspace →').first).to_have_attribute('href','#compare')
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    # Card share routes: section links scroll to the card,
                    # modal links open it centered (presentation view).
                    page.goto(base+'#overview',wait_until='networkidle')
                    dpwh_card = page.get_by_role('article',name='DPWH →',exact=True)
                    dpwh_card.get_by_label('Share DPWH card',exact=True).click()
                    dpwh_card.get_by_role('menuitem',name='Link as modal',exact=True).click()
                    expect(dpwh_card.locator('.card-share-status')).to_contain_text('Link copied')
                    # Copied links carry the full page URL, not just the hash route.
                    assert page.evaluate('navigator.clipboard.readText()') == base + '#overview?modal=dpwh',(page.evaluate('navigator.clipboard.readText()'),)
                    page.goto(base+'#overview?exact=1&modal=dpwh',wait_until='networkidle')
                    modal = page.get_by_role('dialog',name='DPWH budget change summary',exact=True)
                    expect(modal).to_be_visible()
                    expect(modal).to_contain_text('House Only Records')
                    expect(modal).to_contain_text(f"₱{data['workspaces'][0]['insertions']['amount_php']:,}")
                    # Simplified Increased/Decreased presentation: pair count,
                    # NEP→HGAB3 base allocations, signed adjustment.
                    dpwh_adj = data['workspaces'][0]['adjustments']
                    expect(modal).to_contain_text(f"{dpwh_adj['increased_count']:,} pairs")
                    expect(modal).to_contain_text('NEP to HGAB3 Allocations Worth:')
                    expect(modal).to_contain_text(f"₱{dpwh_adj['increased_nep_php']:,} → ₱{dpwh_adj['increased_house_php']:,}")
                    expect(modal).to_contain_text(f"Adjustments worth +₱{dpwh_adj['increased_php']:,}")
                    modal.get_by_role('button',name='Close',exact=True).click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    page.goto(base+'#overview?card=fmr',wait_until='networkidle')
                    expect(page.get_by_role('article',name='DA Farm-to-Market Roads →',exact=True)).to_be_visible()
                    page.wait_for_timeout(400)
                    assert 'fmr' in page.evaluate('''() => {const el = document.getElementById('overview-fmr');
                      const r = el.getBoundingClientRect(); return (r.top >= 0 && r.top < innerHeight) ? 'fmr' : 'scrolled-away';}''')
                    # Experiments workspace: unlisted, direct-URL only. The
                    # Sankey flow charts live here now, off the Overview.
                    nav = page.get_by_role('navigation', name='Workbench workspaces')
                    assert 'Experiments' not in nav.locator('a').all_text_contents(), 'experiments must stay hidden from nav'
                    page.goto(base+'#experiments',wait_until='domcontentloaded')
                    expect(page.get_by_role('heading',name='Experiments',exact=True)).to_be_visible()
                    # Tabs: one experiment per tab, deep-linked via ?tab=.
                    # The default tab is the 3-stage alluvial.
                    tabs = page.locator('.experiments-tabs a')
                    expect(tabs).to_have_count(7)
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('3-stage alluvial')
                    flow_section = page.locator('section[aria-labelledby="experiments-flow-heading"]')
                    # Custom column-flow alluvial: three fixed axes, one block
                    # per (stage, stratum) membership, ribbons between adjacent
                    # axes. Filled paths carry real geometry boxes.
                    expect(flow_section.locator('.flow-sankey')).to_have_count(1)
                    alluvial = flow_section.locator('.flow-sankey').first
                    expect(alluvial.locator('.flow-node rect')).to_have_count(7)
                    expect(alluvial.locator('.flow-link')).to_have_count(3)
                    expect(alluvial.locator('.axis-caption')).to_have_count(3)
                    for caption in alluvial.locator('.axis-caption').all():
                        expect(caption).to_be_visible()
                    # Deep link straight into the PAP tab: five-stage figure
                    # renders, other tabs' sections absent.
                    page.goto(base+'#experiments?tab=pap',wait_until='domcontentloaded')
                    pap_section = page.locator('section[aria-labelledby="experiments-pap-heading"]')
                    pap_fig = pap_section.locator('.category-flow')
                    expect(pap_fig).to_have_count(1)
                    expect(pap_fig.locator('.bf-group-row')).to_have_count(7)
                    expect(pap_fig.locator('.bf-revision-node').first).to_be_visible()
                    expect(page.locator('#experiments-flow-heading')).to_have_count(0)
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('5-stage category alluvial')
                    # NEP-only hierarchy conserves pesos through all three columns.
                    page.get_by_role('link', name='NEP → Category → PAP', exact=True).click()
                    expect(page.get_by_role('heading', name='DPWH · NEP → Category Group → PAP Group', exact=True)).to_be_visible()
                    hierarchy = page.locator('.nep-hierarchy')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="0"]')).to_have_count(1)
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="1"]')).to_have_count(7)
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(46)
                    expect(hierarchy.locator('.nep-hierarchy-link')).to_have_count(53)
                    assert hierarchy.locator('svg').evaluate('''svg => {
                        const labels = [...svg.querySelectorAll('.nep-hierarchy-node')].map(n => ({
                            column: n.dataset.column, box: n.querySelector('text').getBBox()
                        }));
                        const {width, height} = svg.viewBox.baseVal;
                        if (labels.some(({box:b}) => b.x < 0 || b.y < 0 || b.x+b.width > width || b.y+b.height > height)) return false;
                        return ['1','2'].every(column => {
                            const boxes = labels.filter(n => n.column === column).map(n => n.box).sort((a,b) => a.y-b.y);
                            return boxes.every((b,i) => !i || boxes[i-1].y+boxes[i-1].height <= b.y);
                        });
                    }''')
                    assert hierarchy.locator('.nep-hierarchy-node').evaluate_all('''nodes => {
                        const sums = [0, 0, 0];
                        nodes.forEach(n => sums[Number(n.dataset.column)] += Number(n.dataset.value));
                        return sums[0] > 0 && sums.every(v => v === sums[0]);
                    }''')
                    page.get_by_role('combobox', name='Focus category', exact=True).select_option('fap')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(1)
                    expect(hierarchy).to_contain_text('1 PAP group')
                    page.get_by_label('Show exact pesos', exact=True).check()
                    expect(hierarchy).to_contain_text('₱117,749,011,000')
                    page.get_by_role('combobox', name='Focus category', exact=True).select_option('')
                    page.reload(wait_until='networkidle')
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('NEP → Category → PAP')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(46)
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    page.screenshot(path=str(screenshots / f'nep-hierarchy-{width}.png'), full_page=True)
                    # The matching hierarchy uses third-reading money only.
                    page.get_by_role('link', name='HGAB3 → Category → PAP', exact=True).click()
                    expect(page.get_by_role('heading', name='DPWH · HGAB3 → Category Group → PAP Group', exact=True)).to_be_visible()
                    expect(hierarchy).to_have_attribute('data-stage', 'hgab3')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="1"]')).to_have_count(7)
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(45)
                    expect(hierarchy.locator('.nep-hierarchy-link')).to_have_count(52)
                    assert hierarchy.locator('.nep-hierarchy-node').evaluate_all('''nodes => {
                        const sums = [0, 0, 0];
                        nodes.forEach(n => sums[Number(n.dataset.column)] += Number(n.dataset.value));
                        return sums.every(v => v === 587075661000);
                    }''')
                    page.get_by_label('Show exact pesos', exact=True).check()
                    expect(hierarchy).to_contain_text('₱587,075,661,000')
                    page.get_by_role('combobox', name='Focus category', exact=True).select_option('fap')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(1)
                    expect(hierarchy).to_contain_text('₱44,749,011,000')
                    # Switching ledgers resets category focus, preserving all branches.
                    page.get_by_role('link', name='NEP → Category → PAP', exact=True).click()
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(46)
                    page.get_by_role('link', name='HGAB3 → Category → PAP', exact=True).click()
                    page.reload(wait_until='networkidle')
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('HGAB3 → Category → PAP')
                    expect(hierarchy.locator('.nep-hierarchy-node[data-column="2"]')).to_have_count(45)
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    page.screenshot(path=str(screenshots / f'hgab3-hierarchy-{width}.png'), full_page=True)
                    # Allocation flows live on their own tab.
                    page.goto(base+'#experiments?tab=flows',wait_until='domcontentloaded')
                    sankey_section = page.locator('section[aria-labelledby="experiments-sankey-heading"]')
                    expect(sankey_section.locator('.flow-sankey')).to_have_count(4)
                    for i in range(4):
                        chart = sankey_section.locator('.flow-sankey').nth(i)
                        # Ribbons are filled beziers with real area; node
                        # rects must be visible and deep-linkable.
                        expect(chart.locator('.flow-link')).not_to_have_count(0)
                        for ribbon in chart.locator('.flow-link').all():
                            expect(ribbon).to_be_visible()
                        expect(chart.locator('.flow-node rect').first).to_be_visible()
                        expect(chart.locator('.flow-node a').first).to_have_attribute('href',re.compile(r'^#'))
                    # The Overview no longer carries the flow section.
                    page.goto(base+'#overview',wait_until='networkidle')
                    expect(page.locator('.flow-sankey')).to_have_count(0)
                    # Sources groups share the same affordances.
                    page.goto(base+'#sources',wait_until='networkidle')
                    csv_group_head = page.locator('.resource-group-head').filter(has=page.locator('#sources-csv-exports'))
                    csv_group_head.get_by_label('Share CSV dataset exports card',exact=True).click()
                    csv_group_head.get_by_role('menuitem',name='Link to section',exact=True).click()
                    expect(csv_group_head.locator('.card-share-status')).to_contain_text('Link copied')
                    page.goto(base+'#sources?modal=csv-exports',wait_until='networkidle')
                    sources_modal = page.get_by_role('dialog',name='CSV dataset exports datasets',exact=True)
                    expect(sources_modal).to_be_visible()
                    dpwh_csv_in_modal = sources_modal.get_by_role('link',name='DPWH comparison · all rows (Transparency, NEP, HGAB2, HGAB3)',exact=True)
                    assert dpwh_csv_in_modal.get_attribute('download') == 'dpwh_comparison_all_2027.csv',(dpwh_csv_in_modal.get_attribute('download'),)
                    sources_modal.get_by_role('button',name='Close',exact=True).click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    # The former DPWH Resources route redirects into Sources,
                    # where its catalog entries now live.
                    page.goto(base+'#resources',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='Sources and datasets',exact=True)).to_be_visible()
                    # About workspace: suite-level intro with per-workspace cards
                    # and documentation links.
                    page.goto(base+'#about',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='About this workbench',exact=True)).to_be_visible()
                    expect(page.get_by_role('navigation',name='Workbench workspaces').get_by_role('link',name='About',exact=True)).to_have_attribute('aria-current','page')
                    expect(page.locator('main[tabindex="-1"] > .cards').first.locator('article')).to_have_count(7)
                    expect(page.get_by_role('region',name='Workbench workspaces covered')).to_contain_text('NIA Irrigation')
                    expect(page.get_by_role('link',name='Repository README',exact=True)).to_have_attribute('href',re.compile(r'/README\.md$'))
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    page.goto(base+'#overview/unknown',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='Unknown Overview view',exact=True)).to_be_visible()
                    page.get_by_role('link',name='Open Overview',exact=True).click()
                    expect(page.get_by_role('heading',name='Budget allocation overview',exact=True)).to_be_visible()
                    # Schema/recovery check uses a synthetic success response;
                    # it should report the invalid summary without a pageerror.
                    page.route('**/main_overview_2027.json',lambda r:r.fulfill(json={'schema_version':99}))
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_role('alert')).to_contain_text('Unsupported Overview summary')
                    page.unroute('**/main_overview_2027.json')
                    page.get_by_role('button',name='Retry summary',exact=True).click()
                    expect(page.locator('.overview-workspace-card')).to_have_count(4)
                    page.close()
                    context.close()
                    print(f'{width}px: Overview routing, summaries, export and recovery pass',flush=True)
                browser.close()
            assert not errors, errors
            assert not bad, bad
        finally:
            server.shutdown()
    print('Overview browser checks passed')


if __name__=='__main__':
    main()
