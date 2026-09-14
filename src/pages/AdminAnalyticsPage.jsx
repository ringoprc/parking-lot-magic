import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MdOutlineArrowBackIos } from "react-icons/md";
import "./AdminAnalyticsPage.css";

const formatter = new Intl.NumberFormat("zh-TW");
const taipeiDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const JOURNEY_EVENT_META = {
  page_enter: { label: "進入網站", icon: "↗", tone: "enter" },
  page_hidden: { label: "切到背景", icon: "–", tone: "muted" },
  page_visible: { label: "回到頁面", icon: "+", tone: "visible" },
  page_exit: { label: "離開網站", icon: "↙", tone: "exit" },
  lot_open: { label: "開啟停車場", icon: "P", tone: "lot" },
  lot_close: { label: "關閉停車場", icon: "×", tone: "close" },
};

function shortDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function shouldShowChartValue(rows, index, valueKey, radius) {
  const value = rows[index]?.[valueKey] || 0;
  if (value <= 0) return false;
  if (radius <= 0) return true;

  const start = Math.max(0, index - radius);
  const end = Math.min(rows.length - 1, index + radius);
  for (let nearbyIndex = start; nearbyIndex <= end; nearbyIndex += 1) {
    const nearbyValue = rows[nearbyIndex]?.[valueKey] || 0;
    if (nearbyValue > value || (nearbyValue === value && nearbyIndex < index)) return false;
  }
  return true;
}

function formatJourneyTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return taipeiDateTimeFormatter.format(date).replace(",", "");
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round((Number(value) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小時 ${remainingMinutes} 分` : `${hours} 小時`;
}

function summarizeJourney(journey) {
  const pageDurations = new Map();
  let lotOpens = 0;
  let lastPageExitAt = null;

  for (const event of journey.events || []) {
    if (event.eventType === "lot_open") lotOpens += 1;
    if (event.eventType === "page_exit") lastPageExitAt = event.occurredAt;
    if (event.eventType.startsWith("page_") && event.durationMs != null) {
      pageDurations.set(
        event.pageViewId,
        Math.max(pageDurations.get(event.pageViewId) || 0, event.durationMs || 0)
      );
    }
  }

  const activeDurationMs = Array.from(pageDurations.values()).reduce(
    (sum, duration) => sum + duration,
    0
  );
  const lastEventMs = new Date(journey.lastEventAt).getTime();
  const isLive = !lastPageExitAt && Number.isFinite(lastEventMs) && Date.now() - lastEventMs < 90_000;

  return { activeDurationMs, lotOpens, isLive };
}

function journeyEventDescription(event) {
  if (event.eventType === "lot_open") return event.lotName || event.lotId || "停車場";
  if (event.eventType === "lot_close") {
    const name = event.lotName || event.lotId || "停車場";
    return `${name}・停留 ${formatDuration(event.durationMs)}`;
  }
  if (event.eventType === "page_exit") return `可見停留 ${formatDuration(event.durationMs)}`;
  if (event.eventType === "page_hidden") return `已累積 ${formatDuration(event.durationMs)}`;
  if (event.eventType === "page_visible") return `繼續瀏覽・已累積 ${formatDuration(event.durationMs)}`;
  return event.path || "/";
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
  const [hoveredLotView, setHoveredLotView] = useState(null);
  const [lotViewModalDay, setLotViewModalDay] = useState(null);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [lotSearch, setLotSearch] = useState("");
  const [lotSearchOpen, setLotSearchOpen] = useState(false);
  const minuteChartScrollRef = useRef(null);
  const dailyChartScrollRef = useRef(null);
  const lotViewChartScrollRef = useRef(null);
  const requestIdRef = useRef(0);
  const loadAbortRef = useRef(null);
  const lotViewRequestIdRef = useRef(0);
  const lotViewAbortRef = useRef(null);
  const journeyRequestIdRef = useRef(0);
  const journeyAbortRef = useRef(null);
  const [report, setReport] = useState(null);
  const [lotViewReport, setLotViewReport] = useState(null);
  const [journeyReport, setJourneyReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lotViewsLoading, setLotViewsLoading] = useState(false);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [error, setError] = useState("");
  const [lotViewError, setLotViewError] = useState("");
  const [journeyError, setJourneyError] = useState("");
  const [visibleJourneyCount, setVisibleJourneyCount] = useState(10);

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

  async function loadLotViews() {
    if (!adminKey) return;

    const requestId = lotViewRequestIdRef.current + 1;
    lotViewRequestIdRef.current = requestId;
    lotViewAbortRef.current?.abort();
    const controller = new AbortController();
    lotViewAbortRef.current = controller;

    setLotViewsLoading(true);
    setLotViewError("");
    try {
      const query = new URLSearchParams({ days: String(days) });
      if (selectedLotId) query.set("lotId", selectedLotId);
      const response = await fetch(`${apiBase}/api/admin/analytics/lot-views?${query}`, {
        headers: { "x-admin-key": adminKey },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "無法讀取停車場瀏覽資料");
      if (requestId !== lotViewRequestIdRef.current) return;
      setLotViewReport(data);
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      if (requestId !== lotViewRequestIdRef.current) return;
      setLotViewError(loadError?.message || "無法讀取停車場瀏覽資料");
    } finally {
      if (requestId === lotViewRequestIdRef.current) setLotViewsLoading(false);
    }
  }

  async function loadJourneys() {
    if (!adminKey) return;

    const requestId = journeyRequestIdRef.current + 1;
    journeyRequestIdRef.current = requestId;
    journeyAbortRef.current?.abort();
    const controller = new AbortController();
    journeyAbortRef.current = controller;

    setJourneysLoading(true);
    setJourneyError("");
    try {
      const response = await fetch(
        `${apiBase}/api/admin/analytics/journeys?days=${days}&limit=50`,
        {
          headers: { "x-admin-key": adminKey },
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "無法讀取訪客旅程");
      if (requestId !== journeyRequestIdRef.current) return;
      setJourneyReport(data);
      setVisibleJourneyCount(10);
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      if (requestId !== journeyRequestIdRef.current) return;
      setJourneyError(loadError?.message || "無法讀取訪客旅程");
    } finally {
      if (requestId === journeyRequestIdRef.current) setJourneysLoading(false);
    }
  }

  useEffect(() => {
    load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, minuteRange]);

  useEffect(() => {
    loadLotViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, selectedLotId]);

  useEffect(() => {
    loadJourneys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
    lotViewAbortRef.current?.abort();
    journeyAbortRef.current?.abort();
  }, []);

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

  useEffect(() => {
    if (!lotViewReport?.days) return;

    const frame = requestAnimationFrame(() => {
      const element = lotViewChartScrollRef.current;
      if (element) element.scrollLeft = element.scrollWidth;
    });

    return () => cancelAnimationFrame(frame);
  }, [lotViewReport?.days, selectedLotId]);

  useEffect(() => {
    if (!lotViewModalDay) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setLotViewModalDay(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [lotViewModalDay]);

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
  const maxLotViewValue = useMemo(
    () => Math.max(1, ...(lotViewReport?.daily || []).map((row) => row.views || 0)),
    [lotViewReport]
  );
  const filteredLotOptions = useMemo(() => {
    const query = lotSearch.trim().toLocaleLowerCase("zh-TW");
    const lots = lotViewReport?.lots || [];
    if (!query) return lots.slice(0, 10);
    return lots
      .filter((lot) => `${lot.name} ${lot.lotId}`.toLocaleLowerCase("zh-TW").includes(query))
      .slice(0, 10);
  }, [lotSearch, lotViewReport?.lots]);
  const averageViews = report?.totals?.sessions
    ? (report.totals.pageViews / report.totals.sessions).toFixed(1)
    : "0.0";
  const journeys = useMemo(() => journeyReport?.journeys || [], [journeyReport]);
  const journeySummaries = useMemo(
    () => journeys.map((journey) => summarizeJourney(journey)),
    [journeys]
  );
  const journeyStats = useMemo(() => {
    const sessionsWithLots = journeySummaries.filter((summary) => summary.lotOpens > 0).length;
    const totalLotOpens = journeySummaries.reduce((sum, summary) => sum + summary.lotOpens, 0);
    const totalDuration = journeySummaries.reduce(
      (sum, summary) => sum + summary.activeDurationMs,
      0
    );
    return {
      sessionsWithLots,
      totalLotOpens,
      averageDurationMs: journeySummaries.length ? totalDuration / journeySummaries.length : 0,
    };
  }, [journeySummaries]);

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
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                load();
                loadLotViews();
                loadJourneys();
              }}
              placeholder="admin key"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              load();
              loadLotViews();
              loadJourneys();
            }}
            disabled={loading || lotViewsLoading || journeysLoading}
          >
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
                const showValue = hoveredDay
                  ? hoveredDay.date === row.date
                  : shouldShowChartValue(
                      report.daily,
                      index,
                      dailyMetric,
                      loadedDays <= 7 ? 0 : 1
                    );
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
                    <div className="analytics-bar-value">{showValue ? value : ""}</div>
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

        <section className="analytics-panel analytics-lot-view-panel">
          <div className="analytics-panel-title analytics-lot-view-title">
            <div>
              <h2>停車場卡片開啟次數</h2>
              <p>
                {lotViewReport
                  ? `${lotViewReport.startDate} — ${lotViewReport.endDate}・${
                      lotViewReport.selectedLot?.name || "所有停車場"
                    }`
                  : "輸入密碼後載入資料"}
              </p>
            </div>

            <div className="analytics-lot-view-controls">
              <div className="analytics-lot-search">
                <label htmlFor="analytics-lot-search-input">搜尋停車場</label>
                <div className="analytics-lot-search-input-wrap">
                  <input
                    id="analytics-lot-search-input"
                    type="search"
                    value={lotSearch}
                    placeholder="輸入名稱或停車場 ID"
                    autoComplete="off"
                    onFocus={() => setLotSearchOpen(true)}
                    onBlur={() => setLotSearchOpen(false)}
                    onChange={(event) => {
                      setLotSearch(event.target.value);
                      setLotSearchOpen(true);
                      if (selectedLotId) {
                        setSelectedLotId("");
                        setHoveredLotView(null);
                        setLotViewModalDay(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setLotSearchOpen(false);
                        return;
                      }
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      const match = filteredLotOptions[0];
                      if (!match) return;
                      setLotSearch(match.name);
                      setSelectedLotId(match.lotId);
                      setLotSearchOpen(false);
                      setHoveredLotView(null);
                      setLotViewModalDay(null);
                    }}
                  />
                  {(lotSearch || selectedLotId) && (
                    <button
                      type="button"
                      aria-label="顯示所有停車場"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setLotSearch("");
                        setSelectedLotId("");
                        setHoveredLotView(null);
                        setLotViewModalDay(null);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {lotSearchOpen && (
                  <div className="analytics-lot-search-results" role="listbox">
                    <button
                      type="button"
                      className={!selectedLotId ? "active" : ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setLotSearch("");
                        setSelectedLotId("");
                        setLotSearchOpen(false);
                        setHoveredLotView(null);
                        setLotViewModalDay(null);
                      }}
                    >
                      <span>所有停車場</span>
                      <strong>{formatter.format(
                        (lotViewReport?.lots || []).reduce(
                          (sum, lot) => sum + (lot.totalViews || 0),
                          0
                        )
                      )}</strong>
                    </button>
                    {filteredLotOptions.map((lot) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedLotId === lot.lotId}
                        className={selectedLotId === lot.lotId ? "active" : ""}
                        key={lot.lotId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLotSearch(lot.name);
                          setSelectedLotId(lot.lotId);
                          setLotSearchOpen(false);
                          setHoveredLotView(null);
                          setLotViewModalDay(null);
                        }}
                      >
                        <span>
                          {lot.name}
                          <small>{lot.lotId}</small>
                        </span>
                        <strong>{formatter.format(lot.totalViews || 0)}</strong>
                      </button>
                    ))}
                    {filteredLotOptions.length === 0 && (
                      <div className="analytics-lot-search-empty">找不到符合的停車場</div>
                    )}
                  </div>
                )}
              </div>

              <div className="analytics-toggle analytics-time-toggle" aria-label="卡片開啟統計範圍">
                {[7, 30, 90].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={days === value ? "active" : ""}
                    onClick={() => {
                      setDays(value);
                      setHoveredDay(null);
                      setHoveredLotView(null);
                      setLotViewModalDay(null);
                    }}
                  >
                    {value} 天
                  </button>
                ))}
              </div>
            </div>
          </div>

          {lotViewError && <div className="analytics-inline-error">{lotViewError}</div>}

          <div className={`analytics-hover-readout ${hoveredLotView ? "active" : ""}`}>
            {hoveredLotView ? (
              <>
                <strong>{hoveredLotView.date}</strong>
                <span>卡片開啟 {formatter.format(hoveredLotView.views)} 次</span>
              </>
            ) : (
              <>
                <strong>{lotViewsLoading ? "載入中…" : `合計 ${formatter.format(lotViewReport?.totalViews || 0)} 次`}</strong>
                <span>將游標移到柱狀圖上查看該日的詳細數字</span>
              </>
            )}
          </div>

          <div className="analytics-chart-scroll" ref={lotViewChartScrollRef}>
            <div
              className="analytics-chart analytics-lot-view-chart"
              style={{ minWidth: `${Math.max(620, (lotViewReport?.days || days) * 20)}px` }}
            >
              {(lotViewReport?.daily || []).map((row, index) => {
                const height = row.views ? Math.max(4, (row.views / maxLotViewValue) * 100) : 0;
                const reportDays = lotViewReport?.days || days;
                const showLabel = reportDays <= 7
                  || index === 0
                  || index === lotViewReport.daily.length - 1
                  || index % 5 === 0;
                const showValue = hoveredLotView
                  ? hoveredLotView.date === row.date
                  : shouldShowChartValue(
                      lotViewReport.daily,
                      index,
                      "views",
                      reportDays <= 7 ? 0 : 1
                    );
                return (
                  <div
                    className="analytics-bar-column"
                    key={row.date}
                    title={row.views ? `${row.date}：開啟 ${row.views} 次` : undefined}
                    onMouseEnter={() => row.views && setHoveredLotView(row)}
                    onMouseLeave={() => setHoveredLotView(null)}
                    onClick={() => {
                      if (!row.views) return;
                      setHoveredLotView(row);
                      setLotViewModalDay(row);
                    }}
                    onKeyDown={(event) => {
                      if (!row.views || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      setHoveredLotView(row);
                      setLotViewModalDay(row);
                    }}
                    role={row.views ? "button" : undefined}
                    tabIndex={row.views ? 0 : undefined}
                    aria-label={row.views ? `查看 ${row.date} 的 ${row.views} 次卡片開啟明細` : undefined}
                  >
                    <div className="analytics-bar-value">{showValue ? row.views : ""}</div>
                    <div className="analytics-bar-track">
                      <div
                        className={`analytics-bar lot-view ${
                          hoveredLotView
                            ? hoveredLotView.date === row.date
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
              {!lotViewReport && !lotViewsLoading && (
                <div className="analytics-empty">尚未載入停車場卡片資料</div>
              )}
            </div>
          </div>
          <div className="analytics-minute-note">
            桌機開啟地圖資訊卡、手機開啟 bottom sheet，或從停車場清單開啟同一內容時各計一次；資料輪詢不會重複計數。
          </div>
        </section>

        <section className="analytics-panel analytics-journey-panel">
          <div className="analytics-panel-title analytics-journey-title">
            <div>
              <div className="analytics-section-kicker">USER JOURNEYS</div>
              <h2>最近訪客旅程</h2>
              <p>
                {journeyReport
                  ? `最近 ${journeyReport.days} 天・顯示最新 ${formatter.format(journeys.length)} 個匿名 Session`
                  : "輸入密碼後載入旅程資料"}
              </p>
            </div>
            <div className="analytics-journey-privacy">
              <span className="analytics-privacy-dot" />
              僅顯示雜湊識別碼
            </div>
          </div>

          {journeyError && <div className="analytics-inline-error">{journeyError}</div>}

          <div className="analytics-journey-summary">
            <div>
              <span>載入旅程</span>
              <strong>{formatter.format(journeys.length)}</strong>
              <small>最新 Session 樣本</small>
            </div>
            <div>
              <span>查看過停車場</span>
              <strong>{formatter.format(journeyStats.sessionsWithLots)}</strong>
              <small>至少開啟一次卡片</small>
            </div>
            <div>
              <span>平均可見停留</span>
              <strong>{formatDuration(journeyStats.averageDurationMs)}</strong>
              <small>不計背景分頁時間</small>
            </div>
            <div>
              <span>卡片開啟</span>
              <strong>{formatter.format(journeyStats.totalLotOpens)}</strong>
              <small>此批旅程合計</small>
            </div>
          </div>

          <div className="analytics-journey-list">
            {journeys.slice(0, visibleJourneyCount).map((journey, index) => {
              const summary = journeySummaries[index];
              const displayEvents = (journey.events || []).filter(
                (event) => event.eventType !== "page_heartbeat"
              );
              const heartbeatCount = (journey.events || []).length - displayEvents.length;

              return (
                <details className="analytics-journey-row" key={journey.sessionId}>
                  <summary>
                    <div className="analytics-journey-identity">
                      <span className={`analytics-session-status ${summary.isLive ? "live" : ""}`} />
                      <div>
                        <strong>訪客 {journey.visitorId.slice(0, 8)}</strong>
                        <small>Session {journey.sessionId.slice(0, 8)}</small>
                      </div>
                    </div>
                    <div className="analytics-journey-start">
                      <span>進站時間</span>
                      <strong>{formatJourneyTime(journey.startedAt)}</strong>
                    </div>
                    <div className="analytics-journey-metric">
                      <span>可見停留</span>
                      <strong>{formatDuration(summary.activeDurationMs)}</strong>
                    </div>
                    <div className="analytics-journey-metric">
                      <span>停車場</span>
                      <strong>{formatter.format(summary.lotOpens)} 次</strong>
                    </div>
                    <div className="analytics-journey-state">
                      <span className={summary.isLive ? "live" : "ended"}>
                        {summary.isLive ? "瀏覽中" : "已結束"}
                      </span>
                      <i aria-hidden="true">⌄</i>
                    </div>
                  </summary>

                  <div className="analytics-journey-detail">
                    <div className="analytics-journey-detail-head">
                      <span>事件時間軸</span>
                      <span>
                        最後活動 {formatJourneyTime(journey.lastEventAt)}
                        {heartbeatCount > 0 ? `・已合併 ${heartbeatCount} 次心跳` : ""}
                      </span>
                    </div>
                    <div className="analytics-timeline">
                      {displayEvents.map((event, eventIndex) => {
                        const meta = JOURNEY_EVENT_META[event.eventType] || {
                          label: event.eventType,
                          icon: "•",
                          tone: "muted",
                        };
                        return (
                          <div
                            className="analytics-timeline-event"
                            key={`${event.occurredAt}-${event.eventType}-${eventIndex}`}
                          >
                            <div className={`analytics-timeline-icon ${meta.tone}`}>{meta.icon}</div>
                            <div className="analytics-timeline-copy">
                              <strong>{meta.label}</strong>
                              <span>{journeyEventDescription(event)}</span>
                            </div>
                            <time>{formatJourneyTime(event.occurredAt)}</time>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              );
            })}

            {journeysLoading && journeys.length === 0 && (
              <div className="analytics-journey-empty">
                <span className="analytics-journey-spinner" />
                正在載入訪客旅程…
              </div>
            )}
            {!journeysLoading && journeyReport && journeys.length === 0 && (
              <div className="analytics-journey-empty">
                <strong>尚未收到旅程事件</strong>
                <span>新版本上線後，訪客的進站與卡片互動會顯示在這裡。</span>
              </div>
            )}
          </div>

          {visibleJourneyCount < journeys.length && (
            <button
              type="button"
              className="analytics-journey-more"
              onClick={() => setVisibleJourneyCount((count) => count + 10)}
            >
              顯示更多旅程
            </button>
          )}
          <div className="analytics-minute-note">
            停留時間由分頁可見狀態與 30 秒心跳估算；直接關閉瀏覽器時，最後一段時間可能有少量誤差。
          </div>
        </section>

        <div className="analytics-footnote">
          同一瀏覽器清除儲存空間後會被視為新訪客；封鎖瀏覽器儲存或請求的使用者不會列入，因此數字是實用估計值，而非身分識別後的精確人數。
        </div>
      </main>

      {lotViewModalDay && (
        <div
          className="analytics-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLotViewModalDay(null);
          }}
        >
          <section
            className="analytics-lot-view-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analytics-lot-view-modal-title"
          >
            <header>
              <div>
                <div className="analytics-modal-kicker">每日點擊分布</div>
                <h2 id="analytics-lot-view-modal-title">{lotViewModalDay.date}</h2>
                <p>
                  卡片共開啟 {formatter.format(lotViewModalDay.views)} 次，分布於 {formatter.format(lotViewModalDay.breakdown?.length || 0)} 個停車場
                </p>
              </div>
              <button
                type="button"
                className="analytics-modal-close"
                aria-label="關閉明細"
                autoFocus
                onClick={() => setLotViewModalDay(null)}
              >
                ×
              </button>
            </header>

            <div className="analytics-modal-list">
              {(lotViewModalDay.breakdown || []).map((lot, index) => {
                const percentage = lotViewModalDay.views
                  ? (lot.views / lotViewModalDay.views) * 100
                  : 0;
                return (
                  <div className="analytics-modal-row" key={lot.lotId}>
                    <div className="analytics-modal-rank">{index + 1}</div>
                    <div className="analytics-modal-lot">
                      <div className="analytics-modal-lot-title">
                        <span>{lot.name}</span>
                        <strong>{formatter.format(lot.views)} 次</strong>
                      </div>
                      <div className="analytics-modal-lot-meta">
                        <span>{lot.lotId}</span>
                        <span>{percentage.toFixed(percentage >= 10 ? 0 : 1)}%</span>
                      </div>
                      <div className="analytics-modal-share-track">
                        <div style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
