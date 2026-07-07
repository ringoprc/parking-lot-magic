// frontend/src/pages/AdminWorkerStatusPage.jsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Spinner } from "reactstrap";
import "./AdminWorkerStatusPage.css";

import { MdOutlineArrowBackIos } from "react-icons/md";

function formatDateTime(v) {
  if (!v) return "—";

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

function formatAgo(ms) {
  if (ms == null) return "—";

  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;

  if (min <= 0) return `${sec} 秒前`;
  return `${min} 分 ${String(sec).padStart(2, "0")} 秒前`;
}

function formatDurationSec(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} 秒`;
}

export default function AdminWorkerStatusPage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [rows, setRows] = useState([]);
  const [downAfterMs, setDownAfterMs] = useState(60 * 1000);
  const [loading, setLoading] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  function persistAdminKey(v) {
    setAdminKey(v);
    localStorage.setItem("adminKey", v);
  }

  async function load(opts = {}) {
    const { silent = false } = opts;

    if (!adminKey) {
      if (!silent) toast.error("請先輸入管理員密碼");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/devices/worker-heartbeats`, {
        headers: {
          "x-admin-key": adminKey,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "讀取 worker 狀態失敗");
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setDownAfterMs(Number(data?.downAfterMs) || 60 * 1000);
      setLastFetchAt(Date.now());

      if (!silent) toast.success("已更新 worker 狀態");
    } catch (e) {
      toast.error(e?.message || "讀取 worker 狀態失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    if (!adminKey) return;

    const t = setInterval(() => {
      load({ silent: true });
    }, 10_000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, adminKey]);

  const summary = useMemo(() => {
    const total = rows.length;
    const alive = rows.filter((r) => r.isAlive).length;
    const down = total - alive;

    return { total, alive, down };
  }, [rows]);

  return (
    <div className="aws-outer">
      <div className="aws-topbar">

        <a className="aws-back-btn" href="/?admin=1" aria-label="回到管理選單">
          <MdOutlineArrowBackIos size={18} />
        </a>
        <div className="aws-title">AI Worker 狀態管理</div>

        <div className="aws-adminkey">
          <div className="aws-label">管理員密碼</div>

          <input
            className="aws-input"
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="admin key"
          />

          <button
            type="button"
            className="aws-btn"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? "載入中..." : "重新載入"}
          </button>

          <button
            type="button"
            className={`aws-btn ${autoRefresh ? "primary" : ""}`}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            {autoRefresh ? "自動更新中" : "自動更新關閉"}
          </button>
        </div>
      </div>

      <div className="aws-summary-row">
        <div className="aws-summary-card">
          <div className="aws-summary-label">Worker 總數</div>
          <div className="aws-summary-value">{summary.total}</div>
        </div>

        <div className="aws-summary-card alive">
          <div className="aws-summary-label">運作中</div>
          <div className="aws-summary-value">{summary.alive}</div>
        </div>

        <div className={`aws-summary-card ${summary.down > 0 ? "down" : ""}`}>
          <div className="aws-summary-label">Down</div>
          <div className="aws-summary-value">{summary.down}</div>
        </div>

        <div className="aws-summary-card">
          <div className="aws-summary-label">判定 Down 門檻</div>
          <div className="aws-summary-value small">{Math.round(downAfterMs / 1000)} 秒</div>
        </div>

        <div className="aws-summary-card">
          <div className="aws-summary-label">最近載入</div>
          <div className="aws-summary-value small">
            {lastFetchAt ? formatDateTime(lastFetchAt) : "—"}
          </div>
        </div>
      </div>

      <div className="aws-body">
        {loading && rows.length === 0 ? (
          <div className="aws-center">
            <Spinner className="aws-spinner" />
            <span>讀取 worker 狀態中...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="aws-empty">
            目前沒有 worker heartbeat 資料
          </div>
        ) : (
          <div className="aws-card-grid">
            {rows.map((w) => {
              const isAlive = !!w.isAlive;

              return (
                <div
                  key={w.workerId}
                  className={`aws-worker-card ${isAlive ? "alive" : "down"}`}
                >
                  <div className="aws-worker-card-head">
                    <div className="aws-worker-main">
                      <div className="aws-worker-title">
                        {w.workerId || "unknown-worker"}
                      </div>

                      <div className="aws-worker-sub">
                        {w.hostname || "hostname unknown"}
                        {w.pid != null ? ` · pid ${w.pid}` : ""}
                      </div>
                    </div>

                    <div className={`aws-status-pill ${isAlive ? "alive" : "down"}`}>
                      {isAlive ? "ALIVE" : "DOWN"}
                    </div>
                  </div>

                  <div className="aws-worker-meta-grid">
                    <div>
                      <div className="aws-meta-label">狀態</div>
                      <div className="aws-meta-value">{w.status || "—"}</div>
                    </div>

                    <div>
                      <div className="aws-meta-label">版本</div>
                      <div className="aws-meta-value">{w.workerVersion || "—"}</div>
                    </div>

                    <div>
                      <div className="aws-meta-label">最後 heartbeat</div>
                      <div className="aws-meta-value">
                        {formatDateTime(w.lastHeartbeatAt)}
                      </div>
                      <div className={`aws-meta-hint ${isAlive ? "" : "danger"}`}>
                        {formatAgo(w.msSinceHeartbeat)}
                      </div>
                    </div>

                    <div>
                      <div className="aws-meta-label">最後處理</div>
                      <div className="aws-meta-value">
                        {formatDateTime(w.lastProcessedAt)}
                      </div>
                      <div className="aws-meta-hint">
                        {w.lastProcessedDeviceId || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="aws-meta-label">最後結果</div>
                      <div className="aws-meta-value">
                        {w.lastProcessedStatus || "—"}
                        {w.lastProcessedVacancy != null
                          ? ` / ${w.lastProcessedVacancy}`
                          : ""}
                      </div>
                      <div className="aws-meta-hint">
                        {formatDurationSec(w.lastDurationSec)}
                      </div>
                    </div>

                    <div>
                      <div className="aws-meta-label">設定</div>
                      <div className="aws-meta-value">
                        {w.pollIntervalMs ?? "—"}ms · c{w.concurrency ?? "—"} · b{w.batchSize ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className="aws-image-object">
                    <div className="aws-meta-label">最後處理圖片</div>
                    <div className="aws-mono">
                      {w.lastProcessedImageObject || "—"}
                    </div>
                  </div>

                  {w.lastErrorMessage ? (
                    <div className="aws-error-box">
                      <div className="aws-meta-label">最後錯誤</div>
                      <div className="aws-error-time">
                        {formatDateTime(w.lastErrorAt)}
                      </div>
                      <div className="aws-error-message">
                        {w.lastErrorMessage}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

