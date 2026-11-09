#!/usr/bin/env python3
"""Verify first-visit disclosure, explicit acknowledgement and browser persistence."""
from functools import partial
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, DISCLAIMER_ACK_STORAGE_KEY

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    errors = []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'budget-preview').symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}/budget-preview/app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'),
                    args=['--no-sandbox'],
                )
                context = browser.new_context(viewport={'width': 390, 'height': 844})
                page = context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                dialog = page.get_by_role('dialog', name='Important notes about this budget analysis')

                page.goto(base + '#overview', wait_until='networkidle')
                expect(dialog).to_be_visible()
                expect(dialog).to_contain_text('independent, unofficial analysis')
                expect(dialog).to_contain_text('Budgeted does not mean spent')
                assert page.evaluate('(key) => localStorage.getItem(key)', DISCLAIMER_ACK_STORAGE_KEY) is None
                # A first-time reader cannot silently dismiss the warning.
                page.keyboard.press('Escape')
                expect(dialog).to_be_visible()

                # Full documentation is readable before acknowledgement.
                dialog.get_by_role('link', name='Read full disclaimer and methods').click()
                expect(dialog).to_have_count(0)
                expect(page.get_by_role('heading', name='Full disclaimer', exact=True)).to_be_visible()
                assert page.evaluate('(key) => localStorage.getItem(key)', DISCLAIMER_ACK_STORAGE_KEY) is None

                # Navigating back to a workbench requires a deliberate acknowledgement.
                page.goto(base + '#overview', wait_until='networkidle')
                expect(dialog).to_be_visible()
                dialog.get_by_role('button', name='I understand — continue').click()
                expect(dialog).to_have_count(0)
                assert page.evaluate('(key) => localStorage.getItem(key)', DISCLAIMER_ACK_STORAGE_KEY) == 'acknowledged'
                page.reload(wait_until='networkidle')
                expect(dialog).to_have_count(0)

                # Shared origin: accepting once covers other workspaces and tabs.
                page.goto(base + '#sources', wait_until='networkidle')
                expect(dialog).to_have_count(0)
                second_tab = context.new_page()
                second_tab.goto(base + '#overview', wait_until='networkidle')
                expect(second_tab.get_by_role('dialog', name='Important notes about this budget analysis')).to_have_count(0)
                second_tab.close()

                # A new isolated browser context still sees the notice.
                fresh = browser.new_context(viewport={'width': 1440, 'height': 900})
                fresh_page = fresh.new_page()
                fresh_page.goto(base + '#overview', wait_until='networkidle')
                expect(fresh_page.get_by_role('dialog', name='Important notes about this budget analysis')).to_be_visible()
                fresh.close()
                context.close()
                browser.close()
            assert not errors, errors
            print('First-visit disclaimer: initial notice, ESC blocking, full text, acknowledgement, reload and cross-workspace persistence passed')
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    main()
