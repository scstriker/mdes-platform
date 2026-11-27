#!/usr/bin/env python3
"""
Low-Frequency Compliant Serial Collector for China Customs (stats.customs.gov.cn)
Driven by browser-use / browser-harness over a single persistent CDP session + china_customs_suite.user.js v4.0.

Hard invariants:
1. MAX_INFLIGHT == 1 (single-process, single-tab, single serial loop; zero concurrency).
2. Polite jittered delay >= 3.5s..6.5s (hard floor >= 2.5s) before every actual HTTP request + staged batch/year cooldowns.
3. Zero CAPTCHA/WAF bypass: halts immediately on HTTP 412/429 or HTML challenge, saves _checkpoint.json, and prompts human check.
4. Strict completeness & evidence integrity: never marks probeVerifiedZero=True unless exported CSV rows and scope match the official probe, and never records empty-result evidence without a real verified screenshot.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import os
import random
import re
import struct
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
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
DEFAULT_PILOT_ARCHIVE_DIR = PLATFORM_ROOT / "data" / "customs-raw-pilot"
DEFAULT_REPO_LEDGER_PATH = PLATFORM_ROOT / "docs" / "海关2022_2026实采进度实时台账.md"
DEFAULT_CHROME_PROFILE_DIR = Path.home() / ".customs-chromium-9336"

DICT_VERSION = "202601"
EXPECTED_DICT_SHA256 = "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b"
PILOT_HS8 = ["90181100"]
ORDERED_FLOWS = ["import", "export"]
ORDERED_GROUPINGS = ["product", "partner", "regime", "region"]
HARD_FLOOR_DELAY_SEC = 2.5
MAX_SAFE_ROWS = 7500
MIN_EVIDENCE_PNG_DIM = 16

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

HS_HEADERS = ("商品编码", "商品代码", "商品税号", "hs海关编码", "hs编码", "hs_code", "hscode", "code_ts")
USD_HEADERS = ("美元", "金额(美元)", "金额（美元）", "美元金额", "usd", "amount_usd")
NON_USD_HEADERS = ("人民币", "金额(人民币)", "金额（人民币）", "rmb", "cny")
PERIOD_HEADERS = ("数据年月", "统计年月", "年月", "period", "month")
FLOW_HEADERS = ("进出口", "贸易流向", "流向", "flow")
PARTNER_CODE_HEADERS = ("贸易伙伴编码", "贸易伙伴代码", "原产国(地)编码", "最终目的国(地)编码", "产销国(地)编码", "partner_code")
PARTNER_NAME_HEADERS = ("贸易伙伴名称", "贸易伙伴", "原产国(地)", "最终目的国(地)", "产销国(地)", "partner_name")
REGIME_CODE_HEADERS = ("贸易方式编码", "贸易方式代码", "regime_code")
REGIME_NAME_HEADERS = ("贸易方式名称", "贸易方式", "regime_name")
REGION_CODE_HEADERS = ("收发货人注册地编码", "收发货人注册地代码", "注册地编码", "注册地代码", "region_code")
REGION_NAME_HEADERS = ("收发货人注册地名称", "收发货人注册地", "注册地名称", "注册地", "region_name")
SUMMARY_LABELS = frozenset({"合计", "总计", "全国", "全国合计", "全部", "世界", "world", "total", "all"})


class CustomsCircuitBreakError(RuntimeError):
    """Raised immediately when WAF/session check requires human intervention in visible Chrome."""


class CustomsExportVerificationError(RuntimeError):
    """Raised when an exported CSV fails row-count, HS8 scope, month range, or column integrity checks."""


class CustomsScreenshotError(RuntimeError):
    """Raised when capturing or validating a real non-placeholder empty-result PNG screenshot fails."""


class CustomsArchiveConflictError(RuntimeError):
    """Raised when writing would overwrite or collide with an existing archive having a different HS8 scope."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_line_endings_lf(raw_bytes: bytes) -> bytes:
    """Normalize CRLF/CR line endings to LF so dictionary digests do not depend on git core.autocrlf."""
    return raw_bytes.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def build_zero_query_fingerprint(
    *,
    year: int,
    start_month: int,
    end_month: int,
    month_flag: str,
    flow: str,
    grouping: str,
    state: int,
    hs8: list[str],
) -> str:
    sorted_hs8 = sorted({str(c).strip() for c in hs8 if str(c).strip()})
    mf = "1" if month_flag == "1" else "single"
    return (
        f"{DICT_VERSION}|{int(year)}-{int(start_month):02d}..{int(year)}-{int(end_month):02d}"
        f"|mf={mf}|{flow}|{grouping}|st={int(state)}|hs8={','.join(sorted_hs8)}"
    )


def validate_evidence_png(png_bytes: bytes) -> tuple[int, int]:
    """Verify that empty-result screenshot bytes form a real PNG (rejecting empty payloads or 1x1 placeholders)."""
    if not isinstance(png_bytes, (bytes, bytearray)) or len(png_bytes) < 24:
        raise CustomsScreenshotError("Empty-result screenshot is too short to be a valid PNG")
    raw = bytes(png_bytes)
    if not raw.startswith(PNG_SIGNATURE) or raw[12:16] != b"IHDR":
        raise CustomsScreenshotError("Empty-result screenshot does not have a valid PNG/IHDR header")
    width, height = struct.unpack(">II", raw[16:24])
    if width < MIN_EVIDENCE_PNG_DIM or height < MIN_EVIDENCE_PNG_DIM:
        raise CustomsScreenshotError(
            f"Empty-result screenshot dimensions {width}x{height} are below minimum {MIN_EVIDENCE_PNG_DIM}x{MIN_EVIDENCE_PNG_DIM} (placeholder rejected)"
        )
    return width, height


def _find_header_col(headers: list[str], aliases: tuple[str, ...]) -> int:
    lower = [h.strip().lower() for h in headers]
    for alias in aliases:
        target = alias.lower()
        for idx, col in enumerate(lower):
            if col == target:
                return idx
    return -1


def _normalize_hs8_cell(raw_cell: str) -> str | None:
    cleaned = raw_cell.strip()
    m_eq = re.fullmatch(r'="(\d+)"', cleaned)
    if m_eq:
        cleaned = m_eq.group(1)
    elif cleaned.startswith("'") and cleaned[1:].isdigit():
        cleaned = cleaned[1:]
    cleaned = cleaned.strip()
    return cleaned if re.fullmatch(r"\d{8}", cleaned) else None


def _normalize_month_cell(raw_cell: str) -> str | None:
    cleaned = raw_cell.strip()
    m1 = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", cleaned)
    if m1:
        return f"{m1.group(1)}-{m1.group(2)}"
    m2 = re.fullmatch(r"(\d{4})(0[1-9]|1[0-2])", cleaned)
    if m2:
        return f"{m2.group(1)}-{m2.group(2)}"
    return None


def _normalize_flow_cell(raw_cell: str) -> str | None:
    cleaned = raw_cell.strip().lower()
    if cleaned in ("进口", "import", "1"):
        return "import"
    if cleaned in ("出口", "export", "0"):
        return "export"
    return None


def _decode_customs_csv_bytes(raw_bytes: bytes) -> tuple[str, str]:
    if not raw_bytes:
        raise CustomsExportVerificationError("empty_csv_bytes")
    try:
        text = raw_bytes.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        try:
            text = raw_bytes.decode("gb18030")
            encoding = "gb18030"
        except UnicodeDecodeError as exc:
            raise CustomsExportVerificationError(f"undecodable_csv_bytes:{exc}") from exc
    if text.startswith("\ufeff"):
        text = text[1:]
    head = text[:512].lstrip().lower()
    if head.startswith("<!doctype") or head.startswith("<html") or "<html" in head:
        raise CustomsExportVerificationError("html_error_page_in_csv")
    return text, encoding


