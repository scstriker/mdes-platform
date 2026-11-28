import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type TreeNode = {
  id: string;
  label: ReactNode;
  /** 编号前缀，如簇序号「01」 */
  number?: string;
  /** 右侧计数，如指标数 */
  count?: ReactNode;
  children?: TreeNode[];
};

type FlatNode = { node: TreeNode; level: number; parentId: string | null; expandable: boolean };

type TreeProps = {
  nodes: TreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 受控展开；不传则内部管理，初始值为 defaultExpandedIds */
  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
  "aria-label": string;
  className?: string;
};

const INDENT = ["pl-3", "pl-9", "pl-15", "pl-21"];

function flatten(nodes: TreeNode[], expanded: Set<string>, level = 1, parentId: string | null = null): FlatNode[] {
  return nodes.flatMap((node) => {
    const expandable = Boolean(node.children?.length);
    const self: FlatNode = { node, level, parentId, expandable };
    return expandable && expanded.has(node.id)
      ? [self, ...flatten(node.children!, expanded, level + 1, node.id)]
      : [self];
  });
}

/**
 * 树（簇树）。样式沿用 ITEI 桌面导航：当前项 info-bg 底 + 左侧 4px brand-navy + 深蓝加粗字。
 * 键盘：↑↓ 移动，→ 展开 / 进入子项，← 收起 / 回到父项，Home / End，Enter / 空格选中。
 */
export function Tree({
  nodes,
  selectedId,
  onSelect,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  className,
  ...aria
}: TreeProps) {
  const [innerExpanded, setInnerExpanded] = useState<string[]>(defaultExpandedIds);
  const expanded = useMemo(() => new Set(expandedIds ?? innerExpanded), [expandedIds, innerExpanded]);
  const visible = useMemo(() => flatten(nodes, expanded), [nodes, expanded]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement>());

  const tabStop = visible.some((f) => f.node.id === focusedId)
    ? focusedId
    : visible.some((f) => f.node.id === selectedId)
      ? selectedId
      : visible[0]?.node.id;

  function setExpanded(id: string, open: boolean) {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    const ids = [...next];
    if (!expandedIds) setInnerExpanded(ids);
    onExpandedChange?.(ids);
  }

  function focus(id: string | undefined) {
    if (!id) return;
    setFocusedId(id);
    refs.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number) {
    const current = visible[index];
    const id = current.node.id;
    const keys: Record<string, () => void> = {
      ArrowDown: () => focus(visible[index + 1]?.node.id),
      ArrowUp: () => focus(visible[index - 1]?.node.id),
      Home: () => focus(visible[0]?.node.id),
      End: () => focus(visible.at(-1)?.node.id),
      ArrowRight: () => {
        if (!current.expandable) return;
        if (!expanded.has(id)) setExpanded(id, true);
        else focus(visible[index + 1]?.node.id);
      },
      ArrowLeft: () => {
        if (current.expandable && expanded.has(id)) setExpanded(id, false);
        else focus(current.parentId ?? undefined);
      },
      Enter: () => onSelect?.(id),
      " ": () => onSelect?.(id),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  }

  return (
    <ul role="tree" aria-label={aria["aria-label"]} className={cn("grid", className)}>
      {visible.map(({ node, level, expandable }, index) => {
        const selected = node.id === selectedId;
        const open = expanded.has(node.id);
        return (
          <li
            key={node.id}
            ref={(el) => {
              if (el) refs.current.set(node.id, el);
              else refs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={level}
            aria-selected={selected}
            aria-expanded={expandable ? open : undefined}
            tabIndex={node.id === tabStop ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, index)}
            onFocus={(e) => {
              if (e.target === e.currentTarget) setFocusedId(node.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedId(node.id);
              onSelect?.(node.id);
              if (expandable && !open) setExpanded(node.id, true);
            }}
            className={cn(
              "flex min-h-10 cursor-pointer items-center gap-2 border-l-4 border-transparent py-2 pr-3 body text-ink select-none focus-ring-inset",
              "transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground",
              INDENT[Math.min(level - 1, INDENT.length - 1)],
              selected && "border-l-brand-navy bg-info-bg font-bold text-brand-navy",
            )}
          >
            {expandable ? (
              <span
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusedId(node.id);
                  setExpanded(node.id, !open);
                }}
                className="-ml-1 flex size-5 shrink-0 items-center justify-center text-ink-muted"
              >
                <IconChevronRight className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
              </span>
            ) : (
              level > 1 && <span aria-hidden="true" className="-ml-1 size-5 shrink-0" />
            )}
            {node.number && <span className="shrink-0 tabular-nums">{node.number}</span>}
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {node.count !== undefined && (
              <span className="shrink-0 caption font-normal text-ink-muted tabular-nums">{node.count}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
