// frontend/src/components/LotBottomSheet.jsx
import { useEffect, useState } from "react";
import { formatTime, minutesAgo, minSecAgo } from "../utils/time";
import "./LotBottomSheet.css";

function toVacancyNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getVacancyTextColor(v) {
  const n = toVacancyNum(v);
  if (n == null) return "#b6b6b6";   // unknown -> gray (pin border)
  if (n === 0) return "#C5221F";     // 0 -> red (pin border)
  if (n <= 5) return "#C58F00";      // low -> yellow (pin border)
  return "#0F7B2E";                  // ok -> green (pin border)
}

function openGoogleNav(active) {
  if (!active) return;

  // Prefer coordinates if you have them
  const lat = active.lat ?? active.latitude;
  const lng = active.lng ?? active.longitude;

  let url = "";

  if (active.addressZh) {
    // Fallback to address if no lat/lng
    url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(active.addressZh)}` +
      `&travelmode=driving`;
  } else if (lat != null && lng != null) {
    const dest = `${lat},${lng}`;
    url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(dest)}` +
      `&travelmode=driving`;
  } else {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}


export default function LotBottomSheet({ active, onClose }) {
  const [open, setOpen] = useState(false);

  // open when active exists, close when active is null
  useEffect(() => {
    setOpen(!!active);
  }, [active]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  // Prevent the map from stealing scroll when you scroll inside the sheet (iOS)
  function stopMapGesture(e) {
    e.stopPropagation();
  }

  // Keep the sheet mounted for the close animation, but hide if no active and not open
  if (!active && !open) return null;

  return (
    <div className="vl-sheet-layer" onClick={close}>
      <div
        className={`vl-sheet ${open ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vl-sheet-handle">
          <div className="vl-sheet-grabber" />
          <button className="vl-sheet-close" onClick={close} aria-label="close">
            ×
          </button>
        </div>

        <div
          className="vl-sheet-content"
          onTouchStart={stopMapGesture}
          onTouchMove={stopMapGesture}
        >
          <div className="vl-sheet-hero">
            <img
              className="vl-sheet-hero-img"
              onClick={() => openGoogleNav(active)}
              src="https://placehold.co/640x240/f9f9f9/999999/png?text=Parking"
              alt=""
              loading="lazy"
            />
          </div>

          {active && (
            <div className="vl-sheet-body">
              <div className="vl-sheet-titleRow">
                <div className="vl-sheet-title">{active.name}</div>
                <div className="vl-sheet-vac"
                  style={{ color: getVacancyTextColor(active.vacancy) }}
                >
                  空位：
                  <span className="vl-sheet-vacNum">
                    {active.vacancy ?? "未知"}
                  </span>
                </div>
              </div>

              <div className="vl-sheet-addr">{active.addressZh}</div>

              {(() => {
                const m = minutesAgo(active.lastUpdated);
                if (m == null) return null;
                if (m <= 3) return null;
                return (
                  <div className="vl-sheet-warn">
                    資料可能延遲（{m} 分鐘）
                  </div>
                );
              })()}

              <div className="vl-sheet-meta">
                <div>最近更新：{formatTime(active.lastUpdated)}</div>
                {(() => {
                  const ms = minSecAgo(active.lastUpdated);
                  if (!ms) return null;
                  return (
                    <div>
                      （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                    </div>
                  );
                })()}
              </div>

              <div className="vl-sheet-actions">
                <button
                  className="vl-sheet-navBtn"
                  onClick={() => openGoogleNav(active)}
                  type="button"
                >
                  開始導航
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
