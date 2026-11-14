export type AdminNavItem = {
  href: string;
  label: string;
  /** 分组标题，同组项共用 */
  group: string;
  /** 角标数字；undefined 不显示 */
  count?: number;
  /** 未开放：可点但进占位，或禁用 */
  disabled?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "概况", group: "数据导入" },
  { href: "/admin/import", label: "新建导入", group: "数据导入" },
  { href: "/admin/batches", label: "导入记录", group: "数据导入" },
  { href: "/admin/files", label: "原始文件", group: "资料", disabled: true },
  { href: "/admin/release", label: "本期发布", group: "发布", disabled: true },
];
