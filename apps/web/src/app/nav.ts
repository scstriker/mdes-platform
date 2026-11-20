import {
  IconBuildingFactory2,
  IconCertificate,
  IconFileDescription,
  IconHome,
  IconListDetails,
  IconWorld,
} from "@tabler/icons-react";
import type { NavItem } from "@/components/itei";

export const PRODUCT_NAME = "医疗器械产业数据平台";

/** 前台桌面主导航：与《指标体系 V3.0》六大业务领域及报告体系一一对应，零抽象黑话 */
export const PUBLIC_NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "首页", icon: IconHome },
  { href: "/products", label: "注册与产品", icon: IconCertificate },
  { href: "/enterprises", label: "企业与机构", icon: IconBuildingFactory2 },
  { href: "/trade", label: "进出口贸易", icon: IconWorld },
  { href: "/reports", label: "政策与报告", icon: IconFileDescription },
  { href: "/system", label: "指标目录", icon: IconListDetails },
];

/** 窄屏底部 TabBar：严格遵循 ITEI 手机端 ≤ 5 项规范 */
export const MOBILE_NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "首页", icon: IconHome },
  { href: "/products", label: "注册产品", icon: IconCertificate },
  { href: "/enterprises", label: "企业机构", icon: IconBuildingFactory2 },
  { href: "/reports", label: "政策报告", icon: IconFileDescription },
  { href: "/system", label: "指标目录", icon: IconListDetails },
];

/** @deprecated 使用 PUBLIC_NAV；保留别名以免旧引用报错 */
export const NAV = PUBLIC_NAV;

export function isCurrent(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
