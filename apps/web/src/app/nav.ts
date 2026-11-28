import {
  IconArchive,
  IconBuildingFactory2,
  IconBuildingHospital,
  IconCategory2,
  IconCertificate,
  IconChartBar,
  IconChartLine,
  IconCpu,
  IconFileDescription,
  IconHome,
  IconListDetails,
  IconRulerMeasure,
  IconScale,
  IconShieldCheck,
  IconWorld,
} from "@tabler/icons-react";
import type { NavItem } from "@/components/itei";

export const PRODUCT_NAME = "医疗器械产业数据平台";

/** 前台桌面主研究导航（7 项）：与产业总览、市场、技术、产品、企业、贸易及研究出版物一一对应 */
export const PUBLIC_NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "产业总览", icon: IconHome },
  { href: "/markets", label: "市场", icon: IconChartBar },
  { href: "/technologies", label: "技术", icon: IconCpu },
  { href: "/products", label: "产品", icon: IconCertificate },
  { href: "/enterprises", label: "企业", icon: IconBuildingFactory2 },
  { href: "/trade", label: "进出口贸易", icon: IconWorld },
  { href: "/reports", label: "研究报告", icon: IconFileDescription },
];

/** 页眉「资料查询」下拉菜单（7 项）：承载标准统计成果库与六大权威名录/规范查询页 */
export const REFERENCE_NAV: Omit<NavItem, "current">[] = [
  { href: "/statistics", label: "统计成果库", icon: IconChartLine },
  { href: "/regulation/registrations", label: "注册与准入", icon: IconShieldCheck },
  { href: "/institutions", label: "机构名录", icon: IconBuildingHospital },
  { href: "/policies", label: "产业政策", icon: IconScale },
  { href: "/standards", label: "技术标准", icon: IconRulerMeasure },
  { href: "/sources", label: "官方来源", icon: IconArchive },
  { href: "/system", label: "指标与口径", icon: IconListDetails },
];

/** 窄屏底部 TabBar（5 项）：4 项高频直达 + 第 5 项「全部」打开全量研究与资料查询抽屉 */
export const MOBILE_NAV: Omit<NavItem, "current">[] = [
  { href: "/", label: "总览", icon: IconHome },
  { href: "/markets", label: "市场", icon: IconChartBar },
  { href: "/products", label: "产品", icon: IconCertificate },
  { href: "/trade", label: "贸易", icon: IconWorld },
  { href: "#all", label: "全部", icon: IconCategory2 },
];

/** @deprecated 使用 PUBLIC_NAV；保留别名以免旧引用报错 */
export const NAV = PUBLIC_NAV;

export function isCurrent(href: string, pathname: string) {
  if (href.startsWith("#")) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function isReferenceRoute(pathname: string) {
  return REFERENCE_NAV.some((item) => isCurrent(item.href, pathname));
}
