import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Archive,
  Boxes,
  ChevronRight,
  Database,
  Gauge,
  HardDrive,
  Layers3,
  Menu,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Terminal,
  Trash2,
  UploadCloud,
  Wifi,
  Zap,
} from "lucide-react";
import "./style.css";
import "./lab.css";
import "./visual.css";
import "./professor.css";
import "./workload.css";
import "./explainer.css";
const api = async (path, options = {}) => {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
};
const nav = [
  ["/", "Overview", Gauge],
  ["/workload", "Live simulation", Activity],
  ["/sample", "Sample payload", UploadCloud],
  ["/crud", "Manual operations", Terminal],
  ["/memtable", "MemTable", Database],
  ["/wal", "WAL records", Archive],
  ["/search", "Read pipeline", Search],
  ["/sstables", "SSTables", Layers3],
  ["/compaction", "Compaction", Boxes],
  ["/crash", "Crash simulation", ShieldAlert],
  ["/settings", "Parameters", SettingsIcon],
];
const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));
const LIVE_POLL_MS = 3000;
const LIVE_ANIMATION_MS = 2800;
const empty = {
  memtableKeys: 0,
  tombstones: 0,
  sstables: 0,
  walBytes: 0,
  walRecords: 0,
  logicalBytes: 0,
  internalBytes: 0,
  compactionBytes: 0,
  readOps: 0,
  readMisses: 0,
  readHitRate: 0,
  writeAmplification: 0,
  spaceAmplification: 0,
  storage: "offline",
  memtablePreview: [],
  skiplistNodes: [],
  sstableFiles: [],
  memtableType: "ordered skip list",
  skiplistLevels: 4,
  memtableBytes: 0,
  sstableReadOps: 0,
  bloomRejects: 0,
  cacheHits: 0,
  pendingRequests: 0,
  activeRequests: 0,
};
function useRoute() {
  const [p, setP] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setP(location.hash.slice(1) || "/");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return [p, (x) => (location.hash = x)];
}
function Card({ children, className = "", ...props }) {
  return <section className={"card " + className} {...props}>{children}</section>;
}
function Title({ eyebrow, title, desc, action }) {
  return (
    <div className="title-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}
function Kpi({ icon: Icon, label, value, color = "lime" }) {
  return (
    <Card className="kpi">
      <span className={"kpi-icon " + color}>
        <Icon size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </Card>
  );
}
function App() {
  const [path, go] = useRoute(),
    [side, setSide] = useState(false),
    [s, setS] = useState(empty),
    [online, setOnline] = useState(false),
    [history, setHistory] = useState([]);
  const displayedRef = useRef(empty);
  const frameRef = useRef(0);
  const requestRef = useRef(null);
  const hasSnapshotRef = useRef(false);

  const animateTo = (target) => {
    const from = displayedRef.current;
    cancelAnimationFrame(frameRef.current);

    if (!hasSnapshotRef.current) {
      hasSnapshotRef.current = true;
      displayedRef.current = target;
      setS(target);
      return;
    }

    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / LIVE_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = { ...target };
      Object.keys(target).forEach((key) => {
        if (typeof from[key] === "number" && typeof target[key] === "number") {
          next[key] = from[key] + (target[key] - from[key]) * eased;
        }
      });
      displayedRef.current = next;
      setS(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const refresh = () => {
    if (requestRef.current) return requestRef.current;
    requestRef.current = Promise.all([api("/api/status"), api("/api/metrics")])
      .then(([status, metrics]) => {
        const snapshot = { ...empty, ...status, ...metrics };
        animateTo(snapshot);
        setHistory((previous) => [...previous, { time: Date.now(), writes: snapshot.writeOps || 0, reads: snapshot.readOps || 0, keys: snapshot.memtableKeys || 0, flushes: snapshot.flushCount || 0, compactions: snapshot.compactionCount || 0, cache: snapshot.cacheHits || 0 }].slice(-24));
        setOnline(true);
      })
      .catch(() => setOnline(false))
      .finally(() => {
        requestRef.current = null;
      });
    return requestRef.current;
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, LIVE_POLL_MS);
    return () => {
      clearInterval(t);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);
  let page =
    path === "/workload" ? (
      <Workload status={s} refresh={refresh} />
    ) : path === "/sample" ? (
      <SamplePayload />
    ) : path === "/crud" ? (
      <Crud refresh={refresh} />
    ) : path === "/memtable" ? (
      <Memtable status={s} />
    ) : path === "/wal" ? (
      <Wal />
    ) : path === "/search" ? (
      <SearchLab status={s} />
    ) : path === "/sstables" ? (
      <Sstables />
    ) : path === "/compaction" ? (
      <Compaction refresh={refresh} />
    ) : path === "/crash" ? (
      <Crash status={s} refresh={refresh} />
    ) : path === "/settings" ? (
      <Settings />
    ) : (
      <Dashboard status={s} history={history} go={go} refresh={refresh} />
    );
  return (
    <div className="app">
      <aside className={side ? "open" : ""}>
        <div className="brand">
          <span className="brand-mark">
            <Database size={19} />
          </span>
          <div>
            <b>
              LSM<span>/</span>LAB
            </b>
            <small>real storage observability</small>
          </div>
        </div>
        <nav>
          {nav.map(([href, label, I]) => (
            <button
              className={path === href ? "active" : ""}
              key={href}
              onClick={() => {
                go(href);
                setSide(false);
              }}
            >
              <I size={17} />
              {label}
              {path === href && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="health">
          <i className={online ? "on" : ""} />
          <div>
            <b>{online ? "Engine connected" : "Backend offline"}</b>
            <small>{online ? "Local files ready" : "Start C++ backend"}</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button className="menu" onClick={() => setSide(!side)}>
            <Menu />
          </button>
          <div className="crumb">
            VIRTUAL LAB <b>/</b> {nav.find((x) => x[0] === path)?.[1]}
          </div>
          <div className="top-actions">
            <span className="bucket">
              <HardDrive size={14} /> Local object store
            </span>
            <span className={online ? "status" : "status offline"}>
              <i /> {online ? "ONLINE" : "OFFLINE"}
            </span>
            <button onClick={refresh} className="icon-btn">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="page">
          {page}
        </div>
        <footer>
          <Wifi size={13} />{" "}
          {online ? "Connected to C++ API" : "Waiting for C++ API"}{" "}
          <span>· live engine data</span>
        </footer>
      </main>
    </div>
  );
}
function EngineMap({ status: s }) {
  const [focus, setFocus] = useState("write");
  const write = [
    ["01", "Client", "PUT /user:42"],
    ["02", "WAL", "append + fsync"],
    ["03", "MemTable", "sorted skip list"],
    ["04", "Flush", "freeze + sort"],
    ["05", "SSTable", "blocks + index"],
    ["06", "Object store", "local manifest"],
  ];
  const read = [
    ["01", "Client", "GET /user:42"],
    ["02", "Block cache", `${s.cacheHits ? fmt(s.cacheHits) + " hits" : "no cache hits"}`],
    ["03", "Bloom filter", `${fmt(s.bloomRejects)} actual rejects`],
    ["04", "Sparse index", "seek block"],
    ["05", "Data block", "decompress"],
    ["06", "Value", "return latest"],
  ];
  const flow = focus === "write" ? write : read;
  return (
    <Card className="engine-map">
      <div className="map-heading">
        <div>
          <span className="eyebrow">ANATOMY OF AN LSM TREE</span>
          <h2>{focus === "write" ? "Write path: durable first" : "Read path: rule out cheaply"}</h2>
          <p>{focus === "write" ? "Every mutation becomes recoverable before it becomes searchable." : "The engine narrows the search from memory to one compressed data block."}</p>
        </div>
        <div className="segmented">
          <button className={focus === "write" ? "active" : ""} onClick={() => setFocus("write")}><UploadCloud size={14} /> Write</button>
          <button className={focus === "read" ? "active" : ""} onClick={() => setFocus("read")}><Search size={14} /> Read</button>
        </div>
      </div>
      <div className="engine-flow">
        {flow.map(([n, title, detail], i) => (
          <React.Fragment key={title}>
            <div className={"engine-node " + (i === 1 ? "hot" : "")}>
              <span>{n}</span><b>{title}</b><small>{detail}</small>
              {focus === "write" && i === 1 && <em>{fmt(s.walBytes)} B durable</em>}
              {focus === "read" && i === 1 && <em>{fmt(s.readMisses)} misses</em>}
            </div>
            {i < flow.length - 1 && <div className="flow-line"><i /></div>}
          </React.Fragment>
        ))}
      </div>
      <div className="map-legend"><span><i className="dot memory" /> mutable memory</span><span><i className="dot durable" /> durable log</span><span><i className="dot immutable" /> immutable files</span><span><i className="dot cloud" /> local object mirror</span></div>
    </Card>
  );
}
function ConceptBoard({ status: s, go }) {
  const concepts = [
    ["01", "WAL + crash recovery", "Durable append protects writes before memory can be rebuilt.", fmt(s.walRecords) + " records", Archive, "/crash", "Replay experiment"],
    ["02", "MemTable + flush", "Sorted mutable state becomes an immutable L0 table at the flush boundary.", fmt(s.memtableKeys) + " live keys", Database, "/crud", "Write a record"],
    ["03", "Bloom + block cache", "Probabilistic filtering avoids I/O; cache keeps hot blocks in memory.", Math.round(s.readHitRate * 100) + "% hit rate", Search, "/search", "Trace a read"],
    ["04", "Compaction + tombstones", "Sorted runs merge, obsolete versions disappear, and deletes become durable markers.", fmt(s.tombstones) + " tombstones", Boxes, "/compaction", "Run a merge"],
    ["05", "SSTables + local mirror", "Immutable files carry data blocks, sparse indexes, Bloom filters, and a local object mirror.", fmt(s.sstables) + " local files", HardDrive, "/sstables", "Inspect files"],
    ["06", "Amplification trade-offs", "Write, read, and space costs reveal why LSM engines tune buffers and levels.", Math.round(s.writeAmplification || 0) + "× write amp", Activity, "/settings", "Tune parameters"],
  ];
  return <Card className="concept-board"><div className="board-title"><div><span className="eyebrow">LSM CONCEPT OVERVIEW</span><h2>Six ideas, one storage engine</h2><p>Explore each component and inspect its live state and performance data.</p></div><span className="board-status"><i /> LIVE ENGINE MODEL</span></div><div className="concept-grid">{concepts.map(([n,title,desc,metric,Icon,route,action]) => <div className="concept-card" key={title}><div className="concept-top"><span>{n}</span><Icon size={17} /></div><h3>{title}</h3><p>{desc}</p><strong>{metric}</strong><button onClick={() => go(route)}>{action}<ChevronRight size={14} /></button></div>)}</div></Card>;
}
function LearningStrip() {
  return (
    <Card className="learning-strip">
      <div className="learn-title">
        <span className="eyebrow">WRITE PATH OVERVIEW</span>
        <h2>How an LSM write works</h2>
        <p>
          Follow one record from durable intent to sorted immutable storage.
        </p>
      </div>
      <div className="learn-flow">
        {[
          ["01", "Client write", "request"],
          ["02", "WAL", "durable"],
          ["03", "MemTable", "mutable"],
          ["04", "Flush", "sorted"],
          ["05", "L0 SSTable", "immutable"],

          ["06", "Compaction", "merge"],
        ].map(([n, t, sub], i) => (
          <React.Fragment key={n}>
            <div className="learn-step">
              <span>{n}</span>
              <b>{t}</b>
              <small>{sub}</small>
            </div>
            {i < 5 && <b className="learn-arrow">→</b>}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}
function LiveGraphs({ status: s, history }) {
  const points = history.length ? history : [{ writes: s.writeOps || 0, reads: s.readOps || 0, keys: s.memtableKeys || 0, flushes: s.flushCount || 0, compactions: s.compactionCount || 0, cache: s.cacheHits || 0 }];
  const chart = (keys, colors) => {
    const width = 560, height = 150, max = Math.max(1, ...points.flatMap((point) => keys.map((key) => point[key] || 0)));
    return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live engine graph"><path className="graph-grid" d="M0 30H560M0 75H560M0 120H560"/>{keys.map((key, index) => <polyline key={key} className={colors[index]} points={points.map((point, i) => `${points.length === 1 ? 280 : i * width / (points.length - 1)},${height - 18 - ((point[key] || 0) / max) * (height - 36)}`).join(" ")}/>)}</svg>;
  };
  return <div className="overview-graphs"><Card><Head title="Live throughput" sub="new writes and random reads from each 3-second snapshot"/><div className="graph-legend"><span><i className="graph-dot writes"/> Writes</span><span><i className="graph-dot reads"/> Reads</span></div>{chart(["writes", "reads"], ["graph-writes", "graph-reads"])}</Card><Card><Head title="Tree growth" sub="mutable keys, flush checkpoints, compaction merges, and cache hits"/><div className="graph-legend"><span><i className="graph-dot keys"/> Keys</span><span><i className="graph-dot flushes"/> Flushes</span><span><i className="graph-dot compactions"/> Compactions</span><span><i className="graph-dot cache"/> Cache hits</span></div>{chart(["keys", "flushes", "compactions", "cache"], ["graph-keys", "graph-flushes", "graph-compactions", "graph-cache"])}</Card></div>;
}
function Dashboard({ status: s, history, go, refresh }) {
  const [clearing, setClearing] = useState(false), [clearMessage, setClearMessage] = useState("");
  const clearAll = async () => { if (!window.confirm("Delete all MemTable, WAL, SSTable, object-store, cache, and metric data? This cannot be undone.")) return; setClearing(true); try { await api("/api/clear-all", { method: "POST" }); setClearMessage("All engine data cleared."); await refresh(); } catch (e) { setClearMessage("Clear failed: " + e.message); } finally { setClearing(false); } };
  return (<>
    <Title eyebrow="SYSTEM ANALYTICS" title="LSM engine overview" desc="Read-only health and performance analytics from the running storage engine." action={<div className="overview-actions"><button className="primary" onClick={() => go("/workload")}><Activity size={15}/> Open live simulation</button><button className="danger" disabled={clearing} onClick={clearAll}><Trash2 size={15}/> {clearing ? "Clearing…" : "Delete all data"}</button></div>} />
    <Card className="danger-zone"><b>Danger zone</b><span>Deletes all current MemTable records, WAL entries, SSTables, object-store copies, cache contents, and performance counters.</span>{clearMessage && <em>{clearMessage}</em>}</Card>
    <div className="kpis"><Kpi icon={Database} label="MEMTABLE SIZE" value={fmt(s.memtableBytes)+" B"}/><Kpi icon={Archive} label="WAL SIZE" value={fmt(s.walBytes)+" B"} color="cyan"/><Kpi icon={Layers3} label="SSTABLE COUNT" value={fmt(s.sstables)} color="purple"/><Kpi icon={Search} label="CACHE HIT RATE" value={s.readOps ? Math.round((s.cacheHits/s.readOps)*100)+"%" : "0%"} color="orange"/></div>
    <div className="performance-grid"><Card><Head title="Write performance" sub="backend measurements"/><div className="telemetry"><Metric n="Throughput" v={fmt(Math.round(s.writeThroughput || 0))+" ops/s"}/><Metric n="Average latency" v={fmt(Math.round(s.avgWriteLatencyUs || 0))+" µs"}/><Metric n="P50" v={fmt(s.writeP50Us || 0)+" µs"}/><Metric n="P90" v={fmt(s.writeP90Us || 0)+" µs"}/><Metric n="P99" v={fmt(s.writeP99Us || 0)+" µs"}/></div></Card><Card><Head title="Read and storage performance" sub="cache, Bloom, SSTable, and local mirror counters"/><div className="telemetry"><Metric n="Read throughput" v={fmt(Math.round(s.readThroughput || 0))+" ops/s"}/><Metric n="Read P99" v={fmt(s.readP99Us || 0)+" µs"}/><Metric n="Cache misses" v={fmt(s.cacheMisses || s.readMisses)}/><Metric n="Bloom rejects" v={fmt(s.bloomRejects)}/><Metric n="Local mirror reads" v={fmt(s.localMirrorReadCount || s.sstableReadOps)}/><Metric n="Storage usage" v={fmt(s.storageUsageBytes)+" B"}/></div></Card></div>
    <div className="lab-grid"><Card><Head title="LSM state" sub="current durable and mutable structures"/><div className="analytics"><Metric n="MemTable keys" v={fmt(s.memtableKeys)}/><Metric n="Skip-list levels" v={s.skiplistLevels}/><Metric n="Flushes" v={fmt(s.flushCount)}/><Metric n="Compactions" v={fmt(s.compactionCount)}/><Metric n="Tombstones" v={fmt(s.tombstones)}/><Metric n="Active requests" v={fmt(s.activeRequests)}/></div></Card><Card><Head title="Current MemTable" sub="latest in-memory records"/><DataTable rows={s.memtablePreview} empty="No live records yet. Start a simulation or use CRUD."/></Card></div>
    <LiveGraphs status={s} history={history}/>
    <EngineMap status={s}/>
    <ConceptBoard status={s} go={go}/>
    <LearningStrip />
  </>);
}
function Head({ title, sub }) {
  return (
    <div className="card-head">
      <div>
        <h2>{title}</h2>
        <span>{sub}</span>
      </div>
    </div>
  );
}
function Metric({ n, v }) {
  return (
    <div className="metric">
      <span>{n}</span>
      <b>{v}</b>
    </div>
  );
}
function DataTable({ rows, empty }) {
  return rows?.length ? (
    <div className="data-table">
      <div className="thead">
        <span>KEY</span>
        <span>STATE</span>
        <span>BYTES</span>
      </div>
      {rows.map((x) => (
        <div className="trow" key={x.key}>
          <code>{x.key}</code>
          <b className={x.state === "TOMBSTONE" ? "danger-text" : ""}>
            {x.state}
          </b>
          <span>{x.bytes}</span>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty">{empty}</p>
  );
}
const simulationDefaults = { speed: 100, payloadBytes: 256, keySpace: 1000, readRatio: 20, deleteRatio: 10, temperatureEnabled: true, temperatureRate: 1, humidityEnabled: true, humidityRate: 1, airQualityEnabled: true, airQualityRate: 1, noiseEnabled: true, noiseRate: 5, trafficCountEnabled: true, trafficCountRate: 10, parkingOccupancyEnabled: true, parkingOccupancyRate: 1, vibrationEnabled: true, vibrationRate: 50 };
function readSimulationConfig() { try { return { ...simulationDefaults, ...JSON.parse(localStorage.getItem("lsm-simulation-config") || "{}") }; } catch { return simulationDefaults; } }
function SamplePayload() {
  const [cfg, setCfg] = useState(readSimulationConfig), [selected, setSelected] = useState("temperature");
  useEffect(() => { const update = () => setCfg(readSimulationConfig()); addEventListener("simulation-config-updated", update); addEventListener("focus", update); return () => { removeEventListener("simulation-config-updated", update); removeEventListener("focus", update); }; }, []);
  const sensors = [["temperature", "Temperature", "Weather", "temperature-sensor-42", "temperature value=23.42"], ["humidity", "Humidity", "Environment", "humidity-sensor-42", "humidity value=61.08"], ["airQuality", "Air quality", "Pollution", "air-quality-sensor-42", "air-quality value=18.00"], ["noise", "Noise", "Traffic", "noise-sensor-42", "noise value=47.35"], ["trafficCount", "Traffic count", "Vehicles", "traffic-count-sensor-42", "traffic-count value=128.00"], ["parkingOccupancy", "Parking occupancy", "Smart parking", "parking-sensor-42", "parking value=74.00"], ["vibration", "Vibration", "Bridge monitoring", "vibration-sensor-42", "vibration value=12.07"]];
  const enabled = sensors.filter(([key]) => cfg[key + "Enabled"]), totalRate = enabled.reduce((sum, [key]) => sum + Number(cfg[key + "Rate"] || 0), 0), scaledRate = Math.max(0, Math.round(totalRate * Number(cfg.speed || 100) / 100)), sample = sensors.find(([key]) => key === selected) || sensors[0], [sampleKey, label, use, keyExample, valueExample] = sample, rate = Number(cfg[sampleKey + "Rate"] || 0), actualRate = Math.max(0, Math.round(rate * Number(cfg.speed || 100) / 100)), padding = Math.max(0, Number(cfg.payloadBytes || 0) - valueExample.length), payload = valueExample + "x".repeat(Math.min(padding, 180));
  return <><Title eyebrow="SIMULATION PREVIEW" title="Sample payload" desc="View a representative sensor record generated from the current simulation settings."/><div className="sample-summary"><Kpi icon={Database} label="PAYLOAD BYTES" value={fmt(cfg.payloadBytes) + " B"}/><Kpi icon={Activity} label="ACTIVE STREAMS" value={fmt(enabled.length)}/><Kpi icon={Zap} label="APPROX EVENTS / SEC" value={fmt(scaledRate)} color="orange"/><Kpi icon={Search} label="RANDOM READS" value={fmt(cfg.readRatio) + "%"} color="cyan"/></div><Card className="sample-config"><Head title="Choose one sample stream" sub="this changes only the example shown below"/><div className="sample-selector">{sensors.map(([key, label]) => <button key={key} className={selected === key ? "selected" : ""} onClick={() => setSelected(key)}>{label}</button>)}</div></Card><Card className="sample-table"><Head title="Actual generated record" sub={`one PUT record · padded to exactly ${fmt(cfg.payloadBytes)} bytes`}/><div className="payload-list"><div className="payload-card"><div className="payload-title"><div><b>{label}</b><small>{use} · {fmt(rate)} configured events/sec · {fmt(actualRate)} scaled events/sec</small></div><strong className={cfg[sampleKey + "Enabled"] ? "enabled" : "disabled"}>{cfg[sampleKey + "Enabled"] ? "ENABLED" : "DISABLED"}</strong></div><pre>{JSON.stringify({ operation: "PUT", key: keyExample, value: payload }, null, 2)}</pre><small className="payload-foot">Showing {fmt(Math.min(Number(cfg.payloadBytes || 0), valueExample.length + 180))} of {fmt(cfg.payloadBytes)} payload bytes · remaining bytes are padding characters</small></div></div></Card><Card className="sample-note"><Head title="How the backend generates it" sub="record generation steps"/><p>The backend chooses an enabled stream using its configured rate, creates a key such as <code>{keyExample}</code>, generates the sensor value, then pads the value with <code>x</code> characters until it reaches the configured payload size. With the current settings, this stream is selected about {fmt(actualRate)} times per second at the current speed.</p></Card></>;
}
function Workload({ status: s, refresh }) {
  const [busy, setBusy] = useState(false), [speed, setSpeed] = useState(100), [probe, setProbe] = useState(null), [controlError, setControlError] = useState("");
  const command = async (action, selectedSpeed = speed) => { setBusy(true); setControlError(""); try { const config = { ...readSimulationConfig(), speed: selectedSpeed }; await api("/api/simulation/" + action, { method: "POST", body: JSON.stringify(action === "start" ? config : {}) }); await refresh(); } catch (e) { setControlError(e.message); } finally { setBusy(false); } };
  const applySpeed = async (nextSpeed = speed) => { setSpeed(nextSpeed); if (s.simulationRunning) await command("start", nextSpeed); };
  const randomRead = async () => {
    setProbe({ state: "reading", key: "Choosing a random sensor key…" });
    try {
      const cfg = readSimulationConfig(), prefixes = ["temperature", "humidity", "air-quality", "noise", "traffic-count", "parking", "vibration"];
      const key = `${prefixes[Math.floor(Math.random() * prefixes.length)]}-sensor-${Math.floor(Math.random() * Math.max(1, cfg.keySpace))}`;
      const before = await api("/api/metrics"), result = await api("/api/get?key=" + encodeURIComponent(key)), after = await api("/api/metrics");
      const path = after.cacheHits > before.cacheHits ? "BLOCK CACHE HIT" : after.sstableReadOps > before.sstableReadOps ? "SSTABLE READ" : after.bloomRejects > before.bloomRejects ? "BLOOM FILTER REJECT" : result.found ? "MEMTABLE HIT" : "READ MISS";
      setProbe({ state: "done", key, path, found: result.found, value: result.value });
      await refresh();
    } catch (e) { setProbe({ state: "error", key: "Random read failed", path: e.message }); }
  };
  const hit = s.readOps ? (s.cacheHits / Math.max(1, s.readOps) * 100) : 0, miss = s.readOps ? (s.readMisses / Math.max(1, s.readOps) * 100) : 0;
  return (<>
    <Title eyebrow="LIVE ENGINE MONITOR" title="Live simulation" desc="Watch the configured sensor stream move through WAL, MemTable, SSTables, cache, Bloom filters, and compaction." action={<div className="live-actions"><span className={s.simulationRunning ? "live-pill" : "live-pill paused"}><i />{s.simulationRunning ? "RUNNING" : "PAUSED"}</span></div>} />
    <Card className="simulation-console"><div className="console-heading"><div><span className="eyebrow">STREAM CONTROLS</span><h2>Engine playback</h2><p>Control the synthetic sensor workload like a media player. Backend generation changes only when you apply a control.</p></div><span className="speed-readout">{speed}%</span></div><div className="player-row"><button className="player-btn primary" disabled={busy} onClick={() => command(s.simulationRunning ? "stop" : "start")} aria-label={s.simulationRunning ? "Pause stream" : "Start stream"}>{s.simulationRunning ? <Pause size={17}/> : <Play size={17}/>} {s.simulationRunning ? "Pause" : "Start"}</button><button className="player-btn" disabled={busy} onClick={() => command("reset")}><RefreshCw size={16}/> Reset counters</button><button className={speed === 100 ? "speed-btn selected" : "speed-btn"} disabled={busy} onClick={() => applySpeed(100)}>Normal</button><button className={speed === 500 ? "speed-btn selected" : "speed-btn"} disabled={busy} onClick={() => applySpeed(500)}><Zap size={14}/> Fast forward</button><label className="speed-slider"><span>Speed</span><input type="range" min="10" max="1000" step="10" value={speed} onChange={e => setSpeed(Number(e.target.value))}/><b>{speed}%</b></label><button className="player-btn" disabled={busy || !s.simulationRunning} onClick={() => applySpeed()} >Apply speed</button></div>{(controlError || s.simulationError) && <p className="stream-error">Stream paused after an error: {controlError || s.simulationError}</p>}</Card>
    <div className="live-kpis"><Kpi icon={Zap} label="INGESTED WRITES" value={fmt(s.simulationWrites)} color="lime"/><Kpi icon={Search} label="RANDOM READS" value={fmt(s.simulationReads)} color="cyan"/><Kpi icon={Database} label="MEMTABLE KEYS" value={fmt(s.memtableKeys)} color="purple"/><Kpi icon={Layers3} label="SSTABLE FILES" value={fmt(s.sstables)} color="orange"/></div>
    <div className="performance-grid"><Card><Head title="Write path checkpoints" sub="live backend state"/><div className="checkpoint-list"><div><b>WAL</b><span>{fmt(s.walRecords)} records · {fmt(s.walBytes)} B</span><em>durable</em></div><div><b>MemTable</b><span>{fmt(s.memtableKeys)} keys · {fmt(s.memtableBytes)} B</span><em>mutable · L{s.skiplistLevels || 1}</em></div><div><b>Flushes</b><span>{fmt(s.flushCount)} completed</span><em>checkpoint</em></div><div><b>Compaction</b><span>{fmt(s.compactionCount)} merges</span><em>sorted merge</em></div></div></Card><Card><Head title="Read path telemetry" sub="random reads exercise cache and Bloom filters"/><div className="telemetry"><Metric n="Cache hits" v={fmt(s.cacheHits)}/><Metric n="Cache misses" v={fmt(s.cacheMisses || s.readMisses)}/><Metric n="Hit rate" v={Math.round(hit)+"%"}/><Metric n="Bloom rejects" v={fmt(s.bloomRejects)}/><Metric n="SSTable reads" v={fmt(s.sstableReadOps)}/><Metric n="Cache entries" v={fmt(s.cacheSize)}/></div><div className="meter"><span style={{width: hit+"%"}}/><small>cache hit ratio</small></div><div className="meter miss"><span style={{width: miss+"%"}}/><small>read miss ratio</small></div><button className="probe-button" onClick={randomRead} disabled={probe?.state === "reading"}><Search size={15}/> {probe?.state === "reading" ? "Reading…" : "Run random read"}</button>{probe && <div className="probe-result"><code>{probe.key}</code><b>{probe.path}</b>{probe.found !== undefined && <span>{probe.found ? "value returned" : "key not found"}</span>}</div>}</Card></div>
    <Card className="live-tree"><Head title="Live LSM topology" sub="watch mutable memory become immutable sorted files, then merge into lower levels"/><div className="topology"><div className="topology-node current"><small>MEMTABLE</small><b>{fmt(s.memtableKeys)}</b><span>skip list · {s.skiplistLevels || 1} levels</span><div className="level-stack">{Array.from({length: Math.min(8, s.skiplistLevels || 1)}, (_, i) => <i key={i} style={{width: `${35 + i * 9}%`}}>L{i}</i>)}</div></div><div className="topology-arrow">flush →</div><div className="topology-node"><small>L0 SSTABLES</small><b>{fmt(s.sstableFiles?.filter(x => x.level === "L0").length || 0)}</b><span>{fmt(s.flushCount)} flush checkpoints</span></div><div className="topology-arrow">compact →</div><div className="topology-node"><small>L1 / OBJECT STORE</small><b>{fmt(s.sstableFiles?.filter(x => x.level !== "L0").length || 0)}</b><span>{fmt(s.compactionCount)} sorted merges · {fmt(s.cacheSize)} cached blocks</span></div></div></Card>
    <Card><Head title="Latest MemTable entries" sub="newest records from the running stream"/><DataTable rows={s.memtablePreview} empty="Configure the stream in Parameters, then start it here."/></Card>
  </>);
}

function Crud({ refresh }) {
  const samples = [
    ["Temperature", "temperature-sensor-42", "temperature value=23.42"],
    ["Humidity", "humidity-sensor-42", "humidity value=61.08"],
    ["Air quality", "air-quality-sensor-42", "air-quality value=18.00"],
    ["Noise", "noise-sensor-42", "noise value=47.35"],
    ["Traffic count", "traffic-count-sensor-42", "traffic-count value=128.00"],
    ["Parking", "parking-sensor-42", "parking value=74.00"],
    ["Vibration", "vibration-sensor-42", "vibration value=12.07"],
  ];
  const [tab, setTab] = useState("PUT"),
    [key, setKey] = useState(samples[0][1]),
    [value, setValue] = useState(samples[0][2]),
    [trace, setTrace] = useState(null),
    [message, setMessage] = useState("");
  const choose = ([, sampleKey, sampleValue]) => { setKey(sampleKey); setValue(sampleValue); setTrace(null); setMessage(""); };
  const act = async () => {
    try {
      const data = tab === "GET"
        ? await api("/api/get-trace?key=" + encodeURIComponent(key))
        : await api(tab === "DELETE" ? "/api/delete" : "/api/put", { method: "POST", body: JSON.stringify({ key, value }) });
      setTrace(data);
      setMessage(tab === "GET"
        ? (data.found ? `Value retrieved: ${data.value}` : `No live value found (${data.path || data.state || "not found"}).`)
        : tab === "DELETE"
          ? `Delete recorded as sequence ${data.sequence}; a tombstone hides older values.`
          : `Write recorded as sequence ${data.sequence}; WAL is durable before MemTable update.`);
      await refresh();
    } catch (e) {
      setTrace(null); setMessage("Operation failed: " + e.message);
    }
  };
  return (
    <>
      <Title
        eyebrow="REAL DATA OPERATIONS"
        title="Manual data operations"
        desc="Send one controlled PUT, GET, or DELETE and follow its effect through the engine."
      />
      <Card className="crud">
        <div className="crud-purpose"><b>Try a sensor record</b><span>Choose a sensor type to fill a realistic key and value. Run PUT, GET, or DELETE to see how that record travels through the LSM engine.</span></div>
        <div className="sensor-presets" aria-label="Sensor data examples">{samples.map(sample => <button key={sample[0]} className={key === sample[1] ? "selected" : ""} onClick={() => choose(sample)}>{sample[0]}</button>)}</div>
        <div className="tabs">
          {["PUT", "GET", "DELETE"].map((x) => (
            <button
              className={tab === x ? "selected" : ""}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="crud-layout">
          <div>
            <label className="field">
              KEY
              <input value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            {tab !== "DELETE" && (
              <label className="field">
                VALUE
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            )}
            <button
              className={tab === "DELETE" ? "danger" : "primary"}
              onClick={act}
            >
              {tab === "DELETE" ? <Trash2 size={15} /> : <Zap size={15} />}{" "}
              Execute {tab}
            </button>
          </div>
          <div className="write-path"><b>{tab === "GET" ? "How a read is resolved" : tab === "DELETE" ? "How a delete works" : "How a write is stored"}</b>
            {(tab === "GET" ? ["1. Check the MemTable skip list first.", "2. If absent, check the block cache.", "3. Check SSTable range and Bloom filters.", "4. Use the sparse index to locate a data block if needed."] : tab === "DELETE" ? ["1. Append a DEL record to the WAL.", "2. Add a tombstone for this key to the MemTable.", "3. Reads now treat the key as deleted.", "4. Compaction later removes older copies safely."] : ["1. Append the PUT record to the WAL.", "2. Insert or update the key in the MemTable skip list.", "3. Reads see the newest in-memory value first.", "4. When full, flush sorted records into an SSTable."]).map((step, i) => <span key={i}>{step}</span>)}
          </div>
        </div>
        <div className="sensor-record"><small>RECORD SENT TO THE ENGINE</small><pre>{JSON.stringify({ key, ...(tab !== "DELETE" ? { value } : {}), operation: tab }, null, 2)}</pre></div>
        {trace && <div className="operation-trace"><b>{tab === "GET" ? `Read path: ${trace.path || (trace.found ? "VALUE FOUND" : "NOT FOUND")}` : `${tab} accepted · sequence ${trace.sequence}`}</b>{tab === "GET" && <span>{trace.found ? `Returned value: ${trace.value}` : "No current value was returned for this key."}</span>}{trace.steps?.map((step, i) => <div key={i}><strong>{step.stage}</strong><span>{step.result}</span></div>)}</div>}
        {message && <p className="result">{message}</p>}
      </Card>
    </>
  );
}
function Memtable({ status: s }) {
  const nodes = (s.skiplistNodes || []).slice(0, 10);
  const levels = Math.max(1, Number(s.skiplistLevels) || 1);
  return (
    <>
      <Title eyebrow="REAL VOLATILE STATE" title="MemTable inspector" desc="Inspect the live ordered skip list before it is flushed into an SSTable." />
      <div className="kpis">
        <Kpi icon={Database} label="ORDERED KEYS" value={fmt(s.memtableKeys)} />
        <Kpi icon={HardDrive} label="MEMORY BYTES" value={fmt(s.memtableBytes) + " B"} color="cyan" />
        <Kpi icon={Activity} label="SKIP LIST LEVELS" value={s.skiplistLevels} color="orange" />
        <Kpi icon={Trash2} label="TOMBSTONES" value={fmt(s.tombstones)} color="purple" />
      </div>
      <div className="lab-grid">
        <Card>
          <Head title="Current entries" sub="ordered by key · tombstones remain visible" />
          <DataTable rows={s.memtablePreview} empty="MemTable is empty. Add a record or run a workload." />
        </Card>
        <Card>
          <Head title="How the skip list finds a key" sub={`${levels} active level${levels === 1 ? "" : "s"} · showing up to ${nodes.length} real keys`} />
          <p className="skiplist-intro">Think of the MemTable as a sorted line of keys with shortcut lanes above it. Every key is on L0; taller nodes also appear on higher lanes.</p>
          <div className="skiplist-visual">
            {Array.from({ length: levels }, (_, row) => {
              const level = levels - row - 1;
              const laneNodes = nodes.filter((node) => node.height > level);
              return <div className={`skiplist-level ${level === 0 ? "base-level" : ""}`} key={level}><b>L{level}{level === 0 ? " · all keys" : ""}</b><div className="skiplist-lane"><span className="skiplist-sentinel">HEAD</span>{laneNodes.map((node) => <span className="skiplist-node" title={`Node height ${node.height}`} key={node.key}>{node.key}</span>)}<span className="skiplist-sentinel">NULL</span></div></div>;
            })}
          </div>
          <div className="skiplist-lesson"><b>How a lookup moves</b><ol><li>Start at HEAD on the highest active lane.</li><li>Move right while the next key is smaller than the key you want.</li><li>When the next key is too large, drop down one lane from the same node.</li><li>At L0, compare the next key. A match is found; otherwise the key is absent.</li></ol><p>Upper lanes skip over groups of keys, so the engine checks fewer entries than a full scan. Nodes shown here are taken from the live ordered MemTable; higher lanes contain only the taller nodes.</p></div>
          <p className="result">When the configured MemTable limit is reached, its sorted entries are written to an SSTable. The WAL is kept until that table is safely published.</p>
        </Card>
      </div>
    </>
  );
}
function Wal() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const f = () =>
      api("/api/wal")
        .then(setRows)
        .catch(() => {});
    f();
    const t = setInterval(f, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Title
        eyebrow="REAL DURABILITY LOG"
        title="WAL records"
        desc="Live entries read from the backend WAL file."
      />
      <Card>
        <Head
          title={`${rows.length} visible records`}
          sub="timestamp · sequence · operation · key · value bytes"
        />
        <div className="data-table wal-table">
          <div className="thead">
            <span>TIME / SEQ</span>
            <span>OPERATION</span>
            <span>KEY / PAYLOAD</span>
          </div>
          {rows
            .slice(-100)
            .reverse()
            .map((x) => (
              <div className="trow" key={x.seq}>
                <code>
                  {x.timestamp}
                  <br />
                  {x.seq}
                </code>
                <b>{x.operation}</b>
                <span>
                  {x.key} · {x.valueBytes} B
                </span>
              </div>
            ))}
        </div>
        {!rows.length && (
          <p className="empty">
            No WAL entries. Execute a CRUD operation or workload.
          </p>
        )}
      </Card>
    </>
  );
}
function Sstables() {
  const [files, setFiles] = useState([]), [selectedName, setSelectedName] = useState(""), [detail, setDetail] = useState(null), [searchKey, setSearchKey] = useState(""), [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState("");
  const load = () => api("/api/sstables").then((items) => { setFiles(items); setSelectedName((current) => current && items.some((item) => item.name === current) ? current : items[0]?.name || ""); }).catch(() => {});
  useEffect(() => { load(); const timer = setInterval(load, 2500); return () => clearInterval(timer); }, []);
  const loadDetail = async (name = selectedName, key = "") => { if (!name) return; setDetailBusy(true); setDetailError(""); try { setDetail(await api(`/api/sstable-detail?name=${encodeURIComponent(name)}&key=${encodeURIComponent(key)}`)); } catch (e) { setDetailError(e.message); } finally { setDetailBusy(false); } };
  useEffect(() => { if (selectedName) { setDetail(null); setSearchKey(""); loadDetail(selectedName); } else setDetail(null); }, [selectedName]);
  return (
    <>
      <Title
        eyebrow="REAL IMMUTABLE FILES"
        title="SSTable explorer"
        desc="Click a table to inspect its manifest row, sparse index, Bloom filter, and a traced point lookup."
      />
      <div className="sstable-grid">
        {files.map((f) => (
          <Card className={`sstable ${selectedName === f.name ? "selected" : ""}`} key={f.name} role="button" tabIndex={0} aria-pressed={selectedName === f.name} onClick={() => setSelectedName(f.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedName(f.name); } }}>
            <div className="file-head">
              <span className="level-tag">{f.level}</span>
              <code>{f.name}</code>
            </div>
            <strong>
              {fmt(f.records)} <small>records</small>
            </strong>
            <div className="range">
              {f.minKey || "—"} <b>→</b> {f.maxKey || "—"}
            </div>
            <div className="file-meta">
              <span>
                File bytes <b>{fmt(f.bytes)}</b>
              </span>
              <span>
                Sparse index <b>{fmt(f.indexBytes)} B</b>
              </span>
              <span>
                  Bloom filter <b className="success">{fmt(f.bloomBits)} bits</b>
              </span>
            </div>
            <small className="table-open-hint">{selectedName === f.name ? "DETAILS OPEN BELOW" : "SELECT TO INSPECT"}</small>
          </Card>
        ))}
      </div>
      {!files.length && (
        <Card>
          <p className="empty">
            No SSTables yet. Run a workload, then use Compaction to flush the
            MemTable.
          </p>
        </Card>
      )}
      {selectedName && detail?.error && <p className="stream-error">{detail.error}</p>}
      {selectedName && detail?.manifest && <Card className="sstable-detail"><div className="detail-heading"><div><span className="eyebrow">TABLE INSPECTOR</span><h2>{detail.manifest.file}</h2><p>Generation {detail.manifest.generation} · level {detail.manifest.level}</p></div><span className="level-tag">{fmt(detail.table.records)} records</span></div><section className="manifest-inspector"><h3>Manifest entry</h3><code>{detail.manifest.generation} {detail.manifest.level.replace("L", "")} {detail.manifest.file}</code><p>The manifest maps a generation and level to this immutable data file. It lets the engine find the current table set after restart.</p></section><div className="table-detail-grid"><section className="detail-panel"><h3>Sparse index</h3><p>One anchor is stored for every {detail.sparseIndex.stride} sorted records. A lookup chooses the last anchor key ≤ your key, seeks to its byte offset, then scans at most {detail.sparseIndex.stride} records in that block.</p><div className="index-table"><div><b>Record #</b><b>Anchor key</b><b>Byte offset</b></div>{detail.sparseIndex.entries.map((entry) => <div key={`${entry.ordinal}-${entry.key}`}><span>{entry.ordinal}</span><code>{entry.key}</code><span>{fmt(entry.offset)}</span></div>)}</div></section><section className="detail-panel bloom-panel"><h3>Bloom filter</h3><p>The filter checks three bit positions before disk access. Any unset bit proves the key is absent from this table; all set bits mean “maybe,” so the sparse index still checks records.</p><div className="bloom-stats"><span>Bits<b>{fmt(detail.bloomFilter.bitCount)}</b></span><span>Set bits<b>{fmt(detail.bloomFilter.setBits)}</b></span><span>Hash checks<b>{detail.bloomFilter.hashCount}</b></span><span>Estimated false-positive rate<b>{(detail.bloomFilter.estimatedFalsePositiveRate * 100).toFixed(2)}%</b></span></div><div className="bloom-sample"><small>FIRST {detail.bloomFilter.sampleBits.length} BITS · 0 →</small><code>{detail.bloomFilter.sampleBits || "No bit sample"}</code></div></section></div><section className="detail-panel lookup-trace"><h3>Trace a key through this table</h3><form onSubmit={(event) => { event.preventDefault(); loadDetail(selectedName, searchKey); }}><input value={searchKey} onChange={(event) => setSearchKey(event.target.value)} placeholder="Enter a key to trace"/><button className="primary" disabled={detailBusy || !searchKey}>Trace lookup</button></form>{detailBusy && <p className="muted">Reading table metadata…</p>}{detailError && <p className="stream-error">{detailError}</p>}{detail.lookup && <div className="lookup-steps"><div><b>1 · Key range</b><span>{detail.lookup.inKeyRange ? "Key is within this file’s min/max range." : "Key is outside this file’s min/max range; skip this table."}</span></div><div><b>2 · Bloom checks</b>{!detail.lookup.inKeyRange && <span>Not checked: the key range already ruled out this file.</span>}{detail.lookup.bloomChecks.map((check, index) => <span key={index}>Bit {check.bit}: {check.set ? "set" : "unset"}{!check.set ? " — definitely absent" : ""}</span>)}<strong>{!detail.lookup.inKeyRange ? "Range check rejected this file before Bloom lookup" : detail.lookup.bloomSaysMaybe ? "Maybe present — continue to index" : "Definitely absent — no data block read"}</strong></div><div><b>3 · Sparse seek + scan</b><span>{detail.lookup.sparseAnchorKey ? `Start at “${detail.lookup.sparseAnchorKey}” (record ${detail.lookup.sparseAnchorOrdinal})` : "No earlier index anchor; start at the first indexed block"} · byte {fmt(detail.lookup.sparseAnchorOffset)}</span><span>{fmt(detail.lookup.recordsScanned)} records scanned</span><strong>{detail.lookup.recordFound ? detail.lookup.tombstone ? "Found a tombstone: this table marks the key deleted." : "Exact record found in this SSTable." : !detail.lookup.inKeyRange ? "No scan needed because the key is outside this file’s range." : detail.lookup.bloomSaysMaybe ? "No exact record in the scanned block (possible Bloom false positive or key in another table)." : "Index scan skipped after Bloom rejection."}</strong></div></div>}</section></Card>}
    </>
  );
}
function SearchLab({ status: s }) {
  const [q, setQ] = useState("hello"),
    [out, setOut] = useState(null);
  const run = () =>
    api("/api/get?key=" + encodeURIComponent(q))
      .then(setOut)
      .catch((e) => setOut({ error: e.message }));
  return (
    <>
      <Title
        eyebrow="REAL READ PATH"
        title="Search pipeline"
        desc="Search an actual key and observe the MemTable lookup result."
        action={
          <div className="search-box">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={run}>Lookup</button>
          </div>
        }
      />
      <Card className="pipeline-card">
        <div className="pipeline-steps">
          {[
            "Client query",
            "MemTable",
            "L0 SSTables",
            "Bloom filter",
            "Sparse index",
            "Data block",
            "Return value",
          ].map((x, i) => (
            <div className="pipeline-step" key={x}>
              <span>0{i + 1}</span>
              <b>{x}</b>
              <small>
                {[
                  "query enters the engine",
                  "mutable state checked first",
                  "Bloom filter rejects impossible files",
                  "sparse index seeks a 16-row window",
                  "LRU cache avoids repeated reads",
                  "newest version wins",
                ][i]}
              </small>
            </div>
          ))}
        </div>
        {out && (
          <div className="result">
            {out.error
              ? out.error
              : out.found
                ? `Found ${out.key}: ${out.value}`
                : `${q} was not found`}
          </div>
        )}
        {out && !out.error && (
          <div className="read-inspector">
            <div><span>MEMTABLE</span><b>{out.found ? "checked" : "miss"}</b><small>{s.memtableType} · first</small></div>
            <div><span>BLOOM FILTER</span><b>{s.bloomRejects} rejects</b><small>actual file exclusions</small></div>
            <div><span>SPARSE INDEX / DISK</span><b>{s.sstableReadOps} reads</b><small>actual SSTable reads</small></div>
            <div><span>VERSION RULE</span><b>{out.found ? "latest seq" : "absent"}</b><small>tombstones win</small></div>
          </div>
        )}
      </Card>
    </>
  );
}
function Compaction({ refresh }) {
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""), [report, setReport] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      const x = await api("/api/compact", { method: "POST" });
      setMsg(`Compaction complete · ${x.tombstonesRemoved} tombstones removed`);
      setReport(x);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="REAL LSM MAINTENANCE"
        title="Compaction lab"
        desc="See exactly which immutable files were read, how versions were selected, and which files remain after the merge."
        action={
          <button className="primary" disabled={busy} onClick={run}>
            {busy ? <RefreshCw className="spin" /> : <Boxes size={15} />}{" "}
            {busy ? "Compacting…" : "Run compaction"}
          </button>
        }
      />
      <Card className="compact-card">
        <Head
          title="What compaction does"
          sub="Every input file is consumed. The highest sequence number wins for each key; winning deletes are discarded after all older copies are covered."
        />
        <div className="merge-flow">
          <div>
            Current MemTable
            <br />
            <b>mutable</b>
          </div>
          <span>→</span>
          <div>
            L0 + older levels
            <br />
            <b>merge + sort</b>
          </div>
          <span>→</span>
          <div className="output">
            L1 output
            <br />
            <b>immutable</b>
          </div>
        </div>
        <div className="result">
          {msg || "Ready. Run a workload or CRUD writes before compacting."}
        </div>
        {report && <div className="compact-report">
          <div className="compact-explanation"><b>Before → after</b><span>{report.memtableFlushed ? "The current MemTable was first flushed into a new L0 file. " : "The MemTable was empty. "}{report.rule}</span></div>
          <div className="compact-columns">
            <section><h3>Before · files consumed ({report.before.length})</h3>{report.before.length ? report.before.map(f => <div className="compact-file" key={f.name}><b>{f.level} · {f.name}</b><span>{fmt(f.records)} records · {fmt(f.bytes)} B</span><small>{f.minKey || "—"} → {f.maxKey || "—"}</small></div>) : <p className="empty">No SSTables existed.</p>}</section>
            <section><h3>After · files kept ({report.after.length})</h3>{report.after.length ? report.after.map(f => <div className="compact-file output-file" key={f.name}><b>{f.level} · {f.name}</b><span>{fmt(f.records)} records · {fmt(f.bytes)} B</span><small>{f.minKey || "—"} → {f.maxKey || "—"}</small></div>) : <p className="empty">All records were deleted; no output table is needed.</p>}</section>
          </div>
          <p className="muted">Removed {fmt(report.tombstonesRemoved)} deleted keys. The local object mirror is updated with the same output file set.</p>
        </div>}
      </Card>
    </>
  );
}
function SimulationSettings(){const[cfg,setCfg]=useState(readSimulationConfig),[saved,setSaved]=useState(false);const change=(k,v)=>setCfg({...cfg,[k]:typeof v==="boolean"?v:Number(v)});const save=()=>{localStorage.setItem("lsm-simulation-config",JSON.stringify(cfg));setSaved(true);setTimeout(()=>setSaved(false),1600)};const sensors=[["temperature","Temperature","Weather","1/sec"],["humidity","Humidity","Environment","1/sec"],["airQuality","Air Quality (PM2.5)","Pollution","1/sec"],["noise","Noise","Traffic","5/sec"],["trafficCount","Traffic Count","Vehicles","10/sec"],["parkingOccupancy","Parking Occupancy","Smart parking","0.5/sec"],["vibration","Vibration","Bridge monitoring","50/sec"]];return <Card className="sensor-settings"><Head title="Simulation stream settings" sub="These values are sent to the backend when live simulation starts."/><div className="sensor-table"><div className="sensor-head"><span>SENSOR</span><span>REALISTIC USE</span><span>DEFAULT</span><span>RATE / SEC</span></div>{sensors.map(([k,l,u,r])=><div className="sensor-row" key={k}><label className="sensor-check"><input type="checkbox" checked={cfg[k+"Enabled"]} onChange={e=>change(k+"Enabled",e.target.checked)}/><span>{l}</span></label><span className="sensor-use">{u}</span><span className="sensor-default">{r}</span><input className="sensor-rate" type="number" min="1" max="1000" value={cfg[k+"Rate"]} onChange={e=>change(k+"Rate",e.target.value)}/></div>)}</div><div className="sim-settings-controls"><label className="field">Speed multiplier<input type="number" min="10" max="1000" value={cfg.speed} onChange={e=>change("speed",e.target.value)}/></label><label className="field">Payload bytes<input type="number" min="16" max="1048576" value={cfg.payloadBytes} onChange={e=>change("payloadBytes",e.target.value)}/></label><label className="field">Sensor key space<input type="number" min="1" max="1000000" value={cfg.keySpace} onChange={e=>change("keySpace",e.target.value)}/></label><label className="field">Random reads %<input type="number" min="0" max="100" value={cfg.readRatio} onChange={e=>change("readRatio",e.target.value)}/></label><label className="field">Deletes %<input type="number" min="0" max="100" value={cfg.deleteRatio} onChange={e=>change("deleteRatio",e.target.value)}/></label></div><button className="primary" onClick={save}>{saved?"Saved":"Save simulation settings"}</button></Card>;}
function Settings() {
  const [c, setC] = useState({}),
    [msg, setMsg] = useState("");
  useEffect(() => {
    api("/api/config")
      .then(setC)
      .catch(() => {});
  }, []);
  const change = (k, v) => setC({ ...c, [k]: v });
  const save = async () => {
    try {
      await api("/api/config", { method: "POST", body: JSON.stringify(c) });
      setMsg(
        "Saved to the backend. Restart the server to apply engine settings.",
      );
    } catch (e) {
      setMsg(e.message);
    }
  };
  const engine = [
    ["MEMTABLE_SIZE_MB", "MemTable size (MB)", "1"],
    ["WAL_FLUSH_THRESHOLD_MB", "WAL flush threshold (MB)", "1"],
    ["BLOCK_SIZE_KB", "Data block size (KB)", "4"],
    ["BLOCK_CACHE_SIZE_MB", "Block cache size (MB)", "256"],
    ["BLOOM_FPP", "Bloom false-positive rate", "0.01"],
    ["L0_COMPACTION_TRIGGER", "L0 files before compaction", "4"],
    ["MAX_LEVELS", "Maximum LSM levels", "3"],
    ["WRITE_BUFFER_COUNT", "Write buffers", "2"],
  ];
  return (
    <>
      <Title
        eyebrow="LIVE ENGINE CONFIGURATION"
        title="Parameters"
        desc="Tune the actual local-file LSM tree."
      />
      <SimulationSettings />
      <div className="settings-columns">
        <Card>
          <Head
            title="LSM tree tuning"
            sub="changes apply after backend restart"
          />
          {engine.map(([k, l, d]) => (
            <label className="field" key={k}>
              {l}
              <input
                type="number"
                step={k === "BLOOM_FPP" ? "0.001" : "1"}
                value={c[k] ?? d}
                onChange={(e) => change(k, e.target.value)}
              />
            </label>
          ))}
        </Card>
        <Card>
          <Head
            title="Compaction strategy"
            sub="when L0 reaches this file count, the engine automatically compacts current levels"
          />
          <label className="field">
            COMPACTION POLICY
            <select
              value={c.COMPACTION_POLICY || "size-tiered"}
              onChange={(e) => change("COMPACTION_POLICY", e.target.value)}
            >
              <option>size-tiered</option>
              <option>leveled</option>
              <option>universal</option>
            </select>
          </label>
          <div className="parameter-help">
            <b>What these control</b>
            <span>MemTable fills in memory before flush.</span>
            <span>WAL protects writes during a crash.</span>
            <span>L0 trigger starts automatic compaction after a flush reaches the configured file count.</span>
            <span>Block and Bloom settings tune read performance.</span>
          </div>
          <button className="primary" onClick={save}>
            Save engine parameters
          </button>
          <p className="result">{msg}</p>
        </Card>
      </div>
    </>
  );
}
function Crash({ status: s, refresh }) {
  const [phase, setPhase] = useState("ready"),
    [before, setBefore] = useState(null),
    [after, setAfter] = useState(null),
    [recovery, setRecovery] = useState(null),
    [replayCursor, setReplayCursor] = useState(-1),
    [error, setError] = useState("");
  const run = async () => {
    setBefore({ ...s });
    setError("");
    setRecovery(null); setAfter(null); setReplayCursor(-1);
    setPhase("crashing");
    try {
      const result = await api("/api/crash", { method: "POST" });
      const next = await api("/api/status");
      setRecovery(result);
      setAfter(next);
      setPhase("clearing");
      await new Promise(resolve => setTimeout(resolve, 650));
      setPhase("replaying");
      const entries = result.replayLog || [];
      const delay = Math.max(65, Math.min(220, 5000 / Math.max(entries.length, 1)));
      for (let i = 0; i < entries.length; i++) {
        setReplayCursor(i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      setPhase("recovered");
      refresh();
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  };
  return (
    <>
      <Title
        eyebrow="FAILURE RECOVERY LAB"
        title="Crash simulation"
        desc="Watch the MemTable get cleared and rebuilt from the durable WAL tail. This simulates volatile-memory loss without terminating the backend process."
        action={
          <button
            className="danger"
            disabled={["crashing", "clearing", "replaying"].includes(phase)}
            onClick={run}
          >
            <ShieldAlert size={15} />{" "}
            {["crashing", "clearing", "replaying"].includes(phase) ? "Recovering…" : "Simulate MemTable loss"}
          </button>
        }
      />
      <Card className="crash-card">
        <div className={"crash-timeline " + phase}>
          <div className={phase === "ready" || phase === "crashing" ? "active" : "done"}>
            <b>1 · Running</b>
            <span>
              {before?.memtableKeys ?? s.memtableKeys} volatile keys in MemTable
            </span>
          </div>
          <i>→</i>
          <div className={phase === "clearing" ? "active" : ["replaying", "recovered"].includes(phase) ? "done" : ""}>
            <b>2 · Volatile state cleared</b>
            <span>{recovery?.volatileKeysCleared ?? "—"} keys cleared from memory</span>
          </div>
          <i>→</i>
          <div className={phase === "replaying" ? "active" : phase === "recovered" ? "done" : ""}>
            <b>3 · Replay the WAL tail</b>
            <span>{recovery?.walRecordsReplayed ?? "—"} durable WAL records replayed</span>
          </div>
          <i>→</i>
          <div className={phase === "recovered" ? "active" : ""}>
            <b>4 · Recovered</b>
            <span>{recovery?.memtableKeysRebuilt ?? after?.memtableKeys ?? "—"} unique keys rebuilt</span>
          </div>
        </div>
        <div className="crash-panels">
          <div>
            <small>BEFORE SIMULATED LOSS</small>
            <strong>{before?.memtableKeys ?? s.memtableKeys}</strong>
            <span>volatile MemTable keys</span>
            <strong>{before?.walRecords ?? s.walRecords}</strong>
            <span>durable WAL records available</span>
            <strong>{before?.sstables ?? s.sstables}</strong>
            <span>SSTables already persisted</span>
          </div>
          <div>
            <small>AFTER WAL REPLAY</small>
            <strong>{recovery?.walRecordsReplayed ?? "—"}</strong>
            <span>WAL records replayed in sequence</span>
            <strong>{recovery?.memtableKeysRebuilt ?? "—"}</strong>
            <span>unique MemTable keys rebuilt</span>
            <strong>{recovery?.tombstonesRebuilt ?? "—"}</strong>
            <span>delete markers replayed</span>
            <strong>{recovery?.sstablesAlreadyOnDisk ?? after?.sstables ?? "—"}</strong>
            <span>SSTables stayed on disk throughout</span>
          </div>
        </div>
        {phase === "ready" && <p className="muted">Create a few records with Manual operations, then simulate volatile loss. The backend pauses the stream, drops only the in-memory MemTable, and replays the WAL tail; SSTable files are not reloaded because the process remains running.</p>}
        {phase !== "ready" && phase !== "error" && recovery && <div className="wal-replay"><div className="wal-replay-heading"><div><b>WAL replay animation</b><span>Records are applied in sequence; the latest operation for each key becomes its recovered state.</span></div><strong>{phase === "replaying" ? `${Math.max(replayCursor + 1, 0)} / ${recovery.replayLogTotal}` : `${recovery.walRecordsReplayed} / ${recovery.replayLogTotal}`}</strong></div><div className="wal-replay-list">{(recovery.replayLog || []).map((entry, i) => <div key={`${entry.sequence}-${i}`} className={i === replayCursor && phase === "replaying" ? "current" : i <= replayCursor || phase === "recovered" ? "replayed" : "pending"}><b>#{entry.sequence}</b><strong className={entry.operation === "DEL" ? "delete-op" : "put-op"}>{entry.operation}</strong><code>{entry.key}</code><span>{entry.operation === "DEL" ? "tombstone" : `${entry.valueBytes} value bytes`}</span></div>)}</div>{recovery.replayLogTruncated && <small className="replay-note">Showing the first {recovery.replayLog.length} records of {recovery.replayLogTotal}. The backend replayed the full WAL.</small>}{phase === "replaying" && <p className="replay-caption">Applying record {replayCursor + 1} of {recovery.replayLogTotal} to the MemTable…</p>}{phase === "clearing" && <p className="replay-caption">Volatile keys cleared. Preparing the durable WAL records for replay…</p>}</div>}
        {phase === "recovered" && (
          <><p className="result">Recovery complete: the MemTable was rebuilt from {fmt(recovery?.walRecordsReplayed)} WAL records. SSTables remained available on disk and were not part of this replay.</p><Card className="recovery-entries"><Head title="Entries reconstructed from the WAL" sub="latest state per key; tombstones remain visible"/><DataTable rows={recovery?.replayedEntries || []} empty="The WAL tail was empty, so there were no MemTable entries to rebuild."/></Card></>
        )}
        {phase === "error" && <p className="stream-error">Recovery failed: {error}</p>}
      </Card>
    </>
  );
}
class AppErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main style={{ padding: 32, fontFamily: "system-ui", color: "#244" }}><h1>LSM Lab could not start</h1><p>{this.state.error.message}</p><button onClick={() => location.reload()}>Reload</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(<AppErrorBoundary><App /></AppErrorBoundary>);
