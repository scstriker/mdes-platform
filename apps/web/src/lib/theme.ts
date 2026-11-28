import { useEffect, useSyncExternalStore } from "react";

/**
 * 主题偏好：system（跟随系统，删除 data-theme，交给 tokens.css 的媒体查询）/ light / dark。
 * index.html 里有同逻辑的内联脚本，在首屏渲染前写入 data-theme，避免闪烁。
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mdes-theme";
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* 隐私模式下写不进去时只在本次会话生效 */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => "system");
}

/** 当前实际生效的主题（system 时取系统偏好） */
export function useResolvedTheme(): ResolvedTheme {
  const pref = useThemePreference();
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** 页面标题 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ITEI 医疗器械产业数据系统` : "ITEI 医疗器械产业数据系统";
  }, [title]);
}
