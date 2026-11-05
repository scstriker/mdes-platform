import type { ReactNode } from "react";
import { Card, Tag } from "@/components/itei";
import { Page } from "@/components/layout/page";

/** 阶段 1 的页面占位：外框、路由与组件层已就绪，页面内容在阶段 3 按 ADR-002 迁移 */
export function Placeholder({ title, number, lead, items }: { title: string; number: string; lead: string; items: ReactNode[] }) {
  return (
    <Page title={title} number={number} lead={lead}>
      <Card title="本页规划" meta={<Tag tone="info">待迁移</Tag>}>
        <ul className="grid list-disc gap-1 pl-5 body">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
