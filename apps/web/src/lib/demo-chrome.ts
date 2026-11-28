/** 是否在页面上显示「示意 / 编辑位」等占位文案（生产默认关闭；demo 模式与开发可选用） */
export function showDemoChrome(): boolean {
  if (import.meta.env.MODE === "demo") return true;
  if (import.meta.env.PROD) return false;
  return import.meta.env.VITE_SHOW_DEMO_CHROME === "true";
}