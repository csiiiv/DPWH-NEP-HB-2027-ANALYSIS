"""Static share-preview regression tests, without external services."""
import re
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from share_previews import BASE, STORIES, generate_share_pages
from build_pages import validate_site


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.metadata = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = attrs.get("property") or attrs.get("name")
            if key:
                self.metadata[key] = attrs.get("content")
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


class SharePreviewTests(unittest.TestCase):
    def test_registry_matches_highlights_story_ids(self):
        source = (ROOT / "analysis/web/src/Highlights.jsx").read_text(encoding="utf-8")
        declared = set(re.findall(r"\{id:'([^']+)'", source))
        self.assertEqual(set(STORIES), declared, "Share previews must cover the actual Highlights story IDs")

    def test_all_story_pages_have_distinct_metadata_and_correct_destinations(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            generate_share_pages(app)
            pages = sorted((app / "share").glob("*/index.html"))
            self.assertEqual(len(pages), len(STORIES))
            titles = set()
            for slug, (title, description) in STORIES.items():
                with self.subTest(story=slug):
                    page = app / "share" / slug / "index.html"
                    html = page.read_text(encoding="utf-8")
                    parser = MetadataParser()
                    parser.feed(html)
                    canonical = BASE + "share/" + slug + "/"
                    destination = BASE + "#highlights?story=" + slug
                    self.assertEqual(parser.title, title + " | FY2027 Budget Workbench")
                    self.assertEqual(parser.metadata["og:title"], parser.title)
                    self.assertEqual(parser.metadata["og:description"], description)
                    self.assertEqual(parser.metadata["og:url"], canonical)
                    self.assertIn("window.location.replace(" , html)
                    self.assertIn(destination, html)
                    self.assertIn("/analysis/README.md", html)
                    titles.add(parser.title)
            self.assertEqual(len(titles), len(STORIES))

    def test_generated_pages_pass_existing_site_validator(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            generate_share_pages(app)
            with patch("build_pages.OUTPUT", Path(tmp)):
                validate_site()


if __name__ == "__main__":
    unittest.main()
