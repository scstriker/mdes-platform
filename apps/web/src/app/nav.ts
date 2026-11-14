import {
  IconChartBar,
  IconListDetails,
  IconMap2,
  IconBooks,
  IconRadar2,
} from "@tabler/icons-react";
import type { NavItem } from "@/components/itei";

export const PRODUCT_NAME = "医疗器械产业运行监测";

/** 前台主导航：页眉（桌面）与 TabBar（窄屏）共用 */
export const PUBLIC_NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "态势总览", icon: IconRadar2 },
  { href: "/monitoring", label: "运行监测", icon: IconChartBar },
  { href: "/regions", label: "区域画像", icon: IconMap2 },
  { href: "/research", label: "研究发布", icon: IconBooks },
  { href: "/system", label: "指标体系", icon: IconListDetails },
];

/** @deprecated 使用 PUBLIC_NAV；保留别名以免旧引用报错 */
export const NAV = PUBLIC_NAV;

export function isCurrent(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
