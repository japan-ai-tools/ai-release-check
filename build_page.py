"""page/index.html に rules.json・check.js・quota.js・sns.js を埋め込み、1つのファイル dist/index.html を作る。
Cloudflare Pages などの静的な置き場にそのまま置ける。通信は使わない(画像も外に送らない)。"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def build(out=None):
    src = (HERE / "page" / "index.html").read_text(encoding="utf-8")
    rules = json.loads((HERE / "rules.json").read_text(encoding="utf-8"))
    parts = {
        "/*@RULES@*/": "window.AIRC_RULES = " + json.dumps(rules, ensure_ascii=False) + ";",
        "/*@CHECK@*/": (HERE / "check.js").read_text(encoding="utf-8"),
        "/*@QUOTA@*/": (HERE / "quota.js").read_text(encoding="utf-8"),
        "/*@SNS@*/": (HERE / "sns.js").read_text(encoding="utf-8"),
    }
    for k, v in parts.items():
        if src.count(k) != 1:
            raise SystemExit(f"埋め込み先 {k} が1つではない")
        src = src.replace(k, v.replace("</script", "<\\/script"))
    out = Path(out) if out else HERE / "dist" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(src, encoding="utf-8")
    return out


if __name__ == "__main__":
    print(build())
