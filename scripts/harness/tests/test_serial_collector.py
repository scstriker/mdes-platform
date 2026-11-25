import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path

HARNESS_DIR = Path(__file__).resolve().parents[1]
if str(HARNESS_DIR) not in sys.path:
    sys.path.insert(0, str(HARNESS_DIR))

import collect_customs_5y as collector  # noqa: E402


class FakeHarnessTransport:
    def __init__(self, counts_by_range, csv_payload_by_range=None, fail_html_on_call=None):
        self.counts_by_range = counts_by_range
        self.csv_payload_by_range = csv_payload_by_range or {}
        self.fail_html_on_call = fail_html_on_call
        self.calls = []
        self.inflight = 0
        self.max_observed_inflight = 0

    def probe_count(self, *, year, start_month, end_month, month_flag, flow, grouping, hs8):
        self._enter("probe", year, start_month, end_month, flow, grouping)
        try:
            if self.fail_html_on_call == len(self.calls):
                return {"ok": False, "isHtmlBlocked": True, "reason": "http_412_or_html"}
            key = (year, start_month, end_month, flow, grouping)
            total = self.counts_by_range.get(key, 12)
            return {"ok": True, "state": 3 if year == 2024 else 2, "total": total, "isHtmlBlocked": False}
        finally:
            self._exit()

    def fetch_raw_export(self, *, year, start_month, end_month, month_flag, flow, grouping, hs8, state):
        self._enter("export", year, start_month, end_month, flow, grouping)
        try:
            if self.fail_html_on_call == len(self.calls):
                return {"ok": False, "reason": "html_error_page", "circuitBreakRequired": True}
            key = (year, start_month, end_month, flow, grouping)
            raw_bytes = self.csv_payload_by_range.get(
                key,
                (
                    "数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\r\n"
                    f"{year}{start_month:02d},{hs8[0]},心电图记录仪,100,台,50,千克,12345\r\n"
                ).encode("gb18030"),
            )
            return {
                "ok": True,
                "base64": base64.b64encode(raw_bytes).decode("ascii"),
                "byteLength": len(raw_bytes),
                "sha256": collector.sha256_hex(raw_bytes),
                "state": state,
                "inspection": {
                    "detailRowCount": 1,
                    "returnedHs8": [hs8[0]],
                    "unreturnedHs8": hs8[1:],
                },
            }
        finally:
            self._exit()

    def capture_empty_png(self):
        return collector.MINIMAL_FALLBACK_PNG_BYTES

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
        # 全年 1..12 返回 12000 行（超 9000 阈值）-> 自动拆成 1..6 (4500 行) 与 7..12 (4800 行)
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


if __name__ == "__main__":
    unittest.main()
