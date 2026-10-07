import { useEffect, useMemo, useRef, useState } from "react";
import { getAvailabilityPinPresentation } from "../utils/availability";
import "./AiResultHistory.css";

function displayResult(result) {
  if (result.status !== "ok") {
    const pin = getAvailabilityPinPresentation({ vacancy: null });
    return { ...pin, label: "×" };
  }

  const pin = getAvailabilityPinPresentation(result);

  return {
    ...pin,
    label: pin.label === "?" ? "×" : String(pin.label),
  };
}

function formatResultTime(value) {
  if (!value) return "時間未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function AiResultHistory({ apiBase = "", lotId, onDisplayChange, hideWhenEmpty = false, enabled = true }) {
  const [history, setHistory] = useState({
    lotId: null,
    rows: [],
    display: null,
    error: "",
  });
  const onDisplayChangeRef = useRef(onDisplayChange);

  useEffect(() => {
    onDisplayChangeRef.current = onDisplayChange;
  }, [onDisplayChange]);

  useEffect(() => {
    if (!lotId || !enabled) return undefined;

    let mounted = true;
    let controller = null;
    let refreshTimer = null;

    async function load() {
      controller = new AbortController();

      try {
        const response = await fetch(
          `${apiBase}/api/lots/${encodeURIComponent(lotId)}/ai-history`,
          { signal: controller.signal }
        );
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "無法讀取辨識紀錄");
        if (!mounted) return;
        setHistory({
          lotId,
          rows: Array.isArray(data?.rows) ? data.rows.slice(0, 10) : [],
          display: data?.display || null,
          error: "",
        });
        onDisplayChangeRef.current?.(data?.display || null);
      } catch (error) {
        if (!mounted || error?.name === "AbortError") return;
        setHistory({
          lotId,
          rows: [],
          display: null,
          error: "暫時無法讀取辨識紀錄",
        });
      } finally {
        // Wait for the current request before polling again. Aborting every
        // 15 seconds prevents a slow first response from ever being shown.
        if (mounted) refreshTimer = setTimeout(load, 15_000);
      }
    }

    load();

    return () => {
      mounted = false;
      controller?.abort();
      clearTimeout(refreshTimer);
    };
  }, [apiBase, lotId, enabled]);

  const loading = history.lotId !== lotId;
  const orderedRows = useMemo(
    () => history.lotId === lotId ? [...history.rows].reverse() : [],
    [history.lotId, history.rows, lotId]
  );

  if (hideWhenEmpty && (loading || history.error || !orderedRows.length)) return null;

  return (
    <section className="lot-ai-history" aria-label="最近十次 AI 辨識結果">
      <div className="lot-ai-history-head"
        style={{
          alignItems: "flex-end"
        }}
      >
        <span
          style={{
            color: "#999",
            marginLeft: "3px",
            marginBottom: "0.5px",
            fontSize: "8px"
          }}
        >5分鐘前</span>
        <span
          style={{
            fontSize: "10px"
          }}
        >AI 最近 10 次辨識結果</span>
        <span
          style={{
            color: "#999",
            marginLeft: "8px",
            marginRight: "3px",
            marginBottom: "0.5px",
            fontSize: "8px"
          }}
        >現在</span>

      </div>

      {loading ? (
        <div className="lot-ai-history-message" role="status" aria-label="辨識紀錄讀取中">
          <span className="lot-ai-history-spinner" aria-hidden="true" />
        </div>
      ) : history.error ? (
        <div className="lot-ai-history-message is-error">{history.error}</div>
      ) : !orderedRows.length ? (
        <div className="lot-ai-history-message">尚無辨識紀錄</div>
      ) : (
        <div className="lot-ai-history-track">
          {orderedRows.map((row, index) => {
            const result = displayResult(row);
            return (
              <span
                className="lot-ai-result"
                title={`${formatResultTime(row.at)} · ${row.status === "ok" ? "辨識成功" : "未辨識成功"}`}
                key={row.attemptId || `${row.at}-${index}`}
                style={{
                  "--history-result-bg": result.bg,
                  "--history-result-border": result.border,
                  "--history-result-glyph": result.glyph,
                }}
              >
                {result.label}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
