/**
 * 平台编制说明、统计口径与引用规范（桌面端置于 main 底部与细条 AppFooter 之间）。
 * 使用 section 避免与 AppFooter 的 footer 形成重复 contentinfo 地标。
 */
export function PublicationFooter() {
  return (
    <section
      aria-label="平台说明与引用规范"
      className="hidden border-t-2 border-brand-sky border-b border-banner-border bg-banner-bg text-on-banner md:block"
    >
      <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-10 md:grid-cols-3 md:gap-10 md:px-8">
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">平台定位与编制说明</h2>
          <p className="body-sm text-on-banner-muted">
            本系统由机械工业仪器仪表综合技术经济研究所（ITEI）编制维护，依托《医疗器械产业数据系统指标体系 V3.0》（6 大领域、14 个二级分类、33 项三级指标），服务产业运行分析与决策研究。
          </p>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">数据来源与口径规范</h2>
          <ul className="grid gap-1 body-sm text-on-banner-muted">
            <li>整合国家药监局、工信部、海关总署、国家统计局及公开年报数据</li>
            <li>严格区分期末有效存量与年度首次注册、海关出口额与企业境外营收</li>
            <li>区域分布采用分省统计条形与三线表；地图展示须使用带审图号底图</li>
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">主管与研制单位</h2>
          <p className="body-sm text-on-banner-muted">机械工业仪器仪表综合技术经济研究所（ITEI）</p>
          <p className="caption text-on-banner-muted">
            引用示例：ITEI. 医疗器械产业数据平台（2026年第3季度统计基准）[EB/OL]. 2026-10-28.
          </p>
        </div>
      </div>
    </section>
  );
}
