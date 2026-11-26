import base64
import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

HARNESS_DIR = Path(__file__).resolve().parents[1]
if str(HARNESS_DIR) not in sys.path:
    sys.path.insert(0, str(HARNESS_DIR))

import collect_customs_5y as collector  # noqa: E402


def make_valid_png(width: int = 32, height: int = 32) -> bytes:
    """Build a valid uncompressed-filter RGBA PNG of the requested dimensions."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw_scanlines = b"".join(b"\x00" + (b"\xff\xff\xff\xff" * width) for _ in range(height))
    idat = zlib.compress(raw_scanlines)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def make_matching_csv(
    *,
    year: int,
    start_month: int,
    end_month: int,
    grouping: str,
    hs8: list[str],
    row_count: int,
) -> bytes:
    if grouping == "product":
        lines = ["数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元"]
    elif grouping == "partner":
        lines = ["数据年月,商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,美元"]
    elif grouping == "regime":
        lines = ["数据年月,商品编码,商品名称,贸易方式编码,贸易方式名称,第一数量,第一计量单位,美元"]
    else:
        lines = ["数据年月,商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,第一数量,第一计量单位,美元"]

    months = [f"{year}{m:02d}" for m in range(start_month, end_month + 1)]
    for idx in range(row_count):
        ym = months[idx % len(months)]
        code = hs8[0]
        if grouping == "product":
            lines.append(f"{ym},{code},心电图记录仪,100,台,50,千克,12345")
        else:
            lines.append(f"{ym},{code},心电图记录仪,G{idx:05d},分组{idx},100,台,12345")
    return ("\r\n".join(lines) + "\r\n").encode("gb18030")


class FakeHarnessTransport:
    def __init__(
        self,
        counts_by_range,
        csv_payload_by_range=None,
        fail_html_on_call=None,
        empty_png_bytes=None,
        fail_screenshot=False,
        stale_evidence_fp=None,
        fail_evidence_sync=False,
        state_candidates=None,
        miss_states=None,
    ):
        self.counts_by_range = counts_by_range
        self.csv_payload_by_range = csv_payload_by_range or {}
        self.fail_html_on_call = fail_html_on_call
        self.empty_png_bytes = empty_png_bytes if empty_png_bytes is not None else make_valid_png(32, 32)
        self.fail_screenshot = fail_screenshot
        self.stale_evidence_fp = stale_evidence_fp
        self.fail_evidence_sync = fail_evidence_sync
        self._state_candidates = state_candidates
        self._miss_states = set(miss_states or [])
        self.calls = []
        self.evidence_events = []
        self.inflight = 0
        self.max_observed_inflight = 0

    def get_state_candidates(self, *, year, start_month, end_month):
        if self._state_candidates is not None:
            return list(self._state_candidates)
        return [2, 1, 3] if year == 2024 else [1, 2, 3]

    def probe_count(self, *, year, start_month, end_month, month_flag, flow, grouping, hs8, state_candidates=None):
        self._enter("probe", year, start_month, end_month, flow, grouping)
        try:
            if self.fail_html_on_call == len(self.calls):
                return {"ok": False, "isHtmlBlocked": True, "reason": "http_412_or_html"}
            st = state_candidates[0] if state_candidates else (2 if year == 2024 else 1)
            if st in self._miss_states:
                return {"ok": False, "state": None, "total": None, "isHtmlBlocked": False, "reason": "no_state_matched"}
            key = (year, start_month, end_month, flow, grouping)
            total = self.counts_by_range.get(key, 12)
            zero_ev = None
            if total == 0:
                fp = collector.build_zero_query_fingerprint(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    month_flag=month_flag,
                    flow=flow,
                    grouping=grouping,
                    state=st,
                    hs8=hs8,
                )
                zero_ev = {
                    "queryFingerprint": fp,
                    "officialTotal": 0,
                    "responseSha256": collector.sha256_hex(f"zero:{fp}".encode("utf-8")),
                    "officialResponseExcerpt": "暂无数据（共查询到 0 条数据）",
                }
            return {"ok": True, "state": st, "total": total, "zeroEvidence": zero_ev, "isHtmlBlocked": False}
        finally:
            self._exit()

    def prepare_empty_evidence_view(
        self, *, year, start_month, end_month, month_flag, flow, grouping, hs8, state, probe=None
    ):
        self.evidence_events.append(("prepare", year, start_month, end_month, flow, grouping))
        if self.fail_evidence_sync:
            return {"ok": False, "rendered": False, "reason": "dom_sync_failed"}
        fp = self.stale_evidence_fp or collector.build_zero_query_fingerprint(
            year=year,
            start_month=start_month,
            end_month=end_month,
            month_flag=month_flag,
            flow=flow,
            grouping=grouping,
            state=state,
            hs8=hs8,
        )
        zero_ev = probe.get("zeroEvidence") if isinstance(probe, dict) and isinstance(probe.get("zeroEvidence"), dict) else {}
        return {
            "ok": True,
            "rendered": True,
            "officialTotal": 0,
            "queryFingerprint": fp,
            "responseSha256": zero_ev.get("responseSha256", ""),
        }

    def clear_empty_evidence_view(self):
        self.evidence_events.append(("clear",))
        return True

    def fetch_raw_export(self, *, year, start_month, end_month, month_flag, flow, grouping, hs8, state):
        self._enter("export", year, start_month, end_month, flow, grouping)
        try:
            if self.fail_html_on_call == len(self.calls):
                return {"ok": False, "reason": "html_error_page", "circuitBreakRequired": True}
            key = (year, start_month, end_month, flow, grouping)
            expected_total = self.counts_by_range.get(key, 12)
            raw_bytes = self.csv_payload_by_range.get(
                key,
                make_matching_csv(
                    year=year,
                    start_month=start_month,
                    end_month=end_month,
                    grouping=grouping,
                    hs8=hs8,
                    row_count=expected_total,
                ),
            )
            return {
                "ok": True,
                "base64": base64.b64encode(raw_bytes).decode("ascii"),
                "byteLength": len(raw_bytes),
                "sha256": collector.sha256_hex(raw_bytes),
                "state": state,
            }
        finally:
            self._exit()

    def capture_empty_png(self):
        self.evidence_events.append(("capture",))
        if self.fail_screenshot:
            raise collector.CustomsScreenshotError("Page.captureScreenshot failed: missing screenshot data")
        return self.empty_png_bytes

    def _enter(self, kind, year, start_month, end_month, flow, grouping):
        self.inflight += 1
        self.max_observed_inflight = max(self.max_observed_inflight, self.inflight)
        self.calls.append((kind, year, start_month, end_month, flow, grouping))

    def _exit(self):
        self.inflight -= 1


class SerialCollectorTests(unittest.TestCase):
    def test_rejects_high_frequency_delays(self):
        with self.assertRaises(ValueError):
            collector.PoliteRatePolicy(min_delay_sec=0.5, max_delay_sec=1.0)
        with self.assertRaises(ValueError):
            collector.PoliteRatePolicy(min_delay_sec=4.0, max_delay_sec=3.0)

    def test_adaptive_window_bisection_when_over_9000_rows(self):
        # 全年 1..12 返回 12000 行（超 9000 阈值）-> 自动拆成 1..6 (4500 行) 与 7..12 (4800 行)，且导出行数必须精确匹配
        counts = {
            (2024, 1, 12, "import", "partner"): 12000,
            (2024, 1, 6, "import", "partner"): 4500,
            (2024, 7, 12, "import", "partner"): 4800,
        }
        sleeps = []
        transport = FakeHarnessTransport(counts)
        policy = collector.PoliteRatePolicy(
            min_delay_sec=3.5,
            max_delay_sec=6.5,
            batch_cooldown_every=8,
            batch_cooldown_range=(15.0, 25.0),
            sleep_fn=lambda s: sleeps.append(s),
        )

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(
                transport=transport,
                archive_dir=out_dir,
                rate_policy=policy,
            )
            outcomes = runner.collect_task(
                year=2024,
                start_month=1,
                end_month=12,
                flow="import",
                grouping="partner",
                batch_key="PILOT-90181100",
                hs8=["90181100"],
            )
            self.assertEqual(transport.max_observed_inflight, 1)
            self.assertEqual(len(outcomes), 2)
            self.assertEqual([o["monthRange"] for o in outcomes], ["2024-01..2024-06", "2024-07..2024-12"])
            self.assertTrue(all(s >= 3.5 for s in sleeps))

    def test_rejects_incomplete_or_out_of_scope_export_without_checkpointing(self):
        # P1-3: 预检返回 4500 行但导出仅有 1 行，必须拒绝写入 probeVerifiedZero=True 与完成断点
        counts = {(2024, 1, 6, "import", "partner"): 4500}
        truncated_csv = make_matching_csv(
            year=2024, start_month=1, end_month=6, grouping="partner", hs8=["90181100"], row_count=1
        )
        transport = FakeHarnessTransport(
            counts,
            csv_payload_by_range={(2024, 1, 6, "import", "partner"): truncated_csv},
        )
        policy = collector.PoliteRatePolicy(min_delay_sec=3.5, max_delay_sec=4.0, sleep_fn=lambda _: None)

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(transport=transport, archive_dir=out_dir, rate_policy=policy)
            with self.assertRaises(collector.CustomsExportVerificationError):
                runner.collect_task(
                    year=2024,
                    start_month=1,
                    end_month=6,
                    flow="import",
                    grouping="partner",
                    batch_key="G01",
                    hs8=["90181100", "90181210"],
                )
            self.assertEqual(list(out_dir.rglob("*.manifest.json")), [])
            self.assertEqual(list(out_dir.rglob("*.raw.csv")), [])
            ckpt = json.loads((out_dir / "_checkpoint.json").read_text("utf-8"))
            self.assertEqual(ckpt["completedKeys"], [])
            self.assertIn("row_count_mismatch", ckpt["haltedReason"])

        # 导出包含越界月份或越界 HS8 时也必须拒绝
        wrong_scope_csv = (
            "数据年月,商品编码,商品名称,美元\r\n"
            "202312,90181100,心电图记录仪,100\r\n"
        ).encode("utf-8")
        with self.assertRaises(collector.CustomsExportVerificationError):
            collector.verify_exported_csv(
                wrong_scope_csv,
                expected_total=1,
                months_covered=["2024-01", "2024-02"],
                requested_hs8=["90181100"],
                flow="import",
                grouping="product",
            )

        wrong_hs_csv = (
            "数据年月,商品编码,商品名称,美元\r\n"
            "202401,99999999,非目标商品,100\r\n"
        ).encode("utf-8")
        with self.assertRaises(collector.CustomsExportVerificationError):
            collector.verify_exported_csv(
                wrong_hs_csv,
                expected_total=1,
                months_covered=["2024-01"],
                requested_hs8=["90181100"],
                flow="import",
                grouping="product",
            )

    def test_pilot_uses_isolated_default_archive_dir(self):
        # P1-4: 试点默认归档至独立目录 data/customs-raw-pilot，避免与全量 data/customs-raw 发生 409 重叠冲突
        pilot_args = collector.parse_cli_args(["--pilot", "--years", "2024"])
        full_args = collector.parse_cli_args(["--years", "2024"])
        custom_args = collector.parse_cli_args(["--pilot", "--archive-dir", "/tmp/custom-pilot"])

        self.assertEqual(collector.resolve_archive_dir(pilot_args), collector.DEFAULT_PILOT_ARCHIVE_DIR)
        self.assertEqual(collector.resolve_archive_dir(full_args), collector.DEFAULT_ARCHIVE_DIR)
        self.assertNotEqual(collector.resolve_archive_dir(pilot_args), collector.resolve_archive_dir(full_args))
        self.assertEqual(collector.resolve_archive_dir(custom_args), Path("/tmp/custom-pilot"))

    def test_screenshot_failure_or_placeholder_does_not_mark_empty_complete(self):
        # P1-6: 截图失败或返回 1x1 占位图时绝不登记零结果凭证与完成断点
        counts = {(2024, 1, 12, "export", "product"): 0}
        policy = collector.PoliteRatePolicy(min_delay_sec=3.5, max_delay_sec=4.0, sleep_fn=lambda _: None)

        # (a) CDP 截图失败（缺失 data）
        class FakeBrokenBh:
            def cdp(self, method, **kwargs):
                return {}

        broken_transport = object.__new__(collector.BrowserHarnessTransport)
        broken_transport._bh = FakeBrokenBh()
        with self.assertRaises(collector.CustomsScreenshotError):
            broken_transport.capture_empty_png()

        # (b) 采集器收到截图失败或 1x1 占位图
        placeholder_1x1 = make_valid_png(1, 1)
        for bad_transport in (
            FakeHarnessTransport(counts, fail_screenshot=True),
            FakeHarnessTransport(counts, empty_png_bytes=placeholder_1x1),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                out_dir = Path(tmp)
                runner = collector.SerialCustomsCollector(
                    transport=bad_transport, archive_dir=out_dir, rate_policy=policy
                )
                with self.assertRaises(collector.CustomsScreenshotError):
                    runner.collect_task(
                        year=2024,
                        start_month=1,
                        end_month=12,
                        flow="export",
                        grouping="product",
                        batch_key="G01",
                        hs8=["90181100"],
                    )
                self.assertEqual(list(out_dir.rglob("*.empty.png")), [])
                self.assertEqual(list(out_dir.rglob("*.manifest.json")), [])
                ckpt = json.loads((out_dir / "_checkpoint.json").read_text("utf-8"))
                self.assertEqual(ckpt["completedKeys"], [])

        # (c) 真实有效截图（32x32 PNG）正常落盘并登记完成
        good_transport = FakeHarnessTransport(counts, empty_png_bytes=make_valid_png(32, 32))
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(
                transport=good_transport, archive_dir=out_dir, rate_policy=policy
            )
            res = runner.collect_task(
                year=2024,
                start_month=1,
                end_month=12,
                flow="export",
                grouping="product",
                batch_key="G01",
                hs8=["90181100"],
            )
            self.assertEqual(res[0]["status"], "confirmed_empty")
            self.assertEqual(len(list(out_dir.rglob("*.empty.png"))), 1)
            self.assertEqual(len(list(out_dir.rglob("*.manifest.json"))), 1)

    def test_per_request_rate_limiting_across_multiple_state_probes_and_no_unit_test_bypass(self):
        # P2-12: 当首个库状态未命中而继续尝试后续 state 时，每次实际请求都必须独立等待并计入速率计数器
        sleeps = []
        policy = collector.PoliteRatePolicy(
            min_delay_sec=3.5,
            max_delay_sec=4.5,
            batch_cooldown_every=3,
            batch_cooldown_range=(15.0, 16.0),
            sleep_fn=lambda s: sleeps.append(s),
        )
        counts = {(2024, 1, 1, "import", "product"): 2}
        # state 2 未命中 -> 再试 state 1 命中（2 次 probe 请求）+ 1 次 export 请求 = 3 次实际请求 -> 触发 1 次批冷却
        transport = FakeHarnessTransport(counts, state_candidates=[2, 1, 3], miss_states={2})
        with tempfile.TemporaryDirectory() as tmp:
            runner = collector.SerialCustomsCollector(
                transport=transport, archive_dir=Path(tmp), rate_policy=policy
            )
            res = runner.collect_task(
                year=2024,
                start_month=1,
                end_month=1,
                flow="import",
                grouping="product",
                batch_key="G01",
                hs8=["90181100"],
            )
            self.assertEqual(res[0]["status"], "received")
            self.assertEqual(policy.request_count, 3)
            # 3 次单次请求等待（3.5..4.5）+ 第 3 次请求后的 1 次批次冷却（15..16）
            self.assertEqual(len(sleeps), 4)
            self.assertTrue(all(3.5 <= s <= 4.5 for s in sleeps[:3]))
            self.assertGreaterEqual(sleeps[3], 15.0)

        # 验证 BrowserHarnessTransport 生产调用绝不传 skipPoliteWaitForUnitTest
        captured_exprs = []
        prod_transport = object.__new__(collector.BrowserHarnessTransport)
        prod_transport._min_delay_ms = 3500
        prod_transport._max_delay_ms = 6500
        prod_transport.ensure_bridge = lambda: None
        prod_transport._eval_async_js = lambda expr, timeout=45.0: (captured_exprs.append(expr), {"ok": True, "ready": True})[1]

        prod_transport.check_session_ready()
        prod_transport.probe_count(
            year=2024, start_month=1, end_month=1, month_flag="1", flow="import", grouping="product", hs8=["90181100"], state_candidates=[2]
        )
        prod_transport.fetch_raw_export(
            year=2024, start_month=1, end_month=1, month_flag="1", flow="import", grouping="product", hs8=["90181100"], state=2
        )
        for expr in captured_exprs:
            self.assertNotIn("skipPoliteWaitForUnitTest", expr)
            self.assertIn('"minDelayMs": 3500', expr)

    def test_circuit_breaker_halts_immediately_and_persists_checkpoint(self):
        transport = FakeHarnessTransport({}, fail_html_on_call=3)
        policy = collector.PoliteRatePolicy(
            min_delay_sec=3.5,
            max_delay_sec=4.0,
            sleep_fn=lambda _: None,
        )
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(
                transport=transport,
                archive_dir=out_dir,
                rate_policy=policy,
            )
            with self.assertRaises(collector.CustomsCircuitBreakError):
                runner.run_plan(
                    years=[2024],
                    batches=[{"batchKey": "PILOT-90181100", "hs8": ["90181100"]}],
                    flows=["import", "export"],
                    groupings=["product"],
                )
            ckpt_path = out_dir / "_checkpoint.json"
            self.assertTrue(ckpt_path.exists())
            ckpt = json.loads(ckpt_path.read_text("utf-8"))
            self.assertEqual(len(ckpt["completedKeys"]), 1)
            self.assertEqual(ckpt["haltedReason"], "html_or_waf_challenge")

    def test_inject_browser_harness_site_packages_exports_pythonpath(self):
        collector._inject_browser_harness_site_packages()
        import browser_harness  # type: ignore  # noqa: F401
        import os

        self.assertIn("browser-use", os.environ.get("PYTHONPATH", ""))

    def test_chunked_bridge_injection_stays_under_64kib_ipc_limit(self):
        from agent_helpers import inject_customs_suite_bridge

        sent_expressions = []

        def fake_js(expr: str):
            sent_expressions.append(expr)
            if "verifyDictionary" in expr:
                return {"dictVersion": "202601", "hs8Count": 164}
            return None

        res = inject_customs_suite_bridge(fake_js, collector.DEFAULT_USERSCRIPT_PATH)
        self.assertEqual(res["hs8Count"], 164)
        self.assertGreater(len(sent_expressions), 3)
        self.assertTrue(all(len(json.dumps({"expr": e}).encode("utf-8")) < 40_000 for e in sent_expressions))

    def test_splits_window_at_current_start_time_boundary(self):
        counts = {
            (2025, 1, 3, "import", "product"): 3,
            (2025, 4, 12, "import", "product"): 9,
        }
        transport = FakeHarnessTransport(counts)
        transport.get_portal_start_anchor = lambda: "202504"
        policy = collector.PoliteRatePolicy(min_delay_sec=3.5, max_delay_sec=4.0, sleep_fn=lambda _: None)
        with tempfile.TemporaryDirectory() as tmp:
            runner = collector.SerialCustomsCollector(transport=transport, archive_dir=Path(tmp), rate_policy=policy)
            outcomes = runner.collect_task(
                year=2025,
                start_month=1,
                end_month=12,
                flow="import",
                grouping="product",
                batch_key="G01",
                hs8=["90181100"],
            )
            self.assertEqual([o["monthRange"] for o in outcomes], ["2025-01..2025-03", "2025-04..2025-12"])

    def test_zero_result_screenshot_requires_synced_query_view_and_rejects_stale_page(self):
        # [R2 P1-B] 零结果截图前必须同步渲染当前查询条件与官方返回摘要，拒绝历史页面残留截图
        counts = {(2024, 1, 12, "export", "product"): 0}
        policy = collector.PoliteRatePolicy(min_delay_sec=3.5, max_delay_sec=4.0, sleep_fn=lambda _: None)

        # (a) 页面指纹仍是上一笔历史查询 -> 必须拒绝落盘与断点
        stale_transport = FakeHarnessTransport(counts, stale_evidence_fp="202601|2023-01..2023-12|mf=1|import|product|st=2|hs8=90181100")
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(transport=stale_transport, archive_dir=out_dir, rate_policy=policy)
            with self.assertRaises(collector.CustomsScreenshotError):
                runner.collect_task(
                    year=2024,
                    start_month=1,
                    end_month=12,
                    flow="export",
                    grouping="product",
                    batch_key="G01",
                    hs8=["90181100"],
                )
            self.assertEqual(list(out_dir.rglob("*.empty.png")), [])
            self.assertEqual(list(out_dir.rglob("*.manifest.json")), [])
            self.assertEqual([ev[0] for ev in stale_transport.evidence_events], ["prepare", "clear"])

        # (b) 页面同步失败 -> 必须拒绝落盘
        fail_sync_transport = FakeHarnessTransport(counts, fail_evidence_sync=True)
        with tempfile.TemporaryDirectory() as tmp:
            runner = collector.SerialCustomsCollector(transport=fail_sync_transport, archive_dir=Path(tmp), rate_policy=policy)
            with self.assertRaises(collector.CustomsScreenshotError):
                runner.collect_task(
                    year=2024,
                    start_month=1,
                    end_month=12,
                    flow="export",
                    grouping="product",
                    batch_key="G01",
                    hs8=["90181100"],
                )

        # (c) 正常同步当前查询视图 -> 顺序必须是 prepare -> capture -> clear，且 meta 写入 queryFingerprint
        ok_transport = FakeHarnessTransport(counts)
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(transport=ok_transport, archive_dir=out_dir, rate_policy=policy)
            res = runner.collect_task(
                year=2024,
                start_month=1,
                end_month=12,
                flow="export",
                grouping="product",
                batch_key="G01",
                hs8=["90181100"],
            )
            self.assertEqual(res[0]["status"], "confirmed_empty")
            self.assertEqual([ev[0] for ev in ok_transport.evidence_events], ["prepare", "capture", "clear"])
            meta_files = list(out_dir.rglob("*.meta.json"))
            self.assertEqual(len(meta_files), 1)
            meta = json.loads(meta_files[0].read_text("utf-8"))
            self.assertTrue(meta["evidenceViewSynced"])
            self.assertEqual(
                meta["queryFingerprint"],
                "202601|2024-01..2024-12|mf=1|export|product|st=2|hs8=90181100",
            )
            self.assertTrue(meta["officialProbeResponseSha256"])

    def test_dict_sha256_is_stable_across_lf_and_crlf_checkouts(self):
        # [R2 P2-7] Windows autocrlf 将字典检出为 CRLF 时，摘要校验仍精确匹配官方基准值
        lf_bytes = collector.normalize_line_endings_lf(collector.DEFAULT_DICT_CSV_PATH.read_bytes())
        crlf_bytes = lf_bytes.replace(b"\n", b"\r\n")
        self.assertNotEqual(collector.sha256_hex(lf_bytes), collector.sha256_hex(crlf_bytes))

        with tempfile.TemporaryDirectory() as tmp:
            lf_path = Path(tmp) / "dict_lf.csv"
            crlf_path = Path(tmp) / "dict_crlf.csv"
            lf_path.write_bytes(lf_bytes)
            crlf_path.write_bytes(crlf_bytes)

            b_lf = collector.load_official_dict_batches(lf_path, group_size=20)
            b_crlf = collector.load_official_dict_batches(crlf_path, group_size=20)
            self.assertEqual(b_lf, b_crlf)
            self.assertEqual(sum(len(b["hs8"]) for b in b_crlf), 164)

    def test_latest_complete_month_excludes_subsequent_future_years(self):
        # [R2 P2-8] --years 2025,2026 --latest-month 2025-10 必须完全跳过 2026 年，绝不查询或登记未来零值
        self.assertEqual(collector.default_end_month_for_year(2024, "2025-10"), 12)
        self.assertEqual(collector.default_end_month_for_year(2025, "2025-10"), 10)
        self.assertEqual(collector.default_end_month_for_year(2026, "2025-10"), 0)

        counts = {
            (2025, 1, 10, "import", "product"): 5,
            (2026, 1, 12, "import", "product"): 0,
        }
        sleeps = []
        transport = FakeHarnessTransport(counts)
        policy = collector.PoliteRatePolicy(
            min_delay_sec=3.5,
            max_delay_sec=4.0,
            year_cooldown_range=(45.0, 60.0),
            sleep_fn=lambda s: sleeps.append(s),
        )
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            runner = collector.SerialCustomsCollector(
                transport=transport,
                archive_dir=out_dir,
                rate_policy=policy,
                latest_complete_month="2025-10",
            )
            outcomes = runner.run_plan(
                years=[2025, 2026],
                batches=[{"batchKey": "G01", "hs8": ["90181100"]}],
                flows=["import"],
                groupings=["product"],
            )
            self.assertEqual([o["monthRange"] for o in outcomes], ["2025-01..2025-10"])
            self.assertTrue(all(c[1] == 2025 for c in transport.calls))
            self.assertFalse((out_dir / "2026").exists())
            self.assertEqual(list(out_dir.rglob("*_2026_*")), [])
            # 2026 被跳过后不应触发无效跨年冷却
            self.assertFalse(any(s >= 45.0 for s in sleeps))


if __name__ == "__main__":
    unittest.main()
