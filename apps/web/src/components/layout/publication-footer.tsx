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
      <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-9 md:grid-cols-3 md:gap-10 md:px-8">
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">平台定位与研究范畴</h2>
          <p className="body-sm text-on-banner-muted">
            本平台由机械工业仪器仪表综合技术经济研究所（ITEI）研制维护，围绕医疗器械审评准入、产品谱系、重点企业与服务机构、政策标准及进出口贸易六大领域开展常态化产业运行监测与决策支撑研究。
          </p>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">数据来源与统计口径</h2>
          <ul className="grid gap-1 body-sm text-on-banner-muted">
            <li>权威数据源自国家药监局、工信部、海关总署、国家统计局及上市公司定期报告</li>
            <li>严格区分期末有效注册证存量与年度首次注册新增量、海关报关出口额与企业境外营收</li>
            <li>区域统计按注册人法人所在地及境内货源地归集，关键总量序列经官方统计年报交叉核验</li>
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="title-nav text-on-banner">主管与研制单位</h2>
          <p className="body-sm text-on-banner-muted">机械工业仪器仪表综合技术经济研究所（ITEI）</p>
          <p className="caption text-on-banner-muted">
            标准文献引用：机械工业仪器仪表综合技术经济研究所. 医疗器械产业数据平台（2026年第3季度基准）[EB/OL]. 2026-10-28.
          </p>
        </div>
      </div>
    </section>
  );
}
