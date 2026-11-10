"""build_page.py で1つのファイルのページができるか(埋め込み・外の読み込みなし)。node があればページのテストも動かす。"""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_page  # noqa: E402


class BuildPageTest(unittest.TestCase):
    def test_build_single_file(self):
        with tempfile.TemporaryDirectory() as d:
            out = build_page.build(Path(d) / "index.html")
            html = out.read_text(encoding="utf-8")
        self.assertNotIn("/*@", html)
        self.assertIn("window.AIRC_RULES", html)
        self.assertIn("AIReleaseQuota", html)
        self.assertIn("AIReleaseSNS", html)
        self.assertNotRegex(html, r"<script[^>]+src=")
        self.assertIn("法律の助言でもありません", html)

    @unittest.skipUnless(shutil.which("node"), "node が無い")
    def test_node_page_suite(self):
        r = subprocess.run(["node", "--test", str(HERE / "test_page.mjs")],
                           capture_output=True, text=True, encoding="utf-8", timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
