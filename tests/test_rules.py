"""rules.json の形を確かめる(出典・確かめた日・段階・配信先がそろっているか)。"""
import json
import re
import unittest
from datetime import date
from pathlib import Path

RULES = Path(__file__).resolve().parent.parent / "rules.json"
OFFICIAL = {
    "apple_music": ("help.apple.com",),
    "spotify": ("newsroom.spotify.com", "support.spotify.com", "artists.spotify.com", "providersupport.spotify.com"),
    "youtube": ("support.google.com", "blog.youtube"),
    "tunecore_japan": ("www.tunecore.co.jp", "support.tunecore.co.jp"),
    "distrokid": ("distrokid.com", "support.distrokid.com"),
    "jasrac": ("www.jasrac.or.jp",),
    "nextone": ("www.nex-tone.co.jp",),
}


class RulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(RULES.read_text(encoding="utf-8"))

    def test_platforms(self):
        self.assertEqual(set(self.d["platforms"]), set(OFFICIAL))

    def test_every_platform_has_a_rule(self):
        used = {r["platform"] for r in self.d["rules"]}
        self.assertEqual(used, set(OFFICIAL))

    def test_ids_unique(self):
        ids = [r["id"] for r in self.d["rules"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_fields_and_levels(self):
        for r in self.d["rules"]:
            for k in ("id", "platform", "field", "level", "status", "check", "rule", "fix", "source", "checked"):
                self.assertTrue(r.get(k), (r.get("id"), k))
            self.assertIn(r["level"], self.d["levels"])
            self.assertIn(r["status"], ("verified", "unverified"))

    def test_sources_are_official_https(self):
        for r in self.d["rules"]:
            self.assertTrue(r["source"].startswith("https://"), r["id"])
            host = r["source"].split("/")[2]
            self.assertIn(host, OFFICIAL[r["platform"]], r["id"])

    def test_checked_dates(self):
        for r in self.d["rules"]:
            self.assertRegex(r["checked"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertLessEqual(date.fromisoformat(r["checked"]), date.fromisoformat(self.d["updated"]))

    def test_unverified_never_blocks(self):
        for r in self.d["rules"]:
            if r["status"] == "unverified":
                self.assertEqual(r["level"], "info", r["id"])

    def test_disclaimer(self):
        self.assertIn("法律の助言ではない", self.d["note"])

    def test_jasrac_shares_match_guideline(self):
        r = [x for x in self.d["rules"] if x["id"] == "jasrac.ai.partial"][0]
        self.assertEqual(r["params"]["lyrics_ai"], {"music_only": 100, "both": 50, "lyrics_only": 0})
        self.assertEqual(r["params"]["music_ai"], {"music_only": 0, "both": 50, "lyrics_only": 100})
        self.assertEqual(self.d["platforms"]["jasrac"]["kind"], "rights")

    def test_artwork_size_rule(self):
        r = [x for x in self.d["rules"] if x["id"] == "tunecore.art.spec"][0]
        self.assertEqual(r["params"]["min_px"], 3000)


if __name__ == "__main__":
    unittest.main()
