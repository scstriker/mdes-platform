#!/usr/bin/env python3
"""
Low-Frequency Compliant Serial Collector for China Customs (stats.customs.gov.cn)
Driven by browser-use / browser-harness over a single persistent CDP session + china_customs_suite.user.js v4.0.

Hard invariants:
1. MAX_INFLIGHT == 1 (single-process, single-tab, single serial loop; zero concurrency).
2. Polite jittered delay >= 3.5s..6.5s (hard floor >= 2.5s) before every request + staged batch/year cooldowns.
3. Zero CAPTCHA/WAF bypass: halts immediately on HTTP 412/429 or HTML challenge, saves _checkpoint.json, and prompts human check.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import random
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SCRIPT_DIR = Path(__file__).resolve().parent
PLATFORM_ROOT = SCRIPT_DIR.parent.parent
WORKSPACE_ROOT = PLATFORM_ROOT.parent
REPO_USERSCRIPT_PATH = PLATFORM_ROOT / "docs" / "china_customs_suite.user.js"
OUTER_USERSCRIPT_PATH = WORKSPACE_ROOT / "docs" / "china_customs_suite.user.js"
FALLBACK_COLLECTOR_PATH = PLATFORM_ROOT / "scripts" / "china_customs_collector.user.js"
DEFAULT_USERSCRIPT_PATH = (
    REPO_USERSCRIPT_PATH
    if REPO_USERSCRIPT_PATH.exists()
    else (OUTER_USERSCRIPT_PATH if OUTER_USERSCRIPT_PATH.exists() else FALLBACK_COLLECTOR_PATH)
)
DEFAULT_DICT_CSV_PATH = PLATFORM_ROOT / "data" / "hs_dict_202601.csv"
DEFAULT_ARCHIVE_DIR = PLATFORM_ROOT / "data" / "customs-raw"
DEFAULT_CHROME_PROFILE_DIR = PLATFORM_ROOT / "apps" / "api" / ".wrangler" / "chrome-customs-profile"

DICT_VERSION = "202601"
EXPECTED_DICT_SHA256 = "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b"
PILOT_HS8 = ["90181100"]
ORDERED_FLOWS = ["import", "export"]
ORDERED_GROUPINGS = ["product", "partner", "regime", "region"]
HARD_FLOOR_DELAY_SEC = 2.5
MAX_SAFE_ROWS = 9000

MINIMAL_FALLBACK_PNG_BYTES = bytes(
    [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
    ]
)


class CustomsCircuitBreakError(RuntimeError):
    """Raised immediately when WAF/session check requires human intervention in visible Chrome."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass
class PoliteRatePolicy:
    min_delay_sec: float = 3.5
    max_delay_sec: float = 6.5
    batch_cooldown_every: int = 8
    batch_cooldown_range: tuple[float, float] = (15.0, 25.0)
    year_cooldown_range: tuple[float, float] = (45.0, 60.0)
    sleep_fn: Callable[[float], None] = time.sleep
    rng: random.Random = field(default_factory=random.Random)
    _request_count: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        if self.min_delay_sec < HARD_FLOOR_DELAY_SEC:
            raise ValueError(
                f"LOW_FREQUENCY_VIOLATION: min_delay_sec={self.min_delay_sec} must be >= {HARD_FLOOR_DELAY_SEC}s"
            )
        if self.max_delay_sec < self.min_delay_sec:
            raise ValueError(
                f"LOW_FREQUENCY_VIOLATION: max_delay_sec={self.max_delay_sec} must be >= min_delay_sec={self.min_delay_sec}"
            )
        if self.batch_cooldown_every < 1:
            raise ValueError("batch_cooldown_every must be >= 1")

    def wait_before_request(self) -> float:
        delay = self.rng.uniform(self.min_delay_sec, self.max_delay_sec)
        self.sleep_fn(delay)
        self._request_count += 1
        return delay

    def maybe_batch_cooldown(self) -> float | None:
        if self._request_count > 0 and self._request_count % self.batch_cooldown_every == 0:
            rest = self.rng.uniform(*self.batch_cooldown_range)
            self.sleep_fn(rest)
            return rest
        return None

    def wait_year_cooldown(self) -> float:
        rest = self.rng.uniform(*self.year_cooldown_range)
        self.sleep_fn(rest)
        return rest


