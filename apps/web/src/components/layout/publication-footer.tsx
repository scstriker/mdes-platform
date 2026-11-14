/**
 * 发布物页脚三栏（示意稿）：方法说明、数据来源、联系与引用。
 * 置于 main 内、细条 AppFooter 之上。
 */
export function PublicationFooter() {
  return (
    <footer className="grid gap-8 border-t-2 border-brand-navy bg-brand-navy px-4 py-10 text-on-brand md:grid-cols-3 md:gap-10 md:px-8">
      <section className="grid gap-2">
        <h2 className="title-nav">编制说明</h2>
        <p className="body-sm opacity-90">
          本平台按期发布产业运行监测结果，指标口径以《指标体系 V3.0》为准。引用请注明期次、发布日期与编制单位。
        </p>
      </section>
      <section className="grid gap-2">
        <h2 className="title-nav">方法与来源</h2>
        <ul className="grid gap-1 body-sm opacity-90">
          <li>公开数据整理入库，保留溯源与更新频度</li>
          <li>区域统计须使用带审图号的标准底图（地图暂未上线）</li>
          <li>进出口等与海关统计口径对照校验</li>
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="title-nav">联系</h2>
        <p className="body-sm opacity-90">机械工业仪器仪表综合技术经济研究所（ITEI）</p>
        <p className="caption opacity-75">引用格式：ITEI. 医疗器械产业运行监测, 2026年第3期, 2026-10-28.</p>
      </section>
    </footer>
  );
}