import flatTokens from "../../../design/itei/itei-design-system/tokens.flat.json";
import type { ChartTheme } from "./theme";

/**
 * 出版物导出固定浅色主题：直接读取 Style Dictionary 产物 tokens.flat.json 的 light 分支，
 * 源码零硬编码色值，同时确保无论浏览器处于深色主题还是数据表视图，导出的 SVG / PNG / XLSX / PPTX 均为纯净白底出版物配色。
 */
export const PUBLICATION_LIGHT_TOKENS = flatTokens.color.light;

export const PUBLICATION_FONT_SANS = flatTokens.families.sans;

export const PUBLICATION_PPTX_FONT_FACE = "Microsoft YaHei";

export const PUBLICATION_LIGHT_THEME: ChartTheme = {
  series: [
    PUBLICATION_LIGHT_TOKENS["chart-1"],
    PUBLICATION_LIGHT_TOKENS["chart-2"],
    PUBLICATION_LIGHT_TOKENS["chart-3"],
    PUBLICATION_LIGHT_TOKENS["chart-4"],
    PUBLICATION_LIGHT_TOKENS["chart-5"],
  ],
  emphasis: PUBLICATION_LIGHT_TOKENS["chart-3"],
  brandNavy: PUBLICATION_LIGHT_TOKENS["brand-navy"],
  brandSky: PUBLICATION_LIGHT_TOKENS["brand-sky"],
  brandRed: PUBLICATION_LIGHT_TOKENS["brand-red"],
  infoBg: PUBLICATION_LIGHT_TOKENS["info-bg"],
  surfaceSunken: PUBLICATION_LIGHT_TOKENS["surface-sunken"],
  ink: PUBLICATION_LIGHT_TOKENS.ink,
  muted: PUBLICATION_LIGHT_TOKENS["ink-muted"],
  border: PUBLICATION_LIGHT_TOKENS.border,
  borderStrong: PUBLICATION_LIGHT_TOKENS["border-strong"],
  surface: PUBLICATION_LIGHT_TOKENS["surface-raised"],
  fontFamily: PUBLICATION_FONT_SANS,
};
