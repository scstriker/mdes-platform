import type { Icon } from "@tabler/icons-react";

/** 主导航项：页眉（桌面）与 TabBar（窄屏）共用 */
export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  current?: boolean;
};
