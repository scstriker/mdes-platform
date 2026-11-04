import { useEffect, useMemo, useState } from "react";
import { api, type Cluster, type Indicator, type Observation } from "./api";

type View = "home" | "catalog" | "charts" | "import" | "indicator";

const NAV: { id: Exclude<View, "indicator">; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "catalog", label: "指标" },
  { id: "charts", label: "图表" },
  { id: "import", label: "导入" },
];

export default function App() {
  const [view, setView] = useState<View>("home");
  const [indicatorId, setIndicatorId] = useState("");
  const [cluster, setCluster] = useState("");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.clusters(), api.indicators({ phase: "phase1" })])
      .then(([c, i]) => {
        setClusters(c.items);
        setIndicators(i.items);
        setCluster(c.items[0]?.code || "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  const current = indicators.find((i) => i.id === indicatorId);
  const navCurrent = view === "indicator" ? "catalog" : view;
  const title =
    view === "home"
      ? "一、产业指标"
      : view === "catalog"
        ? "二、指标矩阵"
        : view === "charts"
          ? "三、数据图表"
          : view === "import"
            ? "四、数据导入"
            : current?.name || "指标";

  function openIndicator(id: string) {
    setIndicatorId(id);
    setView("indicator");
  }

  return (
    <div className="shell">
      <header className="hdr">
        <div className="brand">
          <img src="/itei-logo.png" alt="ITEI" />
        </div>
        <div className="title">{title}</div>
        <nav className="actions" aria-label="主导航">
          {NAV.map((item) => (
            <button
              key={item.id}
              aria-current={navCurrent === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="work">
        <aside className="side" aria-label="指标簇">
          <div className="cap">指标簇</div>
          {clusters.map((c, index) => (
            <button
              key={c.code}
              aria-current={cluster === c.code ? "page" : undefined}
              onClick={() => {
                setCluster(c.code);
                setView("catalog");
              }}
            >
              {String(index + 1).padStart(2, "0")}　{c.name.replace(/（.+$/, "")}
            </button>
          ))}
        </aside>
        <main className="main">
          {error && <p className="lead">错误：{error}</p>}
          {view === "home" && (
            <Home clusters={clusters.length} count={indicators.length} onEnter={() => setView("catalog")} />
          )}
          {view === "catalog" && (
            <Catalog
              clusters={clusters}
              indicators={indicators}
              cluster={cluster}
              onOpen={openIndicator}
            />
          )}
          {view === "indicator" && <IndicatorView id={indicatorId} stub={current} />}
          {view === "charts" && <Charts indicators={indicators} initial={indicatorId || indicators[0]?.id || ""} />}
          {view === "import" && <Import />}
        </main>
      </div>
      <footer className="app-footer">
        <span>ITEI</span>
        <span>医疗器械产业数据系统</span>
        <span>一期</span>
        <span className="deco" aria-hidden="true" />
      </footer>
    </div>
  );
}

function Home({ clusters, count, onEnter }: { clusters: number; count: number; onEnter: () => void }) {
  return (
    <>
      <h1 className="sec">一、产业指标</h1>
      <p className="lead">本所一期指标按簇展示。导入观测值后，指标页与图表页读取同一批数据。</p>
      <div className="kpis">
        <div className="kpi hi">
          <span className="l">一期指标</span>
          <span className="v">
            {count}
            <small>项</small>
          </span>
          <span className="d">V12 一期清单</span>
        </div>
        <div className="kpi">
          <span className="l">指标簇</span>
          <span className="v">{clusters}</span>
          <span className="d">左侧目录切换</span>
        </div>
        <div className="kpi">
          <span className="l">可视化</span>
          <span className="v">2</span>
          <span className="d">趋势与结构</span>
        </div>
      </div>
      <button className="btn" onClick={onEnter}>
        进入指标矩阵
      </button>
    </>
  );
}

function Catalog({
  clusters,
  indicators,
  cluster,
  onOpen,
}: {
  clusters: Cluster[];
  indicators: Indicator[];
  cluster: string;
  onOpen: (id: string) => void;
}) {
  const active = clusters.find((c) => c.code === cluster) || clusters[0];
  const leaves = indicators.filter((i) => i.cluster_code === active?.code);
  return (
    <>
      <h1 className="sec">二、指标矩阵</h1>
      <h2 className="sub">
        <b>{active?.code}</b>
        {active?.name}
      </h2>
      <div className="card">
        <div className="meta">{leaves.length} 个一期指标</div>
        <div className="leaves">
          {leaves.map((i) => (
            <button key={i.id} onClick={() => onOpen(i.id)}>
              {i.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function useSeries(id: string) {
  const [items, setItems] = useState<Observation[]>([]);
  const [detail, setDetail] = useState<Indicator | null>(null);
  useEffect(() => {
    if (!id) return;
    api.observations({ indicator_id: id }).then((r) => setItems(r.items)).catch(() => setItems([]));
    api.indicator(id).then(setDetail).catch(() => setDetail(null));
  }, [id]);
  return { items, detail };
}

function ChartsBlock({ items }: { items: Observation[] }) {
  const series = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      if (row.value_num == null) continue;
      map.set(row.period, (map.get(row.period) || 0) + row.value_num);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      const label = String(row.dims?.partner || row.dims?.trade_type || row.dims?.metric || row.geo || "合计");
      map.set(label, (map.get(label) || 0) + (row.value_num || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);
  const maxBar = Math.max(...series.map(([, v]) => v), 1);
  const maxRank = Math.max(...ranks.map(([, v]) => v), 1);
  const peak = series.reduce((best, cur) => (cur[1] > best[1] ? cur : best), ["", 0] as [string, number]);
  return (
    <div className="charts">
      <article className="card">
        <h3>期间趋势</h3>
        <div className="meta">{series.length ? `${series[0][0]} 至 ${series.at(-1)?.[0]}` : "尚无数值"}</div>
        <div className="bars">
          {series.map(([period, value]) => (
            <i key={period} className={period === peak[0] ? "on" : ""} title={`${period} ${value}`} style={{ height: `${(value / maxBar) * 100}%` }} />
          ))}
        </div>
      </article>
      <article className="card">
        <h3>结构对比</h3>
        <div className="rank">
          {ranks.map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <b style={{ width: `${(value / maxRank) * 100}%` }} />
              <em>{value}</em>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function IndicatorView({ id, stub }: { id: string; stub?: Indicator }) {
  const { items, detail } = useSeries(id);
  const latest = items.find((x) => x.value_num != null);
  const spec = detail?.spec_json as { definition?: string } | undefined;
  return (
    <>
      <h1 className="sec">{detail?.name || stub?.name}</h1>
      <p className="lead">{detail?.id || stub?.id} · {detail?.update_freq || stub?.update_freq || "更新频率待定"}</p>
      <div className="kpis">
        <div className="kpi hi">
          <span className="l">最近数值</span>
          <span className="v">
            {latest?.value_num ?? "—"}
            <small>{latest?.unit}</small>
          </span>
          <span className="d">{latest ? latest.period : "请先导入观测值"}</span>
        </div>
        <div className="kpi">
          <span className="l">记录数</span>
          <span className="v">{items.length}</span>
          <span className="d">已导入观测</span>
        </div>
        <div className="kpi">
          <span className="l">来源</span>
          <span className="v" style={{ fontSize: 20 }}>
            {detail?.source_kind || stub?.source_kind}
          </span>
          <span className="d">{detail?.phase === "phase1" ? "一期" : "后期"}</span>
        </div>
      </div>
      <ChartsBlock items={items} />
      <table className="data">
        <thead>
          <tr>
            <th>期间</th>
            <th>地域</th>
            <th>数值</th>
            <th>单位</th>
            <th>维度</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td className="code">{row.period}</td>
              <td>{row.geo}</td>
              <td className="num">{row.value_num ?? row.value_text}</td>
              <td>{row.unit}</td>
              <td className="code">{JSON.stringify(row.dims)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>该指标还没有导入数据</td>
            </tr>
          )}
        </tbody>
      </table>
      {spec?.definition && <p className="lead" style={{ marginTop: 24 }}>{spec.definition.slice(0, 360)}</p>}
    </>
  );
}

function Charts({ indicators, initial }: { indicators: Indicator[]; initial: string }) {
  const [id, setId] = useState(initial || "TRD-001");
  useEffect(() => {
    if (initial) setId(initial);
  }, [initial]);
  const { items } = useSeries(id);
  return (
    <>
      <h1 className="sec">三、数据图表</h1>
      <div className="field">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {indicators.map((i) => (
            <option key={i.id} value={i.id}>
              {i.id} {i.name}
            </option>
          ))}
        </select>
      </div>
      <ChartsBlock items={items} />
    </>
  );
}

function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1 className="sec">四、数据导入</h1>
      <p className="lead">CSV 列：indicator_id、period，以及 value_num 或 value_text。可选 geo、unit、dims。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          try {
            setResult(JSON.stringify(await api.importCsv(file), null, 2));
          } catch (err) {
            setResult(`错误：${String(err)}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn" type="submit" disabled={!file || busy}>
          {busy ? "导入中" : "开始导入"}
        </button>
      </form>
      {result && <pre className="out">{result}</pre>}
    </>
  );
}
