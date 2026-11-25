"""Reusable browser-harness workspace helpers for stats.customs.gov.cn low-frequency serial collection."""

from __future__ import annotations

import json
from pathlib import Path

CUSTOMS_PORTAL_URL = "http://stats.customs.gov.cn/"


def disable_customs_debugger_traps(cdp_fn) -> None:
    """Keep CDP Debugger domain disabled so page `debugger;` loops are complete no-ops and never freeze V8."""
    try:
        cdp_fn("Debugger.disable")
    except Exception:
        pass


def inject_customs_suite_bridge(js_fn, userscript_path: str | Path, chunk_size: int = 4000) -> dict:
    """Inject china_customs_suite.user.js v4.0 in <4KB UTF-8 chunks (staying <30KB after _ipc.py ensure_ascii=True JSON framing)."""
    script_source = Path(userscript_path).read_text(encoding="utf-8")
    js_fn("window.__MDES_SUITE_SRC_BUF__ = '';")
    for idx in range(0, len(script_source), chunk_size):
        chunk = script_source[idx : idx + chunk_size]
        js_fn(f"window.__MDES_SUITE_SRC_BUF__ += {json.dumps(chunk, ensure_ascii=False)};")
    js_fn("(0, eval)(window.__MDES_SUITE_SRC_BUF__); delete window.__MDES_SUITE_SRC_BUF__;")
    info = js_fn("window.__CUSTOMS_SUITE_BRIDGE__.verifyDictionary()")
    if isinstance(info, str):
        return json.loads(info)
    return info
