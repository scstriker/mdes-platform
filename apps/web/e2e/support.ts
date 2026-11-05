import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

/** 与 playwright.config.ts 一致 */
export const API_BASE = "http://127.0.0.1:8788";
export const SAMPLE_CSV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/samples/trd_sample.csv");

/** 打开带标签的下拉（Radix Select）并选中一项 */
export async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

/** 在首屏渲染前设置主题偏好 */
export async function useTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("mdes-theme", t), theme);
}

export async function expectNoSkeleton(page: Page) {
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
}
