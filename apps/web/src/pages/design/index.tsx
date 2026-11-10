import { useSearchParams } from "react-router";
import { Page } from "@/components/layout/page";
import { Gallery } from "./gallery";

/**
 * /__design 组件验收页：逐个展示 ITEI 组件层的各种状态，浅色与深色各一屏，
 * 与设计系统 showcase.html 对照验收。?theme=light 或 ?theme=dark 只看一种主题。
 */
export default function DesignPage() {
  const [params] = useSearchParams();
  const only = params.get("theme");
  const themes: ("light" | "dark")[] = only === "light" || only === "dark" ? [only] : ["light", "dark"];
  return (
    <Page
      title="组件验收"
      lead="ITEI 组件层逐个展示各状态，浅色与深色各一屏，对照设计系统 showcase.html 验收。悬停、按下等动态状态请在页面上操作核对。"
    >
      <div className="grid gap-8">
        {themes.map((theme) => (
          <section
            key={theme}
            id={`theme-${theme}`}
            data-theme={theme}
            aria-label={theme === "light" ? "浅色主题" : "深色主题"}
            className="border border-border bg-surface p-4 text-ink md:p-6"
          >
            <p className="mb-6 label text-ink-muted">{theme === "light" ? "浅色主题" : "深色主题"}</p>
            <Gallery theme={theme} />
          </section>
        ))}
      </div>
    </Page>
  );
}
