export type AdminNavItem = {
  href: string;
  label: string;
  /** 分组标题，同组项共用 */
  group: string;
  /** 角标数字；undefined 不显示 */
  count?: number;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "入库概况", group: "数据导入" },
  { href: "/admin/import", label: "新建导入", group: "数据导入" },
  { href: "/admin/batches", label: "导入记录", group: "数据导入" },
  { href: "/admin/indicators", label: "工程指标库", group: "底座与核查" },
  { href: "/admin/observations", label: "观测值核查", group: "底座与核查" },
];