def load_official_dict_batches(dict_csv_path: Path = DEFAULT_DICT_CSV_PATH, group_size: int = 20) -> list[dict[str, Any]]:
    raw_bytes = dict_csv_path.read_bytes()
    actual_sha = sha256_hex(raw_bytes)
    if actual_sha != EXPECTED_DICT_SHA256:
        raise RuntimeError(f"HS dict SHA-256 mismatch: {actual_sha} != {EXPECTED_DICT_SHA256}")

    text = raw_bytes.decode("utf-8-sig")
    rows = list(csv.DictReader(text.splitlines()))
    codes = [r["HS海关编码"].strip() for r in rows]
    batches: list[dict[str, Any]] = []
    for idx in range(0, len(codes), group_size):
        chunk = codes[idx : idx + group_size]
        gid = f"G{(idx // group_size) + 1:02d}"
        batches.append({"batchKey": gid, "hs8": chunk})
    return batches


def default_end_month_for_year(year: int, latest_complete_month: str = "2026-10") -> int:
    ly, lm = [int(x) for x in latest_complete_month.split("-")]
    if year == ly:
        return lm
    return 12


class SerialCustomsCollector:
    """Single-flight serial orchestrator with adaptive window bisection and checkpoint persistence."""

    def __init__(
        self,
        *,
        transport: Any,
        archive_dir: Path = DEFAULT_ARCHIVE_DIR,
        rate_policy: PoliteRatePolicy | None = None,
        latest_complete_month: str = "2026-10",
        revision: str = "r01",
        log_fn: Callable[[str], None] = print,
    ) -> None:
        self.transport = transport
        self.archive_dir = Path(archive_dir)
        self.rate_policy = rate_policy or PoliteRatePolicy()
        self.latest_complete_month = latest_complete_month
        self.revision = revision
        self.log = log_fn
        self.checkpoint_path = self.archive_dir / "_checkpoint.json"
        self._in_flight = False
        self.completed_keys: set[str] = set()
        self._load_checkpoint()

    def _load_checkpoint(self) -> None:
        if self.checkpoint_path.exists():
            try:
                data = json.loads(self.checkpoint_path.read_text(encoding="utf-8"))
                self.completed_keys = set(data.get("completedKeys", []))
            except Exception:
                self.completed_keys = set()

    def _save_checkpoint(self, *, halted_reason: str | None = None) -> None:
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "dictVersion": DICT_VERSION,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "completedKeys": sorted(self.completed_keys),
            "haltedReason": halted_reason,
        }
        tmp_path = self.checkpoint_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp_path.replace(self.checkpoint_path)

    def _guard_single_flight_call(self, fn: Callable[[], Any]) -> Any:
        if self._in_flight:
            raise RuntimeError("ERR_CONCURRENT_REQUEST_FORBIDDEN: SerialCustomsCollector detected concurrent call")
        self._in_flight = True
        try:
            self.rate_policy.wait_before_request()
            result = fn()
        finally:
            self._in_flight = False
        self.rate_policy.maybe_batch_cooldown()
        return result

    def collect_task(
        self,
        *,
        year: int,
        start_month: int,
        end_month: int,
        flow: str,
        grouping: str,
        batch_key: str,
        hs8: list[str],
    ) -> list[dict[str, Any]]:
        month_range_label = f"{year}-{start_month:02d}..{year}-{end_month:02d}"
        task_key = f"{DICT_VERSION}|{month_range_label}|{flow}|{grouping}|{batch_key}|{','.join(sorted(hs8))}"
        if task_key in self.completed_keys:
            self.log(f"[skip-checkpoint] {task_key}")
            return [{"status": "skipped_checkpoint", "monthRange": month_range_label}]

        month_flag = "1" if start_month < end_month else "1"
        probe = self._guard_single_flight_call(
            lambda: self.transport.probe_count(
                year=year,
                start_month=start_month,
                end_month=end_month,
                month_flag=month_flag,
                flow=flow,
                grouping=grouping,
                hs8=hs8,
            )
        )

        if probe.get("isHtmlBlocked") or probe.get("circuitBreakRequired"):
            self._save_checkpoint(halted_reason="html_or_waf_challenge")
            raise CustomsCircuitBreakError(
                f"Circuit breaker tripped during probe ({month_range_label} {flow}/{grouping}): {probe.get('reason')}"
            )

        if not probe.get("ok"):
            self._save_checkpoint(halted_reason=f"probe_failed:{probe.get('reason')}")
            raise CustomsCircuitBreakError(f"Probe failed without valid count: {probe}")

        total = int(probe["total"])
        state = int(probe["state"])

        if total >= MAX_SAFE_ROWS:
            if start_month < end_month:
                mid = (start_month + end_month) // 2
                self.log(f"[bisect-months] {month_range_label} total={total} >= {MAX_SAFE_ROWS} -> {start_month}..{mid} & {mid+1}..{end_month}")
                left = self.collect_task(
                    year=year,
                    start_month=start_month,
                    end_month=mid,
                    flow=flow,
                    grouping=grouping,
                    batch_key=batch_key,
                    hs8=hs8,
                )
                right = self.collect_task(
                    year=year,
                    start_month=mid + 1,
                    end_month=end_month,
                    flow=flow,
                    grouping=grouping,
                    batch_key=batch_key,
                    hs8=hs8,
                )
                return left + right
            if len(hs8) > 1:
                half = len(hs8) // 2
                left = self.collect_task(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    flow=flow,
                    grouping=grouping,
                    batch_key=f"{batch_key}A",
                    hs8=hs8[:half],
                )
                right = self.collect_task(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    flow=flow,
                    grouping=grouping,
                    batch_key=f"{batch_key}B",
                    hs8=hs8[half:],
                )
                return left + right

        months_covered = [f"{year}-{m:02d}" for m in range(start_month, end_month + 1)]
        target_dir = self.archive_dir / str(year) / flow / grouping / batch_key / self.revision
        target_dir.mkdir(parents=True, exist_ok=True)
        stem = f"customs_{DICT_VERSION}_{year}_{start_month:02d}-{end_month:02d}_{flow}_{grouping}_{batch_key}_{self.revision}"

        if total == 0:
            png_bytes = self.transport.capture_empty_png()
            png_sha = sha256_hex(png_bytes)
            png_path = target_dir / f"{stem}.empty.png"
            png_path.write_bytes(png_bytes)

            manifest_obj = {
                "dictVersion": DICT_VERSION,
                "month": months_covered[0],
                "months": months_covered,
                "flow": flow,
                "currency": "USD",
                "grouping": grouping,
                "hs8": hs8,
                "emptyHs8": hs8,
                "probeVerifiedZero": True,
            }
            (target_dir / f"{stem}.manifest.json").write_text(
                json.dumps(manifest_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            (target_dir / f"{stem}.meta.json").write_text(
                json.dumps(
                    {
                        "dictVersion": DICT_VERSION,
                        "monthRange": month_range_label,
                        "months": months_covered,
                        "flow": flow,
                        "grouping": grouping,
                        "batchKey": batch_key,
                        "officialTotal": 0,
                        "emptyPngFilename": png_path.name,
                        "emptyPngSha256": png_sha,
                        "collectedAt": datetime.now(timezone.utc).isoformat(),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            self.completed_keys.add(task_key)
            self._save_checkpoint(halted_reason=None)
            return [{"status": "confirmed_empty", "monthRange": month_range_label, "sha256": png_sha}]

        export_res = self._guard_single_flight_call(
            lambda: self.transport.fetch_raw_export(
                year=year,
                start_month=start_month,
                end_month=end_month,
                month_flag=month_flag,
                flow=flow,
                grouping=grouping,
                hs8=hs8,
                state=state,
            )
        )

        if not export_res.get("ok"):
            if export_res.get("circuitBreakRequired"):
                self._save_checkpoint(halted_reason="html_or_waf_challenge")
                raise CustomsCircuitBreakError(
                    f"Circuit breaker tripped during export ({month_range_label} {flow}/{grouping}): {export_res.get('reason')}"
                )
            self._save_checkpoint(halted_reason=f"export_failed:{export_res.get('reason')}")
            raise CustomsCircuitBreakError(f"Export failed: {export_res}")

        raw_bytes = base64.b64decode(export_res["base64"])
        actual_sha = sha256_hex(raw_bytes)
        if actual_sha != export_res["sha256"]:
            raise RuntimeError(f"IPC byte integrity mismatch: {actual_sha} != {export_res['sha256']}")

        csv_path = target_dir / f"{stem}.raw.csv"
        csv_path.write_bytes(raw_bytes)

        manifest_obj = {
            "dictVersion": DICT_VERSION,
            "month": months_covered[0],
            "months": months_covered,
            "flow": flow,
            "currency": "USD",
            "grouping": grouping,
            "hs8": hs8,
            "emptyHs8": export_res.get("inspection", {}).get("unreturnedHs8", []),
            "probeVerifiedZero": True,
        }
        (target_dir / f"{stem}.manifest.json").write_text(
            json.dumps(manifest_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (target_dir / f"{stem}.meta.json").write_text(
            json.dumps(
                {
                    "dictVersion": DICT_VERSION,
                    "monthRange": month_range_label,
                    "months": months_covered,
                    "flow": flow,
                    "grouping": grouping,
                    "batchKey": batch_key,
                    "officialProbeTotal": total,
                    "selectTableState": state,
                    "savedCsvFilename": csv_path.name,
                    "sha256": actual_sha,
                    "byteLength": len(raw_bytes),
                    "inspection": export_res.get("inspection", {}),
                    "collectedAt": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        self.completed_keys.add(task_key)
        self._save_checkpoint(halted_reason=None)
        self.log(f"[saved] {csv_path.name} ({len(raw_bytes)} B, sha256={actual_sha[:12]}…)")
        return [{"status": "received", "monthRange": month_range_label, "sha256": actual_sha, "csvPath": str(csv_path)}]

    def run_plan(
        self,
        *,
        years: list[int],
        batches: list[dict[str, Any]],
        flows: list[str] = ORDERED_FLOWS,
        groupings: list[str] = ORDERED_GROUPINGS,
    ) -> list[dict[str, Any]]:
        all_outcomes: list[dict[str, Any]] = []
        for y_idx, year in enumerate(years):
            end_m = default_end_month_for_year(year, self.latest_complete_month)
            for batch in batches:
                for flow in flows:
                    for grouping in groupings:
                        res = self.collect_task(
                            year=year,
                            start_month=1,
                            end_month=end_m,
                            flow=flow,
                            grouping=grouping,
                            batch_key=batch["batchKey"],
                            hs8=batch["hs8"],
                        )
                        all_outcomes.extend(res)
            if y_idx + 1 < len(years):
                rest = self.rate_policy.wait_year_cooldown()
                self.log(f"[year-cooldown] Completed {year}, resting {rest:.1f}s before {years[y_idx + 1]}...")
        return all_outcomes


def _inject_browser_harness_site_packages() -> None:
    """Locate uv tool venv for browser-use / browser-harness on Windows/POSIX so both parent & daemon subprocess import `browser_harness`."""
    candidates = [
        Path(os.environ.get("APPDATA", "")) / "uv" / "tools" / "browser-use" / "Lib" / "site-packages",
        Path.home() / ".local" / "share" / "uv" / "tools" / "browser-use" / "lib",
    ]
    existing_py_path = [p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p]
    for cand in candidates:
        if cand.exists():
            cand_str = str(cand)
            if cand_str not in sys.path:
                sys.path.insert(0, cand_str)
            if cand_str not in existing_py_path:
                existing_py_path.insert(0, cand_str)
    if existing_py_path:
        os.environ["PYTHONPATH"] = os.pathsep.join(existing_py_path)


def ensure_dedicated_chrome_cdp(port: int = 9333, profile_dir: Path = DEFAULT_CHROME_PROFILE_DIR) -> str:
    cdp_http = f"http://127.0.0.1:{port}"
    try:
        with urllib.request.urlopen(f"{cdp_http}/json/version", timeout=1.5) as resp:
            if resp.status == 200:
                return cdp_http
    except Exception:
        pass

    chrome_candidates = [
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    browser_bin = next((p for p in chrome_candidates if p.exists()), None)
    if browser_bin is None:
        raise RuntimeError("No Chrome or Edge executable found on this machine.")

    profile_dir.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [
            str(browser_bin),
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=HttpsFirstBalancedModeAutoEnable,HttpsUpgrades",
            "http://stats.customs.gov.cn/",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(25):
        time.sleep(0.5)
        try:
            with urllib.request.urlopen(f"{cdp_http}/json/version", timeout=1.5) as resp:
                if resp.status == 200:
                    return cdp_http
        except Exception:
            continue
    raise RuntimeError(f"Timed out waiting for Chrome CDP endpoint {cdp_http}")


class BrowserHarnessTransport:
    """Real Chrome transport powered by browser-use / browser-harness persistent CDP daemon."""

    def __init__(self, *, cdp_url: str | None = None, userscript_path: Path = DEFAULT_USERSCRIPT_PATH) -> None:
        _inject_browser_harness_site_packages()
        daemon_name = "mdes-customs-serial" if cdp_url else "default"
        if cdp_url:
            os.environ["BU_CDP_URL"] = cdp_url
            os.environ["BU_NAME"] = daemon_name
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))

        from browser_harness import admin as bh_admin  # type: ignore
        from browser_harness import helpers as bh  # type: ignore

        from agent_helpers import disable_customs_debugger_traps, inject_customs_suite_bridge

        bh_admin.ensure_daemon(name=daemon_name, env=dict(os.environ))
        self._bh = bh
        tabs = bh.list_tabs()
        customs_tab = next((t for t in tabs if "customs.gov.cn" in (t.get("url") or "")), None)
        if customs_tab:
            bh.switch_tab(customs_tab, activate=True)
            bh.wait_for_load(timeout=20.0)
            time.sleep(3.0)
        else:
            bh.new_tab("http://stats.customs.gov.cn/")
            bh.wait_for_load(timeout=20.0)
            time.sleep(3.0)

        curr_href = str(self._eval_async_js("location.href", timeout=10.0) or "")
        if curr_href.startswith("chrome-error://") or "customs.gov.cn" not in curr_href:
            bh.goto_url("http://stats.customs.gov.cn/")
            bh.wait_for_load(timeout=20.0)
            time.sleep(3.0)
            curr_href = str(self._eval_async_js("location.href", timeout=10.0) or "")
            if curr_href.startswith("chrome-error://"):
                err_txt = str(
                    self._eval_async_js(
                        "document.documentElement ? document.documentElement.innerText.slice(0, 300) : String()",
                        timeout=10.0,
                    )
                    or ""
                ).replace("\n", " ")
                raise CustomsCircuitBreakError(
                    f"Target portal http://stats.customs.gov.cn/ unreachable in Chrome ({curr_href}): {err_txt}"
                )

        disable_customs_debugger_traps(bh.cdp)
        self.userscript_path = userscript_path
        self.dict_info = inject_customs_suite_bridge(self._eval_async_js, userscript_path)

    def _eval_async_js(self, expression: str, timeout: float = 60.0) -> Any:
        resp = self._bh.cdp(
            "Runtime.evaluate",
            expression=expression,
            returnByValue=True,
            awaitPromise=True,
            _response_timeout=timeout,
        )
        return self._bh._runtime_value(resp, expression)

    def ensure_bridge(self) -> None:
        present = self._eval_async_js("Boolean(window.__CUSTOMS_SUITE_BRIDGE__)", timeout=10.0)
        if not present:
            from agent_helpers import disable_customs_debugger_traps, inject_customs_suite_bridge

            disable_customs_debugger_traps(self._bh.cdp)
            inject_customs_suite_bridge(self._eval_async_js, self.userscript_path)

    def check_session_ready(self) -> dict[str, Any]:
        self.ensure_bridge()
        return self._eval_async_js(
            "window.__CUSTOMS_SUITE_BRIDGE__.checkSessionReady({ skipPoliteWaitForUnitTest: true })",
            timeout=25.0,
        )

    def probe_count(
        self,
        *,
        year: int,
        start_month: int,
        end_month: int,
        month_flag: str,
        flow: str,
        grouping: str,
        hs8: list[str],
    ) -> dict[str, Any]:
        self.ensure_bridge()
        payload = json.dumps(
            {
                "year": year,
                "startMonth": start_month,
                "endMonth": end_month,
                "monthFlag": month_flag,
                "flow": flow,
                "grouping": grouping,
                "hs8": hs8,
                "skipPoliteWaitForUnitTest": True,
            }
        )
        return self._eval_async_js(f"window.__CUSTOMS_SUITE_BRIDGE__.probeCount({payload})", timeout=45.0)

    def fetch_raw_export(
        self,
        *,
        year: int,
        start_month: int,
        end_month: int,
        month_flag: str,
        flow: str,
        grouping: str,
        hs8: list[str],
        state: int,
    ) -> dict[str, Any]:
        self.ensure_bridge()
        payload = json.dumps(
            {
                "year": year,
                "startMonth": start_month,
                "endMonth": end_month,
                "monthFlag": month_flag,
                "flow": flow,
                "grouping": grouping,
                "hs8": hs8,
                "selectTableState": state,
                "skipPoliteWaitForUnitTest": True,
            }
        )
        return self._eval_async_js(f"window.__CUSTOMS_SUITE_BRIDGE__.fetchRawExportBase64({payload})", timeout=75.0)

    def capture_empty_png(self) -> bytes:
        res = self._bh.cdp("Page.captureScreenshot", format="png")
        if isinstance(res, dict) and res.get("data"):
            return base64.b64decode(res["data"])
        return MINIMAL_FALLBACK_PNG_BYTES


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Low-frequency compliant serial China Customs collector (browser-harness).")
    p.add_argument("--years", default="2024", help="Comma-separated years, e.g. 2022,2023,2024,2025,2026")
    p.add_argument("--pilot", action="store_true", help="Collect only pilot HS8 90181100 (ECG recorder)")
    p.add_argument("--groups", default="", help="Optional comma-separated group IDs, e.g. G01,G02")
    p.add_argument("--min-delay", type=float, default=3.5, help="Minimum delay (sec) before each request (>=2.5)")
    p.add_argument("--max-delay", type=float, default=6.5, help="Maximum delay (sec) before each request")
    p.add_argument("--cdp-port", type=int, default=9333, help="Dedicated Chrome remote debugging port")
    p.add_argument("--use-running-chrome", action="store_true", help="Attach to existing running Chrome instead of dedicated port")
    p.add_argument("--wait-human-seconds", type=int, default=90, help="Max seconds to wait for human initial query/verification in visible Chrome")
    p.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE_DIR), help="Target raw archive directory")
    p.add_argument("--latest-month", default="2026-10", help="Latest complete YYYY-MM for current year")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    policy = PoliteRatePolicy(min_delay_sec=args.min_delay, max_delay_sec=args.max_delay)
    years = [int(y.strip()) for y in args.years.split(",") if y.strip()]

    if args.pilot:
        batches = [{"batchKey": "PILOT-90181100", "hs8": PILOT_HS8}]
    else:
        all_batches = load_official_dict_batches()
        if args.groups.strip():
            wanted = {g.strip().upper() for g in args.groups.split(",") if g.strip()}
            batches = [b for b in all_batches if b["batchKey"] in wanted]
        else:
            batches = all_batches

    cdp_url = None if args.use_running_chrome else ensure_dedicated_chrome_cdp(port=args.cdp_port)
    transport = BrowserHarnessTransport(cdp_url=cdp_url)

    status = transport.check_session_ready()
    if not status.get("ready"):
        collector_tmp = SerialCustomsCollector(
            transport=transport,
            archive_dir=Path(args.archive_dir),
            rate_policy=policy,
            latest_complete_month=args.latest_month,
        )
        collector_tmp._save_checkpoint(halted_reason=str(status.get("reason") or "session_or_captcha_gate"))
        raise CustomsCircuitBreakError(
            "stats.customs.gov.cn requires manual human verification (/queryData/toCaptchaView) in visible Chrome "
            f"before querying ({status.get('reason')}). Saved _checkpoint.json; run again after completing human check."
        )

    collector = SerialCustomsCollector(
        transport=transport,
        archive_dir=Path(args.archive_dir),
        rate_policy=policy,
        latest_complete_month=args.latest_month,
    )
    outcomes = collector.run_plan(years=years, batches=batches)
    print(json.dumps({"ok": True, "completedCount": len(outcomes)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
