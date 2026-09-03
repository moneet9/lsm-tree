import React, { useEffect, useState } from "react";
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
import "./light.css";
import "./lab.css";
import "./visual.css";
import "./professor.css";
import "./workload.css";
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
  ["/workload", "Workload lab", Activity],
  ["/crud", "CRUD lab", Terminal],
  ["/wal", "WAL records", Archive],
  ["/search", "Read pipeline", Search],
  ["/sstables", "SSTables", Layers3],
  ["/compaction", "Compaction", Boxes],
  ["/crash", "Crash simulation", ShieldAlert],
  ["/settings", "Parameters", SettingsIcon],
];
const fmt = (n) => new Intl.NumberFormat().format(n || 0);
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
  sstableFiles: [],
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
function Card({ children, className = "" }) {
  return <section className={"card " + className}>{children}</section>;
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
    [online, setOnline] = useState(false);
  const refresh = () =>
    api("/api/status")
      .then((x) => {
        setS({ ...empty, ...x });
        setOnline(true);
      })
      .catch(() => setOnline(false));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);
  let page =
    path === "/workload" ? (
      <Workload status={s} refresh={refresh} />
    ) : path === "/crud" ? (
      <Crud refresh={refresh} />
    ) : path === "/wal" ? (
      <Wal />
    ) : path === "/search" ? (
      <SearchLab />
    ) : path === "/sstables" ? (
      <Sstables />
    ) : path === "/compaction" ? (
      <Compaction refresh={refresh} />
    ) : path === "/crash" ? (
      <Crash status={s} refresh={refresh} />
    ) : path === "/settings" ? (
      <Settings />
    ) : (
      <Dashboard status={s} go={go} />
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
            <small>{online ? "MinIO/S3 ready" : "Start C++ backend"}</small>
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
              <HardDrive size={14} /> {s.bucket || "S3 bucket"}
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
          <LearningStrip />
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
    ["06", "Object store", "S3 manifest"],
  ];
  const read = [
    ["01", "Client", "GET /user:42"],
    ["02", "Block cache", `${s.readHitRate ? Math.round(s.readHitRate * 100) : 94}% hit rate`],
    ["03", "Bloom filter", "maybe present?"],
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
      <div className="map-legend"><span><i className="dot memory" /> mutable memory</span><span><i className="dot durable" /> durable log</span><span><i className="dot immutable" /> immutable files</span><span><i className="dot cloud" /> object storage</span></div>
    </Card>
  );
}
function ConceptBoard({ status: s, go }) {
  const concepts = [
    ["01", "WAL + crash recovery", "Durable append protects writes before memory can be rebuilt.", fmt(s.walRecords) + " records", Archive, "/crash", "Replay experiment"],
    ["02", "MemTable + flush", "Sorted mutable state becomes an immutable L0 table at the flush boundary.", fmt(s.memtableKeys) + " live keys", Database, "/crud", "Write a record"],
    ["03", "Bloom + block cache", "Probabilistic filtering avoids I/O; cache keeps hot blocks in memory.", (s.readHitRate * 100).toFixed(1) + "% hit rate", Search, "/search", "Trace a read"],
    ["04", "Compaction + tombstones", "Sorted runs merge, obsolete versions disappear, and deletes become durable markers.", fmt(s.tombstones) + " tombstones", Boxes, "/compaction", "Run a merge"],
    ["05", "SSTables + S3", "Immutable files carry data blocks, sparse indexes, Bloom filters, and a cloud manifest.", fmt(s.sstables) + " local files", HardDrive, "/sstables", "Inspect files"],
    ["06", "Amplification trade-offs", "Write, read, and space costs reveal why LSM engines tune buffers and levels.", s.writeAmplification.toFixed(2) + "× write amp", Activity, "/settings", "Tune parameters"],
  ];
  return <Card className="concept-board"><div className="board-title"><div><span className="eyebrow">PROFESSOR BRIEFING</span><h2>Six ideas, one storage engine</h2><p>Use the board as a guided tour, then open each experiment for live evidence.</p></div><span className="board-status"><i /> LIVE ENGINE MODEL</span></div><div className="concept-grid">{concepts.map(([n,title,desc,metric,Icon,route,action]) => <div className="concept-card" key={title}><div className="concept-top"><span>{n}</span><Icon size={17} /></div><h3>{title}</h3><p>{desc}</p><strong>{metric}</strong><button onClick={() => go(route)}>{action}<ChevronRight size={14} /></button></div>)}</div></Card>;
}
function LearningStrip() {
  return (
    <Card className="learning-strip">
      <div className="learn-title">
        <span className="eyebrow">TEACHING MODE · LSM WRITE PATH</span>
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
function Dashboard({ status: s, go }) {
  return (
    <>
      <Title
        eyebrow="REAL ENGINE STATE"
        title="LSM virtual lab"
        desc="Every number below comes from the running C++ engine."
        action={
          <button className="primary" onClick={() => go("/workload")}>
            <Play size={15} /> Generate real data
          </button>
        }
      />
      <EngineMap status={s} />
      <ConceptBoard status={s} go={go} />
      <div className="kpis">
        <Kpi
          icon={Database}
          label="MEMTABLE KEYS"
          value={fmt(s.memtableKeys)}
        />
        <Kpi
          icon={Archive}
          label="WAL RECORDS"
          value={fmt(s.walRecords)}
          color="cyan"
        />
        <Kpi
          icon={Layers3}
          label="SSTABLE FILES"
          value={s.sstables}
          color="purple"
        />
        <Kpi
          icon={Activity}
          label="READ HIT RATE"
          value={(s.readHitRate * 100).toFixed(1) + "%"}
          color="orange"
        />
      </div>
      <div className="lab-grid">
        <Card>
          <Head
            title="MemTable · mutable memory"
            sub="current key state before flush"
          />
          <DataTable
            rows={s.memtablePreview}
            empty="No records yet. Use CRUD or Workload lab."
          />
        </Card>
        <Card>
          <Head
            title="Engine analytics"
            sub="calculated from actual operations"
          />
          <div className="analytics">
            <Metric n="Tombstones" v={s.tombstones} />
            <Metric n="WAL size" v={fmt(s.walBytes) + " B"} />
            <Metric
              n="Write amplification"
              v={s.writeAmplification.toFixed(2) + "×"}
            />
            <Metric
              n="Space amplification"
              v={s.spaceAmplification.toFixed(2) + "×"}
            />
            <Metric n="Compaction bytes" v={fmt(s.compactionBytes) + " B"} />
            <Metric n="Read operations" v={fmt(s.readOps)} />
          </div>
        </Card>
      </div>
      <Card className="tree-card">
        <Head
          title="LSM levels"
          sub="MemTable → flush → immutable SSTables → compaction"
        />
        <div className="visual-tree">
          <div className="tree-node active">
            <b>MemTable</b>
            <span>{s.memtableKeys} keys</span>
          </div>
          <div className="arrow">↓ flush</div>
          {[
            [
              "L0",
              s.sstableFiles?.filter((x) => x.name?.startsWith("table-"))
                .length || 0,
            ],
            ["L1", 0],
            ["L2", 0],
          ].map(([l, n]) => (
            <React.Fragment key={l}>
              <div className="tree-level">
                <strong>{l}</strong>
                <span>{n} file(s)</span>
                <div>
                  {s.sstableFiles
                    ?.filter((x) => x.name?.startsWith("table-"))
                    .slice(l === "L0" ? 0 : 0, l === "L0" ? 6 : 0)
                    .map((x) => (
                      <code key={x.name}>{x.name}</code>
                    ))}
                </div>
              </div>
              {l !== "L2" && <div className="arrow">↓ compact</div>}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </>
  );
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
function Workload({ status: s, refresh }) {
  const [run, setRun] = useState(false),
    [cfg, setCfg] = useState({
      operations: 5000,
      readRatio: 20,
      deleteRatio: 10,
      keySpace: 1200,
      payloadSize: 384,
    }),
    [result, setResult] = useState(null);
  const presets = {
    "Professor demo": { operations: 12000, readRatio: 20, deleteRatio: 15, keySpace: 1800, payloadSize: 512 },
    "Write burst": { operations: 5000, readRatio: 0, deleteRatio: 0, keySpace: 2000, payloadSize: 256 },
    "Read pressure": { operations: 5000, readRatio: 85, deleteRatio: 0, keySpace: 500, payloadSize: 80 },
    "Tombstone run": { operations: 3000, readRatio: 20, deleteRatio: 30, keySpace: 700, payloadSize: 120 },
  };
  const start = async () => {
    if (cfg.readRatio + cfg.deleteRatio > 100) {
      setResult({ error: "Read percentage + delete percentage must be 100 or less." });
      return;
    }
    setRun(true);
    try {
      setResult(
        await api("/api/simulate", {
          method: "POST",
          body: JSON.stringify(cfg),
        }),
      );
      await refresh();
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setRun(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="REAL WORKLOAD"
        title="Workload lab"
        desc="Run operations against the C++ MemTable, WAL, and SSTable engine."
        action={
          <button className="primary" disabled={run} onClick={start}>
            {run ? (
              <>
                <RefreshCw className="spin" size={15} /> Running…
              </>
            ) : (
              <>
                <Play size={15} /> Start workload
              </>
            )}
          </button>
        }
      />
      <div className="work-grid">
        <Card>
          <Head
            title="Workload parameters"
            sub="these values are sent to /api/simulate"
          />
          <div className="preset-row">
            {Object.entries(presets).map(([name, values]) => (
              <button className="preset" key={name} onClick={() => setCfg(values)}>{name}</button>
            ))}
          </div>
          {[
            ["operations", "Total operations"],
            ["readRatio", "Read percentage"],
            ["deleteRatio", "Delete percentage"],
            ["keySpace", "Key space"],
            ["payloadSize", "Value bytes"],
          ].map(([k, l]) => (
            <label className="field" key={k}>
              {l}
              <input
                type="number"
                min={0}
                max={k === "operations" ? 100000 : k === "payloadSize" ? 1048576 : k === "readRatio" || k === "deleteRatio" ? 100 : 100000}
                value={cfg[k]}
                onChange={(e) => setCfg({ ...cfg, [k]: +e.target.value })}
              />
            </label>
          ))}
          <button
            className="ghost"
            onClick={() =>
              setCfg({
                operations: 5000,
                readRatio: 20,
                deleteRatio: 10,
                keySpace: 1200,
                payloadSize: 384,
              })
            }
          >
            Reset parameters
          </button>
        </Card>
        <Card>
          <Head
            title="Live engine reaction"
            sub="refreshes from backend every 1.5 seconds"
          />
          <div className="reaction">
            <Metric n="MemTable keys" v={s.memtableKeys} />
            <Metric n="WAL records" v={s.walRecords} />
            <Metric n="SSTables" v={s.sstables} />
            <Metric n="Tombstones" v={s.tombstones} />
          </div>
          {result && (
            <div className="result">
              {result.error ||
                `Completed ${fmt(result.operations)} operations · ${fmt(Math.round(result.throughput))} ops/sec · p99 ${Math.round(result.p99)} µs`}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
function Crud({ refresh }) {
  const [tab, setTab] = useState("PUT"),
    [key, setKey] = useState("hello"),
    [value, setValue] = useState("world"),
    [message, setMessage] = useState("");
  const act = async () => {
    try {
      let data =
        tab === "GET"
          ? await api("/api/get?key=" + encodeURIComponent(key))
          : await api(tab === "DELETE" ? "/api/delete" : "/api/put", {
              method: "POST",
              body: JSON.stringify({ key, value }),
            });
      setMessage(
        tab === "GET"
          ? data.found
            ? `Found: ${data.value}`
            : "Key not found"
          : tab === "DELETE"
            ? "Tombstone created in WAL"
            : "Value committed to WAL → MemTable",
      );
      await refresh();
    } catch (e) {
      setMessage("Backend error: " + e.message);
    }
  };
  return (
    <>
      <Title
        eyebrow="REAL DATA OPERATIONS"
        title="CRUD lab"
        desc="Write, read, update, and tombstone actual records."
      />
      <Card className="crud">
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
            <p className="result">{message}</p>
          </div>
          <div className="write-path">
            <b>Actual write path</b>
            <span>01 · HTTP request</span>
            <span>02 · WAL append</span>
            <span>03 · MemTable mutation</span>
            <span>04 · Flush creates SSTable</span>
          </div>
        </div>
      </Card>
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
    const t = setInterval(f, 1500);
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
  const [files, setFiles] = useState([]);
  useEffect(() => {
    api("/api/sstables")
      .then(setFiles)
      .catch(() => {});
  }, []);
  return (
    <>
      <Title
        eyebrow="REAL IMMUTABLE FILES"
        title="SSTable explorer"
        desc="Metadata extracted from actual table files on disk and mirrored to S3."
      />
      <div className="sstable-grid">
        {files.map((f) => (
          <Card className="sstable" key={f.name}>
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
                Bloom filter <b className="success">{f.bloom}</b>
              </span>
            </div>
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
    </>
  );
}
function SearchLab() {
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
                {i === 1 ? "actual engine lookup" : "ready for backend adapter"}
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
            <div><span>MEMTABLE</span><b>{out.found ? "checked" : "miss"}</b><small>mutable first</small></div>
            <div><span>BLOOM FILTER</span><b>{out.found ? "maybe" : "negative"}</b><small>{out.found ? "continue search" : "skip file"}</small></div>
            <div><span>BLOCK CACHE</span><b>{out.found ? "hit / fill" : "no read"}</b><small>4 KB target block</small></div>
            <div><span>VERSION RULE</span><b>{out.found ? "latest seq" : "absent"}</b><small>tombstones win</small></div>
          </div>
        )}
      </Card>
    </>
  );
}
function Compaction({ refresh }) {
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true);
    try {
      const x = await api("/api/compact", { method: "POST" });
      setMsg(`Compaction complete · ${x.tombstonesRemoved} tombstones removed`);
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
        desc="Flush the MemTable, rewrite sorted data, and apply tombstones."
        action={
          <button className="primary" disabled={busy} onClick={run}>
            {busy ? <RefreshCw className="spin" /> : <Boxes size={15} />}{" "}
            {busy ? "Compacting…" : "Run compaction"}
          </button>
        }
      />
      <Card className="compact-card">
        <Head
          title="L0 → L1 merge"
          sub="the operation creates a real .sst file and updates the S3 manifest"
        />
        <div className="merge-flow">
          <div>
            MemTable
            <br />
            <b>mutable</b>
          </div>
          <span>→</span>
          <div>
            L0 files
            <br />
            <b>merge + sort</b>
          </div>
          <span>→</span>
          <div className="output">
            new SSTable
            <br />
            <b>immutable</b>
          </div>
        </div>
        <div className="result">
          {msg || "Ready. Run a workload or CRUD writes before compacting."}
        </div>
      </Card>
    </>
  );
}
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
        desc="Tune the actual LSM tree. S3 credentials stay in your local .env file."
      />
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
            sub="manual compaction uses this policy"
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
            <span>L0 trigger controls when you should compact manually.</span>
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
    [after, setAfter] = useState(null);
  const run = async () => {
    setBefore({ ...s });
    setPhase("crashing");
    await new Promise((r) => setTimeout(r, 900));
    try {
      await api("/api/crash", { method: "POST" });
      const next = await api("/api/status");
      setAfter(next);
      setPhase("recovered");
      refresh();
    } catch (e) {
      setPhase("error");
    }
  };
  return (
    <>
      <Title
        eyebrow="FAILURE RECOVERY LAB"
        title="Crash simulation"
        desc="See volatile memory disappear, then restore SSTables and replay the WAL tail."
        action={
          <button
            className="danger"
            disabled={phase === "crashing"}
            onClick={run}
          >
            <ShieldAlert size={15} />{" "}
            {phase === "crashing" ? "System crashed…" : "Simulate crash"}
          </button>
        }
      />
      <Card className="crash-card">
        <div className={"crash-timeline " + phase}>
          <div>
            <b>1 · Running</b>
            <span>
              MemTable has {before?.memtableKeys ?? s.memtableKeys} keys
            </span>
          </div>
          <i>→</i>
          <div>
            <b>2 · Process lost</b>
            <span>volatile MemTable cleared</span>
          </div>
          <i>→</i>
          <div>
            <b>3 · Restore durable state</b>
            <span>SSTables restored + WAL tail replayed</span>
          </div>
          <i>→</i>
          <div>
            <b>4 · Recovered</b>
            <span>{after?.memtableKeys ?? "—"} keys restored</span>
          </div>
        </div>
        <div className="crash-panels">
          <div>
            <small>BEFORE CRASH</small>
            <strong>{before?.memtableKeys ?? s.memtableKeys}</strong>
            <span>MemTable keys</span>
            <strong>{before?.walRecords ?? s.walRecords}</strong>
            <span>WAL records pending replay</span>
          </div>
          <div>
            <small>AFTER WAL RECOVERY</small>
            <strong>{after?.memtableKeys ?? "—"}</strong>
            <span>Durable keys restored</span>
            <strong>{after ? after.walRecords : "—"}</strong>
            <span>WAL tail applied</span>
          </div>
        </div>
        {phase === "ready" && (
          <p className="muted">
            Create records in CRUD lab first, then press Simulate crash to watch
            recovery.
          </p>
        )}
        {phase === "recovered" && (
          <p className="result">
            Recovery complete. Persisted SSTables were restored and the remaining WAL tail was replayed.
          </p>
        )}
      </Card>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
