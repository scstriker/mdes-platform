import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FieldControlContext } from "@/components/ui/field-context";

type FieldProps = {
  label: ReactNode;
  required?: boolean;
  /** 说明文字；禁用时写明原因 */
  help?: ReactNode;
  /** 错误原因与下一步，组件自动加「✕ 错误：」前缀 */
  error?: ReactNode;
  disabled?: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 表单字段（ITEI Input 规则）：标签在上方、间距 6px；必填星号 brand-red；
 * 错误态边线与说明变 brand-red，说明以「✕ 错误：」开头（红色同时是「当前项」色，必须有字样）。
 * 内部的 Input / Textarea / SelectTrigger 自动获得 id、aria-describedby、aria-invalid。
 */
export function Field({ label, required, help, error, disabled, id, children, className }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const messageId = `${controlId}-message`;
  const message = error ?? help;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-brand-red">
            *
          </span>
        )}
      </Label>
      <FieldControlContext.Provider
        value={{
          id: controlId,
          describedBy: message ? messageId : undefined,
          invalid: Boolean(error),
          required: Boolean(required),
          disabled: Boolean(disabled),
        }}
      >
        {children}
      </FieldControlContext.Provider>
      {message && (
        <p id={messageId} className={cn("caption", error ? "text-danger" : "text-ink-muted")}>
          {error ? (
            <>
              <span aria-hidden="true">✕ </span>错误：{error}
            </>
          ) : (
            help
          )}
        </p>
      )}
    </div>
  );
}
