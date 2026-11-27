"""
Real-time Collection Progress Ledger & Session Expiry Alert Helper
Maintains strictly aligned progress tables on disk during serial China Customs collection,
performs lightweight keep-alive heartbeats during long inter-year pauses, and displays an
immediate visible alert banner + chime + OS notification if the customs session expires.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

TZ_CN = timezone(timedelta(hours=8))

FLOW_I_E_MAP = {
    "import": "import (iEType=1 进口)",
    "export": "export (iEType=0 出口)",
}

GROUPING_FIELD_MAP = {
    "product": "product (CODE_TS 全国)",
    "partner": "partner (ORIGIN_COUNTRY 伙伴)",
    "regime": "regime (TRADE_MODE 方式)",
    "region": "region (TRADE_CO_PORT 注册地)",
}


def now_cn_str() -> str:
    return datetime.now(TZ_CN).strftime("%Y-%m-%d %H:%M:%S")


def parse_usd_decimal(raw: Any) -> Decimal:
    s = str(raw if raw is not None else "0").replace(",", "").strip()
    if not s:
        return Decimal("0")
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal("0")


def format_usd(val: Decimal) -> str:
    if val == val.to_integral_value():
        return f"{int(val):,}"
    return f"{val:,.4f}".rstrip("0").rstrip(".")


class LiveCollectionLedger:
    """Atomically updates both the repo markdown ledger and optional artifact markdown ledger on every batch."""

    def __init__(
        self,
        *,
        archive_dir: Path,
        repo_ledger_path: Path,
        artifact_ledger_path: Path | None = None,
        mode_label: str = "2022–2026 全量 164 码低频串行归档",
    ) -> None:
        self.archive_dir = Path(archive_dir)
        self.repo_ledger_path = Path(repo_ledger_path)
        self.artifact_ledger_path = Path(artifact_ledger_path) if artifact_ledger_path else None
        self.mode_label = mode_label
        self.state_json_path = self.archive_dir / "_ledger_records.json"
        self.tail_md_path = self.archive_dir / "_ledger_post_sections.md"
        self.records_by_stem: dict[str, dict[str, Any]] = {}
        self.session_status = "🟢 会话正常（MAX_INFLIGHT=1 单飞串行运行中）"
        self.current_activity = "初始化中..."
        self.preserved_tail_markdown: str = ""
        self.extra_footer_lines: list[str] = []
        self._load_existing()

    @staticmethod
    def _extract_preserved_tail(markdown_text: str) -> str:
        """Extract Section IV+ (e.g. D1 publish verification section) after Section III so progress rewrites never erase it."""
        lines = markdown_text.splitlines()
        sec3_idx: int | None = None
        for idx, line in enumerate(lines):
            if line.startswith("## 三、"):
                sec3_idx = idx
                break
        if sec3_idx is None:
            return ""
        for idx in range(sec3_idx + 1, len(lines)):
            if lines[idx].startswith("## "):
                return "\n".join(lines[idx:]).strip()
        return ""

    def _sync_preserved_tail_from_disk(self) -> None:
        candidates = [self.repo_ledger_path]
        if self.artifact_ledger_path:
            candidates.append(self.artifact_ledger_path)
        for path in candidates:
            if path.exists():
                try:
                    extracted = self._extract_preserved_tail(path.read_text(encoding="utf-8"))
                    if extracted:
                        self.preserved_tail_markdown = extracted
                        return
                except Exception:
                    pass
        if not self.preserved_tail_markdown and self.tail_md_path.exists():
            try:
                cached = self.tail_md_path.read_text(encoding="utf-8").strip()
                if cached:
                    self.preserved_tail_markdown = cached
            except Exception:
                pass

    def _save_preserved_tail(self) -> None:
        if not self.preserved_tail_markdown:
            return
        try:
            self._write_atomic(self.tail_md_path, self.preserved_tail_markdown + "\n")
        except Exception:
            pass

    def set_publish_verification_section(self, markdown_section: str) -> None:
        """Persist and attach Section IV+ (D1 publish verification record) to the ledger."""
        self.preserved_tail_markdown = str(markdown_section or "").strip()
        if self.preserved_tail_markdown:
            self._save_preserved_tail()
        elif self.tail_md_path.exists():
            try:
                self.tail_md_path.unlink()
            except Exception:
                pass
        self.render_markdown(sync_tail_from_disk=False)

    def _load_existing(self) -> None:
        if self.state_json_path.exists():
            try:
                arr = json.loads(self.state_json_path.read_text(encoding="utf-8"))
                if isinstance(arr, list):
                    for item in arr:
                        if isinstance(item, dict) and item.get("stem"):
                            self.records_by_stem[str(item["stem"])] = item
            except Exception:
                pass
        self._sync_preserved_tail_from_disk()

    def _save_state_json(self) -> None:
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        ordered = [self.records_by_stem[k] for k in sorted(self.records_by_stem.keys())]
        tmp = self.state_json_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.state_json_path)

    def set_status(self, *, session_status: str | None = None, current_activity: str | None = None) -> None:
        if session_status is not None:
            self.session_status = session_status
        if current_activity is not None:
            self.current_activity = current_activity
        self.render_markdown()

    def record_batch(
        self,
        *,
        stem: str,
        dict_version: str,
        year: int,
        month_range: str,
        months_count: int,
        flow: str,
        grouping: str,
        batch_key: str,
        requested_hs8_count: int,
        select_table_state: int | None,
        official_probe_total: int,
        status: str,
        encoding_name: str,
        byte_length: int,
        detail_row_count: int,
        returned_hs8_count: int,
        empty_hs8_count: int,
        usd_detail_sum: str,
        sha256: str,
    ) -> None:
        self.records_by_stem[stem] = {
            "stem": stem,
            "dictVersion": dict_version,
            "year": int(year),
            "monthRange": month_range,
            "monthsCount": int(months_count),
            "flow": flow,
            "grouping": grouping,
            "batchKey": batch_key,
            "requestedHs8Count": int(requested_hs8_count),
            "selectTableState": select_table_state,
            "officialProbeTotal": int(official_probe_total),
            "status": status,
            "encodingName": encoding_name,
            "byteLength": int(byte_length),
            "detailRowCount": int(detail_row_count),
            "returnedHs8Count": int(returned_hs8_count),
            "emptyHs8Count": int(empty_hs8_count),
            "usdDetailSum": usd_detail_sum,
            "sha256": sha256,
            "completedAt": now_cn_str(),
        }
        self.current_activity = f"已完成 `{stem}`（明细 {detail_row_count} 行，USD {usd_detail_sum}）"
        self._save_state_json()
        self.render_markdown()

    def render_markdown(self, *, sync_tail_from_disk: bool = True) -> None:
        records = list(self.records_by_stem.values())
        records.sort(key=lambda r: (r["year"], r["flow"], r["grouping"], r["batchKey"], r["monthRange"]))

        # Aggregate per year
        years_seen = sorted({int(r["year"]) for r in records} | {2022, 2023, 2024, 2025, 2026})
        summary_lines = [
            "| 统计年份 (`year`) | 月份覆盖窗口 | 适用税号数 | 已落盘批次数 | 有值原件 (`received`) | 零值确认 (`confirmed_empty`) | 累计明细行数 | 进口全国美元累计 (`product`) | 出口全国美元累计 (`product`) |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        recon_lines = [
            "| 统计年份 (`year`) | 流向 (`flow`) | 全国商品 (`product` USD) | 贸易伙伴 (`partner` USD) | 贸易方式 (`regime` USD) | 注册地省市 (`region` USD) | 四分组交叉对账状态 |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for yr in years_seen:
            yr_recs = [r for r in records if int(r["year"]) == yr]
            m_win = f"{yr}-01..{yr}-10 (10月)" if yr == 2026 else f"{yr}-01..{yr}-12 (12月)"
            app_cnt = 163 if yr == 2022 else 164
            rec_cnt = sum(1 for r in yr_recs if r["status"] == "received")
            emp_cnt = sum(1 for r in yr_recs if r["status"] == "confirmed_empty")
            row_sum = sum(int(r["detailRowCount"]) for r in yr_recs)
            imp_usd = sum(
                (parse_usd_decimal(r["usdDetailSum"]) for r in yr_recs if r["flow"] == "import" and r["grouping"] == "product"),
                Decimal("0"),
            )
            exp_usd = sum(
                (parse_usd_decimal(r["usdDetailSum"]) for r in yr_recs if r["flow"] == "export" and r["grouping"] == "product"),
                Decimal("0"),
            )
            summary_lines.append(
                f"| `{yr}` | `{m_win}` | `{app_cnt}` | **{len(yr_recs)}** | `{rec_cnt}` | `{emp_cnt}` | `{row_sum:,}` | `{format_usd(imp_usd)}` | `{format_usd(exp_usd)}` |"
            )

            for fl in ("import", "export"):
                sums_by_grp: dict[str, Decimal] = {}
                cnts_by_grp: dict[str, int] = {}
                for grp in ("product", "partner", "regime", "region"):
                    sub = [r for r in yr_recs if r["flow"] == fl and r["grouping"] == grp]
                    cnts_by_grp[grp] = len(sub)
                    sums_by_grp[grp] = sum((parse_usd_decimal(r["usdDetailSum"]) for r in sub), Decimal("0"))
                if all(cnts_by_grp[g] == 0 for g in ("product", "partner", "regime", "region")):
                    recon_status = "⏳ 待采集"
                elif all(cnts_by_grp[g] > 0 for g in ("product", "partner", "regime", "region")) and len({sums_by_grp[g] for g in ("product", "partner", "regime", "region")}) == 1:
                    recon_status = "✅ **四分组 `$0` 严丝合缝**"
                else:
                    done_grps = [g for g in ("product", "partner", "regime", "region") if cnts_by_grp[g] > 0]
                    recon_status = f"🔄 采集中（已写入 `{','.join(done_grps)}`）"
                recon_lines.append(
                    f"| `{yr}` | `{FLOW_I_E_MAP[fl]}` | `{format_usd(sums_by_grp['product'])}` ({cnts_by_grp['product']}批) | "
                    f"`{format_usd(sums_by_grp['partner'])}` ({cnts_by_grp['partner']}批) | "
                    f"`{format_usd(sums_by_grp['regime'])}` ({cnts_by_grp['regime']}批) | "
                    f"`{format_usd(sums_by_grp['region'])}` ({cnts_by_grp['region']}批) | {recon_status} |"
                )

        detail_lines = [
            "| # | 批次原件标识 (`stem`) | `dictVersion` | `year` | `months` | `flow` (`iEType`) | `grouping` (`outerField2`) | `batchKey` | `hs8Count` | `selectTableState` | 预检 `totalSize` | 状态 (`status`) | 编码 / 字节 (`bytes`) | `detailRowCount` | `returned` / `emptyHs8` | 明细美元合计 (`USD`) | `sourceSha256` (前16位) | 落盘时间 (`UTC+8`) |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        if not records:
            detail_lines.append("| - | *(等待首个批次落盘...)* | `202601` | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |")
        else:
            for idx, r in enumerate(records, start=1):
                st_badge = "✅ `received`" if r["status"] == "received" else "⚪ `confirmed_empty`"
                sha_short = f"`{str(r['sha256'])[:16]}…`"
                detail_lines.append(
                    f"| {idx} | `{r['stem']}` | `{r['dictVersion']}` | `{r['year']}` | `{r['monthRange']}` ({r['monthsCount']}M) | "
                    f"`{FLOW_I_E_MAP.get(r['flow'], r['flow'])}` | `{GROUPING_FIELD_MAP.get(r['grouping'], r['grouping'])}` | "
                    f"`{r['batchKey']}` | `{r['requestedHs8Count']}` | `{r['selectTableState']}` | `{r['officialProbeTotal']:,}` | "
                    f"{st_badge} | `{r['encodingName']}` / `{r['byteLength']:,} B` | `{r['detailRowCount']:,}` | "
                    f"`{r['returnedHs8Count']}` / `{r['emptyHs8Count']}` | **`{r['usdDetailSum']}`** | {sha_short} | `{r['completedAt']}` |"
                )

        try:
            archive_label = self.archive_dir.resolve().relative_to(self.repo_ledger_path.resolve().parents[1]).as_posix()
        except Exception:
            archive_label = self.archive_dir.name

        if sync_tail_from_disk:
            self._sync_preserved_tail_from_disk()
        if self.preserved_tail_markdown:
            self._save_preserved_tail()

        tail_lines: list[str] = []
        if self.preserved_tail_markdown:
            tail_lines.extend(["", self.preserved_tail_markdown])
        if self.extra_footer_lines:
            tail_lines.extend(["", *self.extra_footer_lines])

        content = (
            "\n".join(
                [
                    "# 海关医疗器械（2022–2026）真站低频串行实采实时进度台账",
                    "",
                    f"- **最后刷新时间（UTC+8）**：`{now_cn_str()}`",
                    f"- **当前任务阶段**：{self.mode_label}",
                    f"- **会话与运行状态**：{self.session_status}",
                    f"- **最新动作**：{self.current_activity}",
                    f"- **归档目录**：`{archive_label}`",
                    "- **低频合规参数**：`MAX_INFLIGHT = 1`（全局单飞互斥锁）| `currencyType = usd` | `monthFlag = 1` | 预检间隔 `3.5s–6.5s` | 导出后遵循官网 `13.5s–16.5s` 冷却 | 会话自动保活与失效弹窗提醒",
                    "",
                    "## 一、分年度全局汇总进度（全国 `product` 口径不重复计总额）",
                    "",
                    *summary_lines,
                    "",
                    "## 二、分年度四分组美元总额交叉对账表（`product == partner == regime == region` 实时校验）",
                    "",
                    *recon_lines,
                    "",
                    "## 三、分批次原件获取实时明细台账（严格对齐 `manifest.json` 与后台入库契约）",
                    "",
                    *detail_lines,
                    *tail_lines,
                ]
            ).rstrip("\n")
            + "\n"
        )

        self._write_atomic(self.repo_ledger_path, content)
        if self.artifact_ledger_path:
            self._write_atomic(self.artifact_ledger_path, content)

    @staticmethod
    def _write_atomic(target: Path, text: str) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(target)


def clear_session_expired_alert(transport: Any) -> None:
    """Clear any previous session-expired alert banner/title flash once the session is verified healthy."""
    try:
        transport._eval_async_js(
            """(() => {
              if (window.__mdes_title_flash__) {
                clearInterval(window.__mdes_title_flash__);
                delete window.__mdes_title_flash__;
              }
              const bar = document.getElementById('__mdes_session_alert__');
              if (bar) bar.remove();
              document.title = '海关统计数据查询平台';
              return true;
            })()""",
            timeout=8.0,
        )
    except Exception:
        pass


def trigger_session_expired_alert(transport: Any, reason: str) -> None:
    """
    Display an unmistakable non-blocking alert banner + title flash + WebAudio chime inside the user's visible
    standalone Chromium window (and fire OS msg.exe toast best-effort) when the customs session expires.
    """
    try:
        win_info = transport._bh.cdp("Browser.getWindowForTarget")
        win_id = win_info.get("windowId") if isinstance(win_info, dict) else None
        if win_id is not None:
            transport._bh.cdp("Browser.setWindowBounds", windowId=win_id, bounds={"windowState": "maximized"})
        transport._bh.cdp("Page.bringToFront")
        safe_reason = json.dumps(str(reason))
        transport._eval_async_js(
            f"""(() => {{
              if (window.__mdes_title_flash__) clearInterval(window.__mdes_title_flash__);
              let toggle = false;
              document.title = '⚠️【请输一次验证码】海关会话已过期！';
              window.__mdes_title_flash__ = setInterval(() => {{
                toggle = !toggle;
                document.title = toggle ? '🔴【断点已保存】请在页面点查询输验证码' : '⚠️【请输一次验证码】海关会话已过期！';
              }}, 1200);
              let bar = document.getElementById('__mdes_session_alert__');
              if (!bar) {{
                bar = document.createElement('div');
                bar.id = '__mdes_session_alert__';
                bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b91c1c;color:#fff;padding:14px 24px;font-size:16px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:space-between;font-family:system-ui,sans-serif;';
                document.body.appendChild(bar);
              }}
              bar.innerHTML = '<span>⚠️ 海关会话已过期或触发重新验证（原因：' + {safe_reason} + '）。断点已自动保存！请在下方页面点一次【查询】输入验证码，出结果后回到对话回复“继续”！</span><button onclick="this.parentElement.remove()" style="background:#fff;color:#b91c1c;border:none;padding:6px 14px;font-weight:700;cursor:pointer;">知道了</button>';
              try {{
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                [660, 880, 660].forEach((freq, idx) => {{
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.frequency.value = freq;
                  gain.gain.value = 0.16;
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start(ctx.currentTime + idx * 0.22);
                  osc.stop(ctx.currentTime + idx * 0.22 + 0.18);
                }});
              }} catch (_) {{}}
              return true;
            }})()""",
            timeout=10.0,
        )
    except Exception:
        pass

    if os.name == "nt":
        username = os.environ.get("USERNAME", "*")
        try:
            subprocess.Popen(
                ["msg", username, f"【MDES海关采集提醒】海关会话需重新输入一次验证码（{reason}），断点已保存，请在独立Chromium窗口查询解锁后回复继续！"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass


def send_session_keepalive(transport: Any, year: int = 2026) -> bool:
    """Lightweight same-origin GET (/queryData/getMonth) used by official portal to keep HttpSession warm."""
    try:
        ok = transport._eval_async_js(
            f"""(async () => {{
              const ifr = document.querySelector('iframe');
              const f = ifr && ifr.contentWindow && typeof ifr.contentWindow.fetch === 'function'
                ? ifr.contentWindow.fetch.bind(ifr.contentWindow)
                : fetch;
              const r = await f('/queryData/getMonth?year={int(year)}', {{ credentials: 'include' }});
              return r.ok;
            }})()""",
            timeout=15.0,
        )
        return bool(ok)
    except Exception:
        return False
