import { IconLayoutDashboard, IconListDetails, IconTable, IconUpload } from "@tabler/icons-react";
import type { NavItem } from "@/components/itei";

/** 主导航：页眉（桌面）与 TabBar（窄屏）共用。指标档案归在「指标目录」下 */
export const NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "概览", icon: IconLayoutDashboard },
  { href: "/indicators", label: "指标目录", icon: IconListDetails },
  { href: "/observations", label: "观测值", icon: IconTable },
  { href: "/import", label: "数据导入", icon: IconUpload },
];

export function isCurrent(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
