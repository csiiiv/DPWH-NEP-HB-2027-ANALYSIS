"""PDF preview must receive partial bytes rather than a full file per request."""

import http.client
import sys
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from serve_pages import RangeHandler


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


class RangeTests(unittest.TestCase):
    def test_partial_suffix_invalid_and_full_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            content = bytes(range(256)) * 1024
            Path(directory, "source.pdf").write_bytes(content)
            server = ThreadingHTTPServer(
                ("127.0.0.1", 0), partial(Quiet, directory=directory)
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for spec, expected_status, expected_body in [
                    ("bytes=65536-131071", 206, content[65536:131072]),
                    ("bytes=-10", 206, content[-10:]),
                    ("bytes=300000-", 416, b""),
                    ("bytes=9-2", 416, b""),
                    ("bytes=0-1,4-5", 416, b""),
                    (None, 200, content),
                ]:
                    with self.subTest(spec=spec):
                        client = http.client.HTTPConnection(*server.server_address)
                        client.request(
                            "GET",
                            "/source.pdf",
                            headers={"Range": spec} if spec else {},
                        )
                        response = client.getresponse()
                        self.assertEqual(response.status, expected_status)
                        self.assertEqual(response.read(), expected_body)
                        self.assertEqual(response.getheader("Accept-Ranges"), "bytes")
                        client.close()
            finally:
                server.shutdown()
                server.server_close()
