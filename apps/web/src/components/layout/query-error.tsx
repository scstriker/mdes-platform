import { IconRefresh } from "@tabler/icons-react";
import { Notice } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api";

/** 请求失败：显示原因与「重试」，不把失败当成空数据 */
export function QueryError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <Notice
      tone="danger"
      title={describeError(error)}
      className={className}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <IconRefresh aria-hidden="true" />
            重试
          </Button>
        )
      }
    />
  );
}
