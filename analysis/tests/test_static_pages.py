"""README navigation must survive source-layout to hosted-site packaging."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_pages import hosted_report_links, VIEWER_NAMES, LinkParser, fmr_app_redirect, validate_site


class StaticReadmeLinksTests(unittest.TestCase):
    def test_each_retained_viewer_and_overview_links_both_readmes(self):
        expected = {
            'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md',
            'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/README.md',
        }
        for source in [ROOT / 'site/index.html', ROOT / 'analysis/web/index.html', *(
                ROOT / 'analysis/viewers' / name for name in VIEWER_NAMES)]:
            with self.subTest(page=source.name):
                parser = LinkParser()
                parser.feed(hosted_report_links(source.read_text(), source))
                self.assertTrue(expected.issubset(set(parser.links)))

    def test_missing_markdown_reference_blocks_packaging(self):
        with self.assertRaises(ValueError):
            hosted_report_links('<a href="missing-readme.md">README</a>',
                                ROOT / 'site/index.html')

    def test_fmr_entry_page_passes_packaging_with_its_source_readme(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            (site / 'app').mkdir()
            (site / 'app/index.html').touch()
            page = site / 'fmr.html'
            html = fmr_app_redirect('app/', 'home')
            page.write_text(html)
            # The SPA is checked separately; validate the redirect here.
            with mock.patch('build_pages.OUTPUT', site), \
                 mock.patch.object(Path, 'rglob', return_value=[page]):
                validate_site()
                for readme in ('README.md', 'other-analysis/README.md'):
                    with self.subTest(missing=readme):
                        page.write_text(html.replace('/blob/main/' + readme, '/blob/main/missing.md'))
                        with self.assertRaisesRegex(ValueError, 'Missing repository/workbench README links'):
                            validate_site()

    def test_archived_report_link_keeps_its_document_and_fragment(self):
        text = hosted_report_links(
            '<a href="../archive/docs/FY2027_work_summary.md#5-artifact-index">History</a>',
            ROOT / 'analysis/viewers/source_comparison_2027.html')
        self.assertIn('/analysis/archive/docs/FY2027_work_summary.md#5-artifact-index', text)


if __name__ == '__main__':
    unittest.main()
