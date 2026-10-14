"""Shared browser assertions for Analysis navigation and table deep links."""
import csv
from io import StringIO
from pathlib import Path
import re
from playwright.sync_api import expect


def check_analysis_links(page, goto, view, table_id, *, tabs='Workspace views'):
    goto(f'analysis?view={view}&table={table_id}')
    target = page.locator(f'#table-{table_id}')
    expect(target).to_be_visible()
    expect(target).to_have_class(re.compile(r'\btable-target\b'))
    expect(target).to_be_focused()
    expect(page.locator('h2.fmr-question')).to_be_visible()
    page.reload(wait_until='networkidle')
    expect(target).to_be_focused()
    # Copying a table link preserves active view and a source/filter parameter.
    goto(f'analysis?view={view}&stage=house')
    target.get_by_role('button', name=re.compile('^Copy link to ')).click()
    assert f'table={table_id}' in page.url and 'stage=house' in page.url
    expect(target).to_be_focused()
    nav = page.get_by_role('navigation', name=tabs, exact=True)
    nav.get_by_role('link', name='Overview', exact=True).click()
    assert 'table=' not in page.url
    expect(nav.get_by_role('link', name='Overview', exact=True)).to_have_attribute('aria-current', 'page')


def check_banded_overview(page, goto, table_id):
    goto('analysis?view=overview')
    table = page.locator(f'#table-{table_id}')
    expect(table.locator('.band-row .band-records')).to_have_attribute('colspan', '4')
    expect(table.locator('.band-row .band-allocations')).to_have_attribute('colspan', '4')
    expect(table.locator('tbody tr').first.locator('.band-records')).to_have_count(4)
    expect(table.locator('tbody tr').first.locator('.band-allocations')).to_have_count(4)
    table.get_by_role('button', name='NEP records', exact=True).click()
    assert 'sort=nep_count' in page.url
    page.reload(wait_until='networkidle')
    expect(table.locator('th[aria-sort="descending"]').filter(has_text='NEP records')).to_have_count(1)


def check_candidate_group(page, goto, view, table_id, count_label, dialog_name, export_name, query=None):
    goto(f'analysis?view={view}' + (f'&q={query}' if query else ''))
    table = page.locator(f'#table-{table_id}')
    row = table.locator('tbody tr').first
    count = int(row.locator(f'[data-label="{count_label}"]').inner_text().replace(',', ''))
    row.locator('button.group-open').first.click()
    modal = page.get_by_role('dialog', name=dialog_name, exact=True)
    expect(modal).to_be_visible()
    expect(modal.get_by_label('Record scope', exact=True)).to_contain_text('Dimension:')
    if query:
        expect(modal.get_by_label('Record scope', exact=True)).to_contain_text(query)
    group_url = page.url
    page.reload(wait_until='networkidle')
    expect(modal).to_be_visible()
    assert page.url == group_url
    with page.expect_download() as result:
        modal.get_by_role('button', name=export_name, exact=True).click()
    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
    assert len(exported) == count, (view, count, len(exported))
    assert any('pdf_page' in k for k in exported[0])
    modal.press('Escape')
    expect(modal).to_have_count(0)
    # Re-open without reload so Back/Forward exercises the URL-keyed lifecycle.
    table.locator('tbody button.group-open').first.click()
    expect(modal).to_be_visible()
    page.go_back(wait_until='networkidle')
    expect(modal).to_have_count(0)
    page.go_forward(wait_until='networkidle')
    expect(modal).to_be_visible()
    modal.get_by_role('button', name='Close records', exact=True).click()
    expect(modal).to_have_count(0)
