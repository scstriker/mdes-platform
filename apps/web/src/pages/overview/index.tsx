import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { IconSearch } from "@tabler/icons-react";
import { formatNumber } from "@/components/itei";
import { HeroCarousel } from "@/components/layout/hero-carousel";
import { ReportCoverThumb } from "@/components/layout/report-cover-thumb";
import { Button } from "@/components/ui/button";
import { ISSUE } from "@/content/issue";
import { cn } from "@/lib/utils";

/**
 * 医疗器械产业数据平台首页（向国家部委高端智库与中国信通院克制范式对齐）：
 * 1. 外显单行分域检索栏（直达对应业务子库）
 * 2. 经典首屏轮播（左滚动 Banner + 4 枚微缩缩略图 ｜ 右极简标题 + 短梗概 + 分页圆点）
 * 3. 极静一行 4 项压舱石核心数字
 * 4. 7:5 双栏：ITEI 研判（5 条纯单行）｜ 权威发布（Gemini 封面图 + 单行报告名）
 * 全页统一单字体与「标题（title-sub）/ 正文（body）」两档字号，低认知负担、约一屏看完。
 */
export default function OverviewPage() {
  const navigate = useNavigate();
  const [searchScope, setSearchScope] = useState<string>(ISSUE.searchScopes[0].path);
  const [searchKeyword, setSearchKeyword] = useState("");

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = searchKeyword.trim();
    if (q) {
      navigate(`${searchScope}?q=${encodeURIComponent(q)}`);
    } else {
      navigate(searchScope);
    }
  }

  return (
    <div className="w-full overflow-x-clip bg-surface">
      {/* 外显单行分域检索栏 */}
      <section aria-label="全库分域检索" className="bg-surface pt-6">
        <div className="mx-auto w-full max-w-content px-4 md:px-8">
          <form
            role="search"
            aria-label="全库分域检索"
            onSubmit={handleSearchSubmit}
            className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
          >
            <select
              aria-label="检索范围"
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value)}
              className="h-10 shrink-0 rounded-sm border border-border-strong bg-surface px-3 body text-ink focus-ring sm:w-40"
            >
              {ISSUE.searchScopes.map((scope) => (
                <option key={scope.path} value={scope.path}>
                  {scope.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              aria-label="检索关键词"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="检索器械名称、注册证号、企业、政策或指标…"
              className="h-10 min-w-0 flex-1 rounded-sm border border-border-strong bg-surface px-3.5 body text-ink placeholder:text-ink-muted focus-ring"
            />
            <Button type="submit" className="shrink-0">
              <IconSearch size={16} aria-hidden="true" />
              检索
            </Button>
          </form>
        </div>
      </section>

      {/* 第 1 层：经典克制首屏轮播 */}
      <HeroCarousel />

      {/* 极静一行 4 项压舱石核心数字（仅用正文标签 + 标题档数值，不造额外字号层级） */}
      <section aria-label="核心监测指标" className="bg-surface">
        <div className="mx-auto w-full max-w-content px-4 md:px-8">
          <div className="grid grid-cols-2 border-y border-border md:grid-cols-4 md:divide-x md:divide-border">
            {ISSUE.homepageStats.map((stat, idx) => (
              <Link
                key={stat.id}
                to={stat.href}
                className={cn(
                  "group flex min-w-0 flex-col justify-between gap-1 px-3 py-3.5 transition-colors duration-150 hover:bg-surface-sunken focus-ring-inset md:flex-row md:items-baseline md:gap-3 md:px-4 md:first:pl-1 md:last:pr-1",
                  idx < 2 && "max-md:border-b max-md:border-border",
                  idx % 2 === 0 && "max-md:border-r max-md:border-border",
                )}
              >
                <span className="body whitespace-nowrap text-ink-muted transition-colors duration-150 group-hover:text-brand-navy">
                  {stat.label}
                </span>
                <span className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
                  <span className="title-sub text-brand-navy">{formatNumber(stat.value, stat.digits)}</span>
                  <span className="body text-ink-muted">{stat.unit}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 第 2 层：7:5 双栏（ITEI 研判 5 条纯单行 ｜ 权威发布 2 份封面图文） */}
      <section aria-label="研判观点与权威发布" className="bg-surface py-9 md:py-11">
        <div className="mx-auto grid w-full max-w-content gap-10 px-4 md:px-8 lg:grid-cols-12 lg:gap-12">
          {/* 左 7 列：ITEI 研判 */}
          <div className="min-w-0 lg:col-span-7">
            <div className="mb-2 flex items-baseline justify-between border-b border-border pb-2.5">
              <h2 className="-mb-2.75 border-b-2 border-brand-navy pb-2.5 title-sub text-brand-navy">
                ITEI 研判
              </h2>
              <Link
                to="/reports"
                className="body text-ink-muted transition-colors duration-150 hover:text-link focus-ring"
              >
                更多 &raquo;
              </Link>
            </div>

            <ul className="grid">
              {ISSUE.homepageInsights.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-3 py-2.25">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "shrink-0",
                      item.featured ? "size-1.5 bg-brand-red" : "size-1 bg-border-strong",
                    )}
                  />
                  <Link
                    to={item.href}
                    className="min-w-0 flex-1 truncate body text-ink transition-colors duration-150 hover:text-link focus-ring"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 右 5 列：权威发布 */}
          <div className="min-w-0 lg:col-span-5">
            <div className="mb-2 flex items-baseline justify-between border-b border-border pb-2.5">
              <h2 className="-mb-2.75 border-b-2 border-brand-navy pb-2.5 title-sub text-brand-navy">
                权威发布
              </h2>
              <Link
                to="/reports"
                className="body text-ink-muted transition-colors duration-150 hover:text-link focus-ring"
              >
                更多 &raquo;
              </Link>
            </div>

            <div className="grid gap-5 pt-2.5">
              {ISSUE.homepageBriefings.map((pub) => (
                <Link
                  key={pub.id}
                  to={pub.href}
                  className="group flex items-center gap-4 focus-ring"
                >
                  <ReportCoverThumb variant={pub.coverVariant} label={pub.coverLabel} />
                  <span className="min-w-0 body text-ink transition-colors duration-150 group-hover:text-link">
                    {pub.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
