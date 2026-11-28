import { createContext, useContext } from "react";

/**
 * Field（ITEI 组件层）把 id、说明文字、错误态传给内部控件，
 * Input / Textarea / SelectTrigger 读取后自动挂上 aria 属性。
 */
export type FieldControlContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
};

export const FieldControlContext = createContext<FieldControlContextValue | null>(null);

type ControlProps = {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
};

/** 合并 Field 上下文与控件自身的属性，控件自身的优先 */
export function useFieldControlProps<P extends ControlProps>(props: P): P {
  const field = useContext(FieldControlContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    disabled: props.disabled ?? (field.disabled || undefined),
    required: props.required ?? (field.required || undefined),
    "aria-describedby": props["aria-describedby"] ?? field.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
