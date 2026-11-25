"""Reusable browser-harness workspace helpers for stats.customs.gov.cn low-frequency serial collection."""

from __future__ import annotations

import json
from pathlib import Path

CUSTOMS_PORTAL_URL = "http://stats.customs.gov.cn/"


def disable_customs_debugger_traps(cdp_fn) -> None:
    """Neutralize anti-DevTools `debugger;` loops so in-page fetch() never freezes."""
    try:
        cdp_fn("Debugger.enable")
        cdp_fn("Debugger.setSkipAllPauses", skip=True)
    except Exception:
        pass


def inject_customs_suite_bridge(js_fn, userscript_path: str | Path) -> dict:
    """Inject china_customs_suite.user.js v4.0 into the active tab and verify embedded 202601 dictionary."""
    script_source = Path(userscript_path).read_text(encoding="utf-8")
    js_fn(script_source)
    info = js_fn("window.__CUSTOMS_SUITE_BRIDGE__.verifyDictionary()")
    if isinstance(info, str):
        return json.loads(info)
    return info
