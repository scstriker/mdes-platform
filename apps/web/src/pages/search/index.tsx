import { Link, useSearchParams } from "react-router";
import { IconArrowRight } from "@tabler/icons-react";
import { EmptyState, formatNumber, Tag, TextLink } from "@/components/itei";
import { PUBLIC_SCOPES, queryAllPublicGrouped } from "@/lib/search/search-index";

/**
 * 全站跨库检索结果页（/search?q=...）：
 * 聚合展示「注册与产品 / 企业与机构 / 进出口贸易 / 政策与报告 / 指标目录」五大知识域命中条目，
 * 彻底解决此前首页默认搜全站却只跳 /system 导致搜企业、产品、HS码返回 0 条的问题。
 */
export default function GlobalSearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const { total, groups } = queryAllPublicGrouped(q);
  const hotQueries = PUBLIC_SCOPES[0].hotQueries;

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="grid gap-2 border-b border-border pb-6">
        <p className="label text-brand-navy">跨库联合检索 · 覆盖五大专题知识库</p>
        <h1 className="title-page text-brand-navy">
          {q ? `「${q}」的全站检索结果` : "全站跨库检索"}
        </h1>
        <p className="body text-ink-muted">
          {q ? (
            <>
              在注册产品、企业与科研临床机构、海关贸易、政策标准报告及指标体系中共匹配到{" "}
              <strong className="font-semibold tabular-nums text-ink">{formatNumber(total)}</strong> 条记录。
            </>
          ) : (
            "支持跨库联合检索医疗器械注册批件、上市与单项冠军企业、检验与临床机构、HS 税号、产业政策及三级指标定义。"
          )}
        </p>
      </header>

      {total === 0 ? (
        <EmptyState
          title={`未找到与「${q}」直接匹配的记录`}
          description="请尝试缩短关键词（如搜企业简称、器械核心词或 4 位 HS 编码），或直接从下方热门主题进入专题库。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hotQueries.map((h) => (
                <Link
                  key={h.label}
                  to={`/search?q=${encodeURIComponent(h.query)}`}
                  className="border border-border bg-surface-sunken px-3 py-1.5 body-sm text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
                >
                  {h.label}
                </Link>
              ))}
            </div>
          }
        />
      ) : (
        <div className="grid gap-8">
          {/* 分栏命中计数导航条 */}
          <nav aria-label="检索结果分类跳转" className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <a
                key={g.scope}
                href={`#group-${g.scope.slice(1)}`}
                className="inline-flex items-center gap-1.5 border border-border bg-surface-sunken px-3 py-1.5 body-sm font-semibold text-ink transition-colors hover:border-brand-navy hover:text-brand-navy focus-ring"
              >
                <span>{g.label}</span>
                <span className="tabular-nums text-brand-navy">({g.items.length})</span>
              </a>
            ))}
          </nav>

          {groups.map((group) => (
            <section
              key={group.scope}
              id={`group-${group.scope.slice(1)}`}
              className="grid gap-3 border-t-2 border-brand-navy pt-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="title-sub text-ink">
                  {group.label}{" "}
                  <span className="body-sm font-normal tabular-nums text-ink-muted">
                    （共 {group.items.length} 条）
                  </span>
                </h2>
                {q && (
                  <TextLink to={`${group.scope}?q=${encodeURIComponent(q)}`}>
                    进入{group.label}专题库深入筛选 →
                  </TextLink>
                )}
              </div>

              <ul className="divide-y divide-border border-y border-border">
                {group.items.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="flex items-start justify-between gap-4 px-2 py-3.5 transition-colors hover:bg-surface-sunken focus-ring"
                    >
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="body font-semibold text-brand-navy">{item.title}</span>
                          <Tag size="sm" tone="info">
                            {item.badge}
                          </Tag>
                        </div>
                        <p className="body-sm text-ink-muted">{item.subtitle}</p>
                      </div>
                      <IconArrowRight size={16} className="mt-1.5 shrink-0 text-ink-muted" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
