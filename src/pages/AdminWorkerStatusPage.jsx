import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  MdKeyboardArrowDown,
  MdOutlineArrowBackIos,
  MdOutlineRefresh,
  MdOutlineSearch,
} from "react-icons/md";
import "./AdminWorkerStatusPage.css";

const WINDOWS = [["1h", "1 小時"], ["6h", "6 小時"], ["24h", "24 小時"], ["7d", "7 天"], ["30d", "30 天"]];
const STAGES = ["download", "prepare", "vlm", "submit", "complete"];
const STAGE_LABELS = { claimed: "等待中", download: "下載", prepare: "圖片準備", vlm: "VLM 辨識", submit: "回報", complete: "完成" };
const STATUS_LABELS = { claimed: "等待中", running: "處理中", completed: "完成", failed: "失敗", stale: "逾時", abandoned: "中止", skipped: "略過", healthy: "正常", attention: "需注意" };
const ATTEMPT_STATUSES = ["claimed", "running", "completed", "failed", "stale", "abandoned", "skipped"];
const TERMINAL_PROBLEMS = new Set(["failed", "stale", "abandoned"]);

function formatDateTime(value, withSeconds = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}), hour12: false,
  }).format(date);
}

function formatAgoFromMs(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return "—";
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function formatAge(value, serverNow) {
  if (!value) return "—";
  return formatAgoFromMs(new Date(serverNow || Date.now()).getTime() - new Date(value).getTime());
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") return "—";
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時 ${Math.floor((seconds % 3600) / 60)} 分`;
  return `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小時`;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "—";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("zh-TW").format(number) : "—";
}

function attemptDuration(attempt, serverNow) {
  if (attempt?.timings?.totalMs != null) return attempt.timings.totalMs;
  if (!attempt?.startedAt && !attempt?.claimedAt) return null;
  const start = new Date(attempt.startedAt || attempt.claimedAt).getTime();
  const end = new Date(attempt.completedAt || serverNow || Date.now()).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
}

function resultValue(item) {
  if (item.status === "claimed" || item.status === "running") return { text: "…", tone: "muted" };
  if (TERMINAL_PROBLEMS.has(item.status)) return { text: "!", tone: "error" };
  if (item.status === "skipped") return { text: "–", tone: "muted" };
  if (item.resultStatus === "error") return { text: "!", tone: "error" };
  if (item.resultStatus !== "ok") return { text: "X", tone: "unknown" };
  if (item.availabilityMode === "boolean") return item.hasAvailableSpace ? { text: "有", tone: "ok" } : { text: "滿", tone: "ok" };
  return item.vacancy == null ? { text: "X", tone: "unknown" } : { text: String(item.vacancy), tone: "ok" };
}

function currentResult(attempt) {
  return resultValue({ status: attempt.status, resultStatus: attempt.result?.status, availabilityMode: attempt.result?.availabilityMode, hasAvailableSpace: attempt.result?.hasAvailableSpace, vacancy: attempt.result?.vacancy });
}

function stageState(attempt, stage, index) {
  if (TERMINAL_PROBLEMS.has(attempt.status)) {
    const failedIndex = Math.max(0, STAGES.indexOf(attempt.failure?.stage || attempt.stage));
    if (index < failedIndex) return "done";
    if (index === failedIndex) return "failed";
    return "";
  }
  if (attempt.status === "completed") return "done";
  const currentIndex = Math.max(0, STAGES.indexOf(attempt.stage));
  if (index < currentIndex) return "done";
  if (index === currentIndex || (attempt.stage === "claimed" && stage === "download")) return attempt.isStalled ? "stalled" : "current";
  return "";
}

function failureHint(stage) {
  return ({
    claimed: "Worker 可能在領取工作後中斷，請確認該機器仍在線。",
    download: "請檢查來源圖片是否存在，以及 worker 到儲存空間的連線。",
    prepare: "請檢查圖片是否損毀，或格式是否能由影像處理程式讀取。",
    vlm: "請確認 LM Studio 正在執行、模型已載入，並檢查 VLM concurrency。",
    submit: "辨識可能已完成但無法回報，請檢查後端連線與 worker API key。",
  })[stage] || "請先檢查失敗階段與訊息，再和最近一次成功的工作比較。";
}

function StatusPill({ status, stalled = false }) {
  const value = stalled ? "stalled" : status || "unknown";
  return <span className={`aws-status-pill is-${value}`}>{stalled ? "停滯" : STATUS_LABELS[value] || value}</span>;
}

function MetricCard({ label, value, note, tone = "" }) {
  return <article className={`aws-metric ${tone ? `is-${tone}` : ""}`}><div className="aws-metric-label">{label}</div><strong>{value}</strong><div className="aws-metric-note">{note}</div></article>;
}

function ResultHistory({ items = [] }) {
  const history = [...items].reverse();
  if (!history.length) return <span className="aws-history-empty">尚無結果</span>;
  return <div className="aws-result-history" aria-label="最近辨識結果">{history.map((item, index) => {
    const result = resultValue(item);
    return <span className="aws-history-step" key={item.attemptId || `${item.at}-${index}`}><span className={`aws-history-value is-${result.tone}`} title={`${STATUS_LABELS[item.status] || item.status} · ${formatDateTime(item.at)}`}>{result.text}</span>{index < history.length - 1 && <i aria-hidden="true">›</i>}</span>;
  })}</div>;
}

function Pipeline({ attempts, serverNow }) {
  return <section className="aws-panel aws-pipeline-panel">
    <header className="aws-panel-head"><div><span className="aws-eyebrow">PROCESSING FLOOR</span><h2>目前處理工作</h2><p>來自所有 worker 的即時階段</p></div><span className="aws-panel-count">{attempts.length} active</span></header>
    <div className="aws-stage-head" aria-hidden="true"><span /><div>{STAGES.map((stage) => <span key={stage}>{STAGE_LABELS[stage]}</span>)}</div><span /></div>
    <div className="aws-pipeline-list">{!attempts.length ? <div className="aws-empty-state">目前沒有進行中的工作，workers 正在等待新圖片。</div> : attempts.map((attempt) => <article className="aws-pipeline-row" key={attempt.attemptId}>
      <div className="aws-job-name" title={attempt.deviceId}><strong>{attempt.parkingLotName || attempt.deviceId}</strong><span>{attempt.workerId}</span></div>
      <div className="aws-stage-track">{STAGES.map((stage, index) => <i key={stage} className={stageState(attempt, stage, index)} title={STAGE_LABELS[stage]} />)}</div>
      <div className="aws-job-state"><StatusPill status={attempt.status} stalled={attempt.isStalled} /><span>{formatDuration(attemptDuration(attempt, serverNow))}</span></div>
    </article>)}</div>
  </section>;
}

function WorkerFleet({ workers, serverNow }) {
  return <section className="aws-panel aws-workers-panel">
    <header className="aws-panel-head"><div><span className="aws-eyebrow">WORKER FLEET</span><h2>機器狀態</h2><p>Heartbeat、佇列與本次 session 統計</p></div><span className="aws-panel-count">{workers.filter((worker) => worker.isAlive).length}/{workers.length} online</span></header>
    <div className="aws-worker-list">{!workers.length ? <div className="aws-empty-state">尚未收到任何 worker heartbeat。</div> : workers.map((worker) => <article className={`aws-worker ${worker.isAlive ? "is-alive" : "is-down"}`} key={worker.workerId}>
      <div className="aws-worker-top"><div><strong>{worker.workerId || "unknown-worker"}</strong><span>{worker.hostname || "unknown host"}{worker.pid != null ? ` · pid ${worker.pid}` : ""}</span></div><span className={`aws-online-pill ${worker.isAlive ? "is-alive" : "is-down"}`}><i />{worker.isAlive ? "ONLINE" : "DOWN"}</span></div>
      <div className="aws-worker-stats"><div><span>Active</span><b>{worker.activeJobCount || 0}</b></div><div><span>Pending</span><b>{worker.pendingSubmissionCount || 0}</b></div><div><span>Completed</span><b>{worker.completedCount || 0}</b></div><div><span>Failed</span><b>{worker.failedCount || 0}</b></div></div>
      <div className="aws-worker-meta"><span>heartbeat {formatAge(worker.lastHeartbeatAt, serverNow)}</span><span>v{worker.workerVersion || "—"}</span><span>c{worker.concurrency ?? "—"} · vlm {worker.vlmConcurrency ?? "—"}</span></div>
      {worker.lastErrorMessage && <div className="aws-worker-error" title={worker.lastErrorMessage}>{worker.lastErrorMessage}</div>}
    </article>)}</div>
  </section>;
}

function DevicesPanel({ data, group, setGroup, query, setQuery, loading }) {
  const rows = data?.rows || [];
  return <section className="aws-panel aws-devices-panel">
    <header className="aws-panel-head aws-device-head"><div><span className="aws-eyebrow">FLEET QUALITY</span><h2>裝置辨識品質</h2><p>每台裝置最近 10 次結果，跨 worker 合併</p></div><div className="aws-device-actions"><div className="aws-search-box"><MdOutlineSearch size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋裝置或停車場" aria-label="搜尋裝置或停車場" /></div><span className="aws-panel-count">{data?.totalCount || 0} 台</span></div></header>
    <div className="aws-tabs" role="tablist" aria-label="裝置品質篩選">{[["all", "全部"], ["healthy", "成功較多"], ["attention", "需要注意"]].map(([value, label]) => <button type="button" role="tab" aria-selected={group === value} className={group === value ? "active" : ""} onClick={() => setGroup(value)} key={value}>{label}</button>)}</div>
    <div className={`aws-device-list ${loading ? "is-loading" : ""}`}>{!rows.length ? <div className="aws-empty-state">{loading ? "讀取裝置資料中…" : "目前沒有符合條件的裝置。"}</div> : rows.map((device, index) => <article className="aws-device-row" key={device.deviceId}>
      <span className="aws-device-rank">{String(index + 1).padStart(2, "0")}</span><div className="aws-device-main"><div className="aws-device-title"><div title={device.deviceId}><strong>{device.parkingLotName || device.deviceId}</strong><span>{device.deviceId}{device.lastWorkerId ? ` · ${device.lastWorkerId}` : ""}</span></div><StatusPill status={device.health} /></div>
      <div className="aws-device-bottom"><ResultHistory items={device.resultHistory} /><div className="aws-device-counts"><span className="is-good"><b>{device.successfulCount || 0}</b> 成功</span><span><b>{device.unknownCount || 0}</b> 無法辨識</span><span className="is-bad"><b>{(device.failedCount || 0) + (device.staleCount || 0) + (device.abandonedCount || 0)}</b> 失敗</span><time>{formatAge(device.lastResultAt)}</time></div></div></div>
    </article>)}</div>
  </section>;
}

function FailureRow({ failure, initiallyOpen, serverNow }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="aws-failure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span className="aws-failure-mark">!</span><span className="aws-failure-title"><strong>{failure.parkingLotName || failure.deviceId}</strong><small>{failure.workerId} · {STAGE_LABELS[failure.failure?.stage || failure.stage] || failure.stage}</small></span><time>{formatAge(failure.completedAt, serverNow)}</time><MdKeyboardArrowDown className="aws-failure-chevron" size={20} /></summary>
    <div className="aws-failure-body"><div><span>WHAT HAPPENED</span><code>{failure.failure?.message || "Unknown worker error"}</code></div><div className="aws-failure-hint"><span>LIKELY NEXT STEP</span><p>{failureHint(failure.failure?.stage || failure.stage)}</p></div><div className="aws-failure-object"><span>IMAGE OBJECT</span><code>{failure.imageObject || "—"}</code></div></div>
  </details>;
}

function FailuresPanel({ failures, serverNow }) {
  return <section className="aws-panel aws-failures-panel">
    <header className="aws-panel-head"><div><span className="aws-eyebrow is-danger">DIAGNOSTICS</span><h2>最近失敗</h2><p>失敗、逾時與中止的 operational attempts</p></div><span className="aws-panel-count">{failures.length} retained</span></header>
    <div className="aws-failure-list">{!failures.length ? <div className="aws-empty-state">所選時間範圍內沒有 operational failure。</div> : failures.map((failure, index) => <FailureRow failure={failure} initiallyOpen={index === 0} serverNow={serverNow} key={failure.attemptId} />)}</div>
  </section>;
}

function AttemptsPanel({ data, filters, setFilters, loading, onLoadMore, loadingMore, serverNow }) {
  const rows = data?.rows || [];
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  return <section className="aws-panel aws-attempts-panel">
    <header className="aws-panel-head aws-attempt-head"><div><span className="aws-eyebrow">ATTEMPT HISTORY</span><h2>處理紀錄</h2><p>追蹤工作由哪台 worker 處理、停在哪個階段</p></div><div className="aws-attempt-filters">
      <select value={filters.status} onChange={update("status")} aria-label="狀態"><option value="">所有狀態</option>{ATTEMPT_STATUSES.map((value) => <option value={value} key={value}>{STATUS_LABELS[value]}</option>)}</select>
      <select value={filters.stage} onChange={update("stage")} aria-label="階段"><option value="">所有階段</option><option value="claimed">等待中</option>{STAGES.map((stage) => <option value={stage} key={stage}>{STAGE_LABELS[stage]}</option>)}</select>
      <input value={filters.workerId} onChange={update("workerId")} placeholder="Worker ID" aria-label="Worker ID" /><input value={filters.deviceId} onChange={update("deviceId")} placeholder="Device ID" aria-label="Device ID" />
    </div></header>
    <div className={`aws-table-wrap ${loading ? "is-loading" : ""}`}><table className="aws-attempt-table"><thead><tr><th>時間</th><th>裝置 / 停車場</th><th>Worker</th><th>狀態</th><th>階段</th><th>結果</th><th>處理時間</th></tr></thead><tbody>{!rows.length ? <tr><td colSpan="7" className="aws-table-empty">{loading ? "讀取處理紀錄中…" : "沒有符合條件的處理紀錄。"}</td></tr> : rows.map((attempt) => {
      const result = currentResult(attempt);
      return <tr key={attempt.attemptId}><td><strong>{formatDateTime(attempt.claimedAt)}</strong><small>{formatAge(attempt.claimedAt, serverNow)}</small></td><td><strong>{attempt.parkingLotName || "—"}</strong><small>{attempt.deviceId}</small></td><td><strong>{attempt.workerId}</strong><small>{attempt.workerSessionId || "—"}</small></td><td><StatusPill status={attempt.status} /></td><td>{STAGE_LABELS[attempt.failure?.stage || attempt.stage] || attempt.stage}</td><td><span className={`aws-table-result is-${result.tone}`}>{result.text}</span></td><td>{formatDuration(attemptDuration(attempt, serverNow))}</td></tr>;
    })}</tbody></table></div>
    {data?.hasMore && <button type="button" className="aws-load-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "載入中…" : "載入更多紀錄"}</button>}
  </section>;
}

async function fetchJson(url, adminKey, signal) {
  const response = await fetch(url, { headers: { "x-admin-key": adminKey }, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timeout = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timeout); }, [delay, value]);
  return debounced;
}

export default function AdminWorkerStatusPage({ apiBase }) {
  const initialKey = localStorage.getItem("adminKey") || "";
  const [adminKey, setAdminKey] = useState(initialKey);
  const [connectedKey, setConnectedKey] = useState(initialKey);
  const [windowRange, setWindowRange] = useState("24h");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [deviceGroup, setDeviceGroup] = useState("all");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [attemptFilters, setAttemptFilters] = useState({ status: "", stage: "", workerId: "", deviceId: "" });
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errors, setErrors] = useState({});
  const overviewAbort = useRef(null);
  const devicesAbort = useRef(null);
  const attemptsAbort = useRef(null);
  const debouncedDeviceQuery = useDebounced(deviceQuery);
  const debouncedWorkerId = useDebounced(attemptFilters.workerId);
  const debouncedAttemptDeviceId = useDebounced(attemptFilters.deviceId);
  const setSectionError = useCallback((section, message = "") => setErrors((current) => ({ ...current, [section]: message })), []);

  const loadOverview = useCallback(async () => {
    if (!connectedKey) return;
    overviewAbort.current?.abort(); const controller = new AbortController(); overviewAbort.current = controller;
    setOverviewLoading(true); setSectionError("overview");
    try {
      const query = new URLSearchParams({ window: windowRange });
      const data = await fetchJson(`${apiBase}/api/admin/devices/ai-monitor/overview?${query}`, connectedKey, controller.signal);
      setOverview(data); setLastFetchAt(Date.now());
    } catch (error) { if (error?.name !== "AbortError") setSectionError("overview", error?.message || "無法讀取 AI monitor"); }
    finally { if (overviewAbort.current === controller) setOverviewLoading(false); }
  }, [apiBase, connectedKey, setSectionError, windowRange]);

  const loadDevices = useCallback(async () => {
    if (!connectedKey) return;
    devicesAbort.current?.abort(); const controller = new AbortController(); devicesAbort.current = controller;
    setDevicesLoading(true); setSectionError("devices");
    try {
      const query = new URLSearchParams({ window: windowRange, group: deviceGroup, limit: "200" });
      if (debouncedDeviceQuery.trim()) query.set("query", debouncedDeviceQuery.trim());
      setDevices(await fetchJson(`${apiBase}/api/admin/devices/ai-monitor/devices?${query}`, connectedKey, controller.signal));
    } catch (error) { if (error?.name !== "AbortError") setSectionError("devices", error?.message || "無法讀取裝置品質"); }
    finally { if (devicesAbort.current === controller) setDevicesLoading(false); }
  }, [apiBase, connectedKey, debouncedDeviceQuery, deviceGroup, setSectionError, windowRange]);

  const loadAttempts = useCallback(async ({ append = false, cursor = "" } = {}) => {
    if (!connectedKey) return;
    attemptsAbort.current?.abort(); const controller = new AbortController(); attemptsAbort.current = controller;
    if (append) setLoadingMore(true); else setAttemptsLoading(true); setSectionError("attempts");
    try {
      const query = new URLSearchParams({ window: windowRange, limit: "50" });
      if (attemptFilters.status) query.set("status", attemptFilters.status);
      if (attemptFilters.stage) query.set("stage", attemptFilters.stage);
      if (debouncedWorkerId.trim()) query.set("workerId", debouncedWorkerId.trim());
      if (debouncedAttemptDeviceId.trim()) query.set("deviceId", debouncedAttemptDeviceId.trim());
      if (cursor) query.set("cursor", cursor);
      const data = await fetchJson(`${apiBase}/api/admin/devices/ai-monitor/attempts?${query}`, connectedKey, controller.signal);
      setAttempts((current) => append ? { ...data, rows: [...(current?.rows || []), ...(data.rows || [])] } : data);
    } catch (error) { if (error?.name !== "AbortError") setSectionError("attempts", error?.message || "無法讀取處理紀錄"); }
    finally { if (attemptsAbort.current === controller) { setAttemptsLoading(false); setLoadingMore(false); } }
  }, [apiBase, attemptFilters.stage, attemptFilters.status, connectedKey, debouncedAttemptDeviceId, debouncedWorkerId, setSectionError, windowRange]);

  useEffect(() => { loadOverview(); }, [loadOverview, refreshNonce]);
  useEffect(() => { loadDevices(); }, [loadDevices, refreshNonce]);
  useEffect(() => { loadAttempts(); }, [loadAttempts, refreshNonce]);
  useEffect(() => { if (!autoRefresh || !connectedKey) return undefined; const interval = setInterval(() => setRefreshNonce((value) => value + 1), 15_000); return () => clearInterval(interval); }, [autoRefresh, connectedKey]);
  useEffect(() => () => { overviewAbort.current?.abort(); devicesAbort.current?.abort(); attemptsAbort.current?.abort(); }, []);

  const summary = useMemo(() => overview?.summary || {}, [overview?.summary]);
  const errorMessages = [...new Set(Object.values(errors).filter(Boolean))];
  const busy = overviewLoading || devicesLoading || attemptsLoading;
  const connected = Boolean(connectedKey && overview);
  const headline = summary.activeAttemptCount > 0 ? `${summary.activeAttemptCount} 個工作正在跨機器處理` : connected ? "AI fleet 已連線，等待新的圖片" : "輸入管理員密碼以連線 AI fleet";
  const metrics = useMemo(() => [
    { label: "每分鐘完成", value: formatNumber(summary.completionsLastMinute || 0), note: `所選期間共 ${formatNumber(summary.completedCount || 0)} 個完成`, tone: "live" },
    { label: "平均每張處理時間", value: formatDuration(summary.averageProcessingMs), note: `P50 ${formatDuration(summary.p50ProcessingMs)} · P95 ${formatDuration(summary.p95ProcessingMs)}` },
    { label: "Longest AI delay", value: formatDuration(summary.longestAiDelayMs), note: summary.longestAiDelayDeviceId || "目前沒有等待中的圖片", tone: summary.longestAiDelayMs != null ? "attention" : "" },
    { label: "成功辨識比例", value: formatPercent(summary.recognitionRate), note: `${formatNumber(summary.recognizedCount || 0)} / ${formatNumber(summary.completedCount || 0)} completed`, tone: "success" },
    { label: "Operational failure", value: formatPercent(summary.operationalFailureRate), note: `${formatNumber(summary.failedCount || 0)} failed · ${formatNumber(summary.staleCount || 0)} stale`, tone: summary.failedCount > 0 ? "danger" : "" },
    { label: "待處理圖片", value: formatNumber(summary.pendingImageCount || 0), note: `${formatNumber(summary.activeAttemptCount || 0)} active · ${formatNumber(summary.stalledAttemptCount || 0)} stalled`, tone: summary.stalledAttemptCount > 0 ? "danger" : "" },
  ], [summary]);

  function connectAndRefresh() {
    const key = adminKey.trim();
    if (!key) return toast.error("請先輸入管理員密碼");
    localStorage.setItem("adminKey", key); setConnectedKey(key); setRefreshNonce((value) => value + 1); toast.success("正在更新 AI fleet 資料");
  }

  return <div className="aws-page">
    <header className="aws-header"><div className="aws-heading"><a className="aws-back-btn" href="/?admin=1" aria-label="回到管理選單"><MdOutlineArrowBackIos size={18} /></a><div><span className="aws-eyebrow">PARKING AI · FLEET MONITOR</span><h1>AI 辨識機器監控</h1><p>{headline}</p></div></div><div className="aws-header-status"><span className={`aws-connection ${connected ? "is-live" : ""}`}><i />{connected ? "LIVE" : "OFFLINE"}</span><time>{lastFetchAt ? `更新於 ${formatDateTime(lastFetchAt)}` : "尚未更新"}</time></div></header>
    <div className="aws-toolbar"><label className="aws-key-field"><span>管理員密碼</span><input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") connectAndRefresh(); }} placeholder="admin key" /></label><label><span>統計範圍</span><select value={windowRange} onChange={(event) => setWindowRange(event.target.value)}>{WINDOWS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="button" className="aws-refresh-btn" onClick={connectAndRefresh} disabled={busy}><MdOutlineRefresh size={19} className={busy ? "is-spinning" : ""} />{busy ? "更新中" : "更新資料"}</button><button type="button" className={`aws-auto-btn ${autoRefresh ? "active" : ""}`} onClick={() => setAutoRefresh((value) => !value)}><i />{autoRefresh ? "每 15 秒自動更新" : "自動更新已關閉"}</button></div>
    <main className="aws-content">{errorMessages.map((message) => <div className="aws-error-banner" key={message}>{message}</div>)}
      <section className="aws-overview-strip"><div className="aws-fleet-pulse"><div><strong>{summary.aliveWorkerCount || 0}</strong><span>ONLINE</span></div><p>{summary.workerCount || 0} workers<br /><b>{summary.downWorkerCount || 0} down</b></p></div><div className="aws-metrics-grid">{metrics.map((metric) => <MetricCard {...metric} key={metric.label} />)}</div></section>
      <div className="aws-workbench"><Pipeline attempts={overview?.activeAttempts || []} serverNow={overview?.serverNow} /><WorkerFleet workers={overview?.workers || []} serverNow={overview?.serverNow} /></div>
      <DevicesPanel data={devices} group={deviceGroup} setGroup={setDeviceGroup} query={deviceQuery} setQuery={setDeviceQuery} loading={devicesLoading} />
      <FailuresPanel failures={overview?.recentFailures || []} serverNow={overview?.serverNow} />
      <AttemptsPanel data={attempts} filters={attemptFilters} setFilters={setAttemptFilters} loading={attemptsLoading} loadingMore={loadingMore} onLoadMore={() => loadAttempts({ append: true, cursor: attempts?.nextCursor })} serverNow={attempts?.serverNow} />
    </main>
  </div>;
}