def verify_exported_csv(
    raw_bytes: bytes,
    *,
    expected_total: int,
    months_covered: list[str],
    requested_hs8: list[str],
    flow: str,
    grouping: str,
    bridge_inspection: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Independently parse and verify raw exported CSV bytes against official probe count and requested scope.
    Raises CustomsExportVerificationError on any row-count, HS8, month-range, flow, or column mismatch.
    """
    text, encoding = _decode_customs_csv_bytes(raw_bytes)
    reader = csv.reader(io.StringIO(text, newline=""))
    non_blank = [row for row in reader if any(cell.strip() for cell in row)]
    if not non_blank:
        raise CustomsExportVerificationError("blank_csv_payload")

    headers = [cell.strip() for cell in non_blank[0]]
    usd_col = _find_header_col(headers, USD_HEADERS)
    if usd_col < 0:
        if _find_header_col(headers, NON_USD_HEADERS) >= 0:
            raise CustomsExportVerificationError("rmb_currency_detected")
        raise CustomsExportVerificationError("missing_usd_header")

    hs_col = _find_header_col(headers, HS_HEADERS)
    if hs_col < 0:
        raise CustomsExportVerificationError("missing_hs8_header")

    period_col = _find_header_col(headers, PERIOD_HEADERS)
    flow_col = _find_header_col(headers, FLOW_HEADERS)

    group_code_col = -1
    group_name_col = -1
    if grouping == "partner":
        group_code_col = _find_header_col(headers, PARTNER_CODE_HEADERS)
        group_name_col = _find_header_col(headers, PARTNER_NAME_HEADERS)
        if group_code_col < 0 or group_name_col < 0:
            raise CustomsExportVerificationError("missing_partner_columns")
    elif grouping == "regime":
        group_code_col = _find_header_col(headers, REGIME_CODE_HEADERS)
        group_name_col = _find_header_col(headers, REGIME_NAME_HEADERS)
        if group_code_col < 0 or group_name_col < 0:
            raise CustomsExportVerificationError("missing_regime_columns")
    elif grouping == "region":
        group_code_col = _find_header_col(headers, REGION_CODE_HEADERS)
        group_name_col = _find_header_col(headers, REGION_NAME_HEADERS)
        if group_code_col < 0 or group_name_col < 0:
            raise CustomsExportVerificationError("missing_region_columns")

    if len(months_covered) > 1 and period_col < 0:
        raise CustomsExportVerificationError(f"multi_month_csv_missing_period_column:headers={headers},rows={len(non_blank)-1},probe={expected_total}")

    allowed_months = set(months_covered)
    requested_clean = [str(c).strip() for c in requested_hs8]
    requested_set = set(requested_clean)

    detail_row_count = 0
    summary_row_count = 0
    summary_usd_sum_dec = Decimal("0")
    summary_usd_nonzero = False
    usd_sum_dec = Decimal("0")
    returned_set: set[str] = set()
    unexpected_hs8: set[str] = set()
    observed_months: set[str] = set()
    out_of_range_months: set[str] = set()

    def _record_summary_row(row_cells: list[str]) -> None:
        nonlocal summary_row_count, summary_usd_sum_dec, summary_usd_nonzero
        summary_row_count += 1
        raw_sum_usd = (row_cells[usd_col].strip() if 0 <= usd_col < len(row_cells) else "").replace(",", "").strip()
        if raw_sum_usd:
            try:
                val = Decimal(raw_sum_usd)
                summary_usd_sum_dec += val
                if val != 0:
                    summary_usd_nonzero = True
            except InvalidOperation:
                summary_usd_nonzero = True

    for line_idx, row in enumerate(non_blank[1:], start=2):
        def get_col(col_idx: int) -> str:
            return row[col_idx].strip() if 0 <= col_idx < len(row) else ""

        raw_hs = get_col(hs_col)
        hs8 = _normalize_hs8_cell(raw_hs)
        if not hs8:
            if not raw_hs or raw_hs.lower() in SUMMARY_LABELS or any(c.strip().lower() in SUMMARY_LABELS for c in row):
                _record_summary_row(row)
                continue
            raise CustomsExportVerificationError(f"invalid_hs8_at_line_{line_idx}:{raw_hs}")

        if grouping != "product":
            gc = get_col(group_code_col)
            gn = get_col(group_name_col)
            is_zero_world = gc in ("0", "00", "000") and (gn == "" or gn.lower() in SUMMARY_LABELS)
            if gc.lower() in SUMMARY_LABELS or gn.lower() in SUMMARY_LABELS or is_zero_world:
                _record_summary_row(row)
                continue
            if not gc or not gn:
                raise CustomsExportVerificationError(f"missing_group_cell_at_line_{line_idx}")

        if hs8 not in requested_set:
            unexpected_hs8.add(hs8)

        if period_col >= 0:
            raw_period = get_col(period_col)
            norm_m = _normalize_month_cell(raw_period)
            if not norm_m:
                raise CustomsExportVerificationError(f"invalid_month_at_line_{line_idx}:{raw_period}")
            observed_months.add(norm_m)
            if norm_m not in allowed_months:
                out_of_range_months.add(norm_m)

        if flow_col >= 0:
            raw_flow = get_col(flow_col)
            if raw_flow:
                norm_flow = _normalize_flow_cell(raw_flow)
                if norm_flow != flow:
                    raise CustomsExportVerificationError(f"flow_mismatch_at_line_{line_idx}:{raw_flow}!={flow}")

        raw_usd_str = get_col(usd_col).replace(",", "").strip()
        if raw_usd_str:
            try:
                usd_sum_dec += Decimal(raw_usd_str)
            except InvalidOperation as exc:
                raise CustomsExportVerificationError(f"invalid_usd_at_line_{line_idx}:{raw_usd_str}") from exc

        detail_row_count += 1
        returned_set.add(hs8)

    if unexpected_hs8:
        raise CustomsExportVerificationError(
            f"unexpected_hs8_in_export:{','.join(sorted(unexpected_hs8))}"
        )

    if out_of_range_months:
        raise CustomsExportVerificationError(
            f"out_of_range_months_in_export:{','.join(sorted(out_of_range_months))}"
        )

    if expected_total < 0:
        raise CustomsExportVerificationError(f"invalid_expected_total:{expected_total}")

    if expected_total == 0:
        if detail_row_count != 0 or summary_row_count != 0:
            raise CustomsExportVerificationError(
                f"row_count_mismatch:exported={detail_row_count},summary={summary_row_count},probe_total=0"
            )
    else:
        if detail_row_count == 0 and (summary_usd_nonzero or summary_row_count > 0):
            raise CustomsExportVerificationError(
                f"summary_only_export_rejected:exported=0,summary={summary_row_count},"
                f"summary_usd={summary_usd_sum_dec},probe_total={expected_total}"
            )
        if detail_row_count == 0:
            raise CustomsExportVerificationError(
                f"row_count_mismatch:exported=0,summary=0,probe_total={expected_total}"
            )
        if detail_row_count != expected_total:
            if (detail_row_count + summary_row_count) != expected_total:
                raise CustomsExportVerificationError(
                    f"row_count_mismatch:exported={detail_row_count},summary={summary_row_count},probe_total={expected_total}"
                )
            if summary_row_count == 1 and summary_usd_nonzero and summary_usd_sum_dec != usd_sum_dec:
                raise CustomsExportVerificationError(
                    f"summary_total_mismatch:exported={detail_row_count},detail_usd={usd_sum_dec},"
                    f"summary_usd={summary_usd_sum_dec},probe_total={expected_total}"
                )

    if bridge_inspection and isinstance(bridge_inspection, dict):
        reported_count = bridge_inspection.get("detailRowCount")
        if reported_count is not None and int(reported_count) != detail_row_count:
            raise CustomsExportVerificationError(
                f"inspection_row_count_mismatch:bridge={reported_count},parsed={detail_row_count}"
            )
        reported_unexpected = bridge_inspection.get("unexpectedHs8") or []
        if reported_unexpected:
            raise CustomsExportVerificationError(
                f"bridge_reported_unexpected_hs8:{','.join(str(x) for x in reported_unexpected)}"
            )

    returned_hs8 = [c for c in requested_clean if c in returned_set]
    unreturned_hs8 = [c for c in requested_clean if c not in returned_set]
    usd_fmt = (
        f"{int(usd_sum_dec):,}"
        if usd_sum_dec == usd_sum_dec.to_integral_value()
        else f"{usd_sum_dec:,.4f}".rstrip("0").rstrip(".")
    )
    return {
        "ok": True,
        "encoding": encoding,
        "headerColumns": headers,
        "hasMonthColumn": period_col >= 0,
        "observedMonths": sorted(observed_months),
        "detailRowCount": detail_row_count,
        "summaryRowCount": summary_row_count,
        "returnedHs8": returned_hs8,
        "unreturnedHs8": unreturned_hs8,
        "unexpectedHs8": [],
        "usdDetailSum": usd_fmt,
    }


@dataclass
class PoliteRatePolicy:
    min_delay_sec: float = 3.5
    max_delay_sec: float = 6.5
    export_cooldown_range: tuple[float, float] | None = None
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

    @property
    def request_count(self) -> int:
        return self._request_count

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

    def record_extra_requests(self, extra_count: int) -> None:
        for _ in range(max(0, int(extra_count))):
            self._request_count += 1
            self.maybe_batch_cooldown()

    def wait_after_export(self) -> float | None:
        if self.export_cooldown_range is not None:
            rest = self.rng.uniform(*self.export_cooldown_range)
            self.sleep_fn(rest)
            return rest
        return None

    def wait_year_cooldown(self, keepalive_fn: Callable[[], None] | None = None) -> float:
        rest = self.rng.uniform(*self.year_cooldown_range)
        if keepalive_fn is not None and rest > 20.0:
            half = rest / 2.0
            self.sleep_fn(half)
            keepalive_fn()
            self.sleep_fn(rest - half)
        else:
            self.sleep_fn(rest)
        return rest


def load_official_dict_batches(dict_csv_path: Path = DEFAULT_DICT_CSV_PATH, group_size: int = 20) -> list[dict[str, Any]]:
    raw_bytes = dict_csv_path.read_bytes()
    canonical_bytes = normalize_line_endings_lf(raw_bytes)
    actual_sha = sha256_hex(canonical_bytes)
    if actual_sha != EXPECTED_DICT_SHA256:
        raise RuntimeError(f"HS dict SHA-256 mismatch: {actual_sha} != {EXPECTED_DICT_SHA256}")

    text = canonical_bytes.decode("utf-8-sig")
    rows = list(csv.DictReader(text.splitlines()))
    codes = [r["HS海关编码"].strip() for r in rows]
    batches: list[dict[str, Any]] = []
    for idx in range(0, len(codes), group_size):
        chunk = codes[idx : idx + group_size]
        gid = f"G{(idx // group_size) + 1:02d}"
        batches.append({"batchKey": gid, "hs8": chunk})
    return batches


def compute_official_select_table_state(
    year: int,
    start_month: int,
    end_month: int,
    current_start_time: str = "202504",
    current_end_time: str = "202610",
) -> int:
    select_start = f"{int(year)}{int(start_month):02d}"
    select_end = f"{int(year)}{int(end_month):02d}"
    c_start = str(current_start_time or "202504").strip().replace("-", "")
    c_end = str(current_end_time or "202610").strip().replace("-", "")
    if select_start >= c_start and c_end >= select_end:
        return 1
    if c_start > select_end:
        return 2
    return 3


def default_end_month_for_year(year: int, latest_complete_month: str = "2026-10") -> int:
    m = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", str(latest_complete_month).strip())
    if not m:
        raise ValueError(f"Invalid latest_complete_month (expected YYYY-MM): {latest_complete_month!r}")
    ly, lm = int(m.group(1)), int(m.group(2))
    if year > ly:
        return 0
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
        ledger: Any | None = None,
        on_session_expired: Callable[[str], None] | None = None,
        log_fn: Callable[[str], None] = print,
    ) -> None:
        self.transport = transport
        self.archive_dir = Path(archive_dir)
        self.rate_policy = rate_policy or PoliteRatePolicy()
        self.latest_complete_month = latest_complete_month
        self.revision = revision
        self.ledger = ledger
        self.on_session_expired = on_session_expired
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

    def _probe_count_serial(
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
        """Execute state-candidate probes strictly one HTTP request per rate-limited single-flight call."""
        get_candidates = getattr(self.transport, "get_state_candidates", None)
        if callable(get_candidates):
            candidates = list(get_candidates(year=year, start_month=start_month, end_month=end_month))
            last_probe: dict[str, Any] = {
                "ok": False,
                "state": None,
                "total": None,
                "isHtmlBlocked": False,
                "circuitBreakRequired": False,
                "reason": "no_state_matched",
            }
            primary_failure: dict[str, Any] | None = None
            rejected_fallback_zero_states: list[int] = []
            for idx, state in enumerate(candidates):
                is_primary = idx == 0
                probe = self._guard_single_flight_call(
                    lambda st=state: self.transport.probe_count(
                        year=year,
                        start_month=start_month,
                        end_month=end_month,
                        month_flag=month_flag,
                        flow=flow,
                        grouping=grouping,
                        hs8=hs8,
                        state_candidates=[st],
                    )
                )
                last_probe = probe
                if probe.get("isHtmlBlocked") or probe.get("circuitBreakRequired"):
                    return probe
                if probe.get("ok"):
                    total_val = probe.get("total")
                    if total_val is not None and int(total_val) == 0 and not is_primary:
                        # 仅允许该月份所属主库（candidates[0]）查询成功后确认零值，绝不采信备用库的 0 条返回
                        rejected_fallback_zero_states.append(int(state))
                        continue
                    return probe
                if is_primary:
                    primary_failure = dict(probe)
                    if probe.get("transientError"):
                        # 所属主库遭遇 502/503/504/网络抖动时立即交由外层退避重试主库，绝不改查备用库
                        return probe
            if primary_failure is not None:
                if rejected_fallback_zero_states:
                    primary_failure["rejectedFallbackZeroStates"] = rejected_fallback_zero_states
                return primary_failure
            if rejected_fallback_zero_states:
                return {
                    "ok": False,
                    "state": None,
                    "total": None,
                    "isHtmlBlocked": False,
                    "circuitBreakRequired": False,
                    "transientError": False,
                    "reason": "fallback_zero_rejected",
                    "rejectedFallbackZeroStates": rejected_fallback_zero_states,
                }
            return last_probe

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
        extra_reqs = max(0, int(probe.get("requestCount", 1)) - 1)
        if extra_reqs > 0:
            self.rate_policy.record_extra_requests(extra_reqs)
        if probe.get("ok") and probe.get("total") is not None and int(probe["total"]) == 0:
            get_anchor = getattr(self.transport, "get_portal_start_anchor", None)
            if callable(get_anchor):
                anchor_ym = get_anchor()
                if isinstance(anchor_ym, str) and re.fullmatch(r"\d{6}", anchor_ym):
                    expected_state = compute_official_select_table_state(
                        year,
                        start_month,
                        end_month,
                        current_start_time=anchor_ym,
                        current_end_time=self.latest_complete_month.replace("-", ""),
                    )
                    if probe.get("state") is None or int(probe["state"]) != expected_state:
                        return {
                            "ok": False,
                            "state": None,
                            "total": None,
                            "isHtmlBlocked": False,
                            "circuitBreakRequired": False,
                            "transientError": False,
                            "reason": f"fallback_zero_state_mismatch:got={probe.get('state')},expected={expected_state}",
                        }
        return probe

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
        keepalive_fn: Callable[[], Any] | None = None,
    ) -> list[dict[str, Any]]:
        # 自动识别海关真站 18 个月当前库/历史库分界线（如 currentStartTime="202504"），避免跨库查询导致月份缺失或报错
        get_anchor = getattr(self.transport, "get_portal_start_anchor", None)
        if callable(get_anchor) and start_month < end_month:
            anchor_ym = get_anchor()
            if isinstance(anchor_ym, str) and re.fullmatch(r"\d{6}", anchor_ym):
                a_year = int(anchor_ym[:4])
                a_month = int(anchor_ym[4:6])
                if a_year == year and start_month < a_month <= end_month:
                    self.log(
                        f"[split-db-boundary] {year}-{start_month:02d}..{year}-{end_month:02d} straddles currentStartTime={anchor_ym} -> "
                        f"{start_month:02d}..{a_month - 1:02d} (historical) + {a_month:02d}..{end_month:02d} (current)"
                    )
                    left = self.collect_task(
                        year=year,
                        start_month=start_month,
                        end_month=a_month - 1,
                        flow=flow,
                        grouping=grouping,
                        batch_key=batch_key,
                        hs8=hs8,
                        keepalive_fn=keepalive_fn,
                    )
                    right = self.collect_task(
                        year=year,
                        start_month=a_month,
                        end_month=end_month,
                        flow=flow,
                        grouping=grouping,
                        batch_key=batch_key,
                        hs8=hs8,
                        keepalive_fn=keepalive_fn,
                    )
                    return left + right

        months_covered = [f"{year}-{m:02d}" for m in range(start_month, end_month + 1)]
        target_dir = self.archive_dir / str(year) / flow / grouping / batch_key / self.revision
        stem = f"customs_{DICT_VERSION}_{year}_{start_month:02d}-{end_month:02d}_{flow}_{grouping}_{batch_key}_{self.revision}"

        month_range_label = f"{year}-{start_month:02d}..{year}-{end_month:02d}"
        sorted_hs8 = sorted(hs8)
        task_key = f"{DICT_VERSION}|{month_range_label}|{flow}|{grouping}|{batch_key}|{','.join(sorted_hs8)}"

        def _assert_no_archive_scope_conflict() -> None:
            if not target_dir.exists():
                return
            months_set = set(months_covered)
            for mf_path in sorted(target_dir.glob("*.manifest.json")):
                try:
                    existing_mf = json.loads(mf_path.read_text(encoding="utf-8"))
                except Exception as exc:
                    if mf_path.name == f"{stem}.manifest.json":
                        raise CustomsArchiveConflictError(
                            f"ARCHIVE_SCOPE_OVERWRITE_REFUSED: existing manifest {mf_path} is unreadable ({exc}); refusing to overwrite"
                        ) from exc
                    continue
                existing_hs8 = sorted(str(c).strip() for c in (existing_mf.get("hs8") or []) if str(c).strip())
                existing_months = existing_mf.get("months")
                if not isinstance(existing_months, list):
                    single_m = existing_mf.get("month")
                    existing_months = [single_m] if single_m else []
                existing_month_set = {str(m) for m in existing_months}
                same_stem = mf_path.name == f"{stem}.manifest.json"
                overlaps_window = bool(months_set & existing_month_set)
                if (same_stem or overlaps_window) and existing_hs8 != sorted_hs8:
                    raise CustomsArchiveConflictError(
                        f"ARCHIVE_SCOPE_OVERWRITE_REFUSED: existing archive '{mf_path.name}' covers different HS8 scope "
                        f"({len(existing_hs8)} codes vs requested {len(sorted_hs8)} codes) for overlapping window; "
                        "use a separate --archive-dir or bump --revision instead of changing --group-size in place."
                    )

        _assert_no_archive_scope_conflict()

        def _extract_meta_hs8_scope(meta_obj: dict[str, Any]) -> list[str] | None:
            raw_req = meta_obj.get("requestedHs8")
            if isinstance(raw_req, list) and raw_req:
                return sorted({str(c).strip() for c in raw_req if str(c).strip()})
            raw_hs = meta_obj.get("hs8")
            if isinstance(raw_hs, list) and raw_hs:
                return sorted({str(c).strip() for c in raw_hs if str(c).strip()})
            insp = meta_obj.get("inspection")
            if isinstance(insp, dict):
                ret = insp.get("returnedHs8")
                unret = insp.get("unreturnedHs8")
                if isinstance(ret, list) or isinstance(unret, list):
                    combined = {
                        str(c).strip()
                        for c in [*(ret if isinstance(ret, list) else []), *(unret if isinstance(unret, list) else [])]
                        if str(c).strip()
                    }
                    if combined:
                        return sorted(combined)
            fp = meta_obj.get("queryFingerprint")
            if isinstance(fp, str):
                m_fp = re.search(r"\|hs8=([0-9,]+)$", fp.strip())
                if m_fp:
                    parsed_fp = sorted({c.strip() for c in m_fp.group(1).split(",") if c.strip()})
                    if parsed_fp:
                        return parsed_fp
            return None

        def _is_archived_task_valid_on_disk() -> bool:
            mf_path = target_dir / f"{stem}.manifest.json"
            meta_path = target_dir / f"{stem}.meta.json"
            csv_path = target_dir / f"{stem}.raw.csv"
            png_path = target_dir / f"{stem}.empty.png"
            has_csv = csv_path.exists()
            has_png = png_path.exists()
            if not (mf_path.exists() and meta_path.exists() and (has_csv or has_png)):
                return False
            if has_csv and has_png:
                return False
            try:
                existing_mf = json.loads(mf_path.read_text(encoding="utf-8"))
                existing_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                return False
            if not isinstance(existing_mf, dict) or not isinstance(existing_meta, dict):
                return False
            if (
                existing_mf.get("dictVersion") != DICT_VERSION
                or existing_mf.get("flow") != flow
                or existing_mf.get("grouping") != grouping
            ):
                return False
            existing_months = existing_mf.get("months")
            if not isinstance(existing_months, list):
                single_m = existing_mf.get("month")
                existing_months = [single_m] if single_m else []
            if [str(m) for m in existing_months] != months_covered:
                return False
            existing_hs8 = sorted(str(c).strip() for c in (existing_mf.get("hs8") or []) if str(c).strip())
            if existing_hs8 != sorted_hs8:
                return False
            meta_hs8 = _extract_meta_hs8_scope(existing_meta)
            if meta_hs8 != sorted_hs8:
                return False

            if has_csv:
                expected_sha = str(existing_meta.get("sha256") or "").strip().lower()
                if not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
                    return False
                csv_bytes = csv_path.read_bytes()
                if sha256_hex(csv_bytes) != expected_sha:
                    return False
                if existing_meta.get("byteLength") is not None and len(csv_bytes) != int(existing_meta["byteLength"]):
                    return False
                return True

            expected_png_sha = str(existing_meta.get("emptyPngSha256") or "").strip().lower()
            if not re.fullmatch(r"[0-9a-f]{64}", expected_png_sha):
                return False
            png_bytes = png_path.read_bytes()
            if sha256_hex(png_bytes) != expected_png_sha:
                return False
            try:
                validate_evidence_png(png_bytes)
            except Exception:
                return False
            return True

        if task_key in self.completed_keys:
            if _is_archived_task_valid_on_disk():
                self.log(f"[skip-checkpoint] {task_key}")
                return [{"status": "skipped_checkpoint", "monthRange": month_range_label}]
            self.log(f"[stale-checkpoint] Archived artifact or metadata missing/corrupted for {stem}; re-collecting...")
            self.completed_keys.discard(task_key)

        month_flag = "1"

        def _probe_with_retries(stage_label: str) -> dict[str, Any]:
            res: dict[str, Any] = {}
            for attempt in range(3):
                res = self._probe_count_serial(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    month_flag=month_flag,
                    flow=flow,
                    grouping=grouping,
                    hs8=hs8,
                )
                if not res.get("transientError") or attempt >= 2:
                    break
                self.log(
                    f"[transient-retry] {stage_label} {month_range_label} {flow}/{grouping} {batch_key} hit {res.get('reason')}, resting 22s before retry {attempt + 1}/2..."
                )
                self.rate_policy.sleep_fn(22.0)
                if callable(keepalive_fn):
                    keepalive_fn()

            if res.get("isHtmlBlocked") or res.get("circuitBreakRequired"):
                reason_str = str(res.get("reason") or "html_or_waf_challenge")
                self._save_checkpoint(halted_reason="html_or_waf_challenge")
                if self.ledger is not None:
                    self.ledger.set_status(
                        session_status=f"🔴 会话需人工重输验证码（已保存断点：`{reason_str}`）",
                        current_activity=f"{stage_label} `{month_range_label} {flow}/{grouping} {batch_key}` 触发会话门禁，已暂停等待解锁",
                    )
                if callable(self.on_session_expired):
                    self.on_session_expired(reason_str)
                raise CustomsCircuitBreakError(
                    f"Circuit breaker tripped during {stage_label} ({month_range_label} {flow}/{grouping}): {reason_str}"
                )

            if not res.get("ok"):
                self._save_checkpoint(halted_reason=f"probe_failed:{res.get('reason')}")
                raise CustomsCircuitBreakError(f"{stage_label} failed without valid count: {res}")
            return res

        def _bisect_if_possible(current_total: int) -> list[dict[str, Any]] | None:
            if start_month < end_month:
                mid = (start_month + end_month) // 2
                self.log(f"[bisect-months] {month_range_label} total={current_total} >= {MAX_SAFE_ROWS} -> {start_month}..{mid} & {mid+1}..{end_month}")
                left = self.collect_task(
                    year=year,
                    start_month=start_month,
                    end_month=mid,
                    flow=flow,
                    grouping=grouping,
                    batch_key=batch_key,
                    hs8=hs8,
                    keepalive_fn=keepalive_fn,
                )
                right = self.collect_task(
                    year=year,
                    start_month=mid + 1,
                    end_month=end_month,
                    flow=flow,
                    grouping=grouping,
                    batch_key=batch_key,
                    hs8=hs8,
                    keepalive_fn=keepalive_fn,
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
                    keepalive_fn=keepalive_fn,
                )
                right = self.collect_task(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    flow=flow,
                    grouping=grouping,
                    batch_key=f"{batch_key}B",
                    hs8=hs8[half:],
                    keepalive_fn=keepalive_fn,
                )
                return left + right
            return None

        def _archive_zero_result_evidence(zero_probe: dict[str, Any], zero_state: int) -> list[dict[str, Any]]:
            _assert_no_archive_scope_conflict()
            expected_fp = build_zero_query_fingerprint(
                year=year,
                start_month=start_month,
                end_month=end_month,
                month_flag=month_flag,
                flow=flow,
                grouping=grouping,
                state=zero_state,
                hs8=hs8,
            )
            prepare_view = getattr(self.transport, "prepare_empty_evidence_view", None)
            clear_view = getattr(self.transport, "clear_empty_evidence_view", None)
            if not callable(prepare_view):
                self._save_checkpoint(halted_reason="empty_evidence_view_sync_unsupported")
                raise CustomsScreenshotError(
                    "Transport does not implement prepare_empty_evidence_view; refusing to capture unverified stale page screenshot"
                )
            zero_ev = zero_probe.get("zeroEvidence") if isinstance(zero_probe.get("zeroEvidence"), dict) else {}
            try:
                sync_res = prepare_view(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    month_flag=month_flag,
                    flow=flow,
                    grouping=grouping,
                    hs8=hs8,
                    state=zero_state,
                    probe=zero_probe,
                )
                if (
                    not isinstance(sync_res, dict)
                    or sync_res.get("rendered") is not True
                    or sync_res.get("queryFingerprint") != expected_fp
                    or int(sync_res.get("officialTotal", -1)) != 0
                ):
                    raise CustomsScreenshotError(
                        f"Visible page evidence view did not match current zero-result query (expected={expected_fp}, got={sync_res!r})"
                    )
                png_bytes = self.transport.capture_empty_png()
                png_w, png_h = validate_evidence_png(png_bytes)
            except Exception as exc:
                self._save_checkpoint(halted_reason=f"empty_screenshot_failed:{exc}")
                raise CustomsScreenshotError(
                    f"Failed to capture verified empty-result screenshot ({month_range_label} {flow}/{grouping}): {exc}"
                ) from exc
            finally:
                if callable(clear_view):
                    try:
                        clear_view()
                    except Exception:
                        pass

            target_dir.mkdir(parents=True, exist_ok=True)
            png_sha = sha256_hex(png_bytes)
            png_path = target_dir / f"{stem}.empty.png"
            png_path.write_bytes(png_bytes)
            stale_csv_path = target_dir / f"{stem}.raw.csv"
            if stale_csv_path.exists():
                stale_csv_path.unlink()

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
                        "requestedHs8": list(hs8),
                        "officialTotal": 0,
                        "queryFingerprint": expected_fp,
                        "officialProbeResponseSha256": zero_ev.get("responseSha256") or sync_res.get("responseSha256"),
                        "evidenceViewSynced": True,
                        "emptyPngFilename": png_path.name,
                        "emptyPngSha256": png_sha,
                        "emptyPngDimensions": {"width": png_w, "height": png_h},
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
            if self.ledger is not None:
                self.ledger.record_batch(
                    stem=stem,
                    dict_version=DICT_VERSION,
                    year=year,
                    month_range=month_range_label,
                    months_count=len(months_covered),
                    flow=flow,
                    grouping=grouping,
                    batch_key=batch_key,
                    requested_hs8_count=len(hs8),
                    select_table_state=zero_state,
                    official_probe_total=0,
                    status="confirmed_empty",
                    encoding_name="png",
                    byte_length=len(png_bytes),
                    detail_row_count=0,
                    returned_hs8_count=0,
                    empty_hs8_count=len(hs8),
                    usd_detail_sum="0",
                    sha256=png_sha,
                )
            return [{"status": "confirmed_empty", "monthRange": month_range_label, "sha256": png_sha}]

        probe = _probe_with_retries("预检")
        total = int(probe["total"])
        state = int(probe["state"])

        if total >= MAX_SAFE_ROWS:
            bisected = _bisect_if_possible(total)
            if bisected is not None:
                return bisected

        if total == 0:
            return _archive_zero_result_evidence(probe, state)

        raw_bytes = b""
        actual_sha = ""
        verified: dict[str, Any] = {}
        for verify_try in range(3):
            if verify_try > 0:
                re_probe = _probe_with_retries("重预检")
                total = int(re_probe["total"])
                state = int(re_probe["state"])
                if total == 0:
                    self.log(
                        f"[reprobe-zero] Re-probe on {month_range_label} {flow}/{grouping} {batch_key} returned total=0; switching to verified zero-result evidence flow."
                    )
                    return _archive_zero_result_evidence(re_probe, state)
                if total >= MAX_SAFE_ROWS:
                    bisected = _bisect_if_possible(total)
                    if bisected is not None:
                        return bisected

            export_res: dict[str, Any] = {}
            for attempt in range(3):
                export_res = self._guard_single_flight_call(
                    lambda st=state: self.transport.fetch_raw_export(
                        year=year,
                        start_month=start_month,
                        end_month=end_month,
                        month_flag=month_flag,
                        flow=flow,
                        grouping=grouping,
                        hs8=hs8,
                        state=st,
                    )
                )
                self.rate_policy.wait_after_export()
                if export_res.get("ok") or not export_res.get("transientError") or attempt >= 2:
                    break
                self.log(
                    f"[transient-retry] Export {month_range_label} {flow}/{grouping} {batch_key} hit {export_res.get('reason')}, resting 25s before retry {attempt + 1}/2..."
                )
                self.rate_policy.sleep_fn(25.0)
                if callable(keepalive_fn):
                    keepalive_fn()

            if not export_res.get("ok"):
                reason_str = str(export_res.get("reason") or "export_failed")
                if export_res.get("circuitBreakRequired"):
                    self._save_checkpoint(halted_reason="html_or_waf_challenge")
                    if self.ledger is not None:
                        self.ledger.set_status(
                            session_status=f"🔴 会话需人工重输验证码（已保存断点：`{reason_str}`）",
                            current_activity=f"导出 `{month_range_label} {flow}/{grouping} {batch_key}` 触发会话门禁，已暂停等待解锁",
                        )
                    if callable(self.on_session_expired):
                        self.on_session_expired(reason_str)
                    raise CustomsCircuitBreakError(
                        f"Circuit breaker tripped during export ({month_range_label} {flow}/{grouping}): {reason_str}"
                    )
                if verify_try < 2:
                    self.log(
                        f"[server-cache-retry] Export {month_range_label} {flow}/{grouping} {batch_key} rejected ({reason_str}); resting 15s and re-probing ({verify_try + 1}/2)..."
                    )
                    self.rate_policy.sleep_fn(15.0)
                    continue
                self._save_checkpoint(halted_reason=f"export_failed:{reason_str}")
                raise CustomsCircuitBreakError(f"Export failed: {export_res}")

            raw_bytes = base64.b64decode(export_res["base64"])
            actual_sha = sha256_hex(raw_bytes)
            if actual_sha != export_res["sha256"]:
                self._save_checkpoint(halted_reason="ipc_sha256_mismatch")
                raise RuntimeError(f"IPC byte integrity mismatch: {actual_sha} != {export_res['sha256']}")

            try:
                verified = verify_exported_csv(
                    raw_bytes,
                    expected_total=total,
                    months_covered=months_covered,
                    requested_hs8=hs8,
                    flow=flow,
                    grouping=grouping,
                    bridge_inspection=export_res.get("inspection"),
                )
                break
            except CustomsExportVerificationError as exc:
                if verify_try < 2:
                    self.log(
                        f"[server-cache-retry] Verification rejected contaminated/mismatched export on {month_range_label} {flow}/{grouping} {batch_key} ({exc}); resting 15s and re-probing ({verify_try + 1}/2)..."
                    )
                    self.rate_policy.sleep_fn(15.0)
                    continue
                if "multi_month_csv_missing_period_column" in str(exc) and (start_month < end_month or len(hs8) > 1):
                    self.log(
                        f"[fallback-bisect] {month_range_label} {flow}/{grouping} {batch_key} dropped month column at total={total}; resting 15s and bisecting..."
                    )
                    self.rate_policy.sleep_fn(15.0)
                    if start_month < end_month:
                        mid = (start_month + end_month) // 2
                        left = self.collect_task(
                            year=year,
                            start_month=start_month,
                            end_month=mid,
                            flow=flow,
                            grouping=grouping,
                            batch_key=batch_key,
                            hs8=hs8,
                            keepalive_fn=keepalive_fn,
                        )
                        right = self.collect_task(
                            year=year,
                            start_month=mid + 1,
                            end_month=end_month,
                            flow=flow,
                            grouping=grouping,
                            batch_key=batch_key,
                            hs8=hs8,
                            keepalive_fn=keepalive_fn,
                        )
                        return left + right
                    half = len(hs8) // 2
                    left = self.collect_task(
                        year=year,
                        start_month=start_month,
                        end_month=end_month,
                        flow=flow,
                        grouping=grouping,
                        batch_key=f"{batch_key}A",
                        hs8=hs8[:half],
                        keepalive_fn=keepalive_fn,
                    )
                    right = self.collect_task(
                        year=year,
                        start_month=start_month,
                        end_month=end_month,
                        flow=flow,
                        grouping=grouping,
                        batch_key=f"{batch_key}B",
                        hs8=hs8[half:],
                        keepalive_fn=keepalive_fn,
                    )
                    return left + right
                self._save_checkpoint(halted_reason=f"export_verification_failed:{exc}")
                raise CustomsExportVerificationError(
                    f"Export verification failed ({month_range_label} {flow}/{grouping} {batch_key}): {exc}"
                ) from exc

        _assert_no_archive_scope_conflict()
        target_dir.mkdir(parents=True, exist_ok=True)
        csv_path = target_dir / f"{stem}.raw.csv"
        csv_path.write_bytes(raw_bytes)
        stale_png_path = target_dir / f"{stem}.empty.png"
        if stale_png_path.exists():
            stale_png_path.unlink()

        manifest_obj = {
            "dictVersion": DICT_VERSION,
            "month": months_covered[0],
            "months": months_covered,
            "flow": flow,
            "currency": "USD",
            "grouping": grouping,
            "hs8": hs8,
            "emptyHs8": verified["unreturnedHs8"],
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
                    "requestedHs8": list(hs8),
                    "officialProbeTotal": total,
                    "selectTableState": state,
                    "savedCsvFilename": csv_path.name,
                    "sha256": actual_sha,
                    "byteLength": len(raw_bytes),
                    "inspection": verified,
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
        if self.ledger is not None:
            self.ledger.record_batch(
                stem=stem,
                dict_version=DICT_VERSION,
                year=year,
                month_range=month_range_label,
                months_count=len(months_covered),
                flow=flow,
                grouping=grouping,
                batch_key=batch_key,
                requested_hs8_count=len(hs8),
                select_table_state=state,
                official_probe_total=total,
                status="received",
                encoding_name=str(verified.get("encoding") or "csv"),
                byte_length=len(raw_bytes),
                detail_row_count=int(verified["detailRowCount"]),
                returned_hs8_count=len(verified["returnedHs8"]),
                empty_hs8_count=len(verified["unreturnedHs8"]),
                usd_detail_sum=str(verified.get("usdDetailSum") or "0"),
                sha256=actual_sha,
            )
        self.log(
            f"[saved] {csv_path.name} ({len(raw_bytes)} B, rows={verified['detailRowCount']}, usd={verified.get('usdDetailSum')}, sha256={actual_sha[:12]}…)"
        )
        return [{"status": "received", "monthRange": month_range_label, "sha256": actual_sha, "csvPath": str(csv_path)}]

    def run_plan(
        self,
        *,
        years: list[int],
        batches: list[dict[str, Any]],
        flows: list[str] = ORDERED_FLOWS,
        groupings: list[str] = ORDERED_GROUPINGS,
        batches_by_grouping: dict[str, list[dict[str, Any]]] | None = None,
        start_month_override: int | None = None,
        end_month_override: int | None = None,
        keepalive_fn: Callable[[], None] | None = None,
    ) -> list[dict[str, Any]]:
        all_outcomes: list[dict[str, Any]] = []
        runnable_years: list[tuple[int, int, int]] = []
        for year in years:
            max_end_m = default_end_month_for_year(year, self.latest_complete_month)
            start_m = int(start_month_override) if start_month_override else 1
            end_m = min(int(end_month_override), max_end_m) if end_month_override else max_end_m
            if end_m < 1 or end_m < start_m:
                self.log(
                    f"[skip-year-after-cutoff] year={year} (window {start_m:02d}..{end_m:02d}) exceeds latest_complete_month={self.latest_complete_month}"
                )
                continue
            runnable_years.append((year, start_m, end_m))

        for y_idx, (year, start_m, end_m) in enumerate(runnable_years):
            if batches_by_grouping:
                for grouping in groupings:
                    grp_batches = batches_by_grouping.get(grouping, batches)
                    for batch in grp_batches:
                        year_hs8 = [c for c in batch["hs8"] if not (year == 2022 and c == "90189080")]
                        if not year_hs8:
                            continue
                        for flow in flows:
                            res = self.collect_task(
                                year=year,
                                start_month=start_m,
                                end_month=end_m,
                                flow=flow,
                                grouping=grouping,
                                batch_key=batch["batchKey"],
                                hs8=year_hs8,
                                keepalive_fn=keepalive_fn,
                            )
                            all_outcomes.extend(res)
            else:
                for batch in batches:
                    year_hs8 = [c for c in batch["hs8"] if not (year == 2022 and c == "90189080")]
                    if not year_hs8:
                        continue
                    for flow in flows:
                        for grouping in groupings:
                            res = self.collect_task(
                                year=year,
                                start_month=start_m,
                                end_month=end_m,
                                flow=flow,
                                grouping=grouping,
                                batch_key=batch["batchKey"],
                                hs8=year_hs8,
                                keepalive_fn=keepalive_fn,
                            )
                            all_outcomes.extend(res)
            if y_idx + 1 < len(runnable_years):
                rest = self.rate_policy.wait_year_cooldown(keepalive_fn=keepalive_fn)
                self.log(f"[year-cooldown] Completed {year}, resting {rest:.1f}s before {runnable_years[y_idx + 1][0]}...")
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

    def __init__(
        self,
        *,
        cdp_url: str | None = None,
        userscript_path: Path = DEFAULT_USERSCRIPT_PATH,
        rate_policy: PoliteRatePolicy | None = None,
    ) -> None:
        _inject_browser_harness_site_packages()
        policy = rate_policy or PoliteRatePolicy()
        self._min_delay_ms = int(round(policy.min_delay_sec * 1000))
        self._max_delay_ms = int(round(policy.max_delay_sec * 1000))
        daemon_name = "mdes-customs-9336" if cdp_url else "default"
        if cdp_url:
            os.environ["BU_NAME"] = daemon_name
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))

        from browser_harness import admin as bh_admin  # type: ignore
        from browser_harness import helpers as bh  # type: ignore

        from agent_helpers import disable_customs_debugger_traps, inject_customs_suite_bridge

        daemon_env = dict(os.environ)
        if cdp_url:
            cdp_ws = bh_admin._cdp_ws_from_url(cdp_url)
            os.environ["BU_CDP_WS"] = cdp_ws
            daemon_env.update({"BU_NAME": daemon_name, "BU_CDP_WS": cdp_ws})
            bh_admin.NAME = daemon_name
            bh.NAME = daemon_name

        bh_admin.ensure_daemon(name=daemon_name, env=daemon_env)
        self._bh_admin = bh_admin
        self._daemon_name = daemon_name
        self._daemon_env = daemon_env
        self._bh = bh
        tabs = bh.list_tabs()
        customs_tab = next((t for t in tabs if "customs.gov.cn" in (t.get("url") or "")), None)
        if customs_tab:
            bh.switch_tab(customs_tab, activate=False)
            bh.wait_for_load(timeout=20.0)
            time.sleep(1.5)
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
        self._portal_start_anchor: str | None = None
        try:
            anc = self._eval_async_js(
                "(() => { const ifr = document.querySelector('iframe'); const d = (ifr && ifr.contentDocument) || document; const el = d.getElementById('currentStartTime'); return el && el.value ? String(el.value).trim() : '202504'; })()",
                timeout=10.0,
            )
            if isinstance(anc, str) and re.fullmatch(r"\d{6}", anc):
                self._portal_start_anchor = anc
        except Exception:
            self._portal_start_anchor = "202504"

    def get_portal_start_anchor(self) -> str | None:
        return getattr(self, "_portal_start_anchor", None)

    def _eval_async_js(self, expression: str, timeout: float = 60.0) -> Any:
        resp = self._bh.cdp(
            "Runtime.evaluate",
            expression=expression,
            returnByValue=True,
            awaitPromise=True,
            _response_timeout=timeout,
        )
        return self._bh._runtime_value(resp, expression)

    def _eval_with_daemon_recovery(self, expression: str, timeout: float = 145.0) -> Any:
        bh_admin = getattr(self, "_bh_admin", None)
        if bh_admin is None:
            return self._eval_async_js(expression, timeout=timeout)

        for attempt in range(3):
            try:
                self.ensure_bridge()
                return self._eval_async_js(expression, timeout=timeout)
            except Exception as exc:
                err_name = type(exc).__name__
                err_msg = str(exc)
                is_ipc_timeout = "Timeout" in err_name or "timed out" in err_msg.lower() or "BrokenPipe" in err_name or "Connection" in err_name
                if not is_ipc_timeout or attempt >= 2:
                    raise
                print(
                    f"[daemon-recovery] IPC timeout/disconnect ({err_name}: {err_msg}), resting 20s and re-syncing daemon ({attempt + 1}/2)...",
                    flush=True,
                )
                time.sleep(20.0)
                try:
                    bh_admin.restart_daemon(name=self._daemon_name)
                except Exception:
                    bh_admin.ensure_daemon(name=self._daemon_name, env=self._daemon_env)
                tabs = self._bh.list_tabs()
                customs_tab = next((t for t in tabs if "customs.gov.cn" in (t.get("url") or "")), None)
                if customs_tab:
                    self._bh.switch_tab(customs_tab, activate=False)
                from agent_helpers import disable_customs_debugger_traps, inject_customs_suite_bridge

                disable_customs_debugger_traps(self._bh.cdp)
                inject_customs_suite_bridge(self._eval_async_js, self.userscript_path)

    def ensure_bridge(self) -> None:
        present = self._eval_async_js("Boolean(window.__CUSTOMS_SUITE_BRIDGE__)", timeout=12.0)
        if not present:
            from agent_helpers import disable_customs_debugger_traps, inject_customs_suite_bridge

            disable_customs_debugger_traps(self._bh.cdp)
            inject_customs_suite_bridge(self._eval_async_js, self.userscript_path)

    def get_state_candidates(self, *, year: int, start_month: int, end_month: int) -> list[int]:
        res = self._eval_with_daemon_recovery(
            f"window.__CUSTOMS_SUITE_BRIDGE__.getStateCandidates({int(year)}, {int(start_month)}, {int(end_month)})",
            timeout=20.0,
        )
        if isinstance(res, list) and res:
            return [int(x) for x in res]
        primary = compute_official_select_table_state(
            year,
            start_month,
            end_month,
            current_start_time=self.get_portal_start_anchor() or "202504",
        )
        return [primary, *[s for s in (1, 2, 3) if s != primary]]

    def check_session_ready(self) -> dict[str, Any]:
        payload = json.dumps({"minDelayMs": self._min_delay_ms, "maxDelayMs": self._max_delay_ms})
        return self._eval_with_daemon_recovery(
            f"window.__CUSTOMS_SUITE_BRIDGE__.checkSessionReady({payload})",
            timeout=75.0,
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
        state_candidates: list[int] | None = None,
    ) -> dict[str, Any]:
        req: dict[str, Any] = {
            "year": year,
            "startMonth": start_month,
            "endMonth": end_month,
            "monthFlag": month_flag,
            "flow": flow,
            "grouping": grouping,
            "hs8": hs8,
            "minDelayMs": self._min_delay_ms,
            "maxDelayMs": self._max_delay_ms,
        }
        if state_candidates is not None:
            req["stateCandidates"] = [int(s) for s in state_candidates]
        payload = json.dumps(req)
        return self._eval_with_daemon_recovery(f"window.__CUSTOMS_SUITE_BRIDGE__.probeCount({payload})", timeout=145.0)

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
                "minDelayMs": self._min_delay_ms,
                "maxDelayMs": self._max_delay_ms,
            }
        )
        return self._eval_with_daemon_recovery(
            f"window.__CUSTOMS_SUITE_BRIDGE__.fetchRawExportBase64({payload})", timeout=200.0
        )

    def prepare_empty_evidence_view(
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
        probe: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        zero_ev = probe.get("zeroEvidence") if isinstance(probe, dict) and isinstance(probe.get("zeroEvidence"), dict) else {}
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
                "officialTotal": 0,
                "responseSha256": zero_ev.get("responseSha256", ""),
                "officialResponseExcerpt": zero_ev.get("officialResponseExcerpt", ""),
                "requestParams": zero_ev.get("requestParams", ""),
                "checkedAt": zero_ev.get("checkedAt"),
            }
        )
        return self._eval_with_daemon_recovery(
            f"window.__CUSTOMS_SUITE_BRIDGE__.renderEmptyQueryEvidence({payload})", timeout=30.0
        )

    def clear_empty_evidence_view(self) -> bool:
        try:
            res = self._eval_async_js("window.__CUSTOMS_SUITE_BRIDGE__.clearEmptyQueryEvidence()", timeout=10.0)
            return bool(res)
        except Exception:
            return False

    def capture_empty_png(self) -> bytes:
        res = self._bh.cdp("Page.captureScreenshot", format="png")
        if not isinstance(res, dict) or not isinstance(res.get("data"), str) or not res["data"].strip():
            raise CustomsScreenshotError(f"Page.captureScreenshot failed: missing screenshot data ({res!r})")
        try:
            png_bytes = base64.b64decode(res["data"])
        except Exception as exc:
            raise CustomsScreenshotError(f"Page.captureScreenshot returned invalid base64: {exc}") from exc
        validate_evidence_png(png_bytes)
        return png_bytes


def resolve_archive_dir(args: argparse.Namespace) -> Path:
    """Resolve archive directory, isolating --pilot runs into data/customs-raw-pilot by default."""
    if getattr(args, "archive_dir", None):
        return Path(args.archive_dir)
    if getattr(args, "pilot", False):
        return DEFAULT_PILOT_ARCHIVE_DIR
    return DEFAULT_ARCHIVE_DIR


def resolve_repo_ledger_path(args: argparse.Namespace) -> Path:
    """Resolve real-time ledger path, isolating --pilot and custom --archive-dir runs from the official ledger."""
    if getattr(args, "repo_ledger", None):
        return Path(args.repo_ledger)
    archive_dir = resolve_archive_dir(args)
    if getattr(args, "pilot", False):
        return archive_dir / "_pilot_ledger.md"
    if getattr(args, "archive_dir", None) and archive_dir.resolve() != DEFAULT_ARCHIVE_DIR.resolve():
        return archive_dir / "_collection_ledger.md"
    return DEFAULT_REPO_LEDGER_PATH


def build_collection_batches(
    args: argparse.Namespace,
    *,
    dict_csv_path: Path = DEFAULT_DICT_CSV_PATH,
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]] | None, str]:
    """Build default and per-grouping batches while applying --groups filter uniformly across all dimensions."""
    years = [int(y.strip()) for y in str(args.years).split(",") if y.strip()]
    if getattr(args, "pilot", False):
        return (
            [{"batchKey": "PILOT-90181100", "hs8": PILOT_HS8}],
            None,
            f"90181100 试点核验（年份：{','.join(str(y) for y in years)}）",
        )

    wanted = {g.strip().upper() for g in str(getattr(args, "groups", "") or "").split(",") if g.strip()}
    all_batches = load_official_dict_batches(dict_csv_path=dict_csv_path, group_size=int(args.group_size))
    batches = [b for b in all_batches if b["batchKey"] in wanted] if wanted else all_batches

    batches_by_grouping: dict[str, list[dict[str, Any]]] | None = None
    grouping_sizes_raw = str(getattr(args, "grouping_sizes", "") or "").strip()
    if grouping_sizes_raw:
        batches_by_grouping = {}
        size_desc = []
        for kv in grouping_sizes_raw.split(","):
            if ":" in kv:
                gk, gv = kv.split(":", 1)
                gk_clean = gk.strip()
                gs_int = int(gv.strip())
                dim_batches = load_official_dict_batches(dict_csv_path=dict_csv_path, group_size=gs_int)
                if wanted:
                    dim_batches = [b for b in dim_batches if b["batchKey"] in wanted]
                batches_by_grouping[gk_clean] = dim_batches
                size_desc.append(f"{gk_clean}={gs_int}")
        filter_suffix = f"，定向组={','.join(sorted(wanted))}" if wanted else ""
        mode_label = (
            f"全量 164 码低频串行采集（年份：{','.join(str(y) for y in years)}，"
            f"自适应分组大小：{','.join(size_desc)}{filter_suffix}）"
        )
    else:
        mode_label = (
            f"全量 164 码低频串行采集（年份：{','.join(str(y) for y in years)}，"
            f"分组大小={args.group_size}，批次组数={len(batches)}）"
        )
    return batches, batches_by_grouping, mode_label


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Low-frequency compliant serial China Customs collector (browser-harness).")
    p.add_argument("--years", default="2024", help="Comma-separated years, e.g. 2022,2023,2024,2025,2026")
    p.add_argument("--pilot", action="store_true", help="Collect only pilot HS8 90181100 into isolated data/customs-raw-pilot by default")
    p.add_argument("--group-size", type=int, default=20, help="HS8 codes per batch group (default 20)")
    p.add_argument(
        "--grouping-sizes",
        default="",
        help="Optional per-grouping HS8 batch sizes, e.g. product:164,regime:41,region:28,partner:20",
    )
    p.add_argument("--groups", default="", help="Optional comma-separated group IDs, e.g. G01,G02")
    p.add_argument("--flows", default="import,export", help="Comma-separated flows: import,export")
    p.add_argument("--groupings", default="product,partner,regime,region", help="Comma-separated groupings")
    p.add_argument("--start-month", type=int, default=0, help="Optional start month override (1..12)")
    p.add_argument("--end-month", type=int, default=0, help="Optional end month override (1..12)")
    p.add_argument("--min-delay", type=float, default=3.5, help="Minimum delay (sec) before each request (>=2.5)")
    p.add_argument("--max-delay", type=float, default=6.5, help="Maximum delay (sec) before each request")
    p.add_argument("--export-cooldown-min", type=float, default=8.0, help="Additional post-export cooldown sec (combined with JS lock >=13s)")
    p.add_argument("--export-cooldown-max", type=float, default=10.5, help="Additional post-export cooldown sec")
    p.add_argument("--cdp-port", type=int, default=9336, help="Standalone Chromium remote debugging port (default 9336)")
    p.add_argument("--use-running-chrome", action="store_true", help="Attach to existing running Chrome instead of dedicated port")
    p.add_argument(
        "--repo-ledger",
        default=None,
        help="Path to real-time markdown ledger (defaults to isolated _pilot_ledger.md with --pilot, _collection_ledger.md with custom --archive-dir, else docs/海关2022_2026实采进度实时台账.md)",
    )
    p.add_argument("--artifact-ledger", default="", help="Optional path to artifact real-time markdown ledger")
    p.add_argument(
        "--archive-dir",
        default=None,
        help="Target raw archive directory (defaults to data/customs-raw-pilot with --pilot, else data/customs-raw)",
    )
    p.add_argument("--latest-month", default="2026-10", help="Latest complete YYYY-MM for current year")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))
    from live_ledger import (
        LiveCollectionLedger,
        clear_session_expired_alert,
        send_session_keepalive,
        trigger_session_expired_alert,
    )

    policy = PoliteRatePolicy(
        min_delay_sec=args.min_delay,
        max_delay_sec=args.max_delay,
        export_cooldown_range=(args.export_cooldown_min, args.export_cooldown_max),
    )
    archive_dir = resolve_archive_dir(args)
    repo_ledger_path = resolve_repo_ledger_path(args)
    years = [int(y.strip()) for y in args.years.split(",") if y.strip()]
    flows = [f.strip() for f in args.flows.split(",") if f.strip()]
    groupings = [g.strip() for g in args.groupings.split(",") if g.strip()]

    batches, batches_by_grouping, mode_label = build_collection_batches(args)

    ledger = LiveCollectionLedger(
        archive_dir=archive_dir,
        repo_ledger_path=repo_ledger_path,
        artifact_ledger_path=Path(args.artifact_ledger) if args.artifact_ledger.strip() else None,
        mode_label=mode_label,
    )

    cdp_url = None if args.use_running_chrome else ensure_dedicated_chrome_cdp(port=args.cdp_port)
    transport = BrowserHarnessTransport(cdp_url=cdp_url, rate_policy=policy)

    policy.wait_before_request()
    status = transport.check_session_ready()
    if isinstance(status, dict):
        policy.record_extra_requests(max(0, int(status.get("requestCount", 1)) - 1))
    if not status.get("ready"):
        reason_str = str(status.get("reason") or "session_or_captcha_gate")
        collector_tmp = SerialCustomsCollector(
            transport=transport,
            archive_dir=archive_dir,
            rate_policy=policy,
            latest_complete_month=args.latest_month,
            ledger=ledger,
        )
        collector_tmp._save_checkpoint(halted_reason=reason_str)
        ledger.set_status(
            session_status=f"🔴 会话需人工重输验证码（已保存断点：`{reason_str}`）",
            current_activity="启动前会话健康检查未通过，已弹窗提醒人工输入一次验证码",
        )
        trigger_session_expired_alert(transport, reason_str)
        raise CustomsCircuitBreakError(
            "stats.customs.gov.cn requires manual human verification (/queryData/toCaptchaView) in visible Chrome "
            f"before querying ({reason_str}). Saved _checkpoint.json; run again after completing human check."
        )

    clear_session_expired_alert(transport)
    ledger.set_status(
        session_status="🟢 会话健康已验证（MAX_INFLIGHT=1 单飞低频采集中）",
        current_activity=f"已通过会话预检，开始按序执行 {mode_label}",
    )
    collector = SerialCustomsCollector(
        transport=transport,
        archive_dir=archive_dir,
        rate_policy=policy,
        latest_complete_month=args.latest_month,
        ledger=ledger,
        on_session_expired=lambda r: trigger_session_expired_alert(transport, r),
    )
    outcomes = collector.run_plan(
        years=years,
        batches=batches,
        flows=flows,
        groupings=groupings,
        batches_by_grouping=batches_by_grouping,
        start_month_override=args.start_month if args.start_month > 0 else None,
        end_month_override=args.end_month if args.end_month > 0 else None,
        keepalive_fn=lambda: send_session_keepalive(transport),
    )
    ledger.set_status(
        session_status="✅ 当前计划阶段采集完成（会话保持活跃）",
        current_activity=f"本轮共完成 {len(outcomes)} 项归档单元",
    )
    print(json.dumps({"ok": True, "archiveDir": str(archive_dir), "completedCount": len(outcomes)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
