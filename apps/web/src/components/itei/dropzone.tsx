import { useId, useState, type DragEvent, type ReactNode } from "react";
import { IconFileTypeCsv, IconUpload, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatBytes } from "./format";

type DropzoneProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** 与 <input accept> 相同，如 ".csv,text/csv" */
  accept?: string;
  /** 字节数上限 */
  maxSize?: number;
  /** 外部错误（例如前端预校验失败），优先于组件自身的类型 / 大小校验 */
  error?: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
  label?: string;
  className?: string;
};

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((rule) => (rule.startsWith(".") ? name.endsWith(rule) : file.type === rule));
}

/**
 * 文件拖拽上传区（CSV 导入）。拖入时边线变 brand-navy、底变 info-bg；
 * 选中后显示文件名与大小，可移除；错误以「✕ 错误：」开头并说明下一步。
 * 整块是 <label>，键盘用户 Tab 到隐藏的文件框后按空格即可选择。
 */
export function Dropzone({
  file,
  onFileChange,
  accept,
  maxSize,
  error,
  disabled,
  hint,
  label = "选择文件",
  className,
}: DropzoneProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const [dragging, setDragging] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const shownError = error ?? ownError;

  function take(next: File | undefined | null) {
    if (!next) return;
    if (!matchesAccept(next, accept)) {
      setOwnError(`文件类型不支持，请上传 ${accept} 格式的文件`);
      return;
    }
    if (maxSize && next.size > maxSize) {
      setOwnError(`文件超过 ${formatBytes(maxSize)}，请拆分后重试`);
      return;
    }
    setOwnError(null);
    onFileChange(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) take(event.dataTransfer.files?.[0]);
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <label
        htmlFor={inputId}
        data-dragging={dragging || undefined}
        data-invalid={shownError ? true : undefined}
        data-disabled={disabled || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-strong bg-surface-sunken px-6 py-8 text-center",
          "transition-colors duration-150 ease-out hover:border-brand-navy has-focus-visible:focus-ring-static",
          "data-[dragging]:border-brand-navy data-[dragging]:bg-info-bg",
          "data-[invalid]:border-danger",
          "data-[disabled]:cursor-not-allowed data-[disabled]:border-border data-[disabled]:text-ink-disabled",
        )}
      >
        <IconUpload className="size-8 text-brand-navy" aria-hidden="true" />
        <span className="body text-ink">
          将文件拖到此处，或<span className="mx-1 text-link underline underline-offset-4">{label}</span>
        </span>
        {hint && <span className="caption text-ink-muted">{hint}</span>}
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-describedby={shownError ? messageId : undefined}
          aria-invalid={shownError ? true : undefined}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {file && (
        <div className="flex items-center gap-3 border border-border bg-surface-raised px-4 py-3">
          <IconFileTypeCsv className="size-6 shrink-0 text-brand-navy" aria-hidden="true" />
          <div className="grid min-w-0 flex-1">
            <span className="truncate body text-ink">{file.name}</span>
            <span className="caption text-ink-muted">{formatBytes(file.size)}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onFileChange(null)} disabled={disabled}>
            <IconX aria-hidden="true" />
            移除
          </Button>
        </div>
      )}
      {shownError && (
        <p id={messageId} role="alert" className="caption text-danger">
          <span aria-hidden="true">✕ </span>错误：{shownError}
        </p>
      )}
    </div>
  );
}
