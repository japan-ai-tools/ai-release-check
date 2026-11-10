"""check.js のテスト(node --test)を unittest から動かす。node が無い環境では飛ばす。"""
import shutil
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


@unittest.skipUnless(shutil.which("node"), "node が無い")
class NodeCheckTest(unittest.TestCase):
    def test_node_suite(self):
        r = subprocess.run(["node", "--test", str(HERE / "test_check.mjs")],
                           capture_output=True, text=True, encoding="utf-8", timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
