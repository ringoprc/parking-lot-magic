import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MdOutlineArrowBackIos } from "react-icons/md";
import "./AdminAnalyticsPage.css";

const formatter = new Intl.NumberFormat("zh-TW");

function shortDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function SummaryCard({ label, value, note, accent = "" }) {
  return (
    <div className={`analytics-summary-card ${accent}`}>
      <div className="analytics-summary-label">{label}</div>
      <div className="analytics-summary-value">{formatter.format(value || 0)}</div>
      <div className="analytics-summary-note">{note}</div>
    </div>
  );
}

export default function AdminAnalyticsPage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [days, setDays] = useState(30);
  const [minuteRange, setMinuteRange] = useState(60);
  const [minuteMetric, setMinuteMetric] = useState("uniqueVisitors");
  const [dailyMetric, setDailyMetric] = useState("uniqueVisitors");
  const [hoveredMinute, setHoveredMinute] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const minuteChartScrollRef = useRef(null);
  const dailyChartScrollRef = useRef(null);
  const requestIdRef = useRef(0);
  const loadAbortRef = useRef(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function persistAdminKey(value) {
    setAdminKey(value);
    localStorage.setItem("adminKey", value);
  }

  async function load({ silent = false } = {}) {
    if (!adminKey) {
      if (!silent) toast.error("請先輸入管理員密碼");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBase}/api/admin/analytics/visits?days=${days}&minutes=${minuteRange}`,
        {
          headers: { "x-admin-key": adminKey },
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "無法讀取訪客資料");
      if (requestId !== requestIdRef.current) return;

      setReport(data);
      if (!silent) toast.success("訪客資料已更新");
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      const message = loadError?.message || "無法讀取訪客資料";
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, minuteRange]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!report?.minutes) return;

    const frame = requestAnimationFrame(() => {
      const element = minuteChartScrollRef.current;
      if (element) element.scrollLeft = element.scrollWidth;
    });

    return () => cancelAnimationFrame(frame);
  }, [report?.minutes]);

  useEffect(() => {
    if (!report?.days) return;

    const frame = requestAnimationFrame(() => {
      const element = dailyChartScrollRef.current;
      if (element) element.scrollLeft = element.scrollWidth;
    });

    return () => cancelAnimationFrame(frame);
  }, [report?.days]);

  const today = report?.daily?.[report.daily.length - 1] || {};
  const loadedDays = report?.days || days;
  const loadedMinuteRange = report?.minutes || minuteRange;
  const maxDailyValue = useMemo(
    () => Math.max(1, ...(report?.daily || []).map((row) => row[dailyMetric] || 0)),
    [report, dailyMetric]
  );
  const maxMinuteValue = useMemo(
    () => Math.max(1, ...(report?.minuteSeries || []).map((row) => row[minuteMetric] || 0)),
    [report, minuteMetric]
  );
  const averageViews = report?.totals?.sessions
    ? (report.totals.pageViews / report.totals.sessions).toFixed(1)
    : "0.0";

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <div className="analytics-heading">
          <a className="analytics-back" href="/?admin=1" aria-label="回到管理選單">
            <MdOutlineArrowBackIos size={18} />
          </a>
          <div>
            <div className="analytics-kicker">SITE ANALYTICS</div>
            <h1>網站訪客統計</h1>
            <p>以匿名瀏覽器識別碼估算人數，不儲存 IP 位址或裝置資訊。</p>
          </div>
        </div>

        <div className="analytics-controls">
          <label>
            <span>管理員密碼</span>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => persistAdminKey(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && load()}
              placeholder="admin key"
            />
          </label>
          <button type="button" onClick={() => load()} disabled={loading}>
            {loading ? "載入中…" : "更新資料"}
          </button>
        </div>
      </header>

      <main className="analytics-content">
        {error && <div className="analytics-error">{error}</div>}

        <section className="analytics-summary">
          <SummaryCard
            label="不重複訪客"
            value={report?.totals?.uniqueVisitors}
            note={`最近 ${loadedDays} 天`}
            accent="primary"
          />
          <SummaryCard label="今日訪客" value={today.uniqueVisitors} note="台北時間日曆日" accent="sunny" />
          <SummaryCard label="造訪次數" value={report?.totals?.sessions} note="每個分頁工作階段計一次" />
          <SummaryCard label="頁面瀏覽" value={report?.totals?.pageViews} note={`每次造訪平均 ${averageViews} 頁`} />
        </section>

        <section className="analytics-panel analytics-minute-panel">
          <div className="analytics-panel-title analytics-minute-title">
            <div>
              <h2>每分鐘進站人數</h2>
              <p>
                {report
                  ? `${report.minuteStart} — ${report.minuteEnd}（台北時間）`
                  : "輸入密碼後載入資料"}
              </p>
            </div>
            <div className="analytics-minute-controls">
              <div className="analytics-toggle" aria-label="每分鐘指標">
                <button
                  type="button"
                  className={minuteMetric === "uniqueVisitors" ? "active" : ""}
                  onClick={() => {
                    setMinuteMetric("uniqueVisitors");
                    setHoveredMinute(null);
                  }}
                >
                  不重複訪客
                </button>
                <button
                  type="button"
                  className={minuteMetric === "sessions" ? "active" : ""}
                  onClick={() => {
                    setMinuteMetric("sessions");
                    setHoveredMinute(null);
                  }}
                >
                  Session 數
                </button>
              </div>
              <div className="analytics-toggle analytics-time-toggle" aria-label="每分鐘統計範圍">
                {[
                  [60, "1 小時"],
                  [360, "6 小時"],
                  [1440, "24 小時"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={minuteRange === value ? "active" : ""}
                    onClick={() => {
                      setMinuteRange(value);
                      setHoveredMinute(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`analytics-hover-readout ${hoveredMinute ? "active" : ""}`}>
            {hoveredMinute ? (
              <>
                <strong>{hoveredMinute.minute}</strong>
                <span>不重複訪客 {hoveredMinute.uniqueVisitors}</span>
                <span>Session {hoveredMinute.sessions}</span>
                <span>頁面瀏覽 {hoveredMinute.pageViews}</span>
              </>
            ) : (
              <span>將游標移到柱狀圖上查看該分鐘的詳細數字</span>
            )}
          </div>

          <div className="analytics-chart-scroll" ref={minuteChartScrollRef}>
            <div
              className="analytics-chart analytics-minute-chart"
              style={{ minWidth: `${Math.max(680, loadedMinuteRange * 8)}px` }}
            >
              {(report?.minuteSeries || []).map((row, index) => {
                const value = row[minuteMetric] || 0;
                const height = value ? Math.max(4, (value / maxMinuteValue) * 100) : 0;
                const labelEvery = loadedMinuteRange === 60 ? 10 : loadedMinuteRange === 360 ? 60 : 180;
                const showLabel = index === 0 || index === report.minuteSeries.length - 1 || index % labelEvery === 0;
                const valueLabelRadius = loadedMinuteRange === 60 ? 1 : loadedMinuteRange === 360 ? 5 : 10;
                const clusterStart = Math.max(0, index - valueLabelRadius);
                const clusterEnd = Math.min(report.minuteSeries.length, index + valueLabelRadius + 1);
                const nearbyValues = report.minuteSeries
                  .slice(clusterStart, clusterEnd)
                  .map((item) => item[minuteMetric] || 0);
                const clusterMax = Math.max(...nearbyValues);
                const firstMaxIndex = clusterStart + nearbyValues.indexOf(clusterMax);
                const showValue = value > 0 && value === clusterMax && index === firstMaxIndex;
                return (
                  <div
                    className="analytics-bar-column analytics-minute-column"
                    key={row.minute}
                    title={value > 0
                      ? `${row.minute}：${value} ${minuteMetric === "sessions" ? "個 session" : "位不重複訪客"}`
                      : undefined}
                    onMouseEnter={() => {
                      if (value > 0) setHoveredMinute(row);
                    }}
                    onMouseLeave={() => setHoveredMinute(null)}
                    onClick={() => {
                      if (value > 0) setHoveredMinute(row);
                    }}
                  >
                    <div className="analytics-bar-value">{showValue ? value : ""}</div>
                    <div className="analytics-bar-track">
                      <div
                        className={`analytics-bar ${minuteMetric === "sessions" ? "session" : ""} ${
                          hoveredMinute
                            ? hoveredMinute.minute === row.minute
                              ? "is-highlighted"
                              : "is-dimmed"
                            : ""
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <div className="analytics-bar-date">{showLabel ? row.minute.slice(11) : ""}</div>
                  </div>
                );
              })}
              {!report && <div className="analytics-empty">尚未載入每分鐘資料</div>}
            </div>
          </div>
          <div className="analytics-minute-note">
            不重複訪客會在同一分鐘內合併相同瀏覽器；Session 數會將同一位訪客的不同分頁或新工作階段分開計算。
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-panel-title">
            <div>
              <h2>每日進站人數</h2>
              <p>{report ? `${report.startDate} — ${report.endDate}` : "輸入密碼後載入資料"}</p>
            </div>
            <div className="analytics-daily-controls">
              <div className="analytics-toggle" aria-label="每日指標">
                <button
                  type="button"
                  className={dailyMetric === "uniqueVisitors" ? "active" : ""}
                  onClick={() => {
                    setDailyMetric("uniqueVisitors");
                    setHoveredDay(null);
                  }}
                >
                  不重複訪客
                </button>
                <button
                  type="button"
                  className={dailyMetric === "sessions" ? "active" : ""}
                  onClick={() => {
                    setDailyMetric("sessions");
                    setHoveredDay(null);
                  }}
                >
                  Session 數
                </button>
              </div>
              <div className="analytics-toggle analytics-time-toggle" aria-label="每日統計範圍">
                {[7, 30, 90].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={days === value ? "active" : ""}
                    onClick={() => {
                      setDays(value);
                      setHoveredDay(null);
                    }}
                  >
                    {value} 天
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`analytics-hover-readout ${hoveredDay ? "active" : ""}`}>
            {hoveredDay ? (
              <>
                <strong>{hoveredDay.date}</strong>
                <span>不重複訪客 {hoveredDay.uniqueVisitors}</span>
                <span>Session {hoveredDay.sessions}</span>
                <span>頁面瀏覽 {hoveredDay.pageViews}</span>
              </>
            ) : (
              <span>將游標移到柱狀圖上查看該日的詳細數字</span>
            )}
          </div>

          <div className="analytics-chart-scroll" ref={dailyChartScrollRef}>
            <div className="analytics-chart" style={{ minWidth: `${Math.max(620, loadedDays * 20)}px` }}>
              {(report?.daily || []).map((row, index) => {
                const value = row[dailyMetric] || 0;
                const height = value ? Math.max(4, (value / maxDailyValue) * 100) : 0;
                const showLabel = loadedDays <= 7 || index === 0 || index === report.daily.length - 1 || index % 5 === 0;
                return (
                  <div
                    className="analytics-bar-column"
                    key={row.date}
                    title={value > 0
                      ? `${row.date}：${value} ${dailyMetric === "sessions" ? "個 session" : "位不重複訪客"}`
                      : undefined}
                    onMouseEnter={() => {
                      if (value > 0) setHoveredDay(row);
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    onClick={() => {
                      if (value > 0) setHoveredDay(row);
                    }}
                  >
                    <div className="analytics-bar-value">{value || ""}</div>
                    <div className="analytics-bar-track">
                      <div
                        className={`analytics-bar ${dailyMetric === "sessions" ? "session" : ""} ${
                          hoveredDay
                            ? hoveredDay.date === row.date
                              ? "is-highlighted"
                              : "is-dimmed"
                            : ""
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <div className="analytics-bar-date">{showLabel ? shortDate(row.date) : ""}</div>
                  </div>
                );
              })}
              {!report && <div className="analytics-empty">尚未載入統計資料</div>}
            </div>
          </div>
          <div className="analytics-minute-note">
            不重複訪客會在同一天內合併相同瀏覽器；Session 數會將同一位訪客的不同分頁或新工作階段分開計算。
          </div>
        </section>

        <div className="analytics-footnote">
          同一瀏覽器清除儲存空間後會被視為新訪客；封鎖瀏覽器儲存或請求的使用者不會列入，因此數字是實用估計值，而非身分識別後的精確人數。
        </div>
      </main>
    </div>
  );
}
