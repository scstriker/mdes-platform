import type { ReactNode } from "react";
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const TONE: Record<NoticeTone, { box: string; icon: string; Icon: typeof IconInfoCircle }> = {
  info: { box: "bg-info-bg", icon: "text-info", Icon: IconInfoCircle },
  success: { box: "bg-success-bg", icon: "text-success", Icon: IconCircleCheck },
  warning: { box: "bg-warning-bg", icon: "text-warning", Icon: IconAlertTriangle },
  danger: { box: "bg-danger-bg", icon: "text-danger", Icon: IconAlertCircle },
};

type NoticeProps = {
  tone?: NoticeTone;
  /** 短语式标题；danger 自动加「错误：」前缀（红色与「当前项」同色，必须有字样） */
  title: ReactNode;
  children?: ReactNode;
  /** 右侧操作，如「重试」 */
  action?: ReactNode;
  className?: string;
};

/**
 * 状态横幅：*-bg 浅底 + 1px 边线 + 图标 + 文字，从不只靠颜色。
 * 不用左侧色条（那是 SectionTitle 三级的专属）。
 */
export function Notice({ tone = "info", title, children, action, className }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex flex-wrap items-start gap-3 border border-border px-4 py-3 body text-ink", t.box, className)}
    >
      <t.Icon className={cn("mt-0.5 size-5 shrink-0", t.icon)} aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold">
          {tone === "danger" && <span className="text-danger">错误：</span>}
          {title}
        </p>
        {children && <div className="body-sm text-ink-muted">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}
